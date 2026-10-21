import type * as THREE from 'three';
import { bankRight, flipHorizontal, makePixelTexture, mirrorHalf, type Palette } from './pixel';

// ---------------------------------------------------------------------------
// Spielerschiff
// ---------------------------------------------------------------------------

export const SHIP_PALETTE: Palette = {
  k: 0x0b0a1a, // Kontur
  1: 0x263055, // Rumpf, dunkel bis hell
  2: 0x3d5194,
  3: 0x6286cf,
  4: 0x9cc0f2,
  5: 0xe8f4ff,
  c: 0x0a4a66, // Cockpit
  C: 0x22b8e8,
  h: 0xa8f4ff,
  r: 0x7a1838, // Akzentstreifen
  R: 0xe03c5a,
  g: 0x2a2d40, // Kanonen
  G: 0x8a90aa,
  e: 0x14141f, // Düse
  y: 0xffcf5a, // Düsenglühen
};

/** Linke Hälfte, letzte Spalte ist die Mittelachse. 27 × 28 Pixel nach dem Spiegeln. */
const SHIP_LEFT_HALF = [
  '.............k',
  '............k5',
  '............k4',
  '...........k45',
  '...........k34',
  '..........k234',
  '..........k2cC',
  '.........k23hC',
  '.........k23CC',
  '.........k23cC',
  '.........k22cc',
  '.........k2234',
  '.k.......k2234',
  'kGk.....kR2234',
  'kGk....kRr2234',
  'kGk...kRr32234',
  'kgk..kRr332234',
  'kgk.kRr3343234',
  'kgkkRr33443234',
  'kg2r3334443234',
  'kg223344432234',
  'kg122233332234',
  'kgk11122222234',
  'kgk.k1111kgk34',
  '.k...kkkkkGk23',
  '.........kek12',
  '.........kykk1',
  '.........kyk.k',
];

export const SHIP_DARKEN: Record<string, string> = { 5: '4', 4: '3', 3: '2', 2: '1', h: 'C', R: 'r', G: 'g' };
export const BANK_RATIO = 0.75;

export const SHIP_ROWS = mirrorHalf(SHIP_LEFT_HALF);
export const SHIP_WIDTH = SHIP_ROWS[0].length;
export const SHIP_HEIGHT = SHIP_ROWS.length;

export interface ShipFrame {
  texture: THREE.Texture;
  /** x-Versatz der Flügelkanonen und Triebwerke zur Mitte, in Pixeln. Flügelkanonen werden später ein Upgrade. */
  guns: [number, number];
  engines: [number, number];
}

const GUN_OFFSET = 12;
const ENGINE_OFFSET = 3;
/** Kanonenspitze der Flügelkanonen in Pixeln über der Sprite-Mitte. */
export const SHIP_GUN_Y = 2;
/** Hauptwaffe: Doppelschuss dicht an der Nase. x-Versatz und Höhe über der Sprite-Mitte, in Pixeln. */
export const SHIP_NOSE_GUNS = [-3, 3];
export const SHIP_NOSE_Y = 9;

/** Frames: 0 = gerade, 1 = Schräglage links, 2 = Schräglage rechts. */
export function buildShipFrames(): ShipFrame[] {
  const right = bankRight(SHIP_ROWS, BANK_RATIO, SHIP_DARKEN);
  const g = Math.round(GUN_OFFSET * BANK_RATIO);
  const e = Math.round(ENGINE_OFFSET * BANK_RATIO);
  return [
    { texture: makePixelTexture(SHIP_ROWS, SHIP_PALETTE), guns: [-GUN_OFFSET, GUN_OFFSET], engines: [-ENGINE_OFFSET, ENGINE_OFFSET] },
    { texture: makePixelTexture(flipHorizontal(right), SHIP_PALETTE), guns: [-g, GUN_OFFSET], engines: [-e, ENGINE_OFFSET] },
    { texture: makePixelTexture(right, SHIP_PALETTE), guns: [-GUN_OFFSET, g], engines: [-ENGINE_OFFSET, e] },
  ];
}

// ---------------------------------------------------------------------------
// Triebwerksflamme (3 × 7): Frames 0/1 normal, 1/2 beim Beschleunigen
// ---------------------------------------------------------------------------

