import { bayer, hash2, Painter } from './painter';
import type { Palette } from './pixel';

/** Sektor 10 „Die Sternenflotten“: gebrochenes Weiß, Grau, rote Streifen, Triebwerksglut. */
export const FLEET_PALETTE: Palette = {
  k: 0x0a0a10,
  1: 0x2e2c30,
  2: 0x55525a,
  3: 0x8c8a92,
  4: 0xc8c4c0,
  5: 0xf4f0e8,
  r: 0x7a1414,
  R: 0xe03a2a,
  o: 0xa04a10,
  O: 0xffa040,
  y: 0x8a7010,
  Y: 0xffe060,
  b: 0x10306a,
  B: 0x3a8aff,
  C: 0xa8e0ff,
  a: 0x6a2a08, // Linse, dunkel bis hell
  A: 0xd8781a,
  W: 0xffffff,
  v: 0x050508,
};

const BODY = 'S';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function shade(p: Painter, h: number, y0 = 0): void {
  p.map((ch, x, y) => (ch === BODY ? String(clamp(Math.floor(1.8 + (1 - (y - y0) / h) * 2.8 + (bayer(x, y) - 0.5) * 0.7), 1, 5)) : ch));
}

// ---------------------------------------------------------------------------
// Gegner (zeigen nach unten)
// ---------------------------------------------------------------------------

/** Gabelflügler, 15 × 15: schmaler Rumpf, zwei nach vorn gegabelte Flügel (V-Form). */
function paintFork(size: 15 | 21, stripe: string): string[] {
  const p = new Painter(size, size);
  const c = (size - 1) / 2;
  const s = size / 15;
  // Gabelflügel: zwei Spitzen nach vorn (unten)
  p.poly([[c - 1, 2 * s], [0, size - 1], [2 * s, size - 1], [c - 1, 8 * s]], BODY);
  p.poly([[c + 1, 2 * s], [size - 1, size - 1], [size - 1 - 2 * s, size - 1], [c + 1, 8 * s]], BODY);
  // Rumpf
  p.poly([[c, size - 1], [c - 2 * s, 3 * s], [c, 0], [c + 2 * s, 3 * s]], BODY);
  shade(p, size);
  p.line(Math.round(c - 4 * s), Math.round(9 * s), Math.round(1 * s), size - 2, stripe);
  p.line(Math.round(c + 4 * s), Math.round(9 * s), size - 1 - Math.round(1 * s), size - 2, stripe);
  p.set(c, Math.round(6 * s), 'C');
  p.set(c, 0, 'O');
  p.outline('k');
  return p.rows();
}
export const FORK_ROWS = paintFork(15, 'R');
/** Asse der Staffel: größer; der Anführer mit gelbem Streifen. */
export const ACE_ROWS = paintFork(21, 'R');
export const ACE_LEADER_ROWS = paintFork(21, 'Y');

/** Kanonenboot, 23 × 19: breiter Rumpf, zwei Geschütztürme. */
export const GUNBOAT_ROWS = (() => {
  const p = new Painter(23, 19);
  p.poly([[3, 0], [20, 0], [23, 8], [17, 19], [6, 19], [0, 8]], BODY);
  shade(p, 19);
  p.line(4, 6, 18, 6, 'R');
  for (const x of [6, 16]) {
    p.circle(x, 12, 2.5, '2');
    p.line(x, 13, x, 18, '3');
  }
  p.rect(10, 2, 3, 3, 'C');
  p.outline('k');
  return p.rows();
})();

/** Roter Laserbolzen (3 × 7). */
export const BOLT_ROWS = ['.W.', 'RWR', 'RWR', '.R.', '.R.', '.r.', '.r.'];

// ---------------------------------------------------------------------------
// Endgegner: Forschungskreuzer Odysseus (Pfeilrumpf mit Ringantrieb)
// ---------------------------------------------------------------------------

export const ODY_W = 47;
export const ODY_H = 73;

/** Pfeilrumpf, Spitze nach unten, Ringantrieb am Heck (oben). */
export function paintOdysseus(): string[] {
  const p = new Painter(ODY_W, ODY_H);
  // Ringantrieb: schräger Ring um das Heck
  p.ellipse(23, 14, 22, 9, 'B');
  p.ellipse(23, 14, 18, 6, '.');
  p.map((ch, x, y) => (ch === 'B' && (x + y) % 5 === 0 ? 'C' : ch));
  // Rumpf als langer Pfeil
  p.poly([[23.5, 72], [13, 34], [16, 4], [31, 4], [34, 34]], BODY);
  // Seitliche Stabilisatoren
  p.poly([[13, 38], [5, 50], [8, 52], [15, 44]], BODY);
  p.poly([[34, 38], [42, 50], [39, 52], [32, 44]], BODY);
  shade(p, ODY_H);
  // Ring vor dem Rumpf (vordere Hälfte)
  for (let x = 2; x < 45; x++) {
    const t = (x - 23) / 22;
    const y = Math.round(14 + 9 * Math.sqrt(Math.max(0, 1 - t * t)));
    if (Math.abs(t) < 0.98) {
      p.set(x, y, 'B');
      p.set(x, y - 1, x % 4 === 0 ? 'C' : 'B');
    }
  }
  // Brücke, Fensterband, roter Streifen
  p.rect(20, 46, 7, 4, 'C');
  for (let y = 26; y < 44; y += 4) p.set(23, y, 'C');
  p.line(16, 30, 23, 62, 'R');
  p.line(31, 30, 24, 62, 'R');
  p.outline('k');
  return p.rows();
}

