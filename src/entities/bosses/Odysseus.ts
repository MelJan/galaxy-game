import * as THREE from 'three';
import { FIELD, PIXEL } from '../../config';
import { randRange } from '../../core/view';
import type { Beam, Beams } from '../../fx/Beams';
import { FLEET_PALETTE, ODY_GAP, ODY_H, ODY_SHIELD_FRAMES, ODY_W, paintOdysseus, TORPEDO_ROWS } from '../../gfx/fleetArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { Bullet } from '../Bullets';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const HULL_DEBRIS = new THREE.Color(0xc8c4c0);
/** Schildring: Radius der Mitte des Rings (Welt-Einheiten). */
const RING_R = 48 * PIXEL;
/** Die Lücke ist für Schüsse etwas schmaler als gezeichnet (Rand des Rings). */
const GAP_HIT = ODY_GAP - 0.08;
const TELEPORT_OUT = 0.5;
const TELEPORT_IN = 0.4;
const BEAM_COLOR = 0xa8e0ff;
const TORPEDOES = 4;
const TORPEDO_SPLIT = 1.3;

interface Torpedo {
  sprite: PixelSprite;
  active: boolean;
  hp: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

type Warp = 'none' | 'out' | 'in';
type Sweep = 'idle' | 'charge' | 'fire';

/**
 * Zwischenboss in Sektor 10, Forschungskreuzer Odysseus: ein Pfeilrumpf mit Ringantrieb, umgeben von einem
 * Schildring mit einer Lücke, die langsam um das Schiff wandert. Treffer kommen nur durch die Lücke.
 * Der Kreuzer springt ab und zu an eine andere Stelle, fegt mit einem Lichtstrahl über das Feld und
 * schießt Torpedos, die sich in Splitter teilen.
 */
export class Odysseus extends BossBase {
  private readonly ship: PixelSprite;
  private readonly shield: PixelSprite;
  private readonly torpedoes: Torpedo[] = [];
  private sx = 0;
  private sy = 0;
  private gapAngle = -Math.PI / 2;
  private gapSpeed = 0.85;
  private hp = 0;
  private maxHp = 1;
  private flash = 0;
  private shieldFlash = 0;
  private warp: Warp = 'none';
  private warpTimer = 0;
  private teleportTimer = 0;
  private warpTo = { x: 0, y: 0 };
  private sweep: Sweep = 'idle';
  private sweepTimer = 0;
  private sweepFrom = 0;
  private beam: Beam | null = null;
  private torpedoTimer = 0;
  private boltTimer = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, FLEET_PALETTE, 1, 1, [['.']], HULL_DEBRIS, 'metal');
    this.ship = this.sprite([paintOdysseus()]);
    this.shield = this.sprite(ODY_SHIELD_FRAMES);
    for (let i = 0; i < TORPEDOES; i++) {
      this.torpedoes.push({ sprite: this.sprite([TORPEDO_ROWS]), active: false, hp: 0, x: 0, y: 0, vx: 0, vy: 0, age: 0 });
    }
    this.hint = ['SCHILDRING', 'NUR DURCH DIE LÜCKE TREFFEN'];
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [this.ship, this.shield, ...this.torpedoes.map((t) => t.sprite)];
  }

  get bottom(): number | null {
    return this.sy - RING_R - 0.8;
  }

  hullContains(): boolean {
    return false;
  }

  protected hullRaycast(): number | null {
    return null;
  }

  protected deathCenter(): { x: number; y: number } {
    return { x: this.sx, y: this.sy };
  }

  protected dyingPoint(): { x: number; y: number } {
    return { x: this.sx + randRange(-2, 2), y: this.sy + randRange(-4, 4) };
  }

  health(): number {
    return Math.max(0, this.hp) / this.maxHp;
  }

  protected onStart(): void {
    this.maxHp = this.hp = 190 * this.hpMul;
    this.flash = this.shieldFlash = 0;
    this.gapAngle = -Math.PI / 2 - 1.2;
    this.gapSpeed = 0.85;
    this.warp = 'none';
    this.teleportTimer = 8;
    this.sweep = 'idle';
    this.sweepTimer = 4;
    this.torpedoTimer = 3;
    this.boltTimer = 1.5;
    this.ship.visible = this.shield.visible = true;
    this.ship.mesh.scale.set(1, 1, 1);
    this.shield.mesh.scale.set(1, 1, 1);
    for (const t of this.torpedoes) this.removeTorpedo(t);
    this.sx = 0;
    this.sy = this.y - 9;
  }

  /** Liegt der Winkel a (Welt) in der Lücke? */
  private inGap(a: number): boolean {
    return Math.abs(Math.atan2(Math.sin(a - this.gapAngle), Math.cos(a - this.gapAngle))) < GAP_HIT;
  }

  private get shielded(): boolean {
    return this.phase !== 'enter' && this.phase !== 'dying' && this.warp === 'none';
  }

  /**
   * Torpedos zuerst, dann der Schildring: Ein Schuss, der den Ring von außen kreuzt, kommt nur in der Lücke durch.
   * Innerhalb des Rings gilt die normale Trefferprüfung.
   */
  hitTestBullet(b: Bullet, damage: number): boolean {
    if (this.phase === 'gone') return false;
    for (const t of this.torpedoes) {
      if (!t.active) continue;
      if ((t.x - b.x) ** 2 + (t.y - b.y) ** 2 > 0.7 ** 2) continue;
      this.damageTorpedo(t, damage);
      return true;
    }
    const d0 = Math.hypot(b.prevX - this.sx, b.prevY - this.sy);
    const d1 = Math.hypot(b.x - this.sx, b.y - this.sy);
    if (this.shielded && d0 >= RING_R - 0.3 && d1 < RING_R + 0.3) {
      // Kreuzungspunkt grob: der Punkt der Strecke, der dem Ring am nächsten liegt
      const s = d0 === d1 ? 1 : THREE.MathUtils.clamp((d0 - RING_R) / (d0 - d1), 0, 1);
      const x = b.prevX + (b.x - b.prevX) * s;
      const y = b.prevY + (b.y - b.prevY) * s;
      if (!this.inGap(Math.atan2(y - this.sy, x - this.sx))) {
        this.events.shieldSparks(x, y);
        this.events.deflect();
        this.shieldFlash = 1;
        return true;
      }
    }
    if (d1 > RING_R + 0.3) return false;
    return super.hitTestBullet(b, damage);
  }

  raycastUp(x: number, y0: number, halfWidth: number) {
    const dx = x - this.sx;
    if (this.shielded && Math.abs(dx) < RING_R) {
      const yLow = this.sy - Math.sqrt(RING_R * RING_R - dx * dx);
      if (yLow > y0 && !this.inGap(Math.atan2(yLow - this.sy, dx))) return { y: yLow, target: null };
    }
    return super.raycastUp(x, y0, halfWidth);
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.6) * this.diff.fireRate;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 5);
    const angry = this.health() < 0.5;
    this.gapAngle += this.gapSpeed * (angry ? 1.5 : 1) * dt;

    this.updateWarp(dt);
    this.updateSweep(dt);

    // Doppelbolzen aus dem Bug
    const nose = this.nose();
    this.boltTimer -= dt * this.rage;
    if (this.boltTimer <= 0 && this.warp === 'none') {
      this.boltTimer = 1.3;
      const a = Math.atan2(py - nose.y, px - nose.x);
      for (const off of [-0.12, 0.12]) out.shots.push({ x: nose.x, y: nose.y, vx: Math.cos(a + off) * 16, vy: Math.sin(a + off) * 16, style: 'bolt' });
    }

    // Torpedos: langsam, teilen sich in einen Splitterfächer
    this.torpedoTimer -= dt * this.rage;
    if (this.torpedoTimer <= 0 && this.warp === 'none') {
      this.torpedoTimer = angry ? 3 : 4.2;
      for (const side of angry ? [-1, 1] : [Math.random() < 0.5 ? -1 : 1]) {
        const t = this.torpedoes.find((t) => !t.active);
        if (!t) break;
        Object.assign(t, { active: true, hp: 3 * this.diff.hp, x: this.sx + side * 2.5, y: this.sy - 3, vx: side * 2.5, vy: -6, age: 0 });
        t.sprite.visible = true;
      }
    }
    for (const t of this.torpedoes) {
      if (!t.active) continue;
      t.age += dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (t.age >= TORPEDO_SPLIT) {
        const base = Math.atan2(py - t.y, px - t.x);
        for (let i = 0; i < 7; i++) {
          const a = base + (i - 3) * 0.28;
          out.shots.push({ x: t.x, y: t.y, vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, style: 'normal' });
        }
        this.events.sparks(t.x, t.y);
        this.events.sfx('split');
        this.removeTorpedo(t);
      }
    }
  }

  private nose(): { x: number; y: number } {
    return { x: this.sx, y: this.sy - (ODY_H / 2) * PIXEL };
  }

  private updateWarp(dt: number): void {
    this.warpTimer += dt;
    if (this.warp === 'none') {
      this.teleportTimer -= dt;
      if (this.teleportTimer <= 0 && this.sweep === 'idle') {
        this.warp = 'out';
        this.warpTimer = 0;
        const hw = Math.min(FIELD.halfWidth - RING_R - 0.5, 9);
        let x = randRange(-hw, hw);
        if (Math.abs(x - this.sx) < 4) x = -Math.sign(this.sx || 1) * hw * 0.8;
        this.warpTo = { x, y: this.y - randRange(7.5, 10.5) };
        this.events.sfx('teleport');
      }
    } else if (this.warp === 'out' && this.warpTimer >= TELEPORT_OUT) {
      this.sx = this.warpTo.x;
      this.sy = this.warpTo.y;
      this.warp = 'in';
      this.warpTimer = 0;
    } else if (this.warp === 'in' && this.warpTimer >= TELEPORT_IN) {
      this.warp = 'none';
      this.teleportTimer = this.health() < 0.5 ? 6 : 9;
      // Nach dem Sprung dreht die Lücke manchmal die Richtung
      if (Math.random() < 0.5) this.gapSpeed = -this.gapSpeed;
    }
  }

  /** Lichtstrahl: lädt, dann fegt er von einer Seite zur anderen. */
  private updateSweep(dt: number): void {
    this.sweepTimer -= dt * this.rage;
    const n = this.nose();
    if (this.sweep === 'idle') {
      if (this.sweepTimer <= 0 && this.warp === 'none') {
        this.sweep = 'charge';
        this.sweepTimer = 1;
        this.sweepFrom = Math.random() < 0.5 ? -1 : 1;
        this.beam = this.beams.acquire(BEAM_COLOR, 0.9, true);
        if (this.beam) this.beam.charge = true;
      }
    } else if (this.sweep === 'charge') {
      if (this.sweepTimer <= 0) {
        this.sweep = 'fire';
        this.sweepTimer = 2.4;
        if (this.beam) this.beam.charge = false;
      }
    } else if (this.sweepTimer <= 0) {
      this.sweep = 'idle';
      this.sweepTimer = 5;
      this.beams.release(this.beam);
      this.beam = null;
    }
    if (this.beam) {
      const u = this.sweep === 'fire' ? 1 - Math.max(0, this.sweepTimer) / 2.4 : 0;
      this.beam.x = n.x;
      this.beam.y = n.y;
      this.beam.angle = -Math.PI / 2 + this.sweepFrom * (0.75 - 1.5 * u);
      this.beam.length = 60;
    }
  }

  private damageTorpedo(t: Torpedo, dmg: number): void {
    t.hp -= dmg;
    if (t.hp > 0) return this.events.sparks(t.x, t.y);
    this.events.explode(t.x, t.y, 1, HULL_DEBRIS);
    this.events.partDestroyed(t.x, t.y, 100, 0, false);
    this.removeTorpedo(t);
  }

  private removeTorpedo(t: Torpedo): void {
    t.active = false;
    t.sprite.visible = false;
  }

  protected stopAttacks(): void {
    this.beams.release(this.beam);
    this.beam = null;
    this.sweep = 'idle';
    for (const t of this.torpedoes) this.removeTorpedo(t);
  }

  protected targets(): BossTarget[] {
    if (this.warp !== 'none') return [];
    const hit = (dmg: number) => {
      this.hp -= dmg;
      this.flash = 1;
      this.events.hit();
      if (this.hp <= 0) this.startDying();
    };
    // Rumpf (Mitte und Bugbereich), Ringantrieb oben
    return [
      { x: this.sx, y: this.sy - 1.2, radius: 1.8, hit },
      { x: this.sx, y: this.sy + 2.6, radius: 1.6, hit },
    ];
  }

  protected layout(): void {
    if (this.phase === 'enter') {
      this.sx = this.x;
      this.sy = this.y - 9;
    }
    // Sprung: in die Länge ziehen und verschwinden, dann an der neuen Stelle aufziehen
    let k = 1;
    if (this.warp === 'out') k = 1 - Math.min(1, this.warpTimer / TELEPORT_OUT);
    else if (this.warp === 'in') k = Math.min(1, this.warpTimer / TELEPORT_IN);
    this.ship.mesh.scale.set(Math.max(0.02, k), 1 + (1 - k) * 1.5, 1);
    this.ship.setFlash(this.phase === 'dying' || this.flash > 0.5 || k < 1 ? 1 : 0);
    this.ship.place(this.sx, this.sy, -0.2);
    this.shield.visible = this.phase !== 'dying' && this.warp === 'none';
    this.shield.setFrame(Math.floor(this.time * 8) % 2);
    this.shield.setFlash(this.shieldFlash > 0.5 ? 0.8 : 0);
    this.shield.mesh.rotation.z = this.gapAngle - Math.PI / 2;
    this.shield.place(this.sx, this.sy, -0.1);
    for (const t of this.torpedoes) {
      if (!t.active) continue;
      t.sprite.setFlash(t.age > TORPEDO_SPLIT - 0.4 && Math.floor(this.time * 16) % 2 === 0 ? 1 : 0);
      t.sprite.place(t.x, t.y, -0.05);
    }
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    if (this.warp === 'none' && Math.abs(px - this.sx) < (ODY_W / 2) * PIXEL * 0.6 && Math.abs(py - this.sy) < (ODY_H / 2) * PIXEL) return true;
    return this.torpedoes.some((t) => t.active && (t.x - px) ** 2 + (t.y - py) ** 2 < (0.5 + r) ** 2);
  }
}
