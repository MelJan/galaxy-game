import * as THREE from 'three';
import { FIELD } from '../config';
import { nearest, type Target } from '../core/view';
import { POWERUP_FRAMES, POWERUP_PALETTE, type PowerUpKind } from '../gfx/bossArt';
import { makePixelTexture, PixelSprite } from '../gfx/pixel';

interface Capsule {
  sprite: PixelSprite;
  kind: PowerUpKind;
  active: boolean;
  x: number;
  y: number;
  baseX: number;
  vy: number;
  age: number;
}

const KINDS: PowerUpKind[] = ['repair', 'shield', 'fan', 'laser', 'missile', 'option'];
const PICKUP_RADIUS = 1.7;
/** Kapseln werden nur aus kurzer Entfernung angezogen: man soll sie bewusst einsammeln. */
const MAGNET_RADIUS = 3.5;

export function randomPowerUp(exclude?: PowerUpKind): PowerUpKind {
  const pool = exclude ? KINDS.filter((k) => k !== exclude) : KINDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Power-up-Kapseln: schweben langsam nach unten und schlingern leicht. */
export class PowerUps {
  private readonly capsules: Capsule[] = [];

  constructor(scene: THREE.Scene, capacity = 10) {
    // Alle Frames aller Typen in einer Liste: je zwei pro Typ, in der Reihenfolge von KINDS
    const frames = KINDS.flatMap((k) => POWERUP_FRAMES[k].map((rows) => makePixelTexture(rows, POWERUP_PALETTE)));
    const size = POWERUP_FRAMES.repair[0];
    for (let i = 0; i < capacity; i++) {
      const sprite = new PixelSprite(frames, size[0].length, size.length);
      sprite.visible = false;
      scene.add(sprite.mesh);
      this.capsules.push({ sprite, kind: 'repair', active: false, x: 0, y: 0, baseX: 0, vy: 0, age: 0 });
    }
  }

  /** Kapsel an einer Stelle erscheinen lassen (z. B. wo ein Gegner zerstört wurde). */
  spawn(kind: PowerUpKind, x: number, y: number): void {
    const c = this.capsules.find((cap) => !cap.active);
    if (!c) return;
    c.kind = kind;
    c.active = true;
    c.x = c.baseX = THREE.MathUtils.clamp(x, -FIELD.halfWidth + 1.5, FIELD.halfWidth - 1.5);
    c.y = y;
    c.vy = -3.2;
    c.age = 0;
    c.sprite.visible = true;
  }

  /** Bewegt alle Kapseln und gibt die eingesammelten Typen zurück. */
  /** Gibt die eingesammelten Kapseln zurück, jeweils mit dem Index des Schiffs, das sie bekommen hat. */
  update(dt: number, targets: readonly Target[]): { kind: PowerUpKind; who: number }[] {
    const collected: { kind: PowerUpKind; who: number }[] = [];
    for (const c of this.capsules) {
      if (!c.active) continue;
      c.age += dt;
      c.y += c.vy * dt;
      c.x = c.baseX + Math.sin(c.age * 2.2) * 1.2;

      const t = nearest(targets, c.x, c.y);
      const playerAlive = t !== null;
      const dx = (t?.x ?? 0) - c.x;
      const dy = (t?.y ?? 0) - c.y;
      const dist = Math.hypot(dx, dy);
      if (playerAlive && dist < MAGNET_RADIUS) {
        c.baseX += (dx / dist) * 8 * dt;
        c.y += (dy / dist) * 8 * dt;
      }
      if (playerAlive && dist < PICKUP_RADIUS) {
        collected.push({ kind: c.kind, who: targets.indexOf(t!) });
        this.remove(c);
        continue;
      }
      if (c.y < -FIELD.halfHeight - 3) {
        this.remove(c);
        continue;
      }
      const glow = Math.floor(c.age * 6) % 2;
      c.sprite.setFrame(KINDS.indexOf(c.kind) * 2 + glow);
      c.sprite.place(c.x, c.y, 0.15);
    }
    return collected;
  }

  private remove(c: Capsule): void {
    c.active = false;
    c.sprite.visible = false;
  }

  clear(): void {
    for (const c of this.capsules) if (c.active) this.remove(c);
  }
}
