import { bayer, hash2, Painter } from './painter';
import type { Palette } from './pixel';

/** Sektor 5 „Terranische Miliz“: Stahlgrau, Oliv, Warnorange, dazu Felsbraun und eine Edelstahl-Rakete. */
export const TERRAN_PALETTE: Palette = {
  k: 0x0a0c10, // Kontur
  1: 0x23282e, // Stahl, dunkel bis hell
  2: 0x3e4852,
  3: 0x6a7680,
  4: 0xa8b4bc,
  5: 0xe4ecf0,
  g: 0x3a4a22, // Oliv
  G: 0x6a7a3a,
  O: 0xff8a1a, // Warnorange, Gelb
  y: 0xffd040,
  c: 0x1a6a9a, // Cockpit
  C: 0x8ae0ff,
  r: 0xc02a1a,
  F: 0xffd080, // Triebwerksglut
  f: 0xff7a20,
  e: 0x26262e, // Düsen
  E: 0x55555f,
  t: 0x101418, // Hitzeschild-Kacheln
  T: 0x23282e,
  b: 0x3a2a1e, // Fels, dunkel bis hell
  B: 0x5a4430,
  d: 0x7e6448,
  D: 0xa88a66,
  W: 0xffffff,
};

const STEEL = 'S';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Stahl nach x schattieren (zylindrisch: links Licht, rechts Schatten). */
function shadeCylinder(p: Painter, x0: number, x1: number): void {
  p.map((ch, x, y) => {
    if (ch !== STEEL) return ch;
    const t = 1 - (x - x0) / Math.max(1, x1 - x0);
    return String(clamp(Math.floor(1.6 + Math.sin(t * Math.PI * 0.9 + 0.2) * 3.2 + (bayer(x, y) - 0.5) * 0.6), 1, 5));
  });
}

/** Flaches Bauteil nach y schattieren. */
function shadeFlat(p: Painter, h: number): void {
  p.map((ch, x, y) => {
    if (ch !== STEEL) return ch;
    return String(clamp(Math.floor(1.8 + (1 - y / h) * 2.4 + (bayer(x, y) - 0.5) * 0.7), 1, 4));
  });
  p.map((ch, x, y, get) => (ch >= '1' && ch <= '4' && get(x, y - 1) === '.' ? '5' : ch));
}

// ---------------------------------------------------------------------------
// Gegner (zeigen nach unten)
// ---------------------------------------------------------------------------

/** Abfangjäger, 17 × 15: Pfeilflügel, Oliv mit orangem Streifen. */
export const INTERCEPTOR_ROWS = (() => {
  const p = new Painter(17, 15);
  p.poly([[8, 14.5], [0, 3], [2, 0], [8, 6], [14, 0], [16.5, 3]], STEEL);
  shadeFlat(p, 15);
  p.map((ch, x, y) => (ch >= '1' && ch <= '3' && y < 5 && (x < 5 || x > 11) ? 'G' : ch));
  p.line(3, 3, 6, 7, 'O');
  p.line(13, 3, 10, 7, 'O');
  p.rect(7, 7, 3, 3, 'c');
  p.set(8, 8, 'C');
  p.outline('k');
  return p.rows();
})();

/** Raketenfregatte, 21 × 27: langer Rumpf mit Raketenbehältern an den Seiten. */
export const FRIGATE_ROWS = (() => {
  const p = new Painter(21, 27);
  p.rect(6, 1, 9, 24, STEEL);
  p.poly([[6, 24], [10.5, 27], [15, 24]], STEEL);
  p.rect(1, 8, 5, 12, 'g');
  p.rect(15, 8, 5, 12, 'g');
  shadeCylinder(p, 6, 15);
  for (let y = 9; y < 19; y += 3) {
    p.set(3, y, 'O');
    p.set(17, y, 'O');
  }
  p.rect(8, 4, 5, 3, 'c');
  p.set(9, 5, 'C');
  p.line(6, 13, 14, 13, 'O');
  p.outline('k');
  return p.rows();
})();
/** Raketenschächte relativ zur Sprite-Mitte, in Pixeln. */
export const FRIGATE_PODS: [number, number][] = [
  [-7, -6],
  [7, -6],
];

/** Bergbaudrohne, 19 × 19: runder Körper, Greifarme, gelb-schwarzes Warnband. */
export const MINER_FRAMES = [0, 1].map((k) => {
  const p = new Painter(19, 19);
  p.line(5, 12, 2 - k, 18, '3');
  p.line(13, 12, 16 + k, 18, '3');
  p.circle(9, 8, 7, STEEL);
  shadeFlat(p, 16);
  p.map((ch, x, y) => (y === 9 && ch !== '.' ? ((x >> 1) % 2 ? 'y' : 'k') : ch));
  p.circle(9, 5, 2, k ? 'y' : 'O');
  p.outline('k');
  return p.rows();
});

