import * as THREE from 'three';
import { FIELD } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import type { PixelSprite } from '../../gfx/pixel';
import { GENERATOR_FRAMES, HOLE_FRAMES, VOID_PALETTE } from '../../gfx/voidArt';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const VOID_DEBRIS = new THREE.Color(0xff5ab0);
const GEN_DEBRIS = new THREE.Color(0x7affd8);
/** Umlaufbahnen der Generatoren: Radius (Welt-Einheiten) und Winkelgeschwindigkeit (rad/s, Vorzeichen = Richtung). */
const ORBITS = [
  { r: 3.4, speed: 1.05 },
  { r: 4.9, speed: -0.78 },
  { r: 6.4, speed: 0.58 },
  { r: 7.9, speed: -0.44 },
];
/** Radius des Ereignishorizonts: alles darin wird verschluckt. */
const HORIZON = 1.6;

interface Generator {
  sprite: PixelSprite;
  orbit: number;
  angle: number;
  hp: number;
  alive: boolean;
  flash: number;
  fireTimer: number;
  x: number;
  y: number;
}

/**
 * Endgegner Sektor 7, Singularität: ein Schwarzes Loch, das alle Geschosse krümmt, den Spieler anzieht
 * und verschluckt, was ihm zu nahe kommt. Vier Gravitationsgeneratoren kreisen darum; man muss sie mit
 * gekrümmten Schüssen treffen. Jeder zerstörte Generator verstärkt den Sog. Danach wird die Singularität
 * instabil: Der Kern ist verwundbar und schrumpft mit jedem Treffer, während er Strahlungsringe ausstößt.
 */
