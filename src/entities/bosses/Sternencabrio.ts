import * as THREE from 'three';
import { FIELD, PIXEL } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import { CABRIO_BATTERY_Y, CABRIO_FRAMES, ORBIT_PALETTE } from '../../gfx/orbitArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const CAR_DEBRIS = new THREE.Color(0xff4a3a);
const CRUISE_SPEED = 9.5;
const TURN_RATE = 2.6;
const DASH_SPEED = 24;
const HONK_TIME = 0.8;
const DONUT_TIME = 2.6;
/** Ab diesem Skalarprodukt zeigt das Heck genug zum Spieler, damit der Akku offen liegt (auch schräg von hinten). */
const EXPOSED_DOT = 0.05;

type Drive = 'cruise' | 'honk' | 'dash' | 'donut';

/**
 * Zwischenboss in Sektor 9, Sternencabrio: ein rotes Cabrio, das jemand einmal ins All geschossen hat.
 * Inzwischen sitzt ein Alien am Steuer und dreht Runden über dem Spieler.
 * Verwundbar ist nur der leuchtende Akku im Heck: Man trifft ihn nur, wenn das Auto vom Spieler wegfährt.
 * Die Front lenkt alle Schüsse ab. Zwischendurch hupt es und rast auf den Spieler zu (danach wendet es und zeigt das Heck)
 * oder dreht Donuts und verstreut Krempel. Ab halber Energie: Turbo.
 */
