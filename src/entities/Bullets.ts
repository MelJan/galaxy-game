import * as THREE from 'three';
import { FIELD, PIXEL } from '../config';
import { createPixelMaterial, makePixelTexture, snapPixel, type Palette } from '../gfx/pixel';

export interface Bullet {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  /** Position zu Beginn des Frames, für die Kollisionsprüfung entlang der Flugstrecke. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  active: boolean;
  /** Sinuswelle quer zur Flugrichtung (0 = gerade). Die Grundbahn läuft über baseX/baseY. */
  amp: number;
  freq: number;
  phase: number;
  age: number;
  baseX: number;
  baseY: number;
  /** Zielsuche: maximale Drehrate in rad/s (0 = keine). */
  homing: number;
  /** Restlebenszeit in Sekunden (Infinity = bis zum Rand). */
  life: number;
  /** Schwerkraft nach unten (Wurfgeschosse). */
  gravity: number;
}

export interface SpawnOptions {
  amp?: number;
  freq?: number;
  phase?: number;
  homing?: number;
  life?: number;
  gravity?: number;
}

/** Fester Pool von Pixel-Projektilen. Ist er voll, wird das älteste wiederverwendet. */
export class BulletPool {
  readonly bullets: Bullet[] = [];
  private readonly widthPx: number;
  private readonly heightPx: number;
  private cursor = 0;

  constructor(scene: THREE.Scene, capacity: number, rows: string[], palette: Palette, private readonly orient = false) {
    this.widthPx = rows[0].length;
    this.heightPx = rows.length;
    const geo = new THREE.PlaneGeometry(this.widthPx * PIXEL, this.heightPx * PIXEL);
    const mat = createPixelMaterial(makePixelTexture(rows, palette), this.widthPx, this.heightPx);
    for (let i = 0; i < capacity; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.bullets.push({ mesh, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, active: false, amp: 0, freq: 0, phase: 0, age: 0, baseX: 0, baseY: 0, homing: 0, life: Infinity, gravity: 0 });
    }
  }

  /**
   * amp/freq/phase ergeben ein Projektil, das in einer Sinuswelle quer zur Flugrichtung schlingert,
   * homing eines, das sein Ziel verfolgt (siehe update), life eine begrenzte Flugzeit.
   */
  spawn(x: number, y: number, vx: number, vy: number, opts: SpawnOptions = {}): Bullet {
    const { amp = 0, freq = 0, phase = 0, homing = 0, life = Infinity, gravity = 0 } = opts;
    const b = this.bullets[this.cursor];
    this.cursor = (this.cursor + 1) % this.bullets.length;
    b.active = true;
    b.x = b.prevX = b.baseX = x;
    b.y = b.prevY = b.baseY = y;
    b.vx = vx;
    b.vy = vy;
    b.amp = amp;
    b.freq = freq;
    b.phase = phase;
    b.homing = homing;
    b.life = life;
    b.gravity = gravity;
    b.age = 0;
    b.mesh.visible = true;
    this.place(b);
    return b;
  }

  clear(): void {
    for (const b of this.bullets) if (b.active) this.kill(b);
  }

  kill(b: Bullet): void {
    b.active = false;
    b.mesh.visible = false;
  }

  /** Bewegt alle Projektile. Zielsuchende drehen sich zum Ziel (tx, ty), sofern eins angegeben ist. */
  update(dt: number, tx?: number, ty?: number): void {
    const limitX = FIELD.halfWidth + 4;
    const limitY = FIELD.halfHeight + 4;
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        this.kill(b);
        continue;
      }
      if (b.homing > 0 && tx !== undefined && ty !== undefined) steer(b, tx, ty, b.homing * dt);
      b.prevX = b.x;
      b.prevY = b.y;
      b.age += dt;
      if (b.amp > 0) {
        b.baseX += b.vx * dt;
        b.baseY += b.vy * dt;
        // Auslenkung senkrecht zur Flugrichtung; Start bei 0, damit die Welle an der Mündung beginnt
        const len = Math.hypot(b.vx, b.vy) || 1;
        const off = b.amp * Math.sin(b.freq * b.age + b.phase);
        b.x = b.baseX + (-b.vy / len) * off;
        b.y = b.baseY + (b.vx / len) * off;
      } else {
        b.vy -= b.gravity * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      // Wurfgeschosse dürfen oben aus dem Bild steigen und zurückfallen
      if (Math.abs(b.x) > limitX || b.y < -limitY || b.y > limitY + (b.gravity > 0 ? 20 : 0)) this.kill(b);
      else this.place(b);
    }
  }

  /**
   * Schwerkraftquelle (Schwarzes Loch): beschleunigt alle Geschosse Richtung (wx, wy) mit g / Abstand².
   * Geschosse, die näher als absorb kommen, werden verschluckt (nur nach minAge Sekunden Flugzeit).
   * Gibt die Anzahl verschluckter Geschosse zurück.
   */
  attract(dt: number, wx: number, wy: number, g: number, absorb: number, minAge = 0): number {
    let swallowed = 0;
    for (const b of this.bullets) {
      if (!b.active) continue;
      const dx = wx - b.x;
      const dy = wy - b.y;
      const d2 = dx * dx + dy * dy;
      if (absorb > 0 && d2 < absorb * absorb && b.age >= minAge) {
        this.kill(b);
        swallowed++;
        continue;
      }
      const d = Math.sqrt(d2) || 1;
      const a = Math.min(g / (d2 + 4), 400) * dt;
      b.vx += (dx / d) * a;
      b.vy += (dy / d) * a;
    }
    return swallowed;
  }

  private place(b: Bullet): void {
    if (this.orient) b.mesh.rotation.z = Math.atan2(b.vy, b.vx) - Math.PI / 2;
    b.mesh.position.set(snapPixel(b.x, this.widthPx), snapPixel(b.y, this.heightPx), 0);
  }
}

/**
 * Abstand² zwischen einem Kreismittelpunkt und der Flugstrecke eines Projektils in diesem Frame.
 * So kann ein schnelles Projektil bei niedriger Framerate nicht über einen Gegner hinwegspringen.
 */
export function sweptDistanceSq(b: Bullet, cx: number, cy: number): number {
  const dx = b.x - b.prevX;
  const dy = b.y - b.prevY;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((cx - b.prevX) * dx + (cy - b.prevY) * dy) / len)) : 1;
  const px = b.prevX + dx * t - cx;
  const py = b.prevY + dy * t - cy;
  return px * px + py * py;
}

/** Geschwindigkeit eines Projektils um höchstens maxTurn (rad) Richtung Ziel drehen. */
export function steer(b: Bullet, tx: number, ty: number, maxTurn: number): void {
  const speed = Math.hypot(b.vx, b.vy);
  const cur = Math.atan2(b.vy, b.vx);
  let diff = Math.atan2(ty - b.y, tx - b.x) - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const a = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
  b.vx = Math.cos(a) * speed;
  b.vy = Math.sin(a) * speed;
}
