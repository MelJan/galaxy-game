import { bayer, hash2, Painter } from './painter';
import type { Palette } from './pixel';

/** Sektor 9 „Orbitalfriedhof“: weiße Module, Goldfolie, blaue Solarzellen, rote Warnlichter. */
export const ORBIT_PALETTE: Palette = {
  k: 0x0a0c12,
  1: 0x2a2e38,
  2: 0x4e5462,
  3: 0x868c9a,
  4: 0xc4c8d0,
  5: 0xf2f4f8,
  y: 0x8a6418, // Goldfolie
  Y: 0xe8b840,
  b: 0x10285a, // Solarzellen
  B: 0x2a5aa8,
  c: 0x147a9a, // Leuchten
  C: 0x7ae8ff,
  r: 0x8a1a1a,
  R: 0xff4a3a,
  g: 0x2a8a2a, // Alien
  G: 0x8aff5a,
  o: 0x9a4a10,
  O: 0xffa83a,
  W: 0xffffff,
  v: 0x05060a,
};

const BODY = 'S';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Weiß-grau schattieren: oben hell, unten dunkel. */
function shade(p: Painter, h: number, y0 = 0): void {
  p.map((ch, x, y) => (ch === BODY ? String(clamp(Math.floor(1.8 + (1 - (y - y0) / h) * 2.8 + (bayer(x, y) - 0.5) * 0.7), 1, 5)) : ch));
}

/** Solarpaneel mit Zellraster. */
function solar(p: Painter, x: number, y: number, w: number, h: number): void {
  p.rect(x, y, w, h, 'B');
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if ((xx - x) % 3 === 2 || (yy - y) % 3 === 2) p.set(xx, yy, 'b');
  p.line(x, y, x + w - 1, y, 'y');
  p.line(x, y + h - 1, x + w - 1, y + h - 1, 'y');
}

/** Goldfolie mit Knitterlichtern. */
function foil(p: Painter, x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p.set(xx, yy, hash2(xx, yy) > 0.7 ? 'Y' : 'y');
}

// ---------------------------------------------------------------------------
// Gegner
// ---------------------------------------------------------------------------

/** Satellit, 23 × 13: Goldfolien-Körper, zwei Solarflügel, Antenne. Frame 1 = Warnlicht an. */
export const SATELLITE_FRAMES = [0, 1].map((k) => {
  const p = new Painter(23, 13);
  solar(p, 0, 4, 7, 5);
  solar(p, 16, 4, 7, 5);
  p.line(7, 6, 8, 6, '3');
  p.line(14, 6, 15, 6, '3');
  foil(p, 8, 3, 7, 7);
  p.line(11, 10, 11, 12, '3');
  p.set(11, 12, k ? 'R' : 'r');
  p.line(11, 2, 11, 0, '4');
  p.outline('k');
  return p.rows();
});

/** Weltraumschrott, 11 × 11: abgerissenes Paneel mit Kabeln. */
export const JUNK_ROWS = (() => {
  const p = new Painter(11, 11);
  p.poly([[1, 2], [8, 0], [10, 6], [4, 10], [0, 7]], BODY);
  shade(p, 11);
  p.line(2, 4, 7, 2, 'B');
  p.line(3, 6, 8, 4, 'B');
  p.line(4, 9, 6, 10, 'R');
  p.outline('k');
  return p.rows();
})();

/** Funkbake, 13 × 13: Kugel mit vier Antennen. Frame 1 = Signal. */
export const BEACON_FRAMES = [0, 1].map((k) => {
  const p = new Painter(13, 13);
  for (const [x1, y1] of [[0, 12], [12, 12], [3, 12], [9, 12]]) p.line(6, 6, x1, y1, '3');
  p.circle(6, 5, 4, BODY);
  shade(p, 10);
  p.set(5, 3, 'W');
  p.circle(6, 5, 1.2, k ? 'C' : 'c');
  p.outline('k');
  return p.rows();
});

