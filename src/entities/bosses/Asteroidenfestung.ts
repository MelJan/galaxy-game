import * as THREE from 'three';
import { PIXEL } from '../../config';
import { randRange } from '../../core/view';
import type { Beam, Beams } from '../../fx/Beams';
import type { PixelSprite } from '../../gfx/pixel';
import { ASTEROID_FRAMES, ASTEROID_FRAMES_COUNT, ASTEROID_R, REACTOR_FRAMES, TERRAN_PALETTE, TURRET_ROWS } from '../../gfx/terranArt';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const ROCK_DEBRIS = new THREE.Color(0x7e6448);
const TRACTOR_COLOR = 0x5af0ff;
/** Ab dieser Tiefe (cos des Winkels zur Kamera) gilt ein Anbau als vorne und sichtbar. */
const FRONT = 0.25;

/** Anbau auf der Kugeloberfläche: Länge und Breite in Körperkoordinaten. */
interface Module {
  sprite: PixelSprite;
  lon: number;
  lat: number;
  hp: number;
  alive: boolean;
  flash: number;
  fireTimer: number;
  /** Bildschirmposition und Tiefe, jedes Frame neu berechnet. */
  x: number;
  y: number;
  depth: number;
}

type Tractor = 'idle' | 'charge' | 'pull';

/**
 * Endgegner Sektor 5, Asteroidenfestung: ein riesiger Asteroid mit Station, der sich ständig dreht.
 * Geschütztürme und der Reaktor wandern mit der Drehung über die Vorderseite. Nur der Reaktor zählt –
 * und er ist nur verwundbar, solange er vorne ist. Mit jedem Schaden dreht sich die Festung schneller.
 * Zwischendurch zieht ein Traktorstrahl das Schiff heran, dazu schleudert sie Felsbrocken.
 */
