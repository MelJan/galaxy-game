import * as THREE from 'three';
import { FIELD } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import { DEEP_PALETTE, LEVI_HEAD_FRAMES, LEVI_SEGMENT_FRAMES, LEVI_TAIL_ROWS } from '../../gfx/deepArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const SHELL_DEBRIS = new THREE.Color(0x3aa8c0);
const GLOW_DEBRIS = new THREE.Color(0x5affe0);
const SEGMENTS = 15;
/** Abstand zwischen zwei Segmenten entlang der Spur (Welt-Einheiten). */
const SPACING = 2.0;
/** Diese Segmente tragen Kiemen. */
const GILLS = [2, 5, 8, 11];
const HEAD_R = 1.7;
const SEG_R = 1.15;
const TURN = 2.2;
const DIVE_TELEGRAPH = 0.8;
const DIVE_TIME = 1.4;

interface Segment {
  sprite: PixelSprite;
  gill: boolean;
  hp: number;
  /** Kieme zerstört (Narbe). */
  scar: boolean;
  flash: number;
  x: number;
  y: number;
  angle: number;
}

type Move = 'roam' | 'telegraph' | 'dive';

/**
 * Endgegner Sektor 8, Leviathan: ein riesiger Sternenwurm aus gepanzerten Segmenten, der frei durch das
 * ganze Bild schlängelt. Vier Kiemen öffnen sich in einer Welle entlang des Körpers – nur offene Kiemen nehmen
 * Schaden. Jede zerstörte Kieme kostet ihn zwei Schwanzsegmente und macht ihn schneller. Sind alle Kiemen weg,
 * reißt er das Maul auf und der Kopf wird verwundbar, während er immer öfter auf den Spieler herabstürzt.
 */
