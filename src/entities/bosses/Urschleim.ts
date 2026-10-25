import * as THREE from 'three';
import { FIELD, PIXEL } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import type { PixelSprite } from '../../gfx/pixel';
import { BLOB_FRAMES, BLOB_RADII, SLIME_PALETTE } from '../../gfx/slimeArt';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const SLIME_DEBRIS = new THREE.Color(0x6ad88a);
const GRAVITY = 18;
/** Je Größe (0 = kleinste): Lebenspunkte, Sprunghöhe (Abprallgeschwindigkeit), seitliches Tempo, Punkte, Münzen. */
const HP = [5, 10, 20, 40];
const BOUNCE = [13, 16, 19, 22];
const SPEED = [9, 7, 5.5, 4.5];
const SCORE = [100, 200, 400, 800];
const COINS = [1, 2, 3, 5];
/** Wie viele Blobs es je Größe höchstens geben kann (1 → 2 → 4 → 8). */
const COUNT = [8, 4, 2, 1];

interface Blob {
  sprite: PixelSprite;
  size: number;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  flash: number;
  /** Stauchung beim Aufprall, klingt ab. */
  squash: number;
  spitTimer: number;
}

/**
 * Sektor 4, Urschleim: ein riesiger Blob hüpft durch die Arena und teilt sich bei jedem „Tod“ in zwei kleinere,
 * bis zur kleinsten Größe. Je kleiner, desto schneller. Erst wenn alle weg sind, ist er besiegt.
 */