/** Lenkrakete, 5 × 11: Nase unten (Flugrichtung), Feuer oben. */
export const ROCKET_ROWS = ['..F..', '..f..', 'r...r', 'r.3.r', '.343.', '.343.', '.444.', '.454.', '.454.', '.r5r.', '..W..'];

/** Felsbrocken: klein (13 × 13) und groß (21 × 21). */
function paintRock(size: number, seed: number): string[] {
  const p = new Painter(size, size);
  const c = (size - 1) / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = c * (0.72 + hash2(i, seed) * 0.28);
    pts.push([c + 0.5 + Math.cos(a) * r, c + 0.5 + Math.sin(a) * r]);
  }
  p.poly(pts, 'R');
  const shades = ['b', 'B', 'd', 'D'];
  p.map((ch, x, y) => {
    if (ch !== 'R') return ch;
    const l = ((c - x) + (c - y)) / (size * 0.7);
    return shades[clamp(Math.floor(1.5 + l * 2 + (bayer(x, y) - 0.5) * 0.8), 0, 3)];
  });
  for (let i = 0; i < size / 4; i++) {
    const x = Math.round(c + (hash2(seed, i) - 0.5) * c);
    const y = Math.round(c + (hash2(i + 9, seed) - 0.5) * c);
    if (p.filled(x, y)) p.set(x, y, 'b');
  }
  p.outline('k');
  return p.rows();
}
export const ROCK_SMALL_ROWS = paintRock(13, 3);
export const ROCK_BIG_ROWS = paintRock(21, 7);

/** Leuchtspur-Geschoss (3 × 7). */
export const TRACER_ROWS = ['.W.', 'yWy', '.y.', '.O.', '.O.', '.f.', '...'];

// ---------------------------------------------------------------------------
// Zwischenboss: Stahlrakete (Oberstufe + Booster, senkrecht, Triebwerke zeigen nach unten)
// ---------------------------------------------------------------------------

export const ROCKET_W = 33;
export const ROCKET_H = 118;
/** Zeile, an der Schiff und Booster getrennt werden. */
export const STAGE_ROW = 52;

/** Triebwerke des Boosters (x-Mitte) und ihre Zeile; die drei des Schiffs. */
export const BOOSTER_ENGINES = [8.5, 12.5, 16.5, 20.5, 24.5];
export const BOOSTER_ENGINE_Y = 113.5;
export const SHIP_ENGINES = [12.5, 16.5, 20.5];
export const SHIP_ENGINE_Y = 48.5;

/** Triebwerksglocke: oben schmal, unten breit, rechte Kante dunkel. */
function bell(p: Painter, cx: number, top: number, h: number): void {
  const x = Math.floor(cx);
  for (let y = 0; y < h; y++) {
    const half = y < 2 ? 1 : 1.5;
    for (let dx = -Math.floor(half); dx <= Math.ceil(half) - 1 + (y >= 2 ? 1 : 0); dx++) p.set(x + dx, top + y, dx > 0 ? 'e' : 'E');
  }
}

function paintShip(p: Painter): void {
  // Nase und Rumpf
  p.ellipse(16, 12, 10, 12, STEEL);
  p.rect(6, 12, 21, 32, STEEL);
  // Vordere und hintere Klappen
  p.poly([[6, 10], [2, 13], [2, 18], [6, 18]], STEEL);
  p.poly([[26, 10], [30, 13], [30, 18], [26, 18]], STEEL);
  p.poly([[6, 32], [0, 36], [0, 44], [6, 44]], STEEL);
  p.poly([[26, 32], [32, 36], [32, 44], [26, 44]], STEEL);
  shadeCylinder(p, 6, 26);
  // Hitzeschild: schwarze Kacheln auf der linken Seite
  p.map((ch, x, y) => (ch >= '1' && ch <= '5' && x >= 6 && x <= 11 && y > 4 && y < 44 ? ((x + y) % 3 === 0 ? 'T' : 't') : ch));
  // Fensterreihe
  for (let y = 16; y < 24; y += 3) p.set(18, y, 'C');
  // Triebwerke der Oberstufe
  p.rect(9, 44, 15, 2, 'e');
  for (const x of SHIP_ENGINES) bell(p, x, 46, 5);
}

