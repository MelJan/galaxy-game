import * as THREE from 'three';
import { FIELD, PIXEL, PLAYER } from '../config';
import type { Controls } from '../core/Input';
import type { Palette } from '../gfx/pixel';
import type { Particles } from '../fx/Particles';
import { POWERUP_PALETTE, SHIELD_FRAMES } from '../gfx/bossArt';
import { makePixelTexture, PixelSprite } from '../gfx/pixel';
import {
  buildShipFrames,
  FLAME_FRAMES,
  FLAME_PALETTE,
  SHIP_GUN_Y,
  SHIP_NOSE_GUNS,
  SHIP_NOSE_Y,
  SHIP_HEIGHT,
  SHIP_WIDTH,
  type ShipFrame,
} from '../gfx/sprites';
import type { BulletPool } from './Bullets';

const MUZZLE_COLOR = new THREE.Color(0x7ff0ff);
/** Ab diesem Anteil der Höchstgeschwindigkeit wird der Schräglage-Frame gezeigt. */
const BANK_THRESHOLD = 0.3;
/** Sekunden ohne Schaden nach einem Treffer. */
const INVULNERABLE_TIME = 1.6;
/** Startposition (y) zu Beginn eines Durchlaufs. */
export const START_Y = -FIELD.halfHeight + 6;
/** Touch: höchstens so viel schneller als normal fliegt das Schiff dem Finger hinterher (damit es nicht springt). */
const TOUCH_MAX_SPEED = 6;
export const SHIELD_HITS = 3;
export const SHIELD_TIME = 15;
export const FAN_TIME = 15;
/** Fächerschuss: Winkel der Flügelkanonen nach außen. */
const FAN_ANGLE = 0.16;

/** Werte aus der Werft, die das Schiff beeinflussen. */
export interface PlayerStats {
  fireIntervalMul: number;
  speedMul: number;
  /** 0 = Doppelschuss, 1 = + Mittellauf, 2 = + Flügelkanonen, 3 = Flügelkanonen streuen. */
  gunLevel: number;
  /** Sekunden bis zum automatischen Aufladen des Schilds, 0 = kein Generator. */
  shieldCooldown: number;
}

export class Player {
  stats: PlayerStats = { fireIntervalMul: 1, speedMul: 1, gunLevel: 0, shieldCooldown: 0 };
  private shieldGenTimer = 0;
  /** Logische Position (Mitte), die Sprites rasten davon abgeleitet aufs Pixelraster ein. */
  readonly position = new THREE.Vector2(0, START_Y);
  /** Kleiner Trefferradius wie in klassischen Shootern: nur der Rumpf zählt. */
  readonly hitRadius = 0.55;
  /** Wird bei jeder Salve aufgerufen (Sound). */
  onFire: (() => void) | null = null;
  /** Obere Flugbegrenzung, z. B. unter dem Rumpf des Mutterschiffs. null = Spielfeldrand. */
  ceiling: number | null = null;
  alive = true;
  private invulnerable = 0;
  /** Power-ups: verbleibende Schildtreffer und Restzeiten in Sekunden. */
  shieldHits = 0;
  shieldTime = 0;
  fanTime = 0;
  private readonly shield: PixelSprite;
  private readonly velocity = new THREE.Vector2();
  private readonly target = new THREE.Vector2();
  private readonly frames: ShipFrame[];
  private readonly ship: PixelSprite;
  private readonly flames: PixelSprite[];
  private frame = 0;
  private fireCooldown = 0;
  private animTime = 0;

  /** Startposition (x) – im Zweispieler-Modus links bzw. rechts. */
  startX = 0;

  constructor(scene: THREE.Scene, palette?: Palette) {
    this.frames = buildShipFrames(palette);
    this.ship = new PixelSprite(
      this.frames.map((f) => f.texture),
      SHIP_WIDTH,
      SHIP_HEIGHT,
    );
    const flameTextures = FLAME_FRAMES.map((rows) => makePixelTexture(rows, FLAME_PALETTE));
    this.flames = [0, 1].map(() => new PixelSprite(flameTextures, FLAME_FRAMES[0][0].length, FLAME_FRAMES[0].length));
    this.shield = new PixelSprite(
      SHIELD_FRAMES.map((rows) => makePixelTexture(rows, POWERUP_PALETTE)),
      SHIELD_FRAMES[0][0].length,
      SHIELD_FRAMES[0].length,
    );
    this.shield.visible = false;
    scene.add(this.ship.mesh, ...this.flames.map((f) => f.mesh), this.shield.mesh);
  }

  get shielded(): boolean {
    return this.shieldHits > 0 && this.shieldTime > 0;
  }

  giveShield(time = SHIELD_TIME): void {
    this.shieldHits = SHIELD_HITS;
    this.shieldTime = time;
  }

  giveFan(time = FAN_TIME): void {
    this.fanTime = time;
  }