export class Urschleim extends BossBase {
  private readonly blobs: Blob[] = [];
  private lastDeath = { x: 0, y: 0 };

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, SLIME_PALETTE, 1, 1, [['.']], SLIME_DEBRIS, 'slime', 1.2);
    for (let size = 0; size < BLOB_FRAMES.length; size++) {
      for (let i = 0; i < COUNT[size]; i++) {
        this.blobs.push({ sprite: this.sprite(BLOB_FRAMES[size]), size, alive: false, x: 0, y: 0, vx: 0, vy: 0, hp: 0, flash: 0, squash: 0, spitTimer: 0 });
      }
    }
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return this.blobs.map((b) => b.sprite);
  }

  /** Kein starrer Rumpf: der Spieler darf überall hin, Schüsse prallen nirgends ab. */
  get bottom(): number | null {
    return null;
  }

  hullContains(): boolean {
    return false;
  }

  protected hullRaycast(): number | null {
    return null;
  }

  private radius(size: number): number {
    return BLOB_RADII[size] * PIXEL;
  }

  /** Gesamte noch zu verteilende Lebenskraft eines Blobs samt allen Nachkommen. */
  private potential(size: number): number {
    return size < 0 ? 0 : HP[size] + 2 * this.potential(size - 1);
  }

  health(): number {
    const total = this.potential(3);
    let left = 0;
    for (const b of this.blobs) if (b.alive) left += Math.max(0, b.hp) / this.hpMul + 2 * this.potential(b.size - 1);
    return left / total;
  }

  protected onStart(): void {
    for (const b of this.blobs) {
      b.alive = false;
      b.sprite.visible = false;
    }
    const root = this.spawnBlob(3, 0, FIELD.halfHeight + 6, 4.5, 0);
    if (root) root.spitTimer = 3;
  }

  private spawnBlob(size: number, x: number, y: number, vx: number, vy: number): Blob | null {
    const b = this.blobs.find((blob) => blob.size === size && !blob.alive);
    if (!b) return null;
    Object.assign(b, { alive: true, x, y, vx, vy, hp: HP[size] * this.hpMul, flash: 0, squash: 0, spitTimer: randRange(2, 4) });
    b.sprite.visible = true;
    return b;
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    const floor = -FIELD.halfHeight + 1.5;
    const alive = this.blobs.filter((b) => b.alive).length;
    this.rage = (1 + (1 - this.health()) * 0.5) * this.diff.fireRate;

    for (const b of this.blobs) {
      if (!b.alive) continue;
      const r = this.radius(b.size);
      b.flash = Math.max(0, b.flash - dt * 8);
      b.squash = Math.max(0, b.squash - dt * 4);

      // Sprung-Physik: Schwerkraft, Boden, Wände
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt * this.diff.speed;
      b.y += b.vy * dt;
      if (b.y - r < floor) {
        b.y = floor + r;
        b.vy = BOUNCE[b.size];
        b.squash = 1;
      }
      const wall = FIELD.halfWidth - r;
      if (Math.abs(b.x) > wall) {
        b.x = Math.sign(b.x) * wall;
        b.vx = -b.vx;
      }

      // Große Blobs werfen Schleimkugeln in Bögen
      if (b.size >= 2) {
        b.spitTimer -= dt * this.rage;
        if (b.spitTimer <= 0) {
          b.spitTimer = randRange(2.8, 4.2);
          const g = 14;
          for (const flight of [0.9, 1.3]) {
            const dx = px + randRange(-2, 2) - b.x;
            out.shots.push({ x: b.x, y: b.y + r * 0.5, vx: dx / flight, vy: (py - b.y + 0.5 * g * flight * flight) / flight, style: 'slime', gravity: g, life: 4 });
          }
        }
      }
    }
    if (alive === 0) this.startDying();
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    for (const b of this.blobs) {
      if (!b.alive) continue;
      list.push({
        x: b.x,
        y: b.y,
        radius: this.radius(b.size) * 0.85,
        hit: (dmg) => {
          b.hp -= dmg;
          b.flash = 1;
          if (b.hp > 0) return this.events.hit();
          this.splitBlob(b);
        },
      });
    }
    return list;
  }

  /** Blob platzt: in zwei kleinere auseinander, die kleinsten verschwinden ganz. */
  private splitBlob(b: Blob): void {
    b.alive = false;
    b.sprite.visible = false;
    this.lastDeath = { x: b.x, y: b.y };
    this.events.explode(b.x, b.y, b.size >= 2 ? 2 : 1, SLIME_DEBRIS);
    this.events.sfx('split');
    this.events.shake(0.15 + b.size * 0.15);
    this.events.partDestroyed(b.x, b.y, SCORE[b.size], COINS[b.size], b.size === 2);
    if (b.size === 0) return;
    const s = b.size - 1;
    for (const dir of [-1, 1]) this.spawnBlob(s, b.x + dir * this.radius(s) * 0.5, b.y, dir * SPEED[s], 10);
  }

  protected deathCenter(): { x: number; y: number } {
    return this.lastDeath;
  }

  protected dyingPoint(): { x: number; y: number } | null {
    return { x: this.lastDeath.x + randRange(-2, 2), y: this.lastDeath.y + randRange(-2, 2) };
  }

  protected layout(): void {
    for (const b of this.blobs) {
      if (!b.alive) continue;
      // Beim Einflug fällt der große Blob mit dem Boss-Ankerpunkt herein
      if (this.phase === 'enter' && b.size === 3) {
        b.y = this.y - 2;
        b.vy = 0;
      }
      b.sprite.setFrame(Math.floor(this.time * 3 + b.size) % 2);
      b.sprite.setFlash(b.flash > 0.5 ? 1 : 0);
      // Stauchen und Strecken: beim Aufprall breit, im Flug leicht gestreckt
      const stretch = THREE.MathUtils.clamp(b.vy / 40, -0.12, 0.12);
      b.sprite.mesh.scale.set(1 + b.squash * 0.25 - stretch * 0.5, 1 - b.squash * 0.25 + stretch, 1);
      b.sprite.place(b.x, b.y, -0.1);
    }
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    return this.blobs.some((b) => b.alive && (b.x - px) ** 2 + (b.y - py) ** 2 < (this.radius(b.size) * 0.85 + r) ** 2);
  }
}
