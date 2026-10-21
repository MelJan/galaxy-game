import { bayer, Painter } from './painter';
import { flipHorizontal, mirrorHalf, type Palette } from './pixel';

/** Farben des Mutterschiffs, seiner Kanonen, Tore, Drohnen und des Fusionskerns. */
export const BOSS_PALETTE: Palette = {
  k: 0x0b0a14, // Kontur
  1: 0x1c1830, // Rumpf, dunkel bis hell
  2: 0x2e2a4a,
  3: 0x4a4470,
  4: 0x726a9c,
  5: 0xb0a8d8,
  v: 0x120e1c, // Lüftung, Vertiefungen
  Y: 0xffe27a, // Fensterlicht
  y: 0xd89a2a,
  c: 0x1a8ab0, // Triebwerke, Brücke
  C: 0x8af4ff,
  R: 0xe03c5a, // Akzente
  r: 0x7a1838,
  M: 0x9a9ab0, // Kanonenrohre
  m: 0x4a4a5e,
  e: 0x3fcf4a, // Drohnenauge
  E: 0xd8ffb0,
  h: 0xf0c020, // Warnstreifen
  a: 0x0a3a6a, // Fusionskern, außen bis innen
  b: 0x1a7ad0,
  B: 0x5ac8ff,
  w: 0xe8fbff,
  W: 0xffffff,
};

export const BOSS_W = 177;
export const BOSS_H = 72;

const HULL = 'H';
const isHull = (ch: string) => ch >= '1' && ch <= '5';
const darker: Record<string, string> = { 5: '4', 4: '3', 3: '2', 2: '1', 1: '1' };

/**
 * Positionen der Anbauteile im Rumpf-Raster: Mittelpunkt (x, y) in Pixelkoordinaten.
 * Die Kanonen hängen unter den Flügelpylonen und am Kiel, der Kern sitzt in der Rumpfmitte.
 */
export const BOSS_MOUNTS = {
  cannonLeft: { x: 14.5, y: 47.5 },
  cannonCenter: { x: 88.5, y: 62.5 },
  cannonRight: { x: 162.5, y: 47.5 },
  core: { x: 88.5, y: 30.5 },
  doorLeft: { x: 82, y: 30 },
  doorRight: { x: 95, y: 30 },
};

/** Schacht unter dem Kern, der sich in der Kernphase öffnet: x-Bereich und Startzeile im Rumpf-Raster. */
export const SHAFT = { x0: 80, x1: 96, y0: 36 };

/**
 * Rumpf des Mutterschiffs, 177 × 72, symmetrisch. Schaut nach unten Richtung Spieler.
 * Mit shaft = true ist der Kiel unter dem Kern aufgesprengt, damit Schüsse den Kern erreichen.
 */
