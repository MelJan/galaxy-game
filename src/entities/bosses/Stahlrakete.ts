import * as THREE from 'three';
import { FIELD } from '../../config';
import { randRange } from '../../core/view';
import type { Beam, Beams } from '../../fx/Beams';
import type { PixelSprite } from '../../gfx/pixel';
import {
  BOOSTER_ENGINE_Y,
  BOOSTER_ENGINES,
  BOOSTER_ROWS,
  NOZZLE_FRAMES,
  paintRocket,
  ROCKET_H,
  ROCKET_W,
  SHIP_ENGINE_Y,
  SHIP_ENGINES,
  STAGE_ROW,
  TERRAN_PALETTE,
} from '../../gfx/terranArt';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget, type Mount } from './BossBase';

const STEEL_DEBRIS = new THREE.Color(0xa8b4bc);
const FLAME_COLOR = 0xff9a3a;
/** Booster-Triebwerke, die übrig bleiben dürfen, bevor die Stufentrennung kommt. */
const ENGINES_LEFT_FOR_STAGING = 1;
const STAGING_TIME = 2.2;

type EngineState = 'cold' | 'charge' | 'fire';

interface Engine {
  mount: Mount;
  glow: PixelSprite;
  hp: number;
  alive: boolean;
  flash: number;
  state: EngineState;
  timer: number;
  beam: Beam | null;
}

/** Ablauf der Oberstufe nach der Trennung: gleiten → anvisieren → Sturz → Bremsfeuer → Steigen (verwundbar). */
type ShipMove = 'glide' | 'aim' | 'dive' | 'burn' | 'climb';

/**
 * Zwischenboss in Sektor 5, Stahlrakete (Kampf-Oberstufe der Miliz auf einem Booster):
 * Phase 1: Booster-Triebwerke zünden abwechselnd Flammenstrahlen nach unten. Nur kalte Triebwerke sind verwundbar.
 * Phase 2 nach der heißen Stufentrennung: Der Booster stürzt ab, die Oberstufe gleitet hin und her und stürzt sich
 * im „Suicide Burn“ herab. Ihre drei Triebwerke sind nur verwundbar, während sie danach abkühlt und wieder steigt.
 */
