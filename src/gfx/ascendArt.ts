import { bayer, Painter } from './painter';
import type { Palette } from './pixel';

/** Sektor 3 „Die Aufgestiegenen“: Gold, Ätherkristalle, Energieschilde. */
export const ASCEND_PALETTE: Palette = {
  k: 0x0a0c1a, // Kontur
  1: 0x3a2a10, // Gold, dunkel bis hell
  2: 0x6e5218,
  3: 0xb08a30,
  4: 0xe8c860,
  5: 0xfff2c0,
  b: 0x123070, // Äther-Energie, dunkel bis hell
  B: 0x2a6af0,
  C: 0x8ad8ff,
  W: 0xffffff,
  v: 0x06081a,
  m: 0x5a1a6a, // Runenkristalle: Magenta, Grün, Gold, dazu Rot für Fehler
  M: 0xe06aff,
  n: 0x145a30,
  N: 0x6aff9a,
  y: 0x7a5a10,
  Y: 0xffe070,
  x: 0x6a1010,
  X: 0xff4a4a,
};

const GOLD = 'G';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Gold nach Höhe schattieren, Lichtkante oben. */
function shadeGold(p: Painter, h: number): void {
  p.map((ch, x, y) => {
    if (ch !== GOLD) return ch;
    const t = 1 - y / h;
    return String(clamp(Math.floor(1.7 + t * 2.4 + (bayer(x, y) - 0.5) * 0.8), 1, 4));
  });
  p.map((ch, x, y, get) => (ch >= '1' && ch <= '4' && get(x, y - 1) === '.' ? '5' : ch));
}

// ---------------------------------------------------------------------------
// Gegner
// ---------------------------------------------------------------------------

/** Phasengleiter, 19 × 15: goldene Pfeilform mit Ätherkern, Spitze nach unten. */
export const GLIDER_ROWS = (() => {
  const p = new Painter(19, 15);
  p.poly([[9.5, 15], [0, 2.5], [3, 0], [9.5, 5], [16, 0], [19, 2.5]], GOLD);
  shadeGold(p, 15);
  p.line(2, 2, 7, 7, 'b');
  p.line(16, 2, 11, 7, 'b');
  p.circle(9, 7, 2, 'B');
  p.set(9, 6, 'C');
  p.set(8, 6, 'W');
  p.outline('k');
  return p.rows();
})();

/** Wächter, 23 × 23: Kugelschiff mit vier Finnen. */
export const GUARDIAN_ROWS = (() => {
  const p = new Painter(23, 23);
  p.poly([[9, 4], [11.5, -1], [14, 4]], GOLD);
  p.poly([[9, 19], [11.5, 24], [14, 19]], GOLD);
  p.poly([[4, 9], [-1, 11.5], [4, 14]], GOLD);
  p.poly([[19, 9], [24, 11.5], [19, 14]], GOLD);
  p.circle(11, 11, 8, GOLD);
  shadeGold(p, 23);
  p.circle(11, 11, 5, '2');
  p.circle(11, 11, 3.5, 'B');
  p.circle(11, 11, 2, 'C');
  p.set(10, 10, 'W');
  p.outline('k');
  return p.rows();
})();

/** Energieschild des Wächters, 35 × 35, zwei Flimmer-Frames. */
export const GUARDIAN_SHIELD_FRAMES = [0, 1].map((k) => {
  const p = new Painter(35, 35);
  p.circle(17, 17, 17, 'C');
  p.circle(17, 17, 15, '.');
  p.map((ch, x, y) => {
    const d = Math.hypot(x - 17, y - 17);
    if (ch === 'C') return (x + y + k) % 3 === 0 ? 'B' : 'C';
    // Wabenmuster innen, sehr dünn
    if (d < 14.5 && y % 4 === k * 2 && (x + (y % 8 === 0 ? 0 : 2)) % 4 === 0) return 'b';
    return ch;
  });
  return p.rows();
});