export function paintBossHull(shaft = false): string[] {
  const p = new Painter(BOSS_W, BOSS_H);

  // Grundformen, nur linke Hälfte (x ≤ 88), danach gespiegelt
  p.poly([[22, 12], [89, 6], [89, 51], [62, 55], [34, 51], [14, 37]], HULL); // Hauptrumpf
  p.poly([[0, 24], [22, 15], [31, 43], [2, 45]], HULL); // Flügelpylon
  p.poly([[70, 47], [89, 45], [89, 64], [78, 62]], HULL); // Kiel
  p.rect(76, 0, 13, 8, HULL); // Brücke
  p.rect(28, 5, 12, 9, HULL); // Triebwerksgondel
  p.mirrorX();

  // Verlauf von oben (hell) nach unten (dunkel), Übergänge gedithert
  p.map((ch, x, y) => {
    if (ch !== HULL) return ch;
    const t = 1 - y / BOSS_H;
    return String(Math.max(1, Math.min(4, Math.floor(1.6 + t * 2.8 + (bayer(x, y) - 0.5) * 0.9))));
  });

  // Kantenlicht oben, Schattenkante unten
  p.map((ch, x, y, get) => {
    if (!isHull(ch)) return ch;
    if (get(x, y - 1) === '.') return '5';
    if (get(x, y + 1) === '.') return '1';
    return ch;
  });

  // Panzerplatten: waagerechte und senkrechte Fugen
  p.map((ch, x, y, get) => {
    if (!isHull(ch) || get(x, y - 1) === '.' || get(x, y + 1) === '.') return ch;
    const seamX = [44, 62, 114, 132].includes(x) && y > 14 && y < 49;
    return [20, 31, 41].includes(y) || seamX ? darker[ch] : ch;
  });

  // Fensterband mit Lichtern
  p.rect(42, 24, 93, 3, 'v');
  for (let x = 44; x <= 132; x += 4) {
    p.set(x, 25, 'Y');
    p.set(x + 1, 25, 'y');
  }

  // Lüftungsgitter
  for (const x0 of [46, 177 - 46 - 12]) {
    p.rect(x0, 40, 12, 6, 'v');
    for (let x = x0 + 1; x < x0 + 12; x += 2) p.line(x, 41, x, 44, 'k');
  }

  // Triebwerksdüsen oben (Heck)
  for (const x0 of [30, 177 - 30 - 8]) {
    p.rect(x0, 2, 8, 3, 'c');
    p.rect(x0 + 1, 2, 6, 1, 'C');
  }

  // Rote Streifen entlang der Pylone
  for (const s of [1, -1]) {
    const fx = (x: number) => (s === 1 ? x : 176 - x);
    p.line(fx(3), 42, fx(24), 18, 'R');
    p.line(fx(5), 42, fx(26), 18, 'r');
  }

  // Brückenfenster
  p.rect(80, 3, 17, 2, 'c');
  p.rect(82, 3, 13, 1, 'C');

  // Kanonensockel
  p.circle(14, 46, 6, '2');
  p.circle(162, 46, 6, '2');
  p.circle(88, 60, 6, '2');

  // Vertiefung für den Fusionskern (wird von den Toren verdeckt)
  p.circle(88, 30, 13, 'k');
  p.circle(88, 30, 12, 'v');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.set(Math.round(88 + Math.cos(a) * 12.5), Math.round(30 + Math.sin(a) * 12.5), 'y');
  }

  p.outline('k');

  if (shaft) {
    // Schacht ausschneiden, an den Wänden pulsierende Energieleitungen
    for (let y = SHAFT.y0; y < BOSS_H; y++) {
      const hull = p.filled(SHAFT.x0 - 1, y) || p.filled(SHAFT.x1 + 1, y);
      for (let x = SHAFT.x0; x <= SHAFT.x1; x++) p.set(x, y, '.');
      if (!hull) continue;
      const light = y % 3 === 0 ? 'C' : 'c';
      p.set(SHAFT.x0 - 1, y, light);
      p.set(SHAFT.x1 + 1, y, light);
      p.set(SHAFT.x0 - 2, y, 'k');
      p.set(SHAFT.x1 + 2, y, 'k');
    }
  }
  return p.rows();
}

/** Bordkanone, 17 × 15. Rohr zeigt nach unten. */
export const CANNON_ROWS = mirrorHalf([
  '...kkkkkk',
  '..k455555',
  '.k3444444',
  'k23kkkkkk',
  'k2kRrRrRY',
  'k23kkkkkk',
  'k12333333',
  '.k1222222',
  '..kk11111',
  '....kkmmm',
  '......kmM',
  '......kmM',
  '......kmM',
  '......kyY',
  '.......kk',
]);
/** Mündung relativ zur Sprite-Mitte, in Pixeln. */
export const CANNON_MUZZLE_Y = -6;

/** Zerstörte Kanone: abgedunkelt, Rohr abgerissen, Risse. */
export const CANNON_WRECK_ROWS = (() => {
  const dark: Record<string, string> = { 5: '3', 4: '2', 3: '1', 2: '1', R: 'r', Y: 'k', y: 'k', M: 'm' };
  const rows = CANNON_ROWS.map((row, y) => (y >= 10 ? '.'.repeat(row.length) : [...row].map((c) => dark[c] ?? c).join('')));
  const set = (x: number, y: number, ch: string) => (rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1));
  set(7, 10, 'k');
  set(9, 10, 'm');
  set(10, 11, 'k');
  set(5, 2, 'k');
  set(6, 3, 'k');
  set(11, 6, 'k');
  set(12, 7, 'k');
  return rows;
})();