// ---------------------------------------------------------------------------
// Endgegner: Sternencabrio (von oben, Front oben)
// ---------------------------------------------------------------------------

export const CABRIO_W = 25;
export const CABRIO_H = 43;
/** Akkupaket am Heck (Schwachpunkt) relativ zur Mitte, in Pixeln (y nach unten positiv). */
export const CABRIO_BATTERY_Y = 17;

/** Rotes Cabrio mit grünem Alien am Steuer. Frame 1 = Akku glüht hell. */
export const CABRIO_FRAMES = [0, 1].map((k) => {
  const p = new Painter(CABRIO_W, CABRIO_H);
  // Räder
  for (const [x, y] of [[0, 7], [21, 7], [0, 31], [21, 31]]) p.rect(x, y, 4, 7, 'v');
  // Karosserie: lange Haube, flache Heckpartie
  p.poly([[12.5, 0], [21, 4], [22, 16], [22, 38], [19, 43], [6, 43], [3, 38], [3, 16], [4, 4]], 'R');
  p.map((ch, x, y) => (ch === 'R' ? ((x < 7 || x > 18) && bayer(x, y) > 0.5 ? 'r' : y < 3 || x === 4 || x === 21 ? 'r' : 'R') : ch));
  // Glanzlinie auf der Haube
  p.line(9, 3, 9, 13, 'W');
  // Scheinwerfer
  p.set(6, 3, 'Y');
  p.set(19, 3, 'Y');
  // Windschutzscheibe
  p.poly([[5, 15], [20, 15], [19, 18], [6, 18]], 'C');
  // Innenraum mit zwei Sitzen
  p.rect(6, 18, 13, 12, 'v');
  p.rect(7, 22, 5, 7, '2');
  p.rect(14, 22, 5, 7, '2');
  // Alien am Steuer (links): grüner Kopf mit großen Augen, Lenkrad
  p.circle(9, 22, 2.6, 'G');
  p.set(8, 21, 'v');
  p.set(10, 21, 'v');
  p.set(8, 20, 'g');
  p.set(10, 20, 'g');
  p.line(7, 19, 11, 19, '3');
  // Heckdeck mit Akkupaket (leuchtet)
  p.rect(7, 33, 11, 7, 'r');
  p.rect(8, 34, 9, 5, k ? 'C' : 'c');
  p.line(9, 36, 15, 36, k ? 'W' : 'C');
  // Rücklichter
  p.rect(5, 41, 3, 1, 'R');
  p.rect(17, 41, 3, 1, 'R');
  p.outline('k');
  return p.rows();
});

// ---------------------------------------------------------------------------
// Endgegner: Kosmograd (drehende Modulstation)
// ---------------------------------------------------------------------------

/** Kern mit Andockknoten, 31 × 31. Frame 1 = Luke offen (verwundbar). */
export const KOSMO_CORE_FRAMES = [0, 1].map((open) => {
  const p = new Painter(31, 31);
  p.circle(15, 15, 11, BODY);
  shade(p, 31);
  // Andockstutzen in vier Richtungen
  for (const [x, y, w, h] of [[13, 0, 5, 6], [13, 25, 5, 6], [0, 13, 6, 5], [25, 13, 6, 5]]) p.rect(x, y, w, h, '3');
  // Ringe auf dem Kern
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    p.set(Math.round(15 + Math.cos(t) * 8), Math.round(15 + Math.sin(t) * 8), '2');
  }
  foil(p, 11, 11, 9, 9);
  if (open) {
    p.circle(15, 15, 4, 'v');
    p.circle(15, 15, 2.5, 'O');
    p.set(15, 15, 'W');
  } else {
    p.circle(15, 15, 3, '3');
    p.line(12, 15, 18, 15, '1');
  }
  p.outline('k');
  return p.rows();
});