/** Schildring, 101 × 101, mit einer Lücke (~70°) oben; wird zum Wandern gedreht. Zwei Flimmer-Frames. */
export const ODY_SHIELD_FRAMES = [0, 1].map((k) => {
  const p = new Painter(101, 101);
  for (let y = 0; y < 101; y++) {
    for (let x = 0; x < 101; x++) {
      const d = Math.hypot(x - 50, y - 50);
      if (d < 46 || d > 50) continue;
      const a = Math.atan2(y - 50, x - 50); // Lücke um -π/2 (oben im Bild)
      if (Math.abs(a + Math.PI / 2) < 0.6) continue;
      p.set(x, y, (x + y + k) % 3 === 0 ? 'C' : 'B');
    }
  }
  return p.rows();
});
/** Halber Öffnungswinkel der Lücke (rad). */
export const ODY_GAP = 0.6;

/** Torpedo (7 × 7), teilt sich. */
export const TORPEDO_ROWS = (() => {
  const p = new Painter(7, 7);
  p.circle(3, 3, 3, 'o');
  p.circle(3, 3, 2, 'O');
  p.set(3, 3, 'W');
  return p.rows();
})();

// ---------------------------------------------------------------------------
// Endgegner: Weltenbrecher (gewaltige Kugel aus Sechseckplatten, Fokuslinse)
// ---------------------------------------------------------------------------

export const WB_W = 241;
export const WB_H = 111;
/** Kugelmitte im Raster: oberhalb des Sprites, nur die untere Hälfte ist sichtbar. */
const WB_CX = 120;
const WB_CY = -10;
const WB_R = 120;

/** Untere Halbkugel aus Sechseckplatten, mit Kuhle für die Linse unten in der Mitte. */
export function paintWorldbreaker(): string[] {
  const p = new Painter(WB_W, WB_H);
  const hexSize = 9;
  for (let y = 0; y < WB_H; y++) {
    for (let x = 0; x < WB_W; x++) {
      const dx = x - WB_CX;
      const dy = y - WB_CY;
      const d = Math.hypot(dx, dy);
      if (d > WB_R) continue;
      // Licht von oben links auf der Kugel
      const nz = Math.sqrt(Math.max(0, 1 - (d / WB_R) ** 2));
      const light = 0.45 + nz * 0.45 - (dx / WB_R) * 0.25;
      let lvl = clamp(Math.floor(light * 4.5 + (bayer(x, y) - 0.5) * 0.8), 1, 4);
      // Sechseckraster: Würfelkoordinaten runden, Abstand zur Plattenmitte gibt die Fuge
      const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / hexSize;
      const r = ((2 / 3) * y) / hexSize;
      const s = -q - r;
      let rq = Math.round(q);
      let rr = Math.round(r);
      const rs = Math.round(s);
      const dq = Math.abs(rq - q);
      const dr = Math.abs(rr - r);
      const ds = Math.abs(rs - s);
      if (dq > dr && dq > ds) rq = -rr - rs;
      else if (dr > ds) rr = -rq - rs;
      const edge = (Math.abs(q - rq) + Math.abs(r - rr) + Math.abs(s - (-rq - rr))) / 2;
      if (edge > 0.43) lvl = 1;
      else if (hash2(rq, rr) > 0.85) lvl = Math.max(1, lvl - 1);
      p.set(x, y, String(lvl));
    }
  }
  // Kuhle für die Linse
  p.circle(120, 86, 19, 'k');
  p.circle(120, 86, 18, 'v');
  // Rote Positionslichter
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.1 + (i / 8) * 0.8);
    p.set(Math.round(WB_CX + Math.cos(a) * (WB_R - 4)), Math.round(WB_CY + Math.sin(a) * (WB_R - 4)), 'R');
  }
  p.outline('k');
  return p.rows();
}

/** Energieleiter, 13 × 17: glühender Zylinder. Frames: 0 und 1 Pulsieren, 2 zerstört. */
export const CONDUIT_FRAMES = [0, 1, 2].map((k) => {
  const p = new Painter(13, 17);
  p.rect(2, 0, 9, 17, '2');
  p.rect(0, 0, 13, 3, '3');
  p.rect(0, 14, 13, 3, '3');
  if (k < 2) {
    p.rect(4, 3, 5, 11, k ? 'Y' : 'O');
    p.line(6, 4, 6, 12, 'W');
  } else {
    p.rect(4, 3, 5, 11, 'v');
    p.set(5, 7, 'o');
  }
  p.outline('k');
  return p.rows();
});

/** Fokuslinse, 33 × 33: Bernstein-Linse. Frames 0/1 Pulsieren, 2 aufgebrochen (verwundbar). */
export const LENS_FRAMES = [0, 1, 2].map((k) => {
  const p = new Painter(33, 33);
  p.circle(16, 16, 16, '3');
  p.circle(16, 16, 14, 'a');
  p.circle(16, 16, 10 + (k === 1 ? 1 : 0), 'A');
  p.circle(16, 16, 5, k === 2 ? 'W' : 'Y');
  p.set(12, 11, 'W');
  p.set(13, 11, 'W');
  if (k === 2) {
    for (const [x0, y0, x1, y1] of [[16, 2, 14, 10], [30, 16, 22, 15], [16, 30, 18, 22], [2, 16, 10, 18]]) p.line(x0, y0, x1, y1, 'k');
  }
  p.outline('k');
  return p.rows();
});