  /** Schild fängt einen Treffer ab. Kurz unverwundbar, damit nicht mehrere Schüsse gleichzeitig zählen. */
  absorbHit(): void {
    this.shieldHits--;
    this.invulnerable = 0.35;
    if (this.shieldHits <= 0) this.shieldGenTimer = this.stats.shieldCooldown;
  }

  get x(): number {
    return this.position.x;
  }

  get canBeHit(): boolean {
    return this.alive && this.invulnerable <= 0;
  }

  /** Nach einem Treffer kurz unverwundbar machen. */
  hit(): void {
    this.invulnerable = INVULNERABLE_TIME;
  }

  /** Schiff zerstört: ausblenden, bis zum Neustart. */
  destroy(): void {
    this.alive = false;
    this.setVisible(false);
  }

  reset(): void {
    this.shieldHits = this.shieldTime = this.fanTime = 0;
    this.shieldGenTimer = 0;
    this.position.set(this.startX, START_Y);
    this.velocity.set(0, 0);
    this.invulnerable = 0;
    this.fireCooldown = 0;
    this.alive = true;
    this.setVisible(true);
  }

  private setVisible(v: boolean): void {
    this.ship.visible = v;
    for (const f of this.flames) f.visible = v;
    if (!v && !this.alive) this.shield.visible = false;
  }

  get y(): number {
    return this.position.y;
  }

  /** Oberkante der Schiffsnase (Ursprung des Lasers). */
  get noseY(): number {
    return this.ship.mesh.position.y + (SHIP_HEIGHT / 2) * PIXEL;
  }

  /** Mittelpunkt einer Flügelkanone (i = 0 links, 1 rechts). */
  wingGun(i: number): { x: number; y: number } {
    const { x, y } = this.ship.mesh.position;
    return { x: x + this.frames[this.frame].guns[i] * PIXEL, y: y + SHIP_GUN_Y * PIXEL };
  }

  /**
   * Vorspann und Abspann: Schiff fest an (x, y) zeigen, ohne Steuerung und ohne zu schießen.
   * thrust: 0 = Triebwerk aus (gelandet), ab 0.5 große Flamme.
   */
  pose(dt: number, x: number, y: number, thrust: number, engineFx: Particles): void {
    this.animTime += dt;
    this.alive = true;
    this.invulnerable = 0;
    this.setVisible(true);
    this.position.set(x, y);
    this.velocity.set(0, thrust >= 0.5 ? PLAYER.speed : 0);
    this.frame = 0;
    this.render(thrust > 0 ? engineFx : null);
    if (thrust <= 0) for (const f of this.flames) f.visible = false;
    this.velocity.set(0, 0);
  }

