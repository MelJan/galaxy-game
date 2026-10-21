import { bayer, hash2, Painter } from './painter';
import { flipHorizontal, type Palette } from './pixel';

/** Sektor 2 „Der Schwarm“: Fleisch, Chitin, Säure. */
export const SWARM_PALETTE: Palette = {
  k: 0x0e080a, // Kontur
  1: 0x2a0c18, // Fleisch, dunkel bis hell
  2: 0x4e1628,
  3: 0x7a2438,
  4: 0xb04656,
  5: 0xe88a7a,
  p: 0x1a2410, // Chitin, dunkel bis hell
  q: 0x34481c,
  Q: 0x5e7a2a,
  s: 0x9ab04a,
  a: 0x3aa01a, // Säure
  A: 0x9aff3a,
  B: 0xe8ffb0,
  y: 0xffd23a, // Augen
  W: 0xf0e6c8, // Knochen, Zähne
  v: 0x140608, // Höhlen
  r: 0xb01a2a, // Adern
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fleisch-Pixel nach Höhe und Rauschen schattieren: wirkt fleckig und organisch. */
function shadeFlesh(p: Painter, h: number, marker = 'F'): void {
  p.map((ch, x, y) => {
    if (ch !== marker) return ch;
    const t = 1 - y / h;
    const n = hash2(x >> 1, y >> 1);
    return String(clamp(Math.floor(1.6 + t * 2.4 + (n - 0.5) * 1.1 + (bayer(x, y) - 0.5) * 0.5), 1, 4));
  });
}

const SHELL = ['p', 'q', 'Q', 's'];
function shadeShell(p: Painter, h: number, marker = 'S'): void {
  p.map((ch, x, y) => {
    if (ch !== marker) return ch;
    const t = 1 - y / h;
    const n = hash2(x >> 2, y >> 1);
    return SHELL[clamp(Math.floor(0.8 + t * 2.6 + (n - 0.5) * 0.8 + (bayer(x, y) - 0.5) * 0.6), 0, 3)];
  });
}

/** Lichtkante oben auf Fleisch und Panzer. */
function rimLight(p: Painter): void {
  p.map((ch, x, y, get) => {
    if (get(x, y - 1) !== '.') return ch;
    if (ch >= '1' && ch <= '4') return '5';
    if (SHELL.includes(ch)) return 's';
    return ch;
  });
}

// ---------------------------------------------------------------------------
// Gegner
// ---------------------------------------------------------------------------

/** Schwärmer, 13 × 13, zwei Flügelschlag-Frames. */
export const SWARMLING_FRAMES = [0, 1].map((k) => {
  const p = new Painter(13, 13);
  if (k === 0) {
    p.ellipse(3, 4, 2.6, 1.6, 'S');
    p.ellipse(9, 4, 2.6, 1.6, 'S');
  } else {
    p.ellipse(3, 3, 1.8, 2.7, 'S');
    p.ellipse(9, 3, 1.8, 2.7, 'S');
  }
  p.ellipse(6, 6, 2.6, 4, 'F');
  p.circle(6, 9.5, 2.2, 'F');
  shadeFlesh(p, 13);
  shadeShell(p, 8);
  p.line(4, 11, 3, 12, 'W');
  p.line(8, 11, 9, 12, 'W');
  p.set(5, 10, 'y');
  p.set(7, 10, 'y');
  rimLight(p);
  p.outline('k');
  return p.rows();
});

/** Speier, 19 × 19: Giftsack mit Maul, pulsiert. */
export const SPITTER_FRAMES = [0, 1].map((k) => {
  const p = new Painter(19, 19);
  for (const [x0, x1] of [[4, 1], [6, 3], [12, 15], [14, 17]]) p.line(x0, 11, x1, 17, 'q');
  p.ellipse(9, 8, 7 + k * 0.5, 6 + k * 0.5, 'F');
  shadeFlesh(p, 16);
  p.circle(6, 6, 1.5 + k * 0.3, k ? 'A' : 'a');
  p.circle(12, 5, 1.2, 'A');
  p.circle(10, 9, 1, 'a');
  p.set(6, 5, 'B');
  p.ellipse(9, 14, 3, 2.2, 'v');
  for (const x of [7, 9, 11]) p.set(x, 13, 'W');
  p.set(7, 10, 'y');
  p.set(11, 10, 'y');
  rimLight(p);
  p.outline('k');
  return p.rows();
});
/** Maul relativ zur Sprite-Mitte, in Pixeln. */
export const SPITTER_MOUTH_Y = -5;

/** Brüter, 25 × 23: Brutmutter mit leuchtenden Eiern im Unterleib. */
export const BROOD_FRAMES = [0, 1].map((k) => {
  const p = new Painter(25, 23);
  for (const [x0, y0, x1, y1] of [[5, 12, 0, 20], [8, 14, 4, 22], [16, 14, 20, 22], [19, 12, 24, 20]]) p.line(x0, y0, x1, y1, 'q');
  p.ellipse(12, 9, 11, 8, 'S');
  shadeShell(p, 18);
  p.map((ch, x, y, get) => ((y === 6 || y === 10) && SHELL.includes(ch) && get(x, y - 1) !== '.' ? 'p' : ch));
  p.ellipse(12, 15, 8, 5, 'F');
  shadeFlesh(p, 23);
  for (const [x, y, r] of [[8, 16, 1.8], [12, 18, 2], [16, 16, 1.8]]) {
    p.circle(x, y, r, k ? 'A' : 'a');
    p.set(x, y, 'B');
  }
  p.set(10, 12, 'y');
  p.set(14, 12, 'y');
  rimLight(p);
  p.outline('k');
  return p.rows();
});

/** Säureklumpen (5 × 5). */
export const ACID_ROWS = ['.aAa.', 'aABAa', 'ABBBA', 'aABAa', '.aAa.'];

// ---------------------------------------------------------------------------
// Endgegner: Schwarmkönigin
// ---------------------------------------------------------------------------

export const QUEEN_W = 161;
export const QUEEN_H = 84;

/** Anbaupunkte im Rumpf-Raster (Pixelmitte). */
export const QUEEN_MOUNTS = {
  sacs: [
    { x: 34.5, y: 50.5 },
    { x: 58.5, y: 58.5 },
    { x: 102.5, y: 58.5 },
    { x: 126.5, y: 50.5 },
  ],
  tentacles: [
    { x: 12.5, y: 50.5 },
    { x: 148.5, y: 50.5 },
  ],
  eye: { x: 80.5, y: 58.5 },
  lidLeft: { x: 74, y: 58.5 },
  lidRight: { x: 87, y: 58.5 },
  mouth: { x: 80.5, y: 68 },
};

/** Körper der Königin, 161 × 84: fleckiges Fleisch, Chitin-Kuppeln, Rückenstacheln, Augenhöhle unten. */
export function paintQueenHull(): string[] {
  const p = new Painter(QUEEN_W, QUEEN_H);
  p.ellipse(80, 38, 66, 27, 'F');
  p.ellipse(16, 44, 12, 9, 'F'); // Tentakel-Ansatz
  p.ellipse(80, 22, 44, 17, 'S');
  p.ellipse(42, 28, 22, 13, 'S');
  for (const [x, h] of [[24, 14], [36, 20], [50, 24], [66, 22]]) p.poly([[x - 5, 24], [x, 24 - h], [x + 5, 24]], 'S');
  p.poly([[60, 54], [64, 82], [70, 80], [72, 58]], 'S'); // Mandibel
  p.mirrorX();

  shadeFlesh(p, QUEEN_H);
  shadeShell(p, 48);

  // Adern: kurze Zufallspfade über das Fleisch
  for (let v = 0; v < 14; v++) {
    let x = 20 + hash2(v, 1) * 120;
    let y = 40 + hash2(v, 2) * 18;
    for (let s = 0; s < 22; s++) {
      const ch = p.get(Math.round(x), Math.round(y));
      if (ch >= '1' && ch <= '4') p.set(Math.round(x), Math.round(y), s % 5 === 0 ? 'r' : '1');
      x += hash2(v, s) * 2 - 1;
      y += hash2(s, v) * 2 - 0.9;
    }
  }

  rimLight(p);

  // Augenhöhle am unteren Rand, darunter nichts: so erreichen Schüsse später das Auge
  p.ellipse(80, 58, 13, 10, 'k');
  p.ellipse(80, 58, 12, 9, 'v');
  for (let x = 70; x <= 90; x += 3) p.set(x, 66, 'W');
  for (const m of QUEEN_MOUNTS.sacs) p.circle(Math.floor(m.x), Math.floor(m.y), 6, '2');

  p.outline('k');
  return p.rows();
}

/** Eiersack, 15 × 15: drei Pulsier-Frames und ein geplatzter Frame. */
export const EGG_SAC_FRAMES = [0, 1, 2, 3].map((k) => {
  const p = new Painter(15, 15);
  if (k === 3) {
    p.circle(7, 9, 5, 'q');
    p.circle(7, 9, 3, 'v');
    for (const [x, y] of [[3, 5], [11, 5], [7, 3], [2, 9], [12, 10]]) p.set(x, y, 'q');
  } else {
    p.circle(7, 7, 6 + (k === 1 ? 0.5 : 0), 'a');
    p.circle(6, 6, 3.5 + k * 0.5, 'A');
    p.circle(5, 5, 1.5, 'B');
    p.line(2, 9, 6, 11, 'q');
    p.line(12, 4, 10, 8, 'q');
  }
  p.outline('k');
  return p.rows();
});

/** Tentakelglied (9 × 9) und Stachel an der Spitze (9 × 13). */
export const TENTACLE_SEGMENT_ROWS = (() => {
  const p = new Painter(9, 9);
  p.circle(4, 4, 4, 'F');
  shadeFlesh(p, 9);
  p.line(1, 5, 7, 5, '2');
  p.set(3, 2, '5');
  p.outline('k');
  return p.rows();
})();

export const TENTACLE_TIP_ROWS = (() => {
  const p = new Painter(9, 13);
  p.poly([[4.5, 12.5], [1, 3], [8, 3]], 'W');
  p.circle(4, 3, 3, 'F');
  shadeFlesh(p, 7);
  p.outline('k');
  return p.rows();
})();

/** Auge der Königin: Augapfel (25 × 19) und Iris mit Pupille (11 × 11), die dem Spieler folgt. */
export const EYE_ROWS = (() => {
  const p = new Painter(25, 19);
  p.ellipse(12, 9, 12, 9, 'W');
  for (const [x0, y0, x1, y1] of [[1, 9, 6, 8], [23, 7, 18, 9], [6, 2, 9, 5], [18, 16, 15, 13], [4, 15, 8, 12]]) p.line(x0, y0, x1, y1, 'r');
  p.map((ch, _x, y) => (ch === 'W' && y > 13 ? '5' : ch));
  p.outline('k');
  return p.rows();
})();

export const IRIS_ROWS = (() => {
  const p = new Painter(11, 11);
  p.circle(5, 5, 5, 'a');
  p.circle(5, 5, 3.5, 'A');
  p.circle(5, 5, 2, 'k');
  p.set(3, 3, 'B');
  p.set(4, 3, 'B');
  return p.rows();
})();

/** Chitin-Lider vor dem Auge, 14 × 21, links und rechts. */
export const LID_LEFT_ROWS = (() => {
  const p = new Painter(14, 21);
  p.ellipse(6, 10, 7, 10, 'S');
  p.rect(7, 0, 7, 21, 'S');
  shadeShell(p, 21);
  for (let y = 2; y < 20; y += 4) p.set(13, y, 'W');
  p.outline('k');
  return p.rows();
})();
export const LID_RIGHT_ROWS = flipHorizontal(LID_LEFT_ROWS);