export class Leviathan extends BossBase {
  private readonly head: PixelSprite;
  private readonly tail: PixelSprite;
  private readonly segs: Segment[];
  private count = SEGMENTS;
  private trail: { x: number; y: number }[] = [];
  private hx = 0;
  private hy = 0;
  private heading = -Math.PI / 2;
  private target = { x: 0, y: 0 };
  private move: Move = 'roam';
  private moveTimer = 0;
  private headHp = 0;
  private headMax = 1;
  private headFlash = 0;
  private spreadTimer = 0;
  private sporeTimer = 0;
  private tailPos = { x: 0, y: 0, angle: 0 };

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, DEEP_PALETTE, 1, 1, [['.']], SHELL_DEBRIS, 'flesh', 3.4);
    this.head = this.sprite(LEVI_HEAD_FRAMES);
    this.tail = this.sprite([LEVI_TAIL_ROWS]);
    this.segs = Array.from({ length: SEGMENTS }, (_, i) => ({
      sprite: this.sprite(LEVI_SEGMENT_FRAMES),
      gill: GILLS.includes(i),
      hp: 0,
      scar: false,
      flash: 0,
      x: 0,
      y: 0,
      angle: 0,
    }));
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [...this.segs.map((s) => s.sprite), this.tail, this.head];
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
    return { x: this.hx, y: this.hy };
  }

  protected dyingPoint(): { x: number; y: number } | null {
    // Kettenexplosion vom Schwanz zum Kopf
    const i = Math.max(0, this.count - 1 - Math.floor(this.phaseTime * 6));
    const s = this.segs[Math.min(i, this.count - 1)];
    return { x: s.x + randRange(-0.8, 0.8), y: s.y + randRange(-0.8, 0.8) };
  }

  private get gillsLeft(): number {
    return this.segs.filter((s) => s.gill && !s.scar).length;
  }

  health(): number {
    if (this.phase === 'core' || this.phase === 'dying' || this.phase === 'opening') return 0.4 * Math.max(0, this.headHp) / this.headMax;
    const left = this.segs.reduce((n, s) => n + (s.gill && !s.scar ? Math.max(0, s.hp) : 0), 0);
    return 0.4 + 0.6 * (left / (GILLS.length * 16 * this.hpMul));
  }

  protected onStart(): void {
    this.count = SEGMENTS;
    this.headMax = this.headHp = 70 * this.hpMul;
    for (const s of this.segs) Object.assign(s, { hp: 16 * this.hpMul, scar: false, flash: 0 });
    for (const s of this.sprites()) s.visible = true;
    // Schwimmt von oben herein: die Spur liegt zunächst als gerade Linie über dem Bild
    this.hx = 0;
    this.hy = FIELD.halfHeight + 4;
    this.heading = -Math.PI / 2;
    this.trail = [];
    for (let d = 40; d >= 0; d -= 0.25) this.trail.push({ x: 0, y: this.hy + d });
    this.target = { x: 0, y: FIELD.halfHeight * 0.3 };
    this.move = 'roam';
    this.moveTimer = 6;
    this.spreadTimer = 2;
    this.sporeTimer = 3;
  }

  private get speed(): number {
    const base = 8 + (GILLS.length - this.gillsLeft) * 1.6 + (this.phase === 'core' ? 2 : 0);
    return base * this.diff.speed * (this.move === 'dive' ? 2.3 : this.move === 'telegraph' ? 0.4 : 1);
  }

  private pickTarget(): void {
    this.target = {
      x: randRange(-FIELD.halfWidth * 0.8, FIELD.halfWidth * 0.8),
      y: randRange(-FIELD.halfHeight * 0.25, FIELD.halfHeight * 0.85),
    };
  }

  /** Kopf lenkt mit begrenzter Wendigkeit zum Ziel; jede Bewegung wird als Spur gespeichert. */
  private swim(dt: number): void {
    let diff = Math.atan2(this.target.y - this.hy, this.target.x - this.hx) - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const turn = TURN * (this.move === 'dive' ? 0.6 : 1) * dt;
    this.heading += THREE.MathUtils.clamp(diff, -turn, turn);
    const v = this.speed;
    this.hx += Math.cos(this.heading) * v * dt;
    this.hy += Math.sin(this.heading) * v * dt;
    // Im Bild bleiben (der Einflug darf von oben kommen)
    if (this.phase !== 'enter') {
      this.hx = THREE.MathUtils.clamp(this.hx, -FIELD.halfWidth + 1, FIELD.halfWidth - 1);
      this.hy = THREE.MathUtils.clamp(this.hy, -FIELD.halfHeight + 1, FIELD.halfHeight - 1);
    }
    this.trail.push({ x: this.hx, y: this.hy });
    if (this.trail.length > 900) this.trail.splice(0, this.trail.length - 900);
  }

  /** Segmente entlang der Spur verteilen: jedes SPACING weiter hinten. */
  private placeBody(): void {
    let need = SPACING;
    let acc = 0;
    let seg = 0;
    let prev = { x: this.hx, y: this.hy };
    const place = (x: number, y: number, ax: number, ay: number) => {
      const angle = Math.atan2(ay - y, ax - x);
      if (seg < this.count) Object.assign(this.segs[seg], { x, y, angle });
      else this.tailPos = { x, y, angle };
      seg++;
    };
    for (let i = this.trail.length - 1; i >= 0 && seg <= this.count; i--) {
      const p = this.trail[i];
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      while (acc + d >= need && seg <= this.count) {
        const u = (need - acc) / (d || 1);
        const x = prev.x + (p.x - prev.x) * u;
        const y = prev.y + (p.y - prev.y) * u;
        place(x, y, prev.x, prev.y);
        need += SPACING;
      }
      acc += d;
      prev = p;
    }
    // Falls die Spur zu kurz ist: Rest am Ende stapeln
    while (seg <= this.count) place(prev.x, prev.y, prev.x, prev.y + 1);
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    const core = this.phase === 'core';
    this.rage = (1 + (GILLS.length - this.gillsLeft) * 0.15 + (core ? 0.4 : 0)) * this.diff.fireRate;
    this.headFlash = Math.max(0, this.headFlash - dt * 8);
    for (const s of this.segs) s.flash = Math.max(0, s.flash - dt * 8);

    // Bewegung: umherschwimmen, Sturzangriff mit Vorwarnung (bei ruhigem Angriffstempo seltener)
    this.moveTimer -= dt * (this.move === 'roam' ? Math.min(1, this.diff.fireRate) : 1);
    if (this.move === 'roam') {
      if (Math.hypot(this.target.x - this.hx, this.target.y - this.hy) < 2.5) this.pickTarget();
      if (this.moveTimer <= 0) {
        this.move = 'telegraph';
        this.moveTimer = DIVE_TELEGRAPH;
        this.events.sfx('whale');
      }
    } else if (this.move === 'telegraph') {
      this.target = { x: px, y: py };
      if (this.moveTimer <= 0) [this.move, this.moveTimer] = ['dive', DIVE_TIME];
    } else if (this.moveTimer <= 0) {
      this.move = 'roam';
      this.moveTimer = core ? randRange(3.5, 5) : randRange(6, 8);
      this.pickTarget();
    }

    this.swim(dt);

    // Fächer aus dem Maul
    this.spreadTimer -= dt * this.rage;
    if (this.spreadTimer <= 0 && this.move !== 'dive') {
      this.spreadTimer = core ? 1.6 : 2.4;
      const a = Math.atan2(py - this.hy, px - this.hx);
      for (const d of [-0.25, 0, 0.25]) out.shots.push({ x: this.hx, y: this.hy, vx: Math.cos(a + d) * 11, vy: Math.sin(a + d) * 11, style: 'bio' });
    }
    // Sporen aus dem Körper, die langsam nachsteuern
    this.sporeTimer -= dt * this.rage;
    if (this.sporeTimer <= 0) {
      this.sporeTimer = 2.6;
      const s = this.segs[Math.floor(randRange(2, this.count))];
      const a = Math.atan2(py - s.y, px - s.x);
      out.shots.push({ x: s.x, y: s.y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, style: 'bio', homing: 0.9, life: 5 });
    }

    if (this.phase === 'fight' && this.gillsLeft === 0) {
      this.setPhase('opening');
      this.events.opening('LEVIATHAN', 'DER KOPF IST OFFEN');
    } else if (this.phase === 'opening' && this.phaseTime >= 1) this.setPhase('core');
  }

  /** Eine Kieme ist zerstört: Narbe, zwei Schwanzsegmente lösen sich. */
  private destroyGill(s: Segment): void {
    s.scar = true;
    this.events.explode(s.x, s.y, 2, GLOW_DEBRIS);
    this.events.shake(0.5);
    this.events.partDestroyed(s.x, s.y, 3000, 6, true);
    // Hintere Segmente abwerfen, aber keine noch intakte Kieme
    const lastGill = Math.max(-1, ...this.segs.map((seg, i) => (seg.gill && !seg.scar ? i : -1)));
    const newCount = Math.max(lastGill + 1, this.count - 2, 5);
    for (let i = newCount; i < this.count; i++) this.events.explode(this.segs[i].x, this.segs[i].y, 1, SHELL_DEBRIS);
    if (newCount < this.count) this.events.sfx('shed');
    this.count = newCount;
    const left = this.gillsLeft;
    if (left > 0) this.events.banner('KIEME ZERSTÖRT', `NOCH ${left}`, false);
  }

  /** Kieme offen? Eine Welle läuft den Körper entlang. */
  private gillOpen(i: number): boolean {
    return Math.sin(this.time * 2.2 - i * 0.55) > 0.35;
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    const core = this.phase === 'core';
    list.push({
      x: this.hx,
      y: this.hy,
      radius: HEAD_R,
      armor: !core,
      hit: (dmg) => {
        this.headHp -= dmg;
        this.headFlash = 1;
        this.events.hit();
        if (this.headHp <= 0) this.startDying();
      },
    });
    for (let i = 0; i < this.count; i++) {
      const s = this.segs[i];
      const open = this.phase === 'fight' && s.gill && !s.scar && this.gillOpen(i);
      list.push({
        x: s.x,
        y: s.y,
        radius: SEG_R,
        armor: !open,
        hit: (dmg) => {
          s.hp -= dmg;
          s.flash = 1;
          if (s.hp > 0) return this.events.hit();
          this.destroyGill(s);
        },
      });
    }
    return list;
  }

  protected layout(): void {
    this.placeBody();
    const core = this.phase === 'core' || this.phase === 'opening';
    const telegraph = this.move === 'telegraph' && Math.floor(this.time * 12) % 2 === 0;
    this.head.setFrame(core || this.move !== 'roam' ? 1 : 0);
    this.head.setFlash(this.phase === 'dying' || this.headFlash > 0.5 || telegraph ? 1 : 0);
    this.head.mesh.rotation.z = this.heading + Math.PI / 2;
    this.head.place(this.hx, this.hy, 0.05);

    this.segs.forEach((s, i) => {
      s.sprite.visible = i < this.count;
      if (i >= this.count) return;
      const frame = s.gill ? (s.scar ? 3 : this.phase === 'fight' && this.gillOpen(i) ? 1 : 2) : 0;
      s.sprite.setFrame(frame);
      s.sprite.setFlash(s.flash > 0.5 ? 1 : 0);
      s.sprite.mesh.rotation.z = s.angle + Math.PI / 2;
      // Vordere Segmente liegen über den hinteren
      s.sprite.place(s.x, s.y, -0.01 * i);
    });
    this.tail.mesh.rotation.z = this.tailPos.angle + Math.PI / 2;
    this.tail.place(this.tailPos.x, this.tailPos.y, -0.2);
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    if ((this.hx - px) ** 2 + (this.hy - py) ** 2 < (HEAD_R + r) ** 2) return true;
    for (let i = 0; i < this.count; i++) {
      const s = this.segs[i];
      if ((s.x - px) ** 2 + (s.y - py) ** 2 < (SEG_R * 0.9 + r) ** 2) return true;
    }
    return false;
  }
}
