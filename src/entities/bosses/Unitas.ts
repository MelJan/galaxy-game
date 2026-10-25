import * as THREE from 'three';
import { PIXEL } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import {
  ARM_CLAW_ROWS,
  ARM_SEGMENT_ROWS,
  ORBIT_PALETTE,
  paintTruss,
  SAIL_ROWS,
  TRUSS_H,
  TRUSS_W,
  UNITAS_MODULE_FRAMES,
} from '../../gfx/orbitArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { Bullet } from '../Bullets';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const STATION_DEBRIS = new THREE.Color(0xf2f4f8);
/** Lage der vier Segel und der Module dahinter, relativ zur Mitte (Welt-Einheiten). */
const BAY_X = [-78, -42, 42, 78].map((px) => px * PIXEL);
const SAIL_W = 25 * PIXEL;
const SAIL_H = 55 * PIXEL;
/** Unter dieser Breite (Anteil) steht ein Segel hochkant und lässt Schüsse durch. */
const EDGE_ON = 0.3;
const SEGMENT_LEN = 27 * PIXEL;
const ARM_REST = 2.6;
const ARM_REBUILD = 8;
const OPEN_TIME = 1.5;

interface Bay {
  sail: PixelSprite;
  module: PixelSprite;
  x: number;
  angle: number;
  speed: number;
  hp: number;
  alive: boolean;
  flash: number;
  fireTimer: number;
  reflectTimer: number;
}

type ArmState = 'rest' | 'aim' | 'reach' | 'retract' | 'broken';

/**
 * Endgegner Sektor 9, Station Unitas: eine riesige Forschungsstation aus vielen Nationen, mit einem langen Gittermast,
 * vier drehbaren Solarsegeln und einem Roboterarm.
 * Hinter jedem Segel sitzt ein Modul. Breitseitig gedrehte Segel werfen Schüsse zum Spieler zurück, nur hochkant
 * stehende lassen sie zum Modul durch. Der Roboterarm greift nach dem Spieler; schießt man den Greifer ab,
 * ist der Arm eine Weile außer Gefecht. Ohne Module öffnet sich das Kommandomodul in der Mitte.
 */