/** Lanzenträger, 15 × 25: lange Goldlanze mit Kristall an der Spitze, aus dem der Strahl kommt. */
export const LANCER_ROWS = (() => {
  const p = new Painter(15, 25);
  p.poly([[3, 9], [0, 15], [3, 15]], GOLD);
  p.poly([[12, 9], [15, 15], [12, 15]], GOLD);
  p.poly([[7.5, 25], [3, 11], [7.5, 0], [12, 11]], GOLD);
  shadeGold(p, 25);
  p.line(7, 3, 7, 15, 'b');
  p.circle(7, 19, 2, 'B');
  p.set(7, 18, 'C');
  p.set(7, 21, 'C');
  p.outline('k');
  return p.rows();
})();
/** Kristallspitze relativ zur Sprite-Mitte, in Pixeln. */
export const LANCER_TIP_Y = -11;

/** Ätherbolzen (3 × 7) und zielsuchende Ätherkugel (7 × 7). */
export const AETHER_BOLT_ROWS = ['.C.', 'CWC', 'CWC', 'BCB', 'BCB', '.B.', '.b.'];
export const AETHER_ORB_ROWS = (() => {
  const p = new Painter(7, 7);
  p.circle(3, 3, 3, 'b');
  p.circle(3, 3, 2, 'B');
  p.circle(3, 3, 1, 'C');
  p.set(3, 3, 'W');
  return p.rows();
})();

// ---------------------------------------------------------------------------
// Endgegner: Kristallarche
// ---------------------------------------------------------------------------

export const ARK_W = 185;
export const ARK_H = 80;

export const ARK_MOUNTS = {
  glyphs: [
    { x: 36.5, y: 40.5 },
    { x: 62.5, y: 31.5 },
    { x: 122.5, y: 31.5 },
    { x: 148.5, y: 40.5 },
  ],
  core: { x: 92.5, y: 51.5 },
  tips: [
    { x: 9.5, y: 52.5 },
    { x: 175.5, y: 52.5 },
  ],
};

/** Ober- und Unterkante des Sichelbogens bei Spalte x. */
const arcOuter = (x: number) => 66 - 64 * Math.sqrt(Math.max(0, 1 - ((x - 92) / 92) ** 2));
const arcInner = (x: number) => 84 - 60 * Math.sqrt(Math.max(0, 1 - ((x - 92) / 96) ** 2));

/** Rumpf der Arche, 185 × 80: goldene Sichel mit nach unten zeigenden Hörnern, Kristalladern, Kernhalterung. */
export function paintArkHull(): string[] {
  const p = new Painter(ARK_W, ARK_H);
  // Sichel: innere Ellipse ist breiter als die äußere, so laufen die Hörner spitz nach unten aus
  p.ellipse(92, 66, 92, 64, GOLD);
  p.ellipse(92, 84, 96, 60, '.');
  p.poly([[76, 20], [92, 40], [108, 20]], GOLD); // Kernhalterung
  p.poly([[84, 6], [92, -4], [100, 6]], GOLD); // Turm
  shadeGold(p, 60);

  // Kristallader entlang der Bogenmitte
  for (let x = 6; x < ARK_W - 6; x++) {
    const mid = Math.round((arcOuter(x) + arcInner(x)) / 2);
    if (!p.filled(x, mid)) continue;
    p.set(x, mid, x % 6 === 0 ? 'C' : 'B');
    if (x % 6 === 0) p.set(x, mid - 1, 'b');
  }
  // Emitter an den Hornspitzen
  for (const t of ARK_MOUNTS.tips) {
    p.circle(Math.floor(t.x), Math.floor(t.y) - 2, 3, 'B');
    p.set(Math.floor(t.x), Math.floor(t.y) - 2, 'C');
  }
  // Turmfenster
  p.rect(90, 2, 5, 2, 'C');
  p.outline('k');
  return p.rows();
}