  /** gunsEnabled = false, solange der Dauerlaser die normalen Kanonen ersetzt. */
  update(dt: number, input: Controls, bullets: BulletPool, engineFx: Particles, sparkFx: Particles, gunsEnabled = true): void {
    if (!this.alive) return;
    this.animTime += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.fanTime = Math.max(0, this.fanTime - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    if (this.shieldTime <= 0) this.shieldHits = 0;
    // Schildgenerator: lädt einen Treffer-Schild nach, solange kein Schild aktiv ist
    if (this.stats.shieldCooldown > 0 && !this.shielded) {
      this.shieldGenTimer -= dt;
      if (this.shieldGenTimer <= 0) {
        this.shieldHits = 1;
        this.shieldTime = Infinity;
      }
    }
    // Blinken während der Unverwundbarkeit
    this.setVisible(this.invulnerable <= 0 || Math.floor(this.invulnerable * 12) % 2 === 0);
    this.move(dt, input);
    this.render(engineFx);
    if (gunsEnabled) this.shoot(dt, input, bullets, sparkFx);
  }

  private move(dt: number, input: Controls): void {
    const p = this.position;
    if (input.moveTo) {
      // Touch: noch in diesem Schritt am Zielpunkt sein (der Finger ist schon gefiltert, siehe TouchDrag)
      this.target.set(input.moveTo.x - p.x, input.moveTo.y - p.y).divideScalar(Math.max(dt, 1e-4));
      const max = PLAYER.speed * this.stats.speedMul * TOUCH_MAX_SPEED;
      if (this.target.lengthSq() > max * max) this.target.setLength(max);
      this.velocity.copy(this.target);
    } else {
      this.target.set(input.axisX, input.axisY);
      if (this.target.lengthSq() > 1) this.target.normalize();
      this.target.multiplyScalar(PLAYER.speed * this.stats.speedMul);
      this.velocity.lerp(this.target, 1 - Math.exp(-PLAYER.accel * dt));
    }
    p.x += this.velocity.x * dt;
    p.y += this.velocity.y * dt;

    // Das Schiff darf bis an den Bildrand, die Hälfte der Sprite-Breite bleibt sichtbar drin
    const maxX = FIELD.halfWidth - (SHIP_WIDTH / 2) * PIXEL;
    const maxY = FIELD.halfHeight - PLAYER.edgeMarginY;
    if (Math.abs(p.x) > maxX) {
      p.x = Math.sign(p.x) * maxX;
      this.velocity.x = 0;
    }
    if (Math.abs(p.y) > maxY) {
      p.y = Math.sign(p.y) * maxY;
      this.velocity.y = 0;
    }
    if (this.ceiling !== null && p.y > this.ceiling) {
      // Weich nach unten drücken statt hart zu stoppen (der Boss schiebt sich beim Einflug herein)
      p.y += (this.ceiling - p.y) * Math.min(1, dt * 10);
      this.velocity.y = Math.min(this.velocity.y, 0);
    }

    const bank = this.velocity.x / PLAYER.speed;
    this.frame = bank < -BANK_THRESHOLD ? 1 : bank > BANK_THRESHOLD ? 2 : 0;
  }

  /** engineFx = null: ohne Abgasteilchen. */
  private render(engineFx: Particles | null): void {
    const frame = this.frames[this.frame];
    this.ship.setFrame(this.frame);
    this.ship.place(this.position.x, this.position.y);
    const { x: sx, y: sy } = this.ship.mesh.position;

    // Flammen direkt unter den Düsen, 1 Pixel Überlappung
    const boosting = this.velocity.y > PLAYER.speed * 0.3;
    const tick = Math.floor(this.animTime * 16) % 2;
    const flameH = this.flames[0].heightPx;
    const flameY = sy - (SHIP_HEIGHT / 2) * PIXEL - (flameH / 2 - 1) * PIXEL;
    // Schildblase: flimmert, blinkt in den letzten 3 Sekunden
    const shieldOn = this.shielded && (this.shieldTime > 3 || Math.floor(this.shieldTime * 8) % 2 === 0);
    this.shield.visible = shieldOn;
    if (shieldOn) {
      this.shield.setFrame(Math.floor(this.animTime * 10) % 2);
      this.shield.place(sx, sy, 0.05);
    }

    this.flames.forEach((flame, i) => {
      flame.setFrame(boosting ? 1 + tick : tick);
      flame.mesh.position.set(sx + frame.engines[i] * PIXEL, flameY, -0.05);
    });

    if (!engineFx) return;
    for (const ex of frame.engines) {
      engineFx.emit(
        sx + ex * PIXEL + (Math.random() - 0.5) * PIXEL * 2,
        flameY - flameH * 0.3 * PIXEL,
        (Math.random() - 0.5) * 1.2,
        -7 - Math.random() * 5,
        0.25 + Math.random() * 0.2,
      );
    }
  }

  private shoot(dt: number, input: Controls, bullets: BulletPool, sparkFx: Particles): void {
    this.fireCooldown -= dt;
    if (!input.fire) {
      this.fireCooldown = Math.max(this.fireCooldown, 0);
      return;
    }
    if (this.fireCooldown > 0) return;
    this.fireCooldown += PLAYER.fireInterval * this.stats.fireIntervalMul;

    this.onFire?.();
    const { x: sx, y: sy } = this.ship.mesh.position;
    const tipY = sy + SHIP_NOSE_Y * PIXEL;
    for (const gx of SHIP_NOSE_GUNS) {
      const x = sx + gx * PIXEL;
      bullets.spawn(x, tipY + 4 * PIXEL, 0, PLAYER.bulletSpeed);
      for (let n = 0; n < 3; n++) {
        sparkFx.emit(x, tipY, (Math.random() - 0.5) * 5, 3 + Math.random() * 6, 0.12, MUZZLE_COLOR);
      }
    }

    const guns = this.stats.gunLevel;
    // Werft-Stufe 1: dritter Lauf in der Mitte
    if (guns >= 1) bullets.spawn(sx, tipY + 7 * PIXEL, 0, PLAYER.bulletSpeed);
    // Werft-Stufe 2: Flügelkanonen feuern geradeaus mit
    if (guns >= 2) {
      for (const i of [0, 1]) {
        const g = this.wingGun(i);
        bullets.spawn(g.x, g.y + 4 * PIXEL, 0, PLAYER.bulletSpeed);
      }
    }
    // Werft-Stufe 3 oder Fächer-Power-up: Flügelkanonen feuern zusätzlich schräg nach außen
    if (guns >= 3 || this.fanTime > 0) {
      const wingY = sy + SHIP_GUN_Y * PIXEL;
      this.frames[this.frame].guns.forEach((gx, i) => {
        const a = Math.PI / 2 + (i === 0 ? FAN_ANGLE : -FAN_ANGLE);
        const x = sx + gx * PIXEL;
        bullets.spawn(x, wingY + 4 * PIXEL, Math.cos(a) * PLAYER.bulletSpeed, Math.sin(a) * PLAYER.bulletSpeed);
        sparkFx.emit(x, wingY, (Math.random() - 0.5) * 5, 3 + Math.random() * 6, 0.12, MUZZLE_COLOR);
      });
    }
  }
}