export class Unitas extends BossBase {
  private readonly truss: PixelSprite;
  private readonly bays: Bay[];
  private readonly command: PixelSprite;
  private readonly segment: PixelSprite;
  private readonly claw: PixelSprite;
  private ty = 0;
  private coreHp = 0;
  private coreMax = 1;
  private coreFlash = 0;
  private arm: ArmState = 'rest';
  private armTimer = 0;
  private armAngle = -Math.PI / 2;
  private armLen = ARM_REST;
  private armReach = ARM_REST;
  private clawHp = 0;
  private clawFlash = 0;
  private volleyTimer = 0;
  /** Zurückgeworfene Schüsse, die im nächsten tick als feindliche Geschosse starten. */
  private reflected: { x: number; y: number }[] = [];

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, ORBIT_PALETTE, 1, 1, [['.']], STATION_DEBRIS, 'metal', 3.8);
    this.truss = this.sprite([paintTruss()]);
    this.bays = BAY_X.map((x, i) => ({
      sail: this.sprite([SAIL_ROWS]),
      module: this.sprite(UNITAS_MODULE_FRAMES),
      x,
      angle: i * 0.9,
      speed: [0.55, -0.42, 0.48, -0.6][i],
      hp: 0,
      alive: false,
      flash: 0,
      fireTimer: 0,
      reflectTimer: 0,
    }));
    this.command = this.sprite(UNITAS_MODULE_FRAMES);
    this.segment = this.sprite([ARM_SEGMENT_ROWS]);
    this.claw = this.sprite([ARM_CLAW_ROWS]);
    this.hint = ['SEGEL SPIEGELN SCHÜSSE', 'NUR HOCHKANT DURCHSCHIESSEN'];
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [this.truss, ...this.bays.flatMap((b) => [b.sail, b.module]), this.command, this.segment, this.claw];
  }

  private get halfTruss(): number {
    return (TRUSS_W / 2) * PIXEL;
  }

  get bottom(): number | null {
    return this.ty - SAIL_H - 1;
  }

  hullContains(x: number, y: number): boolean {
    if (this.phase === 'gone') return false;
    return Math.abs(y - this.ty) < (TRUSS_H / 2) * PIXEL && Math.abs(x - this.x) < this.halfTruss;
  }

  protected hullRaycast(x: number, y0: number): number | null {
    // Module und Kommandomodul sitzen auf dem Mast: Der Laser trifft sie, nicht den Mast davor
    if (this.bays.some((b) => b.alive && Math.abs(this.x + b.x - x) < 1.2) || Math.abs(this.x - x) < 1.2) return null;
    const y = this.ty - (TRUSS_H / 2) * PIXEL;
    return Math.abs(x - this.x) < this.halfTruss && y > y0 ? y : null;
  }

  protected deathCenter(): { x: number; y: number } {
    return { x: this.x, y: this.ty };
  }

  protected dyingPoint(): { x: number; y: number } {
    return { x: this.x + randRange(-11, 11), y: this.ty + randRange(-3, 1) };
  }

  private get moduleMax(): number {
    return 30 * this.hpMul;
  }

  health(): number {
    const mods = this.bays.reduce((n, b) => n + (b.alive ? Math.max(0, b.hp) : 0), 0);
    return (mods + Math.max(0, this.coreHp)) / (this.bays.length * this.moduleMax + this.coreMax);
  }

  protected onStart(): void {
    this.coreMax = this.coreHp = 110 * this.hpMul;
    this.coreFlash = 0;
    for (const b of this.bays) {
      Object.assign(b, { hp: this.moduleMax, alive: true, flash: 0, fireTimer: randRange(1, 2.5), reflectTimer: 0 });
      b.sail.visible = b.module.visible = true;
    }
    this.truss.visible = this.command.visible = this.segment.visible = this.claw.visible = true;
    this.command.setFrame(0);
    this.arm = 'rest';
    this.armTimer = 3;
    this.armLen = this.armReach = ARM_REST;
    this.armAngle = -Math.PI / 2;
    this.clawHp = 22 * this.diff.hp;
    this.volleyTimer = 2.5;
    this.reflected = [];
  }

  private get alive(): number {
    return this.bays.filter((b) => b.alive).length;
  }

  /** Sichtbare Breite eines Segels als Anteil (1 = breitseitig, 0 = hochkant). */
  private openness(b: Bay): number {
    return Math.abs(Math.cos(b.angle));
  }

  private sailBlocks(b: Bay, x: number, y: number): boolean {
    if (!b.alive || this.openness(b) < EDGE_ON) return false;
    const hw = (SAIL_W / 2) * this.openness(b);
    return Math.abs(x - (this.x + b.x)) < hw && y < this.ty && y > this.ty - SAIL_H;
  }

  /** Segel zuerst: breitseitig gedrehte werfen den Schuss zurück. */
  hitTestBullet(b: Bullet, damage: number): boolean {
    if (this.phase === 'gone') return false;
    if (this.phase !== 'enter' && this.phase !== 'dying') {
      for (const bay of this.bays) {
        for (const s of [1, 0.5, 0]) {
          const x = b.prevX + (b.x - b.prevX) * s;
          const y = b.prevY + (b.y - b.prevY) * s;
          if (!this.sailBlocks(bay, x, y)) continue;
          if (bay.reflectTimer <= 0) {
            bay.reflectTimer = 0.28;
            this.reflected.push({ x, y });
            this.events.sfx('reflect');
          } else this.events.deflect();
          this.events.shieldSparks(x, y);
          return true;
        }
      }
    }
    return super.hitTestBullet(b, damage);
  }

  raycastUp(x: number, y0: number, halfWidth: number) {
    const hit = super.raycastUp(x, y0, halfWidth);
    // Breitseitige Segel halten den Laser auf (ohne ihn zurückzuwerfen)
    for (const bay of this.bays) {
      if (!bay.alive || this.openness(bay) < EDGE_ON) continue;
      if (Math.abs(x - (this.x + bay.x)) > (SAIL_W / 2) * this.openness(bay) + halfWidth) continue;
      const y = this.ty - SAIL_H;
      if (y > y0 && (!hit || y < hit.y)) return { y, target: null };
    }
    return hit;
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.6) * this.diff.fireRate;
    this.coreFlash = Math.max(0, this.coreFlash - dt * 8);
    this.clawFlash = Math.max(0, this.clawFlash - dt * 8);
    const core = this.phase === 'core';

    for (const r of this.reflected) {
      const a = Math.atan2(py - r.y, px - r.x) + randRange(-0.15, 0.15);
      out.shots.push({ x: r.x, y: r.y - 0.3, vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, style: 'tracer' });
    }
    this.reflected.length = 0;

    for (const b of this.bays) {
      b.flash = Math.max(0, b.flash - dt * 8);
      b.reflectTimer -= dt;
      b.angle += b.speed * dt * (core ? 1.8 : 1 + (4 - this.alive) * 0.15);
      if (!b.alive) continue;
      // Module feuern nach unten zwischen den Segeln hindurch
      b.fireTimer -= dt * this.rage;
      if (b.fireTimer <= 0) {
        b.fireTimer = 2.6;
        const o = { x: this.x + b.x, y: this.ty - 1 };
        for (const dx of [-1.8, 1.8]) {
          const a = Math.atan2(py - o.y, px - (o.x + dx));
          out.shots.push({ x: o.x + dx, y: o.y, vx: Math.cos(a) * 13, vy: Math.sin(a) * 13, style: 'normal' });
        }
      }
    }

    // Kommandomodul: Fächer, offen schneller
    this.volleyTimer -= dt * this.rage;
    if (this.volleyTimer <= 0) {
      this.volleyTimer = core ? 1.4 : 3.4;
      const n = core ? 9 : 5;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.22;
        out.shots.push({ x: this.x, y: this.ty - 1.6, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, style: 'boss' });
      }
    }

    this.updateArm(dt, px, py);

    if (this.phase === 'opening' && this.phaseTime >= OPEN_TIME) {
      this.setPhase('core');
      this.command.setFrame(1);
      this.events.opening('KOMMANDOMODUL OFFEN', 'DIE SEGEL DREHEN DURCH');
    }
  }

  private get armBase(): { x: number; y: number } {
    return { x: this.x, y: this.ty - 1.6 };
  }

  private get clawPos(): { x: number; y: number } {
    const b = this.armBase;
    return { x: b.x + Math.cos(this.armAngle) * this.armLen, y: b.y + Math.sin(this.armAngle) * this.armLen };
  }

  /** Roboterarm: zielt (blinkt), schießt teleskopartig zum Spieler vor, zieht sich zurück. */
  private updateArm(dt: number, px: number, py: number): void {
    // Greiftempo folgt dem Angriffstempo (auf Sehr leicht seltener), offen schneller
    this.armTimer -= dt * (this.phase === 'core' ? 1.6 : 1) * Math.min(1, this.diff.fireRate);
    const base = this.armBase;
    switch (this.arm) {
      case 'rest':
        this.armLen += (ARM_REST - this.armLen) * Math.min(1, dt * 4);
        this.armAngle += (-Math.PI / 2 + Math.sin(this.time * 0.8) * 0.4 - this.armAngle) * Math.min(1, dt * 2);
        if (this.armTimer <= 0) this.setArm('aim', 0.8);
        break;
      case 'aim': {
        const want = Math.atan2(py - base.y, px - base.x);
        this.armAngle += (want - this.armAngle) * Math.min(1, dt * 6);
        this.armReach = Math.min(Math.hypot(px - base.x, py - base.y) + 1.5, 32);
        if (this.armTimer <= 0) {
          this.setArm('reach', 0.55);
          this.events.sfx('tractor');
        }
        break;
      }
      case 'reach':
        this.armLen += (this.armReach - this.armLen) * Math.min(1, dt * 9);
        if (this.armTimer <= 0) this.setArm('retract', 1.1);
        break;
      case 'retract':
        this.armLen += (ARM_REST - this.armLen) * Math.min(1, dt * 3);
        if (this.armTimer <= 0) this.setArm('rest', randRange(2.5, 3.5));
        break;
      case 'broken':
        this.armLen += (1.2 - this.armLen) * Math.min(1, dt * 3);
        this.armAngle += (-Math.PI / 2 - this.armAngle) * Math.min(1, dt * 2);
        if (Math.random() < dt * 10) this.events.sparks(base.x + randRange(-0.4, 0.4), base.y - this.armLen);
        if (this.armTimer <= 0) {
          this.clawHp = 22 * this.diff.hp;
          this.setArm('rest', 2);
          this.events.sfx('regrow');
        }
        break;
    }
  }

  private setArm(state: ArmState, time: number): void {
    this.arm = state;
    this.armTimer = time;
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    for (const b of this.bays) {
      if (!b.alive) continue;
      list.push({
        x: this.x + b.x,
        y: this.ty,
        radius: 1.2,
        hit: (dmg) => {
          b.hp -= dmg;
          b.flash = 1;
          this.events.hit();
          if (b.hp > 0) return;
          b.alive = false;
          b.module.visible = false;
          b.sail.visible = false;
          const x = this.x + b.x;
          this.events.explode(x, this.ty, 2, STATION_DEBRIS);
          this.events.explode(x, this.ty - SAIL_H / 2, 2, STATION_DEBRIS);
          this.events.partDestroyed(x, this.ty, 1500, 8, this.alive === 2);
          this.events.shake(0.5);
          if (this.alive === 0) {
            this.setPhase('opening');
            this.events.sfx('separation');
          }
        },
      });
    }
    if (this.arm !== 'broken') {
      const c = this.clawPos;
      list.push({
        x: c.x,
        y: c.y,
        radius: 0.8,
        noMissile: true,
        hit: (dmg) => {
          this.clawHp -= dmg;
          this.clawFlash = 1;
          this.events.hit();
          if (this.clawHp > 0) return;
          this.events.explode(c.x, c.y, 1, STATION_DEBRIS);
          this.events.partDestroyed(c.x, c.y, 600, 3, false);
          this.events.banner('ARM AUSSER GEFECHT', '', false);
          this.setArm('broken', ARM_REBUILD);
        },
      });
    }
    list.push({
      x: this.x,
      y: this.ty,
      radius: 1.3,
      armor: this.phase !== 'core',
      hit: (dmg) => {
        this.coreHp -= dmg;
        this.coreFlash = 1;
        this.events.hit();
        if (this.coreHp <= 0) this.startDying();
      },
    });
    return list;
  }

  protected layout(): void {
    this.ty = this.y - 4.5;
    const dying = this.phase === 'dying';
    this.truss.setFlash(dying && Math.floor(this.time * 14) % 3 === 0 ? 0.7 : 0);
    this.truss.place(this.x, this.ty, -0.3);
    for (const b of this.bays) {
      const open = this.openness(b);
      // Segel: waagerecht gestaucht je nach Drehung; hochkant leuchten sie auf (durchlässig)
      b.sail.mesh.scale.x = Math.max(0.06, open);
      b.sail.setFlash(open < EDGE_ON ? 0.35 : 0);
      b.sail.place(this.x + b.x, this.ty - SAIL_H / 2 - 0.4, -0.15);
      b.module.setFlash(dying || b.flash > 0.5 ? 1 : 0);
      b.module.place(this.x + b.x, this.ty, -0.25);
    }
    this.command.setFlash(dying || this.coreFlash > 0.5 ? 1 : 0);
    this.command.place(this.x, this.ty, -0.25);

    // Arm: ein gestrecktes Glied vom Kommandomodul zum Greifer
    const base = this.armBase;
    const c = this.clawPos;
    this.segment.mesh.rotation.z = this.armAngle + Math.PI / 2;
    this.segment.mesh.scale.y = Math.max(0.2, this.armLen / SEGMENT_LEN);
    this.segment.place((base.x + c.x) / 2, (base.y + c.y) / 2, -0.12);
    this.claw.visible = this.arm !== 'broken';
    this.claw.mesh.rotation.z = this.armAngle + Math.PI / 2;
    this.claw.setFlash(this.clawFlash > 0.5 || (this.arm === 'aim' && Math.floor(this.time * 12) % 2 === 0) ? 1 : 0);
    this.claw.place(c.x, c.y, -0.1);
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    if (this.arm === 'broken') return false;
    const c = this.clawPos;
    return (c.x - px) ** 2 + (c.y - py) ** 2 < (0.8 + r) ** 2;
  }
}
