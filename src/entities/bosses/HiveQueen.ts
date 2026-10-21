import * as THREE from 'three';
import { PIXEL } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import type { PixelSprite } from '../../gfx/pixel';
import {
  EGG_SAC_FRAMES,
  EYE_ROWS,
  IRIS_ROWS,
  LID_LEFT_ROWS,
  LID_RIGHT_ROWS,
  paintQueenHull,
  QUEEN_H,
  QUEEN_MOUNTS,
  QUEEN_W,
  SWARM_PALETTE,
  TENTACLE_SEGMENT_ROWS,
  TENTACLE_TIP_ROWS,
} from '../../gfx/swarmArt';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget, type Mount } from './BossBase';

const SEGMENTS = 10;
const SEGMENT_LENGTH = 0.85;
/** Treffer pro Tentakelglied. */
const SEGMENT_HP = 5;
/** Wie weit die Kiefer aufgleiten, in Pixeln. */
const LID_TRAVEL = 14;
const TELEGRAPH_TIME = 0.9;
const OPEN_TIME = 3.2;
const FLINCH_TIME = 1.6;
/** Langes Fenster, wenn beide Tentakel abgetrennt sind. */
const EXHAUSTED_TIME = 4.5;
/** Anteil der Lebenskraft, der in einem Fenster genügt, damit sie zurückzuckt. */
const FLINCH_SHARE = 0.22;
const FLESH_DEBRIS = new THREE.Color(0xb04656);
const ACID_DEBRIS = new THREE.Color(0x9aff3a);

/** Kieferzustand: geschlossen (gepanzert) → Vorwarnung (Brüllen) → offen (Auge verwundbar) → ggf. Zurückzucken. */
type Maw = 'closed' | 'telegraph' | 'open' | 'flinch';

interface Tentacle {
  side: number;
  mount: Mount;
  segments: PixelSprite[];
  tip: PixelSprite;
  points: { x: number; y: number }[];
  tipAngle: number;
  /** Verbleibende Glieder; wird von der Spitze her abgeschossen. */
  length: number;
  tipHp: number;
  flash: number;
}

/**
 * Sektor 2, Schwarmkönigin – ein Timing-Kampf:
 * Ihr Panzer ist undurchdringlich und sie regeneriert sich. Nur wenn sie brüllend die Kiefer aufreißt, liegt das Auge
 * für ein paar Sekunden frei. Genug Schaden in einem Fenster lässt sie zurückzucken. Nebenbei legt sie Eier,
 * aus denen Brüter schlüpfen. Die Tentakel lassen sich Glied für Glied abschießen; sind beide ab, ist sie erschöpft.
 */