function paintBooster(p: Painter, top: number): void {
  p.rect(6, top, 21, 60, STEEL);
  shadeCylinder(p, 6, 26);
  // Ringförmige Schweißnähte
  p.map((ch, _x, y) => (ch >= '1' && ch <= '5' && y > top && (y - top) % 9 === 0 ? String(Math.max(1, Number(ch) - 1)) : ch));
  // Gitterflossen
  for (const x0 of [1, 27]) {
    p.rect(x0, top + 4, 5, 6, '2');
    for (let y = top + 5; y < top + 10; y += 2) p.line(x0, y, x0 + 4, y, 'k');
  }
  // Belüftungsring für die heiße Stufentrennung
  p.rect(6, top, 21, 3, 'e');
  for (let x = 7; x < 26; x += 2) p.set(x, top + 1, 'k');
  // Triebwerksglocken
  p.rect(7, top + 58, 19, 3, 'e');
  for (const x of BOOSTER_ENGINES) bell(p, x, top + 61, 5);
}

/** Rumpf: Variante 0 mit Booster, Variante 1 nur das Schiff (nach der Stufentrennung). */
export function paintRocket(withBooster: boolean): string[] {
  const p = new Painter(ROCKET_W, ROCKET_H);
  paintShip(p);
  if (withBooster) paintBooster(p, STAGE_ROW);
  p.outline('k');
  return p.rows();
}

/** Abgetrennter Booster als eigenes Sprite (fällt nach der Stufentrennung). */
export const BOOSTER_ROWS = (() => {
  const p = new Painter(ROCKET_W, 66);
  paintBooster(p, 0);
  p.outline('k');
  return p.rows();
})();

/** Glühende Düse (7 × 6), Frame 0 heiß, Frame 1 zerstört. */
export const NOZZLE_FRAMES = [
  ['..f..', '.fFf.', 'fFWFf', 'fFFFf', '.fFf.', '..f..'],
  ['..k..', '.kek.', 'ke.ek', 'k...k', '.k.k.', '.....'],
];

// ---------------------------------------------------------------------------
// Endgegner: Asteroidenfestung
// ---------------------------------------------------------------------------

export const ASTEROID_R = 44;
export const ASTEROID_FRAMES_COUNT = 48;

/** Kraterzentren auf der Kugel (Einheitsvektoren) und Radien, fest für ein stabiles Aussehen. */
const CRATERS = Array.from({ length: 16 }, (_, i) => {
  const z = hash2(i, 1) * 2 - 1;
  const a = hash2(i, 2) * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return { x: s * Math.cos(a), y: z, z: s * Math.sin(a), r: 0.12 + hash2(i, 3) * 0.2 };
});

/** Felskugel, die sich um die senkrechte Achse dreht: ASTEROID_FRAMES_COUNT Frames, vorab gerendert. */
export const ASTEROID_FRAMES = Array.from({ length: ASTEROID_FRAMES_COUNT }, (_, f) => {
  const R = ASTEROID_R;
  const size = R * 2 + 3;
  const c = R + 1;
  const rot = (f / ASTEROID_FRAMES_COUNT) * Math.PI * 2;
  const p = new Painter(size, size);
  const shades = ['b', 'B', 'd', 'D'];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - c) / R;
      const ny = (y - c) / R;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      // Licht von oben links, in vier Stufen mit Dithering
      const light = -nx * 0.6 - ny * 0.55 + nz * 0.55;
      let lvl = clamp(Math.floor((light + 0.3) * 2.6 + (bayer(x, y) - 0.5) * 0.9), 0, 3);
      // Punkt auf der Kugel in Körperkoordinaten
      const px = nx * Math.cos(rot) + nz * Math.sin(rot);
      const pz = -nx * Math.sin(rot) + nz * Math.cos(rot);
      for (const cr of CRATERS) {
        const dot = px * cr.x + -ny * cr.y + pz * cr.z;
        const ang = Math.acos(clamp(dot, -1, 1));
        if (ang < cr.r * 0.75) lvl = Math.max(0, lvl - 1);
        else if (ang < cr.r) lvl = Math.min(3, lvl + 1);
      }
      p.set(x, y, shades[lvl]);
    }
  }
  p.outline('k');
  return p.rows();
});

/** Geschützturm (11 × 11) und Reaktor (15 × 15, zwei Pulsier-Frames). */
export const TURRET_ROWS = (() => {
  const p = new Painter(11, 11);
  p.circle(5, 6, 4.5, STEEL);
  shadeFlat(p, 11);
  p.rect(4, 0, 3, 5, '2');
  p.set(5, 0, 'O');
  p.circle(5, 6, 1.5, 'O');
  p.outline('k');
  return p.rows();
})();

export const REACTOR_FRAMES = [0, 1].map((k) => {
  const p = new Painter(15, 15);
  p.circle(7, 7, 7, 'y');
  p.map((ch, x, y) => (ch === 'y' && ((x + y) >> 1) % 2 ? 'k' : ch));
  p.circle(7, 7, 5, '2');
  p.circle(7, 7, 3.5 + k * 0.5, 'C');
  p.circle(7, 7, 1.5 + k * 0.5, 'W');
  p.outline('k');
  return p.rows();
});
