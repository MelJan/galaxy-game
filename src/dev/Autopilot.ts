import { FIELD } from '../config';
import type { Controls } from '../core/Input';
import { beamDistanceSq, type Beam } from '../fx/Beams';
import type { Bullet } from '../entities/Bullets';
import type { BossBase } from '../entities/bosses/BossBase';
import type { Enemy } from '../entities/Enemies';

/** Was der Autopilot von der Spielwelt sieht. */
export interface BotWorld {
  x: number;
  y: number;
  hitRadius: number;
  /** Höchste erlaubte Flughöhe (unter dem Endgegner), null = frei. */
  ceiling: number | null;
  speed: number;
  bullets: Bullet[];
  bulletRadius: number;
  beams: readonly Beam[];
  enemies: readonly Enemy[];
  boss: BossBase | null;
}

const STEP = 0.06;
const GRID = 0.7;
const MARGIN = 0.25;

/**
 * Nur für Tests (?bot): ein einfacher, aber umsichtiger Pilot für Spieler 1.
 * Bewertet mögliche Zielpunkte danach, wie gefährlich der Weg dorthin in der nächsten knappen Sekunde ist
 * (vorausberechnete Geschosse, Strahlen, Gegner, Rumpf des Endgegners), und bevorzugt Stellen, von denen ein
 * Schuss senkrecht nach oben eine verwundbare Stelle trifft. Geschossen wird nur, wenn der Schuss etwas bringt
 * (keine Salven auf Panzerung oder Spiegelsegel).
 */
export class Autopilot {
  /** 0 = Anfänger, 1 = perfekt. Bestimmt Reaktionszeit, Vorausschau und Entscheidungstakt. */
  private readonly reaction: number;
  private readonly horizon: number;
  private readonly interval: number;
  private goalX = 0;
  private goalY = -13;
  private decide = 0;
  /** Letzte Positionen von Gegnern, um ihre Geschwindigkeit zu schätzen. */
  private readonly lastPos = new WeakMap<object, { x: number; y: number }>();
  private readonly vel = new WeakMap<object, { vx: number; vy: number }>();

  constructor(skill = 1) {
    const k = Math.max(0, Math.min(1, skill));
    this.reaction = (1 - k) * 0.4;
    this.horizon = 0.45 + 0.45 * k;
    this.interval = 0.05 + (1 - k) * 0.2;
  }

  controls(w: BotWorld, dt: number): Controls {
    for (const e of w.enemies) {
      if (!e.active) continue;
      const last = this.lastPos.get(e);
      if (last && dt > 0) this.vel.set(e, { vx: (e.x - last.x) / dt, vy: (e.y - last.y) / dt });
      this.lastPos.set(e, { x: e.x, y: e.y });
    }
    this.decide -= dt;
    if (this.decide <= 0) {
      this.decide = this.interval;
      this.choose(w);
    }
    const dx = this.goalX - w.x;
    const dy = this.goalY - w.y;
    return {
      axisX: Math.abs(dx) < 0.08 ? 0 : Math.max(-1, Math.min(1, dx * 2.5)),
      axisY: Math.abs(dy) < 0.08 ? 0 : Math.max(-1, Math.min(1, dy * 2.5)),
      fire: this.worthFiring(w, w.x, w.y),
    };
  }

  /** Bringt ein Schuss von hier etwas? */
  private worthFiring(w: BotWorld, x: number, y: number): boolean {
    for (const e of w.enemies) {
      if (e.active && e.solid && e.y > y && e.y < FIELD.halfHeight && Math.abs(e.x - x) < e.type.radius + 0.6) return true;
    }
    if (!w.boss?.active) return false;
    // Unter einer verwundbaren Stelle (wie ein Spieler, der darunter Dauerfeuer gibt)
    return w.boss.vulnerableTargets().some((t) => t.y > y && Math.abs(t.x - x) < t.radius + 0.35);
  }

