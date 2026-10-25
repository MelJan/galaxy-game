import * as THREE from 'three';
import { FIELD } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import { CRYSTAL_PALETTE, RING_SHARD_FRAMES, SWARM_CORE_FRAMES } from '../../gfx/crystalArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const ICE_DEBRIS = new THREE.Color(0xa8e0ff);
/** Ringe: Radius (Welt-Einheiten), Anzahl Splitter, Drehgeschwindigkeit (rad/s, Vorzeichen = Richtung). */
const RINGS = [
  { radius: 3.2, count: 10, speed: 0.9 },
  { radius: 4.9, count: 14, speed: -0.62 },
  { radius: 6.6, count: 18, speed: 0.42 },
];
const REGROW_TIME = 6;
const PULSE_TELEGRAPH = 0.7;
const PULSE_TIME = 1.5;

interface Shard {
  sprite: PixelSprite;
  ring: number;
  slot: number;
  hp: number;
  alive: boolean;
  regrow: number;
  flash: number;
  x: number;
  y: number;
}

/**
 * Endgegner Sektor 6, Kristallschwarm: ein Kern, um den drei Ringe aus Splittern gegenläufig rotieren.
 * Die Splitter fangen alle Schüsse ab. Man muss eine Lücke schießen und den Kern durch die Lücke treffen,
 * bevor die Splitter nachwachsen. Regelmäßig dehnen sich die Ringe pulsierend aus, und einzelne Splitter
 * lösen sich, um den Spieler zu jagen.
 */