export class Singularitaet extends BossBase {
  private readonly hole: PixelSprite;
  private readonly gens: Generator[];
  private cx = 0;
  private cy = 0;
  private coreHp = 0;
  private coreMax = 1;
  private coreFlash = 0;
  private ringTimer = 0;
  private spiralTimer = 0;
  private spiral = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, VOID_PALETTE, 1, 1, [['.']], VOID_DEBRIS, 'void', 4.6);
    this.hole = this.sprite(HOLE_FRAMES);
    this.gens = ORBITS.map((_, i) => ({ sprite: this.sprite(GENERATOR_FRAMES), orbit: i, angle: 0, hp: 0, alive: false, flash: 0, fireTimer: 0, x: 0, y: 0 }));
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [this.hole, ...this.gens.map((g) => g.sprite)];
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

  protected dyingPoint(): { x: number; y: number } | null {
    // Die Explosionen werden spiralförmig in das Loch gezogen
    const a = this.phaseTime * 7;
    const r = Math.max(0.5, 7 - this.phaseTime * 1.6);
    return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r };
  }

  private get deadGens(): number {
    return this.gens.filter((g) => !g.alive).length;
  }

  health(): number {
    if (this.phase !== 'core' && this.phase !== 'dying' && this.phase !== 'opening') {
      const left = this.gens.reduce((n, g) => n + (g.alive ? Math.max(0, g.hp) : 0), 0);
      return 0.5 + 0.5 * (left / (this.gens.length * 14 * this.hpMul));
    }
    return 0.5 * Math.max(0, this.coreHp) / this.coreMax;
  }

  protected onStart(): void {
    this.coreMax = this.coreHp = 70 * this.hpMul;
    this.gens.forEach((g, i) => Object.assign(g, { angle: i * 1.7, hp: 14 * this.hpMul, alive: true, flash: 0, fireTimer: 1.5 + i * 0.7 }));
    for (const s of this.sprites()) s.visible = true;
    this.ringTimer = 3;
    this.spiralTimer = 0;
  }

  protected stopAttacks(): void {
    this.pull = null;
    this.well = null;
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    const dead = this.deadGens;
    const core = this.phase === 'core';
    this.rage = (1 + dead * 0.2 + (core ? 0.4 : 0)) * this.diff.fireRate;
    this.coreFlash = Math.max(0, this.coreFlash - dt * 8);

    // Sog und Raumkrümmung, mit jedem gefallenen Generator stärker
    this.pull = { x: this.cx, y: this.cy, strength: core ? 6.5 : 2.2 + dead * 1.2 };
    this.well = { x: this.cx, y: this.cy, g: core ? 2600 : 1300 + dead * 380, absorb: core ? 0 : HORIZON };

    for (const g of this.gens) {
      g.flash = Math.max(0, g.flash - dt * 8);
      if (!g.alive) continue;
      // Generatoren beschleunigen, je weniger übrig sind
      g.angle += ORBITS[g.orbit].speed * dt * (1 + dead * 0.25);
      g.fireTimer -= dt * this.rage;
      if (g.fireTimer > 0) continue;
      g.fireTimer = 3.2;
      const a = Math.atan2(py - g.y, px - g.x);
      out.shots.push({ x: g.x, y: g.y, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, style: 'void' });
    }

    if (this.phase === 'fight') {
      // Ring aus der Akkretionsscheibe
      this.ringTimer -= dt * this.rage;
      if (this.ringTimer <= 0) {
        this.ringTimer = 3.4;
        const off = Math.random() * Math.PI;
        for (let i = 0; i < 14; i++) {
          const a = off + (i / 14) * Math.PI * 2;
          out.shots.push({ x: this.cx + Math.cos(a) * 2.6, y: this.cy + Math.sin(a) * 2.6, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, style: 'void' });
        }
      }
      if (dead === this.gens.length) {
        this.setPhase('opening');
        this.events.opening('SINGULARITÄT', 'INSTABIL – KERN TREFFEN');
        this.events.shake(0.8);
      }
    } else if (this.phase === 'opening') {
      if (this.phaseTime >= 1.2) this.setPhase('core');
    } else if (core) {
      // Hawking-Strahlung: dichte Spirale und Ringe
      this.spiralTimer -= dt * this.rage;
      if (this.spiralTimer <= 0) {
        this.spiralTimer = 0.12;
        this.spiral += 0.4;
        for (let i = 0; i < 2; i++) {
          const a = this.spiral + i * Math.PI;
          out.shots.push({ x: this.cx + Math.cos(a) * 1.8, y: this.cy + Math.sin(a) * 1.8, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, style: 'void' });
        }
      }
      this.ringTimer -= dt * this.rage;
      if (this.ringTimer <= 0) {
        this.ringTimer = 2.4;
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + randRange(0, 0.3);
          out.shots.push({ x: this.cx + Math.cos(a) * 1.8, y: this.cy + Math.sin(a) * 1.8, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, style: 'void' });
        }
      }
    }
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    for (const g of this.gens) {
      if (!g.alive) continue;
      list.push({
        x: g.x,
        y: g.y,
        radius: 0.75,
        hit: (dmg) => {
          g.hp -= dmg;
          g.flash = 1;
          if (g.hp > 0) return this.events.hit();
          g.alive = false;
          g.sprite.visible = false;
          this.events.explode(g.x, g.y, 2, GEN_DEBRIS);
          this.events.sfx('gravity');
          this.events.shake(0.6);
          this.events.partDestroyed(g.x, g.y, 3000, 6, true);
          const left = this.gens.length - this.deadGens;
          if (left > 0) this.events.banner('GENERATOR ZERSTÖRT', `SOG VERSTÄRKT · NOCH ${left}`, true);
        },
      });
    }
    if (this.phase === 'core') {
      list.push({
        x: this.cx,
        y: this.cy,
        radius: HORIZON * this.coreScale,
        hit: (dmg) => {
          this.coreHp -= dmg;
          this.coreFlash = 1;
          this.events.hit();
          if (this.coreHp <= 0) this.startDying();
        },
      });
    }
    return list;
  }

  /** Der Kern schrumpft mit jedem Treffer, beim Tod kollabiert er ganz. */
  private get coreScale(): number {
    if (this.phase === 'dying') return Math.max(0.05, 0.5 * (1 - this.phaseTime / 4.2));
    if (this.phase !== 'core') return 1;
    return 0.5 + 0.5 * (this.coreHp / this.coreMax);
  }

  protected layout(): void {
    this.cx = this.x + Math.sin(this.time * 0.3) * Math.min(FIELD.halfWidth * 0.3, 5);
    this.cy = this.y - 6.5 + Math.sin(this.time * 0.45) * 0.8;
    const s = this.coreScale;
    this.hole.mesh.scale.setScalar(s);
    this.hole.setFrame(Math.floor(this.time * 8) % HOLE_FRAMES.length);
    this.hole.setFlash(this.coreFlash > 0.5 ? 0.6 : 0);
    this.hole.place(this.cx, this.cy, -0.3);
    for (const g of this.gens) {
      const r = ORBITS[g.orbit].r;
      g.x = this.cx + Math.cos(g.angle) * r;
      g.y = this.cy + Math.sin(g.angle) * r * 0.8;
      g.sprite.setFrame(Math.floor(this.time * 6 + g.orbit) % 2);
      g.sprite.setFlash(g.flash > 0.5 ? 1 : 0);
      g.sprite.place(g.x, g.y, -0.1);
    }
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    if ((this.cx - px) ** 2 + (this.cy - py) ** 2 < (HORIZON * this.coreScale + r) ** 2) return true;
    return this.gens.some((g) => g.alive && (g.x - px) ** 2 + (g.y - py) ** 2 < (0.7 + r) ** 2);
  }
}