/** Ätherkern, 23 × 23: facettierter Kristall, pulsiert in drei Frames. */
export const ARK_CORE_FRAMES = [0, 1, 2].map((k) => {
  const p = new Painter(23, 23);
  p.poly([[11.5, 0], [22, 11.5], [11.5, 23], [1, 11.5]], 'b');
  p.poly([[11.5, 3], [19, 11.5], [11.5, 20], [4, 11.5]], 'B');
  p.poly([[11.5, 6 - k], [16 + k, 11.5], [11.5, 17 + k], [7 - k, 11.5]], 'C');
  p.circle(11, 11, 1.5 + k * 0.6, 'W');
  p.line(11, 1, 11, 21, 'C');
  p.outline('k');
  return p.rows();
});

/** Schildkuppel um den Kern, 57 × 45, zwei Flimmer-Frames. */
export const ARK_SHIELD_FRAMES = [0, 1].map((k) => {
  const p = new Painter(57, 45);
  p.ellipse(28, 22, 28, 22, 'C');
  p.ellipse(28, 22, 26, 20, '.');
  p.map((ch, x, y) => {
    if (ch === 'C') return (x + y + k) % 3 === 0 ? 'B' : 'C';
    const inside = ((x - 28) / 25) ** 2 + ((y - 22) / 19) ** 2 < 1;
    if (inside && y % 4 === k * 2 && (x + (y % 8 === 0 ? 0 : 3)) % 6 === 0) return 'b';
    return ch;
  });
  return p.rows();
});

// ---------------------------------------------------------------------------
// Runenkristalle der Kristallarche: vier Farben, vier Symbole, je drei Zustände
// ---------------------------------------------------------------------------

/** [dunkle Farbe, helle Farbe] je Kristall: Cyan, Magenta, Gold, Grün. */
const GLYPH_COLORS: [string, string][] = [
  ['b', 'C'],
  ['m', 'M'],
  ['y', 'Y'],
  ['n', 'N'],
];

/** Rune als Linienzug im 15 × 19-Raster (Mitte bei 7, 8). */
function drawRune(p: Painter, i: number, ch: string): void {
  if (i === 0) {
    for (const [a, b] of [[[7, 4], [10, 8]], [[10, 8], [7, 12]], [[7, 12], [4, 8]], [[4, 8], [7, 4]]] as const) p.line(a[0], a[1], b[0], b[1], ch);
  } else if (i === 1) {
    for (const [a, b] of [[[7, 4], [10, 11]], [[10, 11], [4, 11]], [[4, 11], [7, 4]]] as const) p.line(a[0], a[1], b[0], b[1], ch);
  } else if (i === 2) {
    p.circle(7, 8, 3, ch);
    p.circle(7, 8, 1.9, '.');
  } else {
    p.line(4, 5, 10, 11, ch);
    p.line(10, 5, 4, 11, ch);
  }
}

/** Frames je Kristall: 0 = dunkel, 1 = leuchtend, 2 = Fehler (rot). */
export const GLYPH_FRAMES = GLYPH_COLORS.map(([dark, light], i) =>
  (['dim', 'lit', 'error'] as const).map((state) => {
    const p = new Painter(15, 19);
    const body = state === 'error' ? 'x' : state === 'lit' ? light : dark;
    p.poly([[7.5, 0], [15, 6.5], [7.5, 17], [0, 6.5]], body);
    p.rect(3, 16, 9, 3, GOLD);
    shadeGold(p, 19);
    // Leuchtend: weiße Rune auf hellem Kristall, sonst helle Rune auf dunklem
    drawRune(p, i, state === 'lit' ? 'W' : state === 'error' ? 'X' : light);
    // Im Rune-Kreis wurde ausgeschnitten: wieder mit der Körperfarbe füllen
    p.map((ch, x, y) => (ch === '.' && Math.hypot(x - 7, y - 8) < 2 ? body : ch));
    p.outline('k');
    return p.rows();
  }),
);
