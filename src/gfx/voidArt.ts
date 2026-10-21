import { bayer, Painter } from './painter';
import type { Palette } from './pixel';

/** Sektor 7 „Der Ereignishorizont“: Schwärze, Violett, Magenta und ein unheimliches Grün. */
export const VOID_PALETTE: Palette = {
  k: 0x05030a,
  v: 0x000000, // Ereignishorizont
  1: 0x150a24,
  2: 0x2a1450,
  3: 0x4a2a8a,
  4: 0x8a5ad8,
  5: 0xd8c0ff,
  m: 0xb01a70,
  M: 0xff5ab0,
  g: 0x1a9a7a,
  G: 0x7affd8,
  W: 0xffffff,
};

const BODY = 'B';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function shade(p: Painter, h: number): void {
  p.map((ch, x, y) => (ch === BODY ? String(clamp(Math.floor(1.5 + (1 - y / h) * 2.6 + (bayer(x, y) - 0.5) * 0.8), 1, 4)) : ch));
  p.map((ch, x, y, get) => (ch >= '1' && ch <= '4' && get(x, y - 1) === '.' ? '5' : ch));
}

// ---------------------------------------------------------------------------
// Gegner
// ---------------------------------------------------------------------------

/** Gravitationsmine, 15 × 15: dunkler Kern mit Stacheln und pulsierendem Ring. */
export const GRAVMINE_FRAMES = [0, 1].map((k) => {
  const p = new Painter(15, 15);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + k * 0.4;
    p.line(7, 7, 7 + Math.cos(a) * 7, 7 + Math.sin(a) * 7, i % 2 ? '3' : '4');
  }
  p.circle(7, 7, 4.5, BODY);
  shade(p, 15);
  p.circle(7, 7, 2.5, 'v');
  p.circle(7, 7, 1, k ? 'M' : 'm');
  p.outline('k');
  return p.rows();
});

/** Leerenauge, 17 × 17: Augapfel aus Schatten mit grüner Iris. */
export const VOIDEYE_FRAMES = [0, 1].map((k) => {
  const p = new Painter(17, 17);
  p.circle(8, 8, 8, BODY);
  shade(p, 17);
  p.ellipse(8, 9, 6, 4, 'W');
  p.circle(8, 9, 3, k ? 'G' : 'g');
  p.circle(8, 9, 1.5, 'v');
  p.set(7, 8, 'W');
  // Lider oben und unten
  p.line(2, 6, 14, 6, '2');
  p.line(3, 12, 13, 12, '2');
  p.outline('k');
  return p.rows();
});
/** Pupille relativ zur Sprite-Mitte (Ursprung des Strahls), in Pixeln. */
export const VOIDEYE_PUPIL_Y = -1;

/** Schattenjäger, 17 × 13: spitzer Dolch mit magenta Triebwerk. */
export const STALKER_ROWS = (() => {
  const p = new Painter(17, 13);
  p.poly([[8.5, 13], [0, 1], [5, 3], [8.5, 0], [12, 3], [17, 1]], BODY);
  shade(p, 13);
  p.line(3, 2, 7, 8, 'm');
  p.line(13, 2, 9, 8, 'm');
  p.set(8, 4, 'G');
  p.set(8, 5, 'g');
  p.outline('k');
  return p.rows();
})();

/** Leerengeschoss (5 × 5). */
export const VOID_BULLET_ROWS = ['.mMm.', 'mMWMm', 'MWvWM', 'mMWMm', '.mMm.'];

// ---------------------------------------------------------------------------
// Endgegner: Singularität
// ---------------------------------------------------------------------------

export const HOLE_SIZE = 71;
const HC = 35;

/**
 * Schwarzes Loch mit Akkretionsscheibe, 71 × 71, vier Frames (die Scheibe dreht sich).
 * Die vordere Scheibenhälfte liegt vor dem Loch, die hintere wird oben als Lichtbogen gespiegelt (Linseneffekt).
 */
export const HOLE_FRAMES = [0, 1, 2, 3].map((k) => {
  const p = new Painter(HOLE_SIZE, HOLE_SIZE);
  const streak = (a: number, r: number) => {
    const s = Math.sin(a * 6 + k * (Math.PI / 2) + r * 0.45) + Math.sin(a * 13 - k + r * 0.9) * 0.5;
    return s > 1 ? 'W' : s > 0.4 ? 'M' : s > -0.3 ? '4' : s > -0.9 ? 'm' : '3';
  };
  // Hintere Scheibe als Lichtbogen um das Loch
  for (let y = 0; y < HOLE_SIZE; y++) {
    for (let x = 0; x < HOLE_SIZE; x++) {
      const dx = x - HC;
      const dy = y - HC;
      const r = Math.hypot(dx, dy);
      if (r > 13 && r < 17 && dy < 4) p.set(x, y, streak(Math.atan2(dy, dx), r));
    }
  }
  // Ereignishorizont
  p.circle(HC, HC, 12.5, 'v');
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    p.set(Math.round(HC + Math.cos(a) * 12.5), Math.round(HC + Math.sin(a) * 12.5), i % 3 === k % 3 ? 'W' : 'G');
  }
  // Vordere Scheibe: flache Ellipse, nur die untere Hälfte liegt vor dem Loch
  for (let y = 0; y < HOLE_SIZE; y++) {
    for (let x = 0; x < HOLE_SIZE; x++) {
      const dx = x - HC;
      const dy = (y - HC) / 0.32;
      const r = Math.hypot(dx, dy);
      if (r < 15 || r > 34) continue;
      const behind = y < HC && Math.hypot(x - HC, y - HC) < 13;
      if (behind) continue;
      // Außen ausgefranst
      if (r > 30 && bayer(x, y) < (r - 30) / 4) continue;
      p.set(x, y, streak(Math.atan2(dy, dx), r));
    }
  }
  return p.rows();
});

/** Gravitationsgenerator, 13 × 13: grüner Oktaeder, zwei Frames (dreht sich). */
export const GENERATOR_FRAMES = [0, 1].map((k) => {
  const p = new Painter(13, 13);
  const w = k ? 4 : 6;
  p.poly([[6.5, 0], [6.5 + w, 6.5], [6.5, 13], [6.5 - w, 6.5]], 'g');
  p.poly([[6.5, 2], [6.5 + w * 0.5, 6.5], [6.5, 11], [6.5 - w * 0.5, 6.5]], 'G');
  p.line(6, 1, 6, 11, 'W');
  p.outline('k');
  return p.rows();
});
