import * as THREE from 'three';
import type { Sound } from '../audio/Sound';
import { PLAYER } from '../config';
import type { Controls } from '../core/Input';
import type { BulletPool } from '../entities/Bullets';
import type { Player } from '../entities/Player';
import type { Beam, Beams } from '../fx/Beams';
import { OPTION_FRAMES, POWERUP_PALETTE } from '../gfx/bossArt';
import { makePixelTexture, PixelSprite } from '../gfx/pixel';

export const LASER_TIME = 12;
export const MISSILE_TIME = 15;
export const OPTION_TIME = 20;
/** Schaden des Dauerlasers pro Sekunde. */
export const LASER_DPS = 26;
export const LASER_WIDTH = 0.85;
export const MISSILE_DAMAGE = 3;

const LASER_COLOR = 0xff6af0;
const MISSILE_INTERVAL = 0.45;
const OPTION_INTERVAL = 0.16;
/** Ruheposition der Begleiter relativ zum Schiff. */
const OPTION_OFFSETS = [
  new THREE.Vector2(-3.4, -0.8),
  new THREE.Vector2(3.4, -0.8),
];

/**
 * Zusatzwaffen aus Power-ups: Dauerlaser (ersetzt die Kanonen), Zielsuch-Raketen und zwei Begleiter, die mitschießen.
 * Die Restzeiten laufen unabhängig voneinander, mehrere können gleichzeitig aktiv sein.
 */
export class Weapons {
  laserTime = 0;
  missileTime = 0;
  optionTime = 0;
  /** Dauerhafte Begleiter aus der Werft (0–2). */
  permanentDrones = 0;
  /** Aktiver Laserstrahl; Länge und Treffer setzt die Spiellogik. */
  laser: Beam | null = null;
  private missileTimer = 0;
  private optionTimer = 0;
  private readonly options: PixelSprite[];
  private readonly optionPos = OPTION_OFFSETS.map(() => new THREE.Vector2());
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private readonly beams: Beams,
    private readonly bullets: BulletPool,
    private readonly missiles: BulletPool,
    private readonly sound: Sound,
  ) {
    const frames = OPTION_FRAMES.map((rows) => makePixelTexture(rows, POWERUP_PALETTE));
    this.options = OPTION_OFFSETS.map(() => {
      const s = new PixelSprite(frames, OPTION_FRAMES[0][0].length, OPTION_FRAMES[0].length);
      s.visible = false;
      scene.add(s.mesh);
      return s;
    });
  }

  get laserActive(): boolean {
    return this.laserTime > 0;
  }

  reset(): void {
    this.laserTime = this.missileTime = this.optionTime = 0;
    this.permanentDrones = 0;
    this.stopLaser();
    for (const o of this.options) o.visible = false;
  }

  /** Laserstrahl und sein Dauerton aus (Power-up-Zeit bleibt erhalten). */
  stopLaser(): void {
    if (!this.laser) return;
    this.beams.release(this.laser);
    this.laser = null;
    this.sound.setLaser(false);
  }

  update(dt: number, input: Controls, player: Player): void {
    this.time += dt;
    this.laserTime = Math.max(0, this.laserTime - dt);
    this.missileTime = Math.max(0, this.missileTime - dt);
    this.optionTime = Math.max(0, this.optionTime - dt);
    const firing = input.fire && player.alive;

    // Dauerlaser aus der Schiffsnase
    if (this.laserTime > 0 && firing) {
      if (!this.laser) {
        this.laser = this.beams.acquire(LASER_COLOR, LASER_WIDTH, false);
        this.sound.setLaser(true);
      }
      if (this.laser) {
        this.laser.x = player.x;
        this.laser.y = player.noseY;
        this.laser.angle = Math.PI / 2;
      }
    } else this.stopLaser();

    // Zielsuch-Raketen aus den Flügelkanonen
    this.missileTimer -= dt;
    if (this.missileTime > 0 && firing && this.missileTimer <= 0) {
      this.missileTimer = MISSILE_INTERVAL;
      for (const i of [0, 1]) {
        const g = player.wingGun(i);
        this.missiles.spawn(g.x, g.y, (i === 0 ? -1 : 1) * 7, 16, { homing: 5, life: 3 });
      }
      this.sound.missile();
    }

    // Begleiter folgen dem Schiff mit etwas Verzögerung und schießen geradeaus.
    // Dauerhafte aus der Werft zuerst, das Power-up ergänzt die übrigen (blinkt kurz vor Ablauf).
    const powerUp = this.optionTime > 0 && (this.optionTime > 3 || Math.floor(this.optionTime * 8) % 2 === 0);
    this.options.forEach((o, i) => {
      const show = player.alive && (i < this.permanentDrones || powerUp);
      const target = OPTION_OFFSETS[i];
      const bob = Math.sin(this.time * 3 + i * Math.PI) * 0.35;
      const pos = this.optionPos[i];
      if (!o.visible) pos.set(player.x + target.x, player.y + target.y);
      pos.x += (player.x + target.x - pos.x) * Math.min(1, dt * 8);
      pos.y += (player.y + target.y + bob - pos.y) * Math.min(1, dt * 8);
      o.visible = show;
      o.setFrame(Math.floor(this.time * 10) % 2);
      o.place(pos.x, pos.y, 0.05);
    });
    this.optionTimer -= dt;
    if (firing && this.optionTimer <= 0) {
      this.optionTimer = OPTION_INTERVAL;
      this.options.forEach((o, i) => {
        if (o.visible) this.bullets.spawn(this.optionPos[i].x, this.optionPos[i].y + 0.6, 0, PLAYER.bulletSpeed);
      });
    }
  }
}