  private choose(w: BotWorld): void {
    const hw = FIELD.halfWidth - 1;
    const top = Math.min(w.ceiling ?? 0, 0) - 0.3;
    const rows = [-14, -11, -7, -3].filter((y) => y <= top);
    if (!rows.length) rows.push(Math.max(-FIELD.halfHeight + 1.5, top));
    // Geschosse, die gerade erst abgefeuert wurden, hat ein Mensch noch nicht wahrgenommen
    const near = w.bullets.filter((b) => b.active && b.age >= this.reaction && Math.abs(b.y - w.y) < 22 && Math.abs(b.x - w.x) < 26);
    const beams = w.beams.filter((b) => b.active && b.hostile);
    let best = Infinity;
    for (const gy of rows) {
      for (let gx = -hw; gx <= hw + 1e-6; gx += GRID) {
        let cost = this.danger(w, gx, gy, near, beams) * 20;
        // Vorzeitig verwerfen nur, wenn selbst der größte Bonus nicht mehr reicht
        if (cost - 6.4 >= best) continue;
        cost += Math.abs(gx - w.x) * 0.04 + Math.abs(gy + 13) * 0.05;
        if (this.worthFiring(w, gx, gy)) cost -= 6;
        // Ruhig bleiben, wenn das alte Ziel genauso gut ist
        if (Math.abs(gx - this.goalX) < GRID && gy === this.goalY) cost -= 0.4;
        if (cost < best) {
          best = cost;
          this.goalX = gx;
          this.goalY = gy;
        }
      }
    }
  }

  /** Gefahr auf dem Weg zu (gx, gy): Summe über die vorausberechneten Zusammenstöße, frühe zählen mehr. */
  private danger(w: BotWorld, gx: number, gy: number, bullets: Bullet[], beams: Beam[]): number {
    let d = 0;
    const dist = Math.hypot(gx - w.x, gy - w.y) || 1;
    const r = w.hitRadius + w.bulletRadius + MARGIN;
    for (let t = 0; t <= this.horizon; t += STEP) {
      const k = Math.min(1, (w.speed * t) / dist);
      const sx = w.x + (gx - w.x) * k;
      const sy = w.y + (gy - w.y) * k;
      const weight = 1.3 - t / this.horizon;
      for (const b of bullets) {
        let bx: number;
        let by: number;
        if (b.amp > 0) {
          // Sinusbahn wie in Bullets.update
          const len = Math.hypot(b.vx, b.vy) || 1;
          const off = b.amp * Math.sin(b.freq * (b.age + t) + b.phase);
          bx = b.baseX + b.vx * t + (-b.vy / len) * off;
          by = b.baseY + b.vy * t + (b.vx / len) * off;
        } else {
          bx = b.x + b.vx * t;
          by = b.y + b.vy * t - 0.5 * b.gravity * t * t;
        }
        if ((bx - sx) ** 2 + (by - sy) ** 2 < r * r) d += weight;
      }
      for (const beam of beams) {
        if (beam.charge && t < 0.25) continue;
        // Strahlen können nachgeführt werden: großzügig Abstand halten wie ein Mensch
        const rr = beam.width / 2 + w.hitRadius + MARGIN + 1.2;
        if (beamDistanceSq(beam, sx, sy) < rr * rr) d += weight * 2;
      }
      for (const e of w.enemies) {
        if (!e.active || !e.solid) continue;
        const v = this.vel.get(e) ?? { vx: 0, vy: 0 };
        const er = e.type.radius + w.hitRadius + 0.4 + MARGIN;
        if ((e.x + v.vx * t - sx) ** 2 + (e.y + v.vy * t - sy) ** 2 < er * er) d += weight * 2;
      }
      if (w.boss?.active && t < 0.4 && w.boss.touchesPlayer(sx, sy, w.hitRadius + MARGIN)) d += weight * 2;
    }
    return d;
  }
}
