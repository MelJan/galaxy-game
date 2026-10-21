import { bayer, Painter } from './painter';
import type { Palette } from './pixel';

/** Sektor 6 „Kristallwesen“: eisiges Blau, Weiß und violette Herzen. */
export const CRYSTAL_PALETTE: Palette = {
  k: 0x0a0a1e,
  1: 0x1a2a5a,
  2: 0x2a5aa0,
  3: 0x5aa0e0,
  4: 0xa8e0ff,
  5: 0xf0ffff,
  v: 0x5a2aa0,
  V: 0xc0a0ff,
  W: 0xffffff,
};

const ICE = 'I';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Facetten: links heller, rechts dunkler, mit einer hellen Mittelkante. */
function shadeFacets(p: Painter, cx: number): void {
  p.map((ch, x, y) => {
    if (ch !== ICE) return ch;
    const lvl = x < cx ? 3 + (bayer(x, y) > 0.7 ? 1 : 0) : 2 - (bayer(x, y) > 0.8 ? 1 : 0);
    return String(clamp(lvl, 1, 5));
  });
}

/** Splitter, 9 × 13: langer Diamant, zwei Frames mit wanderndem Glanz. */
export const SHARD_FRAMES = [0, 1].map((k) => {
  const p = new Painter(9, 13);
  p.poly([[4.5, 0], [9, 6.5], [4.5, 13], [0, 6.5]], ICE);
  shadeFacets(p, 4.5);
  p.line(4, 1, 4, 11, '5');
  p.set(4, k ? 3 : 8, 'W');
  p.outline('k');
  return p.rows();
});

/** Prisma, 17 × 17: dreieckiger Kristall, wirft Treffer als Splitter zurück. */
export const PRISM_FRAMES = [0, 1].map((k) => {
  const p = new Painter(17, 17);
  p.poly([[8.5, 16.5], [0, 2], [17, 2]], ICE);
  shadeFacets(p, 8.5);
  p.line(8, 3, 8, 14, k ? 'V' : '5');
  p.line(2, 3, 14, 3, '5');
  p.circle(8, 7, 1.5, 'V');
  p.outline('k');
  return p.rows();
});

/** Kristallknospe, 15 × 15: wächst in drei Stufen, kurz vor dem Platzen mit Rissen. */
export const BUD_FRAMES = [0, 1, 2].map((k) => {
  const p = new Painter(15, 15);
  const r = 4.5 + k;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    p.poly([[7 + Math.cos(a) * 2, 7 + Math.sin(a) * 2], [7 + Math.cos(a + 0.35) * r, 7 + Math.sin(a + 0.35) * r], [7 + Math.cos(a - 0.35) * r, 7 + Math.sin(a - 0.35) * r]], ICE);
  }
  p.circle(7, 7, 3, 'v');
  p.circle(7, 7, 1.5 + k * 0.5, 'V');
  shadeFacets(p, 7);
  if (k === 2) for (const [x, y] of [[4, 3], [11, 5], [3, 10], [10, 11]]) p.set(x, y, 'W');
  p.outline('k');
  return p.rows();
});

/** Kristallsplitter-Geschoss (3 × 5). */
export const SHARD_BULLET_ROWS = ['.5.', '545', '434', '.3.', '.2.'];

// ---------------------------------------------------------------------------
// Endgegner: Kristallschwarm (Kern mit rotierenden Splitter-Ringen)
// ---------------------------------------------------------------------------

/** Ring-Splitter, 9 × 9, zwei Frames: heil und nachwachsend (halb transparent wirkend, dunkel). */
export const RING_SHARD_FRAMES = [0, 1].map((k) => {
  const p = new Painter(9, 9);
  p.poly([[4.5, 0], [9, 4.5], [4.5, 9], [0, 4.5]], k ? '1' : ICE);
  if (!k) shadeFacets(p, 4.5);
  p.set(4, 2, k ? '2' : 'W');
  p.outline('k');
  return p.rows();
});

/** Kern, 25 × 25: Geode mit violettem Herzen, drei Pulsier-Frames. */
export const SWARM_CORE_FRAMES = [0, 1, 2].map((k) => {
  const p = new Painter(25, 25);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? 11 : 12.5;
    p.poly([[12 + Math.cos(a - 0.4) * 5, 12 + Math.sin(a - 0.4) * 5], [12 + Math.cos(a) * r, 12 + Math.sin(a) * r], [12 + Math.cos(a + 0.4) * 5, 12 + Math.sin(a + 0.4) * 5]], ICE);
  }
  p.circle(12, 12, 6.5, ICE);
  shadeFacets(p, 12);
  p.circle(12, 12, 5, 'v');
  p.circle(12, 12, 3 + k * 0.7, 'V');
  p.circle(12, 12, 1 + k * 0.5, 'W');
  p.outline('k');
  return p.rows();
});