/** Linkes Panzertor über dem Kern, 14 × 26, mit Warnstreifen an der Innenkante. */
export const DOOR_LEFT_ROWS = (() => {
  const p = new Painter(14, 26);
  p.rect(0, 0, 14, 26, '3');
  p.map((_ch, x, y) => {
    if (x >= 10) return (x + y) % 4 < 2 ? 'h' : 'k';
    const t = 1 - y / 26;
    return String(Math.floor(2 + t * 2 + (bayer(x, y) - 0.5) * 0.8));
  });
  p.map((ch, x, y) => (y === 0 ? '5' : y === 25 ? '1' : x === 0 ? '4' : ch));
  for (const [x, y] of [[2, 2], [2, 23], [7, 2], [7, 23]]) p.set(x, y, 'k');
  p.rect(2, 11, 6, 4, 'v');
  p.line(3, 12, 6, 12, 'R');
  return p.rows();
})();
export const DOOR_RIGHT_ROWS = flipHorizontal(DOOR_LEFT_ROWS);

/** Fusionskern, 21 × 21, drei Frames zum Pulsieren. */
export const CORE_FRAMES = [0, 1, 2].map((k) => {
  const p = new Painter(21, 21);
  p.circle(10, 10, 10, 'a');
  p.circle(10, 10, 8 + (k === 2 ? 1 : 0), 'b');
  p.circle(10, 10, 6 + k * 0.5, 'B');
  p.circle(10, 10, 3.5 + k, 'w');
  p.circle(10, 10, 1.5 + k * 0.5, 'W');
  // Energieblitze am Rand
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + k * 0.5;
    p.line(10 + Math.cos(a) * 5, 10 + Math.sin(a) * 5, 10 + Math.cos(a) * 9, 10 + Math.sin(a) * 9, 'B');
  }
  return p.rows();
});

/** Begleitdrohne, 15 × 15, vier Frames: die Stacheln drehen sich. */
export const ESCORT_FRAMES = [0, 1, 2, 3].map((k) => {
  const p = new Painter(15, 15);
  const a0 = (k / 4) * (Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 2;
    p.line(7, 7, 7 + Math.cos(a) * 7, 7 + Math.sin(a) * 7, 'r');
    p.set(Math.round(7 + Math.cos(a) * 7), Math.round(7 + Math.sin(a) * 7), 'R');
  }
  p.circle(7, 7, 4.5, '3');
  p.map((ch, _x, y) => (ch === '3' ? (y < 5 ? '4' : y > 9 ? '2' : '3') : ch));
  p.circle(7, 7, 2, 'e');
  p.set(6, 6, 'E');
  p.set(7, 6, 'E');
  p.outline('k');
  return p.rows();
});

/** Boss-Projektil (5 × 5), orange, damit es sich von normalen Gegnerschüssen abhebt. */
export const BOSS_BULLET_PALETTE: Palette = { W: 0xffffff, y: 0xffd84a, o: 0xff6a1a };
export const BOSS_BULLET_ROWS = ['.oyo.', 'oyWyo', 'yWWWy', 'oyWyo', '.oyo.'];

// ---------------------------------------------------------------------------
// Power-up-Kapseln (13 × 13, zwei Frames zum Blinken) und Schildblase (41 × 41)
// ---------------------------------------------------------------------------

export type PowerUpKind = 'repair' | 'shield' | 'fan' | 'laser' | 'missile' | 'option';