export const FLAME_PALETTE: Palette = { W: 0xfffbe6, y: 0xffd84a, o: 0xff8a2a, r: 0xd2342a };

export const FLAME_FRAMES = [
  ['yWy', 'yWy', '.y.', '.o.', '.r.', '...', '...'],
  ['yWy', 'yWy', 'oyo', '.o.', '.o.', '.r.', '...'],
  ['yWy', 'yWy', 'yWy', 'oyo', '.o.', '.r.', '.r.'],
];

// ---------------------------------------------------------------------------
// Spielerprojektil (3 × 8)
// ---------------------------------------------------------------------------

export const BULLET_PALETTE: Palette = { W: 0xffffff, h: 0xa8f4ff, c: 0x22b8e8, d: 0x0a6a9a };

export const BULLET_ROWS = ['.W.', 'hWh', 'hWh', 'hWh', 'cWc', '.c.', '.c.', '.d.'];

// ---------------------------------------------------------------------------
// Gegner (zeigen nach unten, Richtung Spieler). Linke Hälfte, letzte Spalte = Mittelachse.
// ---------------------------------------------------------------------------

export const ENEMY_PALETTE: Palette = {
  k: 0x120a14, // Kontur
  1: 0x3a1030, // Panzerung, dunkel bis hell
  2: 0x6a1a4a,
  3: 0xa02a5a,
  4: 0xd8506a,
  5: 0xffa0a0,
  e: 0x3fcf4a, // Sensor/Auge
  E: 0xd8ffb0,
  M: 0x6a6a80, // Metall
  o: 0xff9a3a, // Mündungsglühen
};

/** Drohne, 15 × 12: schwach, kommt in Schwärmen. */
export const DRONE_ROWS = mirrorHalf([
  '...kkkkk',
  '..k23444',
  '.k234555',
  '.k23kkkk',
  'k123keeE',
  'k122kkkk',
  'k1122222',
  'kk111111',
  'k2k.kkkk',
  'k3k.....',
  '.k4k....',
  '..k.....',
]);

/** Jäger, 19 × 14: schießt gezielt. */
export const FIGHTER_ROWS = mirrorHalf([
  'k........k',
  'kk......k3',
  'k4k....k23',
  'k34k..k123',
  'k234kk1235',
  'k12344k235',
  'k11234k2ke',
  'kk1123k2eE',
  '.kk112k2ke',
  '..kk11k23k',
  '....kkk23M',
  '.......kMM',
  '........kM',
  '........ko',
]);

/** Schwerer Kreuzer, 25 × 19: gepanzert, Fächerschüsse aus drei Rohren. */
export const HEAVY_ROWS = mirrorHalf([
  '....kkkkkkkkk',
  '...k222222223',
  '..k2333333334',
  '.k23444444445',
  'k123455555555',
  'k123kkkkkkkkk',
  'k12keEeEeEeEe',
  'k123kkkkkkkkk',
  'k123333333333',
  'kk12222222222',
  'kMMk111111111',
  'kMMk11kkkkkkk',
  'kMMk1k3333333',
  '.kMkk12222222',
  '.kok.k1111111',
  '..k..kkk11111',
  '........kkMMM',
  '..........kMo',
  '...........ko',
]);

// ---------------------------------------------------------------------------
// Gegnerprojektil (5 × 5) und Gold-Münze (7 × 7, 3 Frames für die Drehung)
// ---------------------------------------------------------------------------

export const ENEMY_BULLET_PALETTE: Palette = { W: 0xffffff, y: 0xff9ad0, o: 0xe0307a };
export const ENEMY_BULLET_ROWS = ['.oyo.', 'oyWyo', 'yWWWy', 'oyWyo', '.oyo.'];

export const COIN_PALETTE: Palette = { y: 0x7a4a0a, Y: 0xffd23a, W: 0xfff6c0, o: 0xc08a1a };
export const COIN_FRAMES = [
  ['..yyy..', '.yWWYy.', 'yWYYYoy', 'yWYYYoy', 'yYYYYoy', '.yYooy.', '..yyy..'],
  ['..yyy..', '.yWYoy.', '.yWYoy.', '.yYYoy.', '.yYYoy.', '.yYooy.', '..yyy..'],
  ['...y...', '..yWy..', '..yYy..', '..yYy..', '..yYy..', '..yoy..', '...y...'],
];