export class Sternencabrio extends BossBase {
  private readonly car: PixelSprite;
  private cx = 0;
  private cy = 0;
  private heading = -Math.PI / 2;
  private speed = 0;
  private drive: Drive = 'cruise';
  private driveTimer = 0;
  private waypoint = 0;
  private lapsUntilTrick = 0;
  /** Umlaufrichtung der Runde: 1 = gegen den Uhrzeigersinn. */
  private lapDir = 1;
  private dashTo = { x: 0, y: 0 };
  private hp = 0;
  private maxHp = 1;
  private flash = 0;
  private turbo = false;
  private throwTimer = 0;
  private sparkTimer = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, ORBIT_PALETTE, 1, 1, [['.']], CAR_DEBRIS, 'metal');
    this.car = this.sprite(CABRIO_FRAMES);
    this.hint = ['AKKU IM HECK', 'TRIFF IHN, WENN DAS AUTO WEGFÄHRT'];
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [this.car];
  }

  get bottom(): number | null {
    return null;
  }

  hullContains(): boolean {
    return false;
  }

  protected hullRaycast(): number | null {
    return null;
  }

  protected deathCenter(): { x: number; y: number } {
    return { x: this.cx, y: this.cy };
  }

  protected dyingPoint(): { x: number; y: number } {
    return { x: this.cx + randRange(-1.5, 1.5), y: this.cy + randRange(-2.5, 2.5) };
  }

  health(): number {
    return Math.max(0, this.hp) / this.maxHp;
  }

  protected onStart(): void {
    this.maxHp = this.hp = 170 * this.hpMul;
    this.car.visible = true;
    this.cx = 0;
    this.cy = this.y - 6;
    this.heading = -Math.PI / 2;
    this.speed = 0;
    this.drive = 'cruise';
    this.waypoint = 0;
    this.lapsUntilTrick = 5;
    this.lapDir = 1;
    this.flash = 0;
    this.turbo = false;
    this.throwTimer = 2;
  }

  /** Eckpunkte der Runde: ein Rechteck mit abgerundeten Kurven (durch das Lenken) im oberen Feld. */
  private corner(i: number): { x: number; y: number } {
    const hw = Math.min(FIELD.halfWidth - 3.5, 12);
    const pts = [
      { x: hw, y: -1 },
      { x: hw, y: 12 },
      { x: -hw, y: 12 },
      { x: -hw, y: -1 },
    ];
    const n = pts.length;
    return pts[(((i * this.lapDir) % n) + n) % n];
  }

  private get dirX(): number {
    return Math.cos(this.heading);
  }

  private get dirY(): number {
    return Math.sin(this.heading);
  }

  /** Lage des Akkus (Heck) in Welt-Koordinaten. */
  private battery(): { x: number; y: number } {
    const d = CABRIO_BATTERY_Y * PIXEL;
    return { x: this.cx - this.dirX * d, y: this.cy - this.dirY * d };
  }

  /** Zeigt das Heck zum Spieler? */
  private exposed(): boolean {
    const b = this.battery();
    const tx = this.px - b.x;
    const ty = this.py - b.y;
    const len = Math.hypot(tx, ty) || 1;
    return (-this.dirX * tx - this.dirY * ty) / len > EXPOSED_DOT;
  }

  /** Lenkt das Auto auf einen Punkt zu (begrenzte Lenkgeschwindigkeit). */
  private steer(dt: number, tx: number, ty: number, turn: number): void {
    const want = Math.atan2(ty - this.cy, tx - this.cx);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += THREE.MathUtils.clamp(diff, -turn * dt, turn * dt);
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.5) * this.diff.fireRate;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.driveTimer += dt;
    // Turbo ab halber Energie; das Grundtempo folgt dem Schwierigkeitsgrad
    const boost = (this.turbo ? 1.4 : 1) * this.diff.speed;

    if (!this.turbo && this.health() < 0.5) {
      this.turbo = true;
      this.events.banner('TURBO!', 'DER FAHRER DREHT DURCH', true);
      this.events.sfx('honk');
    }

    switch (this.drive) {
      case 'cruise': {
        const c = this.corner(this.waypoint);
        this.speed += (CRUISE_SPEED * boost - this.speed) * Math.min(1, dt * 2);
        this.steer(dt, c.x, c.y, TURN_RATE * boost);
        if ((c.x - this.cx) ** 2 + (c.y - this.cy) ** 2 < 6) {
          this.waypoint++;
          if (--this.lapsUntilTrick <= 0) {
            this.lapsUntilTrick = 4 + Math.floor(Math.random() * 3);
            this.setDrive(Math.random() < 0.55 ? 'honk' : 'donut');
          }
        }
        break;
      }
      case 'honk':
        // Bremst, richtet sich auf den Spieler aus und hupt
        this.speed = Math.max(0, this.speed - dt * 30);
        this.steer(dt, px, py, 5);
        if (this.driveTimer >= HONK_TIME / boost) {
          this.dashTo = { x: px, y: Math.max(py + 1, -FIELD.halfHeight + 4) };
          this.setDrive('dash');
        }
        break;
      case 'dash':
        this.speed = DASH_SPEED * boost;
        this.steer(dt, this.dashTo.x, this.dashTo.y, 0.6);
        if (this.cy < this.dashTo.y + 1 || this.driveTimer > 1.6 || Math.abs(this.cx) > FIELD.halfWidth - 1) {
          // Wendet und fährt nach oben davon: Jetzt zeigt das Heck zum Spieler
          this.lapDir = -this.lapDir;
          this.waypoint = this.nearestCornerAbove();
          this.setDrive('cruise');
        }
        break;
      case 'donut':
        // Dreht auf der Stelle und verstreut Krempel nach allen Seiten
        this.speed = Math.max(3, this.speed - dt * 20);
        this.heading += 5.5 * boost * dt;
        this.throwTimer -= dt * 3 * this.rage;
        if (this.throwTimer <= 0) {
          this.throwTimer = 1;
          const b = this.battery();
          const a = this.heading + Math.PI + randRange(-0.3, 0.3);
          out.shots.push({ x: b.x, y: b.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, style: 'normal' });
          this.events.sparks(b.x, b.y);
        }
        if (this.driveTimer >= DONUT_TIME) {
          this.throwTimer = 1.5;
          this.setDrive('cruise');
        }
        break;
    }

    this.cx += this.dirX * this.speed * dt;
    this.cy += this.dirY * this.speed * dt;
    this.cx = THREE.MathUtils.clamp(this.cx, -FIELD.halfWidth + 1.5, FIELD.halfWidth - 1.5);
    this.cy = THREE.MathUtils.clamp(this.cy, -FIELD.halfHeight + 2, FIELD.halfHeight - 1);

    // Der Fahrer wirft Krempel in hohem Bogen nach dem Spieler
    if (this.drive === 'cruise') {
      this.throwTimer -= dt * this.rage;
      if (this.throwTimer <= 0) {
        this.throwTimer = this.turbo ? 1.1 : 1.6;
        const t = 1.1;
        const g = 8;
        const vx = (px - this.cx) / t;
        const vy = (py - this.cy) / t + 0.5 * g * t;
        out.shots.push({ x: this.cx, y: this.cy, vx, vy, style: 'normal', gravity: g });
      }
    }

    // Funkenspur aus dem Heck bei Turbo und beim Sturmangriff
    this.sparkTimer -= dt;
    if ((this.turbo || this.drive === 'dash') && this.sparkTimer <= 0) {
      this.sparkTimer = 0.06;
      const b = this.battery();
      this.events.sparks(b.x, b.y);
    }
  }

  private setDrive(d: Drive): void {
    this.drive = d;
    this.driveTimer = 0;
    if (d === 'honk') this.events.sfx('honk');
  }

  /** Index des oberen Eckpunkts, der am nächsten liegt. */
  private nearestCornerAbove(): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < 4; i++) {
      const c = this.corner(i);
      if (c.y < 5) continue;
      const d = (c.x - this.cx) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    return best;
  }

  protected targets(): BossTarget[] {
    const b = this.battery();
    const open = this.exposed();
    const list: BossTarget[] = [
      {
        x: b.x,
        y: b.y,
        radius: 1,
        armor: !open,
        hit: (dmg) => {
          this.hp -= dmg;
          this.flash = 1;
          this.events.hit();
          if (this.hp <= 0) this.startDying();
        },
      },
    ];
    // Die Karosserie selbst schluckt Schüsse (Front und Seiten)
    for (const f of [0, 0.55]) {
      const d = CABRIO_BATTERY_Y * PIXEL * f;
      list.push({ x: this.cx + this.dirX * d, y: this.cy + this.dirY * d, radius: 1.35, armor: true, noMissile: true, hit: () => {} });
    }
    return list;
  }

  protected layout(): void {
    if (this.phase === 'enter') {
      this.cx = 0;
      this.cy = this.y - 6;
    }
    const open = this.phase !== 'enter' && this.exposed();
    this.car.setFrame(open && Math.floor(this.time * 8) % 2 === 0 ? 1 : 0);
    this.car.setFlash(this.phase === 'dying' || this.flash > 0.5 || (this.drive === 'honk' && Math.floor(this.time * 12) % 2 === 0) ? 1 : 0);
    this.car.mesh.rotation.z = this.heading - Math.PI / 2;
    this.car.place(this.cx, this.cy, -0.2);
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    for (const f of [-0.8, 0, 0.8]) {
      const d = CABRIO_BATTERY_Y * PIXEL * f;
      if ((this.cx + this.dirX * d - px) ** 2 + (this.cy + this.dirY * d - py) ** 2 < (1.3 + r) ** 2) return true;
    }
    return false;
  }
}