export const POWERUP_PALETTE: Palette = {
  k: 0x0b0a14,
  W: 0xffffff,
  R: 0xff4a5a, // Reparatur
  r: 0x8a1830,
  C: 0x5af0ff, // Schild
  c: 0x147a9a,
  O: 0xffa83a, // Fächerschuss
  o: 0x9a4a10,
  P: 0xff6af0, // Laser
  p: 0x8a1a7a,
  L: 0xa8ff4a, // Raketen
  l: 0x3a7a14,
  Y: 0xffe24a, // Begleiter
  y: 0x8a6a10,
  M: 0x9a9ab0, // Raketenhülle
  G: 0xfff4c0, // Leuchtrand
};

const POWERUP_COLORS: Record<PowerUpKind, [string, string]> = {
  repair: ['R', 'r'],
  shield: ['C', 'c'],
  fan: ['O', 'o'],
  laser: ['P', 'p'],
  missile: ['L', 'l'],
  option: ['Y', 'y'],
};
const POWERUP_ICONS: Record<PowerUpKind, string[]> = {
  repair: ['..W..', '..W..', 'WWWWW', '..W..', '..W..'],
  shield: ['WWWWW', 'W.W.W', 'W.W.W', '.W.W.', '..W..'],
  fan: ['W.W.W', 'W.W.W', '.WWW.', '..W..', '..W..'],
  laser: ['.W.W.', '.W.W.', '.W.W.', 'WWWWW', '.WWW.'],
  missile: ['..W..', '.WWW.', '.WWW.', 'WW.WW', 'W...W'],
  option: ['WW.WW', 'WW.WW', '.....', '..W..', '.WWW.'],
};

export const POWERUP_FRAMES: Record<PowerUpKind, string[][]> = (() => {
  const out = {} as Record<PowerUpKind, string[][]>;
  for (const kind of Object.keys(POWERUP_COLORS) as PowerUpKind[]) {
    const [light, dark] = POWERUP_COLORS[kind];
    out[kind] = [false, true].map((glow) => {
      const p = new Painter(13, 13);
      p.circle(6, 6, 6, 'k');
      p.circle(6, 6, 5, dark);
      p.circle(5, 5, 3.5, light);
      p.set(3, 3, 'W');
      p.set(4, 3, 'W');
      POWERUP_ICONS[kind].forEach((row, y) => [...row].forEach((ch, x) => ch === 'W' && p.set(4 + x, 4 + y, 'W')));
      // Im Leuchtframe glimmt der Rand
      if (glow) p.map((ch, x, y, get) => (ch === 'k' && (get(x - 1, y) === '.' || get(x + 1, y) === '.' || get(x, y - 1) === '.' || get(x, y + 1) === '.') ? 'G' : ch));
      return p.rows();
    });
  }
  return out;
})();

/** Schildblase um das Spielerschiff, zwei Frames für ein Flimmern. */
export const SHIELD_FRAMES = [0, 1].map((k) => {
  const p = new Painter(41, 41);
  p.circle(20, 20, 20, 'C');
  p.circle(20, 20, 18, '.');
  // Innen ein feines Dither-Raster, das zwischen den Frames wechselt
  p.map((ch, x, y) => {
    const d = Math.hypot(x - 20, y - 20);
    if (ch === 'C') return (x + y + k) % 3 === 0 ? 'c' : 'C';
    if (d < 17.5 && d > 15.5 && (x + y + k) % 4 === 0) return 'c';
    return ch;
  });
  return p.rows();
});

/** Zielsuch-Rakete des Spielers, 3 × 7, zeigt nach oben. */
export const MISSILE_ROWS = ['.W.', 'WWW', 'MWM', 'MLM', 'M.M', '.O.', '.Y.'];

/** Begleiter-Drohne, 9 × 9, zwei Frames: der Lichtpunkt kreist. */
export const OPTION_FRAMES = [0, 1].map((k) => {
  const p = new Painter(9, 9);
  p.circle(4, 4, 4, 'y');
  p.circle(4, 4, 3, 'Y');
  p.circle(4, 4, 1.5, 'W');
  const a = k * Math.PI;
  p.set(Math.round(4 + Math.cos(a) * 3), Math.round(4 + Math.sin(a) * 3), 'G');
  p.outline('k');
  return p.rows();
});