export class Stahlrakete extends BossBase {
  private readonly booster: Engine[];
  private readonly shipEngines: Engine[];
  private readonly fallingBooster: PixelSprite;
  private fall = { x: 0, y: 0, vy: 0, rot: 0, active: false };
  private igniteTimer = 0;
  private burstTimer = 0;
  private move: ShipMove = 'glide';
  private moveTimer = 0;
  private glideTarget = 0;
  /** Abstand des Schiffs nach unten (Sturzflug), zusätzlich zur Ruheposition. */
  private drop = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, TERRAN_PALETTE, ROCKET_W, ROCKET_H, [paintRocket(true), paintRocket(false)], STEEL_DEBRIS, 'metal');
    const engine = (x: number, y: number): Engine => ({
      mount: { x, y },
      glow: this.sprite(NOZZLE_FRAMES),
      hp: 0,
      alive: false,
      flash: 0,
      state: 'cold',
      timer: 0,
      beam: null,
    });
    this.booster = BOOSTER_ENGINES.map((x) => engine(x, BOOSTER_ENGINE_Y));
    this.shipEngines = SHIP_ENGINES.map((x) => engine(x, SHIP_ENGINE_Y));
    this.fallingBooster = this.sprite([BOOSTER_ROWS]);
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [...this.booster.map((e) => e.glow), ...this.shipEngines.map((e) => e.glow), this.fallingBooster];
  }

  protected onStart(): void {
    for (const e of this.booster) this.resetEngine(e, 22);
    for (const e of this.shipEngines) this.resetEngine(e, 26);
    this.fall.active = false;
    this.fallingBooster.visible = false;
    this.igniteTimer = 1.5;
    this.burstTimer = 2;
    this.drop = 0;
    this.move = 'glide';
    this.moveTimer = 3;
  }

  private resetEngine(e: Engine, hp: number): void {
    this.beams.release(e.beam);
    Object.assign(e, { hp: hp * this.hpMul, alive: true, flash: 0, state: 'cold', timer: 0, beam: null });
    e.glow.visible = false;
    e.glow.setFrame(0);
  }

  protected stopAttacks(): void {
    for (const e of [...this.booster, ...this.shipEngines]) {
      this.beams.release(e.beam);
      e.beam = null;
      if (e.alive) e.state = 'cold';
    }
  }

  health(): number {
    const sum = (list: Engine[], hp: number) => list.reduce((n, e) => n + (e.alive ? Math.max(0, e.hp) : 0), 0) / (list.length * hp * this.hpMul);
    if (this.phase === 'enter' || this.phase === 'fight') return 0.5 + 0.5 * sum(this.booster, 22);
    return 0.5 * sum(this.shipEngines, 26);
  }

  get bottom(): number | null {
    // Nach der Trennung zählt nur noch das Schiff (oberer Teil des Rumpf-Rasters)
    const row = this.phase === 'enter' || this.phase === 'fight' ? ROCKET_H : STAGE_ROW;
    return this.world({ x: 0, y: row }).y;
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.6) * this.diff.fireRate;
    for (const e of [...this.booster, ...this.shipEngines]) e.flash = Math.max(0, e.flash - dt * 8);

    // Leuchtspur-Salven aus dem Schiff
    this.burstTimer -= dt * this.rage;
    if (this.burstTimer <= 0 && this.phase !== 'opening') {
      this.burstTimer = 2.4;
      const o = this.world({ x: ROCKET_W / 2, y: 30 });
      for (let i = 0; i < 4; i++) {
        const a = Math.atan2(py - o.y, px - o.x) + (i - 1.5) * 0.12;
        out.shots.push({ x: o.x, y: o.y, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, style: 'tracer' });
      }
    }

    if (this.phase === 'fight') this.updateBooster(dt);
    else if (this.phase === 'opening') {
      if (this.phaseTime >= STAGING_TIME) {
        this.setPhase('core');
        this.move = 'glide';
        this.moveTimer = 2;
      }
    } else if (this.phase === 'core') this.updateShip(dt, px);

    this.updateFallingBooster(dt);
  }

  /** Phase 1: immer zwei kalte Triebwerke laden auf und feuern. */
  private updateBooster(dt: number): void {
    this.igniteTimer -= dt * this.rage;
    if (this.igniteTimer <= 0) {
      this.igniteTimer = 2.2;
      const cold = this.booster.filter((e) => e.alive && e.state === 'cold');
      for (let i = 0; i < 2 && cold.length; i++) {
        const e = cold.splice(Math.floor(Math.random() * cold.length), 1)[0];
        e.state = 'charge';
        e.timer = 0.9;
      }
    }
    this.updateEngineCycle(this.booster, dt, 1.4, 0.8);
    if (this.booster.filter((e) => e.alive).length <= ENGINES_LEFT_FOR_STAGING) this.stage();
  }

  /** Laden → Feuern → Abkühlen für eine Gruppe Triebwerke. */
  private updateEngineCycle(list: Engine[], dt: number, fireTime: number, width: number): void {
    for (const e of list) {
      if (!e.alive || e.state === 'cold') continue;
      e.timer -= dt;
      if (e.timer > 0) continue;
      if (e.state === 'charge') {
        e.state = 'fire';
        e.timer = fireTime;
        e.beam = this.beams.acquire(FLAME_COLOR, width, true);
        this.events.sfx('ignite');
      } else {
        e.state = 'cold';
        this.beams.release(e.beam);
        e.beam = null;
      }
    }
  }

  /** Heiße Stufentrennung: Booster fällt, die Oberstufe fliegt allein weiter. */
  private stage(): void {
    for (const e of this.booster) {
      this.beams.release(e.beam);
      e.beam = null;
      e.alive = false;
      e.glow.visible = false;
    }
    this.setHullVariant(1);
    this.setPhase('opening');
    const c = this.world({ x: ROCKET_W / 2, y: STAGE_ROW + 33 });
    this.fall = { x: c.x, y: c.y, vy: 0, rot: 0, active: true };
    this.fallingBooster.visible = true;
    const ring = this.world({ x: ROCKET_W / 2, y: STAGE_ROW });
    for (const dx of [-1.2, 0, 1.2]) this.events.explode(ring.x + dx, ring.y, 2, STEEL_DEBRIS);
    this.events.sfx('separation');
    this.events.shake(1);
    this.events.banner('STUFENTRENNUNG', 'BOOSTER STÜRZT AB', true);
  }

  private updateFallingBooster(dt: number): void {
    const f = this.fall;
    if (!f.active) return;
    f.vy -= 14 * dt;
    f.y += f.vy * dt;
    f.rot += dt * 0.6;
    if (f.y < -FIELD.halfHeight - 6) {
      f.active = false;
      this.fallingBooster.visible = false;
      this.events.explode(f.x, -FIELD.halfHeight + 1, 3, STEEL_DEBRIS);
      this.events.shake(0.8);
    }
  }

  /** Phase 2: gleiten, über dem Spieler anvisieren, herabstürzen, Bremsfeuer, wieder steigen. */
  private updateShip(dt: number, px: number): void {
    this.moveTimer -= dt;
    const cruise = 0;
    /** Wie tief das Schiff beim Sturzflug herunterkommt (Welt-Einheiten). */
    const low = 14;
    switch (this.move) {
      case 'glide':
        this.x += THREE.MathUtils.clamp(this.glideTarget - this.x, -8 * dt, 8 * dt);
        if (Math.abs(this.glideTarget - this.x) < 0.3) this.glideTarget = randRange(-FIELD.halfWidth * 0.6, FIELD.halfWidth * 0.6);
        this.drop += (cruise - this.drop) * Math.min(1, dt * 3);
        if (this.moveTimer <= 0) [this.move, this.moveTimer] = ['aim', 1.0];
        break;
      case 'aim':
        // Über dem Spieler positionieren, Triebwerke glühen vor
        this.x += THREE.MathUtils.clamp(px - this.x, -14 * dt, 14 * dt);
        for (const e of this.shipEngines) if (e.alive) e.state = 'charge';
        if (this.moveTimer <= 0) [this.move, this.moveTimer] = ['dive', 0.6];
        break;
      case 'dive':
        this.drop += (low - this.drop) * Math.min(1, dt * 6);
        if (this.moveTimer <= 0) {
          this.move = 'burn';
          this.moveTimer = 1.2;
          for (const e of this.shipEngines) {
            if (!e.alive) continue;
            e.state = 'fire';
            e.beam = this.beams.acquire(FLAME_COLOR, 0.9, true);
          }
          this.events.sfx('ignite');
          this.events.shake(0.5);
        }
        break;
      case 'burn':
        if (this.moveTimer <= 0) {
          this.move = 'climb';
          this.moveTimer = 2.2;
          for (const e of this.shipEngines) {
            this.beams.release(e.beam);
            e.beam = null;
            if (e.alive) e.state = 'cold';
          }
        }
        break;
      case 'climb':
        // Kühlt ab und steigt langsam: jetzt sind die Triebwerke verwundbar
        this.drop += (cruise - this.drop) * Math.min(1, dt * 0.9);
        if (this.moveTimer <= 0) [this.move, this.moveTimer] = ['glide', randRange(2.5, 4)];
        break;
    }
  }

  /** Flammenstrahlen an die Triebwerke heften. */
  private updateBeams(): void {
    for (const e of [...this.booster, ...this.shipEngines]) {
      if (!e.beam) continue;
      const m = this.world(e.mount);
      e.beam.x = m.x;
      e.beam.y = m.y - 0.3;
      e.beam.angle = -Math.PI / 2;
      e.beam.length = m.y + FIELD.halfHeight + 4;
    }
  }

  /** Kalte Triebwerke sind treffbar, glühende und feuernde prallen ab. */
  private engineTargets(list: Engine[], open: boolean, score: number): BossTarget[] {
    return list
      .filter((e) => e.alive)
      .map((e) => {
        const m = this.world(e.mount);
        const armor = !open || e.state !== 'cold';
        return {
          x: m.x,
          y: m.y,
          radius: 0.55,
          armor,
          hit: (dmg: number) => {
            e.hp -= dmg;
            e.flash = 1;
            if (e.hp > 0) return this.events.hit();
            e.alive = false;
            this.beams.release(e.beam);
            e.beam = null;
            e.glow.setFrame(1);
            this.events.explode(m.x, m.y, 2, STEEL_DEBRIS);
            this.events.partDestroyed(m.x, m.y, score, 4, true);
            if (list === this.shipEngines && this.shipEngines.every((s) => !s.alive)) this.startDying();
          },
        };
      });
  }

  protected targets(): BossTarget[] {
    if (this.phase === 'fight') return this.engineTargets(this.booster, true, 1500);
    if (this.phase === 'core') return this.engineTargets(this.shipEngines, this.move === 'climb', 2500);
    return [];
  }

  protected layout(): void {
    // Sturzflug: das Schiff liegt um drop tiefer als die Ruheposition, auch in der Todessequenz
    this.y -= this.drop;
    this.hull.place(this.x, this.y, -0.3);
    this.updateBeams();
    for (const e of [...this.booster, ...this.shipEngines]) {
      const inPhase = this.booster.includes(e) ? this.phase === 'fight' || this.phase === 'enter' : this.phase !== 'fight' && this.phase !== 'enter';
      const hot = e.alive && e.state !== 'cold';
      // Glühen beim Laden blinkt, beim Feuern dauerhaft; zerstörte zeigen ein Wrack
      e.glow.visible = inPhase && (hot ? e.state === 'fire' || Math.floor(this.time * 12) % 2 === 0 : !e.alive);
      e.glow.setFrame(e.alive ? 0 : 1);
      e.glow.setFlash(e.flash > 0.5 ? 1 : 0);
      const m = this.world(e.mount);
      e.glow.place(m.x, m.y - 0.2, -0.05);
    }
    if (this.fall.active) {
      this.fallingBooster.mesh.rotation.z = this.fall.rot;
      this.fallingBooster.place(this.fall.x, this.fall.y, -0.25);
    }
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    // Der abstürzende Booster ist gefährlich
    if (!this.fall.active) return false;
    return Math.abs(px - this.fall.x) < 2 + r && Math.abs(py - this.fall.y) < 4 + r;
  }
}
