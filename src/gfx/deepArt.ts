import { bayer, Painter } from './painter';
import type { Palette } from './pixel';

/** Sektor 8 „Die kosmische Tiefe“: Tiefseeblau mit leuchtendem Cyan, Pink und Gelb. */
export const DEEP_PALETTE: Palette = {
  k: 0x020a12,
  1: 0x08243a,
  2: 0x0e3e5e,
  3: 0x1a6a8a,
  4: 0x3aa8c0,
  5: 0x9ae8f0,
  p: 0x8a1a6a,
  P: 0xff5ac0,
  y: 0x8a7a10,
  Y: 0xfff06a,
  c: 0x0a6a6a,
  C: 0x5affe0,
  W: 0xffffff,
  v: 0x01060c,
};

const BODY = 'B';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function shade(p: Painter, h: number, y0 = 0): void {
  p.map((ch, x, y) => (ch === BODY ? String(clamp(Math.floor(1.4 + (1 - (y - y0) / h) * 2.6 + (bayer(x, y) - 0.5) * 0.8), 1, 4)) : ch));
  p.map((ch, x, y, get) => (ch >= '1' && ch <= '4' && get(x, y - 1) === '.' ? '5' : ch));
}

// ---------------------------------------------------------------------------
// Gegner (zeigen nach unten)
// ---------------------------------------------------------------------------

/** Sternqualle, 17 × 19: durchscheinende Glocke, wehende Tentakel. Frame 2 = kurz vor der Entladung. */
export const JELLY_FRAMES = [0, 1, 2].map((k) => {
  const p = new Painter(17, 19);
  for (let i = 0; i < 5; i++) {
    const x0 = 3 + i * 2.7;
    for (let y = 8; y < 19; y++) {
      const x = Math.round(x0 + Math.sin(y * 0.7 + i + k * 1.6) * 1.1);
      p.set(x, y, k === 2 ? 'C' : y % 3 === 0 ? 'P' : 'p');
    }
  }
  p.ellipse(8, 6, 8, 6, BODY);
  p.rect(0, 7, 17, 6, '.');
  p.ellipse(8, 6, 8, 6, BODY);
  p.map((ch, _x, y) => (ch === BODY && y > 7 ? '.' : ch));
  shade(p, 8);
  p.map((ch, x, y) => (ch >= '1' && ch <= '4' && (x + y) % 4 === 0 ? (k === 2 ? 'C' : '4') : ch));
  p.line(1, 7, 15, 7, k === 2 ? 'C' : 'P');
  p.circle(8, 4, 1.5, k === 2 ? 'W' : 'C');
  p.outline('k');
  return p.rows();
});

/** Anglerfisch, 23 × 21: großes Maul nach unten, Leuchtköder an der Angel vor dem Maul. */
export const ANGLER_FRAMES = [0, 1].map((k) => {
  const p = new Painter(23, 21);
  p.ellipse(11, 8, 10, 7.5, BODY);
  p.poly([[1, 4], [-1, 0], [5, 3]], BODY);
  p.poly([[21, 4], [23, 0], [17, 3]], BODY);
  shade(p, 16);
  // Maul mit Zähnen
  p.ellipse(11, 13, 7, 3 + k, 'v');
  for (let x = 5; x <= 17; x += 2) {
    p.set(x, 11, 'W');
    p.set(x + 1, 15 + k, 'W');
  }
  p.set(6, 6, 'Y');
  p.set(16, 6, 'Y');
  // Angel und Köder
  p.line(11, 1, 11, 0, '3');
  p.line(11, 0, 14, 2, '3');
  p.line(14, 2, 14, 17, '3');
  p.circle(14, 19, 1.5, k ? 'Y' : 'y');
  p.set(14, 19, 'W');
  p.outline('k');
  return p.rows();
});

/** Sternigel, 15 × 15: stachelige Kugel. */
export const URCHIN_ROWS = (() => {
  const p = new Painter(15, 15);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.line(7, 7, 7 + Math.cos(a) * 7, 7 + Math.sin(a) * 7, i % 2 ? 'P' : 'p');
  }
  p.circle(7, 7, 4, 'p');
  p.circle(6, 6, 2, 'P');
  p.set(6, 5, 'W');
  p.outline('k');
  return p.rows();
})();

/** Leuchtgeschoss (5 × 5) und Stachel (3 × 7). */
export const BIO_BULLET_ROWS = ['.cCc.', 'cCWCc', 'CWWWC', 'cCWCc', '.cCc.'];
export const SPIKE_ROWS = ['.W.', '.P.', 'PPP', '.P.', '.p.', '.p.', '.p.'];

// ---------------------------------------------------------------------------
// Endgegner: Leviathan (Kopf, Segmente, Schwanz – alle zeigen nach unten)
// ---------------------------------------------------------------------------

/** Kopf, 33 × 31: Frame 0 geschlossen, 1 aufgerissen mit leuchtendem Schlund. */
export const LEVI_HEAD_FRAMES = [0, 1].map((open) => {
  const p = new Painter(33, 31);
  p.ellipse(16, 13, 15, 13, BODY);
  p.poly([[4, 18], [16, 31], [28, 18]], BODY);
  shade(p, 31);
  // Panzerplatten
  for (const y of [6, 11]) p.line(4, y, 28, y, '2');
  // Augen
  for (const x of [8, 24]) {
    p.circle(x, 15, 2, 'v');
    p.set(x, 15, open ? 'P' : 'Y');
  }
  // Maul
  if (open) {
    p.poly([[9, 20], [16, 30], [23, 20]], 'v');
    p.poly([[12, 21], [16, 27], [20, 21]], 'C');
    p.set(16, 23, 'W');
    for (let x = 10; x <= 22; x += 3) p.set(x, 20, 'W');
  } else {
    p.line(10, 22, 16, 28, 'k');
    p.line(22, 22, 16, 28, 'k');
  }
  // Leuchtpunkte entlang der Seiten
  for (const [x, y] of [[3, 12], [29, 12], [6, 20], [26, 20]]) p.set(x, y, 'C');
  p.outline('k');
  return p.rows();
});

/** Rumpfsegment, 21 × 21: 0 = gepanzert, 1 = Kieme offen, 2 = Kieme geschlossen, 3 = Narbe. */
export const LEVI_SEGMENT_FRAMES = [0, 1, 2, 3].map((state) => {
  const p = new Painter(21, 21);
  p.circle(10, 10, 9.5, BODY);
  shade(p, 21);
  p.line(2, 7, 18, 7, '2');
  p.line(2, 13, 18, 13, '2');
  p.poly([[8, 0], [10, -3], [12, 0]], '3');
  if (state === 1) {
    p.ellipse(10, 10, 5, 3.5, 'c');
    p.ellipse(10, 10, 3.5, 2.2, 'C');
    p.line(7, 10, 13, 10, 'W');
  } else if (state === 2) {
    p.ellipse(10, 10, 5, 1.5, 'c');
  } else if (state === 3) {
    p.ellipse(10, 10, 5, 3, 'v');
    p.set(8, 9, 'p');
    p.set(12, 11, 'p');
  } else {
    p.set(4, 10, 'C');
    p.set(16, 10, 'C');
  }
  p.outline('k');
  return p.rows();
});

/** Schwanzende, 15 × 19. */
export const LEVI_TAIL_ROWS = (() => {
  const p = new Painter(15, 19);
  p.poly([[1, 0], [14, 0], [7.5, 18.5]], BODY);
  shade(p, 19);
  p.set(7, 14, 'C');
  p.set(7, 10, 'C');
  p.outline('k');
  return p.rows();
})();