export class HiveQueen extends BossBase {
  private readonly glands: PixelSprite[];
  private readonly tentacles: Tentacle[];
  private readonly lids: PixelSprite[];
  private readonly eye: PixelSprite;
  private readonly iris: PixelSprite;
  private eyeHp = 0;
  private eyeMax = 1;
  private eyeFlash = 0;
  private maw: Maw = 'closed';
  private mawTimer = 0;
  private windowDamage = 0;
  private openAmount = 0;
  private exhausted = false;
  private spitTimer = 0;
  private eggTimer = 0;
  private tripleTimer = 0;
  private lashTimer = 0;
  private lash = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, SWARM_PALETTE, QUEEN_W, QUEEN_H, [paintQueenHull()], FLESH_DEBRIS, 'flesh');
    this.glands = QUEEN_MOUNTS.sacs.map(() => this.sprite(EGG_SAC_FRAMES.slice(0, 3)));
    this.tentacles = QUEEN_MOUNTS.tentacles.map((mount, i) => ({
      side: i === 0 ? -1 : 1,
      mount,
      segments: Array.from({ length: SEGMENTS }, () => this.sprite([TENTACLE_SEGMENT_ROWS])),
      tip: this.sprite([TENTACLE_TIP_ROWS]),
      points: Array.from({ length: SEGMENTS + 1 }, () => ({ x: 0, y: 0 })),
      tipAngle: 0,
      length: SEGMENTS,
      tipHp: 0,
      flash: 0,
    }));
    this.lids = [this.sprite([LID_LEFT_ROWS]), this.sprite([LID_RIGHT_ROWS])];
    this.eye = this.sprite([EYE_ROWS]);
    this.iris = this.sprite([IRIS_ROWS]);
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [...this.glands, ...this.tentacles.flatMap((t) => [...t.segments, t.tip]), ...this.lids, this.eye, this.iris];
  }

  protected onStart(): void {
    this.eyeMax = this.eyeHp = 120 * this.diff.hp;
    this.maw = 'closed';
    this.mawTimer = 3;
    this.openAmount = 0;
    this.exhausted = false;
    this.spitTimer = 2;
    this.eggTimer = 3;
    this.tripleTimer = 0;
    this.lashTimer = 5;
    this.lash = 0;
    for (const t of this.tentacles) {
      t.length = SEGMENTS;
      t.tipHp = SEGMENT_HP * this.diff.hp;
      t.flash = 0;
    }
    for (const s of this.sprites()) s.visible = true;
  }

  health(): number {
    return Math.max(0, this.eyeHp) / this.eyeMax;
  }

  /** Wie lange die Kiefer geschlossen bleiben: je verletzter, desto öfter reißt sie sie auf. */
  private closedTime(): number {
    const base = Math.max(2.8, 5.5 - (1 - this.health()) * 2.5);
    // Nach dem Verlust beider Tentakel ist sie geschwächt und öffnet öfter
    return this.exhausted ? base * 0.6 : base;
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.8) * this.diff.fireRate;
    this.eyeFlash = Math.max(0, this.eyeFlash - dt * 8);
    for (const t of this.tentacles) t.flash = Math.max(0, t.flash - dt * 8);

    this.updateMaw(dt, out);

    // Kiefer gleiten auf und zu; beim Zurückzucken schlagen sie zu
    const target = this.maw === 'open' ? 1 : 0;
    const speed = this.maw === 'flinch' ? 16 : target ? 5 : 8;
    this.openAmount += THREE.MathUtils.clamp(target - this.openAmount, -speed * dt, speed * dt);

    // Tentakel peitschen alle paar Sekunden Richtung Spieler
    this.lashTimer -= dt * this.rage;
    if (this.lashTimer <= 0) this.lashTimer = 5;
    this.lash += ((this.lashTimer < 1.3 ? 1 : 0) - this.lash) * Math.min(1, dt * 4);

    if (this.maw === 'flinch') return;
    const mouth = this.world(QUEEN_MOUNTS.mouth);

    // Säurefontäne
    this.spitTimer -= dt * this.rage;
    if (this.spitTimer <= 0) {
      this.spitTimer = 3.2;
      const n = this.maw === 'open' ? 9 : 7;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.3;
        const v = randRange(8, 10);
        out.shots.push({ x: mouth.x, y: mouth.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, style: 'acid' });
      }
    }

    // Eier legen: treiben langsam nach unten und schlüpfen als Brüter
    this.eggTimer -= dt * this.rage;
    if (this.eggTimer <= 0) {
      this.eggTimer = 5.5;
      const gland = this.world(QUEEN_MOUNTS.sacs[Math.floor(Math.random() * QUEEN_MOUNTS.sacs.length)]);
      out.spawns.push({ type: 'egg', x: gland.x, y: gland.y - 1, vx: 0, vy: 0, pattern: 'line', speed: 1.8 });
      this.events.sfx('eggLay');
    }

    // Offenes Auge spuckt gezielt
    if (this.maw === 'open') {
      this.tripleTimer -= dt * this.rage;
      if (this.tripleTimer <= 0) {
        this.tripleTimer = 0.8;
        const e = this.world(QUEEN_MOUNTS.eye);
        const aim = Math.atan2(py - e.y, px - e.x);
        for (const d of [-0.14, 0, 0.14]) {
          out.shots.push({ x: e.x, y: e.y - 1, vx: Math.cos(aim + d) * 12, vy: Math.sin(aim + d) * 12, style: 'acid' });
        }
      }
    }
  }

  private updateMaw(dt: number, out: EnemyOutput): void {
    this.mawTimer -= dt;
    switch (this.maw) {
      case 'closed':
        // Hinter geschlossenen Kiefern regeneriert sie sich
        this.eyeHp = Math.min(this.eyeMax, this.eyeHp + 1.0 * this.diff.hp * dt);
        if (this.mawTimer <= 0) {
          this.maw = 'telegraph';
          this.mawTimer = TELEGRAPH_TIME;
          this.events.sfx('roar');
        }
        break;
      case 'telegraph':
        if (this.mawTimer <= 0) {
          this.maw = 'open';
          this.mawTimer = OPEN_TIME;
          this.windowDamage = 0;
          // Beim Aufreißen ein Säurering
          const e = this.world(QUEEN_MOUNTS.eye);
          const off = Math.random() * Math.PI;
          for (let i = 0; i < 16; i++) {
            const a = off + (i / 16) * Math.PI * 2;
            out.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, style: 'acid' });
          }
        }
        break;
      case 'open':
        if (this.windowDamage >= this.eyeMax * FLINCH_SHARE) {
          // Genug Schaden: sie zuckt schreiend zurück
          this.maw = 'flinch';
          this.mawTimer = FLINCH_TIME;
          this.events.sfx('screech');
          this.events.shake(0.5);
        } else if (this.mawTimer <= 0) {
          this.maw = 'closed';
          this.mawTimer = this.closedTime();
        }
        break;
      case 'flinch':
        if (this.mawTimer <= 0) {
          this.maw = 'closed';
          this.mawTimer = this.closedTime();
        }
        break;
    }
  }

  /** Tentakel als Gliederkette: jedes Glied pendelt, beim Peitschen zieht die Kette Richtung Spieler. */
  private updateTentacles(): void {
    for (const t of this.tentacles) {
      const base = this.world(t.mount);
      let a = t.side * 0.35;
      const toPlayer = Math.atan2(this.px - base.x, -(this.py - base.y));
      const sway = 0.12 + this.lash * 0.1;
      let x = base.x;
      let y = base.y;
      t.points[0].x = x;
      t.points[0].y = y;
      for (let i = 0; i < SEGMENTS; i++) {
        a += Math.sin(this.time * 1.8 + i * 0.6 + t.side * 1.3) * sway - t.side * 0.02;
        a += (toPlayer - a) * 0.12 * this.lash;
        x += Math.sin(a) * SEGMENT_LENGTH;
        y -= Math.cos(a) * SEGMENT_LENGTH;
        t.points[i + 1].x = x;
        t.points[i + 1].y = y;
        if (i + 1 === t.length) t.tipAngle = a;
      }
    }
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    // Tentakel: von der Spitze her abschießen
    for (const t of this.tentacles) {
      if (t.length === 0) continue;
      const tip = t.points[t.length];
      list.push({
        x: tip.x,
        y: tip.y,
        radius: 0.65,
        hit: (dmg) => {
          t.tipHp -= dmg;
          t.flash = 1;
          if (t.tipHp > 0) return this.events.hit();
          t.length--;
          t.tipHp = SEGMENT_HP * this.diff.hp;
          this.events.sfx('sever');
          this.events.explode(tip.x, tip.y, 1, ACID_DEBRIS);
          if (t.length > 0) return;
          this.events.partDestroyed(tip.x, tip.y, 1500, 4, true);
          this.events.sfx('screech');
          if (this.tentacles.every((other) => other.length === 0)) this.exhaust();
        },
      });
    }

    const e = this.world(QUEEN_MOUNTS.eye);
    if (this.openAmount > 0.6 && (this.maw === 'open' || this.maw === 'flinch')) {
      list.push({
        x: e.x,
        y: e.y,
        radius: 1.4,
        hit: (dmg) => {
          this.eyeHp -= dmg;
          this.windowDamage += dmg;
          this.eyeFlash = 1;
          this.events.hit();
          if (this.eyeHp <= 0) this.startDying();
        },
      });
    } else {
      // Geschlossene Kiefer schützen das Auge
      list.push({ x: e.x, y: e.y, radius: 1.7, armor: true, hit: () => {} });
    }
    return list;
  }

  /** Beide Tentakel ab: sie bricht erschöpft ein, das Auge liegt lange frei. */
  private exhaust(): void {
    this.exhausted = true;
    this.maw = 'open';
    this.mawTimer = EXHAUSTED_TIME;
    this.windowDamage = -Infinity;
    this.events.banner('ERSCHÖPFT', 'DAS AUGE LIEGT FREI', true);
  }

  protected layout(): void {
    this.updateTentacles();

    // Drüsen pulsieren, kurz vor dem Eierlegen schneller
    const fast = this.eggTimer < 1;
    this.glands.forEach((g, i) => {
      const m = this.world(QUEEN_MOUNTS.sacs[i]);
      g.setFrame(Math.floor(this.time * (fast ? 12 : 4) + i) % 3);
      g.place(m.x, m.y, -0.1);
    });

    for (const t of this.tentacles) {
      t.segments.forEach((seg, i) => {
        seg.visible = i < t.length;
        seg.setFlash(i === t.length - 1 && t.flash > 0.5 ? 1 : 0);
        seg.place(t.points[i].x, t.points[i].y, -0.35 + i * 0.001);
      });
      t.tip.visible = t.length > 0;
      if (t.length > 0) {
        const tip = t.points[t.length];
        t.tip.mesh.rotation.z = t.tipAngle;
        t.tip.setFlash(t.flash > 0.5 ? 1 : 0);
        t.tip.place(tip.x, tip.y, -0.33);
      }
    }

    // Kiefer: zittern bei der Vorwarnung
    const tremble = this.maw === 'telegraph' ? Math.sin(this.time * 70) * PIXEL : 0;
    const ll = this.world(QUEEN_MOUNTS.lidLeft);
    const lr = this.world(QUEEN_MOUNTS.lidRight);
    this.lids[0].place(ll.x - this.openAmount * LID_TRAVEL * PIXEL + tremble, ll.y, -0.1);
    this.lids[1].place(lr.x + this.openAmount * LID_TRAVEL * PIXEL - tremble, lr.y, -0.1);

    // Auge und Iris: die Iris folgt dem Spieler
    const e = this.world(QUEEN_MOUNTS.eye);
    this.eye.setFlash(this.phase === 'dying' || this.eyeFlash > 0.5 ? 1 : 0);
    this.eye.place(e.x, e.y, -0.2);
    const look = Math.atan2(this.py - e.y, this.px - e.x);
    this.iris.place(e.x + Math.cos(look) * 5 * PIXEL, e.y + Math.sin(look) * 3 * PIXEL, -0.15);
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    return this.tentacles.some((t) => t.points.some((p, i) => i > 1 && i <= t.length && (p.x - px) ** 2 + (p.y - py) ** 2 < (r + 0.45) ** 2));
  }
}
