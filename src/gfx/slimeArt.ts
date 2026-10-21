import { bayer, hash2, Painter } from './painter';
import type { Palette } from './pixel';

/** Sektor 4 „Der Schleim“: glibbriges Grün mit violetten Zellkernen. */
export const SLIME_PALETTE: Palette = {
  k: 0x06120e, // Kontur
  1: 0x0e3a2a, // Schleim, dunkel bis hell
  2: 0x17664a,
  3: 0x2aa06a,
  4: 0x6ad88a,
  5: 0xc8ffb8,
  n: 0x5a1a7a, // Zellkern
  N: 0xc06aff,
  b: 0x9affd0, // Bläschen
  W: 0xffffff,
};

const SLIME = 'S';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Schleim schattieren: oben hell, unten dunkel, Glanzlicht oben links. */
function shadeSlime(p: Painter, cx: number, cy: number, r: number): void {
  p.map((ch, x, y) => {
    if (ch !== SLIME) return ch;
    const t = 1 - (y - (cy - r)) / (2 * r);
    return String(clamp(Math.floor(1.4 + t * 2.8 + (bayer(x, y) - 0.5) * 0.8), 1, 4));
  });
  p.map((ch, x, y, get) => (ch >= '1' && ch <= '4' && get(x, y - 1) === '.' ? '5' : ch));
  // Glanzlicht
  const gx = Math.round(cx - r * 0.45);
  const gy = Math.round(cy - r * 0.5);
  if (p.filled(gx, gy)) p.set(gx, gy, 'W');
  if (r > 4 && p.filled(gx + 1, gy)) p.set(gx + 1, gy, '5');
}

/** Bläschen im Schleim verteilen (deterministisch). */
function bubbles(p: Painter, cx: number, cy: number, r: number, count: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const a = hash2(i, seed) * Math.PI * 2;
    const d = hash2(seed, i) * r * 0.7;
    const x = Math.round(cx + Math.cos(a) * d);
    const y = Math.round(cy + Math.sin(a) * d);
    if (p.get(x, y) !== '.' && p.get(x, y) !== 'N' && p.get(x, y) !== 'n') p.set(x, y, 'b');
  }
}

/** Tropfen, 11 × 11, zwei Frames: gestaucht und gestreckt. */
export const DROPLET_FRAMES = [0, 1].map((k) => {
  const p = new Painter(11, 11);
  p.poly([[5.5, k ? 1 : 0], [8.5, 5], [2.5, 5]], SLIME);
  p.ellipse(5, 7, k ? 4.4 : 4, k ? 3.2 : 3.6, SLIME);
  shadeSlime(p, 5, 6, 5);
  p.set(5, 7, 'N');
  p.outline('k');
  return p.rows();
});

/** Spritzer, 7 × 7: was von einem Tropfen übrig bleibt. */
export const SPLASH_ROWS = (() => {
  const p = new Painter(7, 7);
  p.circle(3, 3, 2.6, SLIME);
  shadeSlime(p, 3, 3, 3);
  p.outline('k');
  return p.rows();
})();

/** Schleimer, 19 × 17: Blob mit Zellkern, der Schleimkugeln wirft. */
export const OOZER_FRAMES = [0, 1].map((k) => {
  const p = new Painter(19, 17);
  p.ellipse(9, 8, k ? 9 : 8.5, k ? 6.5 : 7, SLIME);
  p.ellipse(5, 14, 1.5, 2 + k, SLIME);
  p.ellipse(13, 14, 1.4, 1.5 + k * 0.5, SLIME);
  shadeSlime(p, 9, 8, 8);
  p.circle(9, 8, 2.2, 'n');
  p.circle(9, 7.5, 1.2, 'N');
  bubbles(p, 9, 8, 7, 5, 3 + k);
  p.outline('k');
  return p.rows();
});
/** Maul des Schleimers relativ zur Sprite-Mitte, in Pixeln. */
export const OOZER_MOUTH_Y = -5;

/** Amöbe, 27 × 25: Membran mit Pseudopodien, verwundbar nur im Zellkern. */
export const AMOEBA_FRAMES = [0, 1].map((k) => {
  const p = new Painter(27, 25);
  const lobes: [number, number, number][] = [
    [13, 12, 9],
    [6 + k, 8, 5],
    [21 - k, 9, 5],
    [7, 18 - k, 4.5],
    [19 + k, 18, 4.5],
    [13, 3 + k, 3.5],
  ];
  for (const [x, y, r] of lobes) p.circle(x, y, r, '2');
  for (const [x, y, r] of lobes) p.circle(x, y, r - 2, '3');
  p.map((ch, x, y) => (ch === '3' && (x + y) % 5 === 0 ? '4' : ch));
  p.circle(13, 12, 4.5, 'n');
  p.circle(13, 12, 3, 'N');
  p.circle(12, 11, 1, 'W');
  bubbles(p, 13, 12, 9, 7, 11 + k);
  p.map((ch, x, y, get) => (ch === '2' && get(x, y - 1) === '.' ? '4' : ch));
  p.outline('k');
  return p.rows();
});

/** Schleimkugel (5 × 5). */
export const SLIMEBALL_ROWS = ['.4N4.', '4NNN4', 'NNWNN', '4NNN4', '.4N4.'];

// ---------------------------------------------------------------------------
// Endgegner: Urschleim in vier Größen, je zwei Wabbel-Frames
// ---------------------------------------------------------------------------

/** Radius in Pixeln je Größe (Index 0 = kleinste). */
export const BLOB_RADII = [10, 17, 26, 36];

export const BLOB_FRAMES = BLOB_RADII.map((r, size) =>
  [0, 1].map((k) => {
    const d = r * 2 + 3;
    const c = r + 1;
    const p = new Painter(d, d);
    // Unregelmäßiger Rand: viele Kreise entlang des Umfangs
    p.circle(c, c, r * 0.92, SLIME);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + k * 0.3 + size;
      const wob = r * (0.86 + 0.12 * Math.sin(i * 2.3 + k * 1.7 + size));
      p.circle(c + Math.cos(a) * r * 0.25, c + Math.sin(a) * r * 0.25, wob * 0.82, SLIME);
    }
    shadeSlime(p, c, c, r);
    // Zellkerne: einer pro Größe, plus kleinere bei großen Blobs
    p.circle(c + r * 0.15, c + r * 0.05, Math.max(2, r * 0.28), 'n');
    p.circle(c + r * 0.1, c, Math.max(1.2, r * 0.18), 'N');
    if (size >= 2) {
      p.circle(c - r * 0.4, c + r * 0.3, r * 0.12, 'n');
      p.circle(c + r * 0.45, c - r * 0.35, r * 0.1, 'n');
    }
    bubbles(p, c, c, r, 4 + size * 5, 21 + size * 7 + k);
    p.outline('k');
    return p.rows();
  }),
);