/** Modul, 17 × 33 (zeigt nach oben, Spitze = Geschütz). Frame 0 heil, 1 Mündungsblitz. */
export const KOSMO_MODULE_FRAMES = [0, 1].map((k) => {
  const p = new Painter(17, 33);
  p.rect(5, 2, 7, 31, BODY);
  shade(p, 33);
  // Solarflügel in der Mitte
  solar(p, 0, 13, 5, 11);
  solar(p, 12, 13, 5, 11);
  // Ringnähte und Bullaugen
  for (const y of [8, 26]) p.line(5, y, 11, y, '2');
  p.set(8, 18, 'C');
  p.set(8, 21, 'C');
  // Geschütz an der Spitze
  p.rect(7, 0, 3, 3, '2');
  p.set(8, 0, k ? 'O' : 'R');
  p.outline('k');
  return p.rows();
});

/** Abgerissenes, verkohltes Modul. */
export const KOSMO_WRECK_ROWS = (() => {
  const rows = KOSMO_MODULE_FRAMES[0].map((r) => r.replace(/[345]/g, '2').replace(/B/g, 'b').replace(/[Ry]/g, '1'));
  return rows.map((r, y) => [...r].map((ch, x) => (ch !== '.' && ch !== 'k' && hash2(x, y) > 0.8 ? 'v' : ch)).join(''));
})();

// ---------------------------------------------------------------------------
// Endgegner: Station Unitas (Gittermast, Solarsegel, Module, Roboterarm)
// ---------------------------------------------------------------------------

export const TRUSS_W = 201;
export const TRUSS_H = 15;

/** Langer Gittermast quer über den Bildschirm. */
export function paintTruss(): string[] {
  const p = new Painter(TRUSS_W, TRUSS_H);
  p.rect(0, 4, TRUSS_W, 7, '3');
  // Fachwerk
  for (let x = 0; x < TRUSS_W; x++) {
    p.set(x, 4, '4');
    p.set(x, 10, '2');
    const d = x % 8;
    if (d === 0) p.line(x, 4, x, 10, '4');
    p.set(x, 4 + Math.min(6, d < 4 ? d * 2 : (8 - d) * 2), '1');
  }
  // Gelenkboxen für die Segel
  for (const x of [22, 58, 142, 178]) p.rect(x - 3, 2, 7, 11, '4');
  p.outline('k');
  return p.rows();
}

/** Solarsegel, 25 × 55 (wird für die Drehung waagerecht gestaucht). */
export const SAIL_ROWS = (() => {
  const p = new Painter(25, 55);
  solar(p, 0, 0, 25, 55);
  p.line(12, 0, 12, 54, 'y');
  return p.rows();
})();

/** Druckmodul, 19 × 27: weißer Zylinder mit Goldfolie. Frame 1 = getroffen/offen. */
export const UNITAS_MODULE_FRAMES = [0, 1].map((k) => {
  const p = new Painter(19, 27);
  p.rect(2, 0, 15, 27, BODY);
  shade(p, 27);
  foil(p, 2, 10, 15, 6);
  for (const y of [4, 21]) p.line(2, y, 16, y, '2');
  p.set(9, 7, k ? 'O' : 'C');
  p.set(9, 19, k ? 'O' : 'C');
  p.outline('k');
  return p.rows();
});

/** Glied des Roboterarms, 7 × 27, und Greifer, 11 × 11. */
export const ARM_SEGMENT_ROWS = (() => {
  const p = new Painter(7, 27);
  p.rect(1, 0, 5, 27, BODY);
  shade(p, 27);
  p.circle(3, 2, 2.5, '2');
  p.circle(3, 24, 2.5, '2');
  p.outline('k');
  return p.rows();
})();

export const ARM_CLAW_ROWS = (() => {
  const p = new Painter(11, 11);
  p.rect(3, 0, 5, 5, '3');
  p.line(3, 5, 0, 10, '4');
  p.line(7, 5, 10, 10, '4');
  p.set(5, 3, 'R');
  p.outline('k');
  return p.rows();
})();