export class Asteroidenfestung extends BossBase {
  private readonly rock: PixelSprite;
  private readonly turrets: Module[];
  private readonly reactor: Module;
  private rotation = 0;
  private reactorMax = 1;
  private wasFront = false;
  private tractor: Tractor = 'idle';
  private tractorTimer = 0;
  private tractorBeam: Beam | null = null;
  private rockTimer = 0;
  private readonly radius = ASTEROID_R * PIXEL;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, TERRAN_PALETTE, 1, 1, [['.']], ROCK_DEBRIS, 'metal');
    this.rock = this.sprite(ASTEROID_FRAMES);
    const module = (rows: string[][], lon: number, lat: number): Module => ({
      sprite: this.sprite(rows),
      lon,
      lat,
      hp: 0,
      alive: false,
      flash: 0,
      fireTimer: 0,
      x: 0,
      y: 0,
      depth: 0,
    });
    this.turrets = [
      module([TURRET_ROWS], 0.4, 0.45),
      module([TURRET_ROWS], 2.0, -0.35),
      module([TURRET_ROWS], 3.6, 0.2),
      module([TURRET_ROWS], 5.1, -0.5),
    ];
    this.reactor = module(REACTOR_FRAMES, 2.8, -0.15);
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [this.rock, ...this.turrets.map((t) => t.sprite), this.reactor.sprite];
  }

  /** Mittelpunkt des Asteroiden: oben im Bild, knapp unter dem Rand. */
  private get center(): { x: number; y: number } {
    return { x: this.x, y: this.y - this.radius - 0.6 };
  }

  get bottom(): number | null {
    return this.center.y - this.radius;
  }

  hullContains(x: number, y: number): boolean {
    if (this.phase === 'gone') return false;
    const c = this.center;
    return (x - c.x) ** 2 + (y - c.y) ** 2 < (this.radius * 0.95) ** 2;
  }

  /**
   * Die Felskugel ist (von oben gesehen) die Fläche hinter den Anbauten: Schüsse und Laser fliegen über sie hinweg
   * und treffen nur Geschütze und Reaktor. Rammen kann man sie trotzdem.
   */
  protected blocksShot(): boolean {
    return false;
  }

  protected hullRaycast(): number | null {
    return null;
  }

  protected dyingPoint(): { x: number; y: number } | null {
    const c = this.center;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.radius;
    return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
  }

  protected deathCenter(): { x: number; y: number } {
    return this.center;
  }

  protected onStart(): void {
    this.rotation = 0;
    this.reactorMax = this.reactor.hp = 110 * this.diff.hp;
    this.reactor.alive = true;
    for (const t of this.turrets) Object.assign(t, { hp: 16 * this.diff.hp, alive: true, flash: 0, fireTimer: randRange(1, 3) });
    for (const s of this.sprites()) s.visible = true;
    this.tractor = 'idle';
    this.tractorTimer = 7;
    this.rockTimer = 3;
    this.wasFront = false;
  }

  protected stopAttacks(): void {
    this.beams.release(this.tractorBeam);
    this.tractorBeam = null;
    this.tractor = 'idle';
    this.pull = null;
  }

  health(): number {
    return Math.max(0, this.reactor.hp) / this.reactorMax;
  }

  /** Positionen der Anbauten aus der aktuellen Drehung. */
  private placeModules(): void {
    const c = this.center;
    for (const m of [...this.turrets, this.reactor]) {
      const a = m.lon - this.rotation;
      m.x = c.x + this.radius * 0.9 * Math.cos(m.lat) * Math.sin(a);
      m.y = c.y + this.radius * 0.9 * Math.sin(m.lat);
      m.depth = Math.cos(m.lat) * Math.cos(a);
    }
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    // Je verletzter, desto schneller dreht sie sich
    this.rotation += dt * (0.32 + (1 - this.health()) * 0.45) * this.diff.speed;
    this.rage = (1 + (1 - this.health()) * 0.6) * this.diff.fireRate;
    this.placeModules();
    for (const m of [...this.turrets, this.reactor]) m.flash = Math.max(0, m.flash - dt * 8);

    // Geschütztürme feuern, solange sie vorne sind
    for (const t of this.turrets) {
      if (!t.alive || t.depth < FRONT) continue;
      t.fireTimer -= dt * this.rage;
      if (t.fireTimer > 0) continue;
      t.fireTimer = 2;
      const a = Math.atan2(py - t.y, px - t.x);
      for (const d of [-0.1, 0, 0.1]) out.shots.push({ x: t.x, y: t.y, vx: Math.cos(a + d) * 16, vy: Math.sin(a + d) * 16, style: 'tracer' });
    }

    // Kommt der Reaktor nach vorne, sendet er einen Ring aus
    const front = this.reactor.depth > FRONT;
    if (front && !this.wasFront) {
      this.events.banner('REAKTOR', 'JETZT TREFFEN', false);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        out.shots.push({ x: this.reactor.x, y: this.reactor.y, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, style: 'tracer' });
      }
    }
    this.wasFront = front;

    // Felsbrocken schleudern
    this.rockTimer -= dt * this.rage;
    if (this.rockTimer <= 0) {
      this.rockTimer = 3.2;
      const c = this.center;
      const side = Math.random() < 0.5 ? -1 : 1;
      out.spawns.push({ type: Math.random() < 0.35 ? 'rockBig' : 'rockSmall', x: c.x + side * this.radius * 0.7, y: c.y - this.radius * 0.6, vx: side * 3, vy: -5, speed: 7, hold: 0.6 });
    }

    this.updateTractor(dt, px, py);
  }

  /** Traktorstrahl: Vorwarnung, dann zieht er das Schiff zum Asteroiden. */
  private updateTractor(dt: number, px: number, py: number): void {
    this.tractorTimer -= dt * this.rage;
    const c = this.center;
    if (this.tractor === 'idle' && this.tractorTimer <= 0) {
      this.tractorBeam = this.beams.acquire(TRACTOR_COLOR, 1.6, false);
      if (this.tractorBeam) {
        this.tractor = 'charge';
        this.tractorTimer = 1.1;
        this.tractorBeam.charge = true;
      } else this.tractorTimer = 1;
    } else if (this.tractor === 'charge' && this.tractorTimer <= 0) {
      this.tractor = 'pull';
      this.tractorTimer = 2.6;
      if (this.tractorBeam) this.tractorBeam.charge = false;
      this.events.sfx('tractor');
      this.events.banner('TRAKTORSTRAHL', 'GEGENSTEUERN!', true);
    } else if (this.tractor === 'pull' && this.tractorTimer <= 0) {
      this.stopAttacks();
      this.tractorTimer = 9;
    }

    this.pull = this.tractor === 'pull' ? { x: c.x, y: c.y, strength: 11 } : null;
    const beam = this.tractorBeam;
    if (beam) {
      // Vom unteren Rand des Asteroiden zum Schiff
      const a = Math.atan2(py - c.y, px - c.x);
      beam.x = c.x + Math.cos(a) * this.radius;
      beam.y = c.y + Math.sin(a) * this.radius;
      beam.angle = a;
      beam.length = Math.max(0.5, Math.hypot(px - beam.x, py - beam.y));
    }
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    for (const t of this.turrets) {
      if (!t.alive || t.depth < FRONT) continue;
      list.push({
        x: t.x,
        y: t.y,
        radius: 0.7,
        hit: (dmg) => {
          t.hp -= dmg;
          t.flash = 1;
          if (t.hp > 0) return this.events.hit();
          t.alive = false;
          this.events.explode(t.x, t.y, 2, ROCK_DEBRIS);
          this.events.partDestroyed(t.x, t.y, 1200, 4, true);
        },
      });
    }
    const r = this.reactor;
    if (r.depth > FRONT) {
      list.push({
        x: r.x,
        y: r.y,
        radius: 0.95,
        hit: (dmg) => {
          r.hp -= dmg;
          r.flash = 1;
          this.events.hit();
          if (r.hp <= 0) this.startDying();
        },
      });
    }
    return list;
  }

  protected layout(): void {
    const c = this.center;
    const frame = Math.floor(((this.rotation / (Math.PI * 2)) % 1 + 1) % 1 * ASTEROID_FRAMES_COUNT) % ASTEROID_FRAMES_COUNT;
    this.rock.setFrame(frame);
    this.rock.setFlash(this.phase === 'dying' && Math.floor(this.phaseTime * 14) % 3 === 0 ? 0.6 : 0);
    this.rock.place(c.x, c.y, -0.3);
    this.placeModules();
    for (const m of [...this.turrets, this.reactor]) {
      // Hinter dem Horizont unsichtbar
      m.sprite.visible = m.alive && m.depth > 0.05 && this.phase !== 'dying';
      if (m === this.reactor) m.sprite.setFrame(Math.floor(this.time * 6) % 2);
      m.sprite.setFlash(m.flash > 0.5 ? 1 : 0);
      m.sprite.place(m.x, m.y, -0.2 + m.depth * 0.05);
    }
  }
}