export class Kristallschwarm extends BossBase {
  private readonly shards: Shard[] = [];
  private readonly core: PixelSprite;
  private readonly angles = RINGS.map(() => 0);
  private coreHp = 0;
  private coreMax = 1;
  private coreFlash = 0;
  private cx = 0;
  private cy = 0;
  private pulseTimer = 0;
  private pulse: 'idle' | 'telegraph' | 'expand' = 'idle';
  private pulsePhase = 0;
  private aimTimer = 0;
  private ringTimer = 0;
  private detachTimer = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, CRYSTAL_PALETTE, 1, 1, [['.']], ICE_DEBRIS, 'crystal');
    RINGS.forEach((ring, r) => {
      for (let i = 0; i < ring.count; i++) {
        this.shards.push({ sprite: this.sprite(RING_SHARD_FRAMES), ring: r, slot: i, hp: 0, alive: false, regrow: 0, flash: 0, x: 0, y: 0 });
      }
    });
    this.core = this.sprite(SWARM_CORE_FRAMES);
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [...this.shards.map((s) => s.sprite), this.core];
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
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 6;
    return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r };
  }

  health(): number {
    return Math.max(0, this.coreHp) / this.coreMax;
  }

  protected onStart(): void {
    this.coreMax = this.coreHp = 100 * this.hpMul;
    for (const s of this.shards) Object.assign(s, { hp: 2 * this.diff.hp, alive: true, regrow: 0, flash: 0 });
    for (const s of this.sprites()) s.visible = true;
    this.pulseTimer = 6;
    this.pulse = 'idle';
    this.aimTimer = 1.5;
    this.ringTimer = 3;
    this.detachTimer = 4;
  }

  /** Ringradius-Faktor beim Pulsieren: dehnt sich aus und zieht sich wieder zusammen. */
  private get spread(): number {
    return this.pulse === 'expand' ? 1 + 0.75 * Math.sin(Math.PI * Math.min(1, this.pulsePhase / PULSE_TIME)) : 1;
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.6) * this.diff.fireRate;
    this.coreFlash = Math.max(0, this.coreFlash - dt * 8);
    RINGS.forEach((ring, r) => (this.angles[r] += ring.speed * dt * (1 + (1 - this.health()) * 0.5)));

    for (const s of this.shards) {
      s.flash = Math.max(0, s.flash - dt * 8);
      if (s.alive) continue;
      // Zerstörte Splitter wachsen nach
      s.regrow -= dt;
      if (s.regrow <= 0) {
        s.alive = true;
        s.hp = 2 * this.diff.hp;
        this.events.sfx('regrow');
      }
    }

    // Pulsieren: Vorwarnung (Splitter blitzen), dann Ausdehnen
    this.pulseTimer -= dt * this.rage;
    if (this.pulse === 'idle' && this.pulseTimer <= 0) {
      this.pulse = 'telegraph';
      this.pulsePhase = 0;
    } else if (this.pulse !== 'idle') {
      this.pulsePhase += dt;
      if (this.pulse === 'telegraph' && this.pulsePhase >= PULSE_TELEGRAPH) {
        this.pulse = 'expand';
        this.pulsePhase = 0;
        this.events.sfx('pulse');
      } else if (this.pulse === 'expand' && this.pulsePhase >= PULSE_TIME) {
        this.pulse = 'idle';
        this.pulseTimer = 7;
      }
    }

    // Der Kern zielt auf den Spieler und sendet ab und zu einen Ring aus
    this.aimTimer -= dt * this.rage;
    if (this.aimTimer <= 0) {
      this.aimTimer = 0.55;
      const a = Math.atan2(py - this.cy, px - this.cx);
      out.shots.push({ x: this.cx, y: this.cy, vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, style: 'shard' });
    }
    this.ringTimer -= dt * this.rage;
    if (this.ringTimer <= 0) {
      this.ringTimer = 3.4;
      const off = Math.random() * Math.PI;
      for (let i = 0; i < 16; i++) {
        const a = off + (i / 16) * Math.PI * 2;
        out.shots.push({ x: this.cx, y: this.cy, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, style: 'shard' });
      }
    }

    // Ein Splitter aus dem äußeren Ring löst sich und jagt den Spieler
    this.detachTimer -= dt * this.rage;
    if (this.detachTimer <= 0) {
      this.detachTimer = 4;
      const outer = this.shards.filter((s) => s.alive && s.ring === RINGS.length - 1);
      const s = outer[Math.floor(Math.random() * outer.length)];
      if (s) {
        s.alive = false;
        s.regrow = REGROW_TIME;
        out.spawns.push({ type: 'shard', x: s.x, y: s.y, vx: randRange(-3, 3), vy: -5, speed: 10, hold: 2 });
      }
    }
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    for (const s of this.shards) {
      if (!s.alive) continue;
      list.push({
        x: s.x,
        y: s.y,
        radius: 0.55,
        noMissile: true,
        hit: (dmg) => {
          s.hp -= dmg;
          s.flash = 1;
          if (s.hp > 0) return this.events.hit();
          s.alive = false;
          s.regrow = REGROW_TIME;
          this.events.explode(s.x, s.y, 1, ICE_DEBRIS);
          this.events.partDestroyed(s.x, s.y, 60, 0, false);
        },
      });
    }
    list.push({
      x: this.cx,
      y: this.cy,
      radius: 1.3,
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
    // Die ganze Formation treibt langsam durch die obere Hälfte
    this.cx = this.x + Math.sin(this.time * 0.35) * Math.min(FIELD.halfWidth * 0.35, 8);
    this.cy = this.y - 8.5 + Math.sin(this.time * 0.5) * 1.2;
    const spread = this.spread;
    const telegraph = this.pulse === 'telegraph' && Math.floor(this.pulsePhase * 14) % 2 === 0;
    for (const s of this.shards) {
      const ring = RINGS[s.ring];
      const a = this.angles[s.ring] + (s.slot / ring.count) * Math.PI * 2;
      const r = ring.radius * spread;
      s.x = this.cx + Math.cos(a) * r;
      s.y = this.cy + Math.sin(a) * r;
      // Nachwachsende Splitter erscheinen dunkel kurz vor ihrer Rückkehr
      s.sprite.visible = this.phase !== 'dying' && (s.alive || s.regrow < 1.2);
      s.sprite.setFrame(s.alive ? 0 : 1);
      s.sprite.setFlash(s.flash > 0.5 || telegraph ? 1 : 0);
      s.sprite.mesh.rotation.z = a;
      s.sprite.place(s.x, s.y, -0.1);
    }
    this.core.setFrame(Math.floor(this.time * 7) % SWARM_CORE_FRAMES.length);
    this.core.setFlash(this.phase === 'dying' || this.coreFlash > 0.5 ? 1 : 0);
    this.core.place(this.cx, this.cy, -0.2);
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    if ((this.cx - px) ** 2 + (this.cy - py) ** 2 < (1.3 + r) ** 2) return true;
    return this.shards.some((s) => s.alive && (s.x - px) ** 2 + (s.y - py) ** 2 < (0.5 + r) ** 2);
  }
}
