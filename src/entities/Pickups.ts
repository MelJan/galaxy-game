import * as THREE from 'three';
import { FIELD, SCROLL_SPEED } from '../config';
import { nearest, randRange, type Target } from '../core/view';
import { makePixelTexture, PixelSprite } from '../gfx/pixel';
import { COIN_FRAMES, COIN_PALETTE } from '../gfx/sprites';

interface Coin {
  sprite: PixelSprite;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

/** Ab dieser Entfernung werden Münzen zum Schiff gezogen. */
const MAGNET_RADIUS = 7;
const PICKUP_RADIUS = 1.4;
const ANIM = [0, 1, 2, 1];

/** Gold-Münzen, die Gegner fallen lassen. */
export class Pickups {
  private readonly coins: Coin[] = [];
  /** Faktor auf die Magnetreichweite (Werft). */
  magnetMul = 1;

  constructor(scene: THREE.Scene, capacity = 160) {
    const frames = COIN_FRAMES.map((rows) => makePixelTexture(rows, COIN_PALETTE));
    for (let i = 0; i < capacity; i++) {
      const sprite = new PixelSprite(frames, COIN_FRAMES[0][0].length, COIN_FRAMES[0].length);
      sprite.visible = false;
      scene.add(sprite.mesh);
      this.coins.push({ sprite, active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0 });
    }
  }

  /** Münzen an einer Stelle verstreuen. */
  drop(x: number, y: number, count: number): void {
    for (let n = 0; n < count; n++) {
      const c = this.coins.find((coin) => !coin.active);
      if (!c) return;
      const a = Math.random() * Math.PI * 2;
      const sp = count > 1 ? randRange(2, 6) : 0;
      c.active = true;
      c.x = x;
      c.y = y;
      c.vx = Math.cos(a) * sp;
      c.vy = Math.sin(a) * sp + 3;
      c.age = Math.random();
      c.sprite.visible = true;
    }
  }

  /** Bewegt alle Münzen und gibt zurück, wie viele das Schiff eingesammelt hat. */
  update(dt: number, targets: readonly Target[]): number {
    let collected = 0;
    for (const c of this.coins) {
      if (!c.active) continue;
      c.age += dt;
      // Zum nächsten Schiff ziehen
      const t = nearest(targets, c.x, c.y);
      const playerAlive = t !== null;
      const dx = (t?.x ?? 0) - c.x;
      const dy = (t?.y ?? 0) - c.y;
      const dist = Math.hypot(dx, dy);

      const magnet = MAGNET_RADIUS * this.magnetMul;
      if (playerAlive && dist < magnet) {
        // Je näher, desto stärker der Zug
        const pull = 60 * (1 - dist / magnet) + 10;
        c.vx += (dx / dist) * pull * dt;
        c.vy += (dy / dist) * pull * dt;
      } else {
        // Ausbremsen und mit dem Weltraum nach unten treiben
        c.vx *= 1 - 2 * dt;
        c.vy += (-SCROLL_SPEED * 0.5 - c.vy) * 2 * dt;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;

      if (playerAlive && dist < PICKUP_RADIUS) {
        collected++;
        this.remove(c);
        continue;
      }
      if (c.y < -FIELD.halfHeight - 3) {
        this.remove(c);
        continue;
      }
      c.sprite.setFrame(ANIM[Math.floor(c.age * 10) % ANIM.length]);
      c.sprite.place(c.x, c.y, 0.1);
    }
    return collected;
  }

  private remove(c: Coin): void {
    c.active = false;
    c.sprite.visible = false;
  }

  /** Alle Münzen im Bild auf einmal einsammeln (z. B. vor der Werft). */
  collectAll(): number {
    let n = 0;
    for (const c of this.coins) {
      if (!c.active) continue;
      this.remove(c);
      n++;
    }
    return n;
  }

  clear(): void {
    for (const c of this.coins) if (c.active) this.remove(c);
  }
}
