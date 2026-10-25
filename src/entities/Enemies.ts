import * as THREE from 'three';
import { FIELD, PIXEL } from '../config';
import { randRange } from '../core/view';
import type { Material } from '../audio/Sound';
import type { Beam, Beams } from '../fx/Beams';
import {
  ASCEND_PALETTE,
  GLIDER_ROWS,
  GUARDIAN_ROWS,
  GUARDIAN_SHIELD_FRAMES,
  LANCER_ROWS,
  LANCER_TIP_Y,
} from '../gfx/ascendArt';
import { makePixelTexture, PixelSprite, type Palette } from '../gfx/pixel';
import { DRONE_ROWS, ENEMY_PALETTE, FIGHTER_ROWS, HEAVY_ROWS } from '../gfx/sprites';
import { BROOD_FRAMES, EGG_SAC_FRAMES, SPITTER_FRAMES, SPITTER_MOUTH_Y, SWARM_PALETTE, SWARMLING_FRAMES } from '../gfx/swarmArt';
import { AMOEBA_FRAMES, DROPLET_FRAMES, OOZER_FRAMES, OOZER_MOUTH_Y, SLIME_PALETTE, SPLASH_ROWS } from '../gfx/slimeArt';
import { FRIGATE_ROWS, INTERCEPTOR_ROWS, MINER_FRAMES, ROCK_BIG_ROWS, ROCK_SMALL_ROWS, ROCKET_ROWS, TERRAN_PALETTE } from '../gfx/terranArt';
import { BUD_FRAMES, CRYSTAL_PALETTE, PRISM_FRAMES, SHARD_FRAMES } from '../gfx/crystalArt';
import { GRAVMINE_FRAMES, STALKER_ROWS, VOID_PALETTE, VOIDEYE_FRAMES, VOIDEYE_PUPIL_Y } from '../gfx/voidArt';
import { ANGLER_FRAMES, DEEP_PALETTE, JELLY_FRAMES, URCHIN_ROWS } from '../gfx/deepArt';
import { BEACON_FRAMES, JUNK_ROWS, ORBIT_PALETTE, SATELLITE_FRAMES } from '../gfx/orbitArt';
import { FLEET_PALETTE, FORK_ROWS, GUNBOAT_ROWS } from '../gfx/fleetArt';

export type EnemyTypeId =
  | 'drone'
  | 'fighter'
  | 'heavy'
  | 'swarmling'
  | 'spitter'
  | 'brood'
  | 'egg'
  | 'glider'
  | 'guardian'
  | 'lancer'
  | 'droplet'
  | 'splash'
  | 'oozer'
  | 'amoeba'
  | 'interceptor'
  | 'frigate'
  | 'rocket'
  | 'miner'
  | 'rockSmall'
  | 'rockBig'
  | 'shard'
  | 'prism'
  | 'bud'
  | 'gravmine'
  | 'voideye'
  | 'stalker'
  | 'jelly'
  | 'angler'
  | 'urchin'
  | 'satellite'
  | 'junk'
  | 'beacon'
  | 'forkfighter'
  | 'gunboat';
export type PatternId = 'line' | 'sine' | 'swoop' | 'hover' | 'chase' | 'warp' | 'bounce' | 'strafe' | 'zigzag' | 'lunge';
/** Aussehen eines Gegnerschusses: bestimmt Sprite und Pool. */
export type ShotStyle = 'normal' | 'boss' | 'acid' | 'aether' | 'orb' | 'slime' | 'tracer' | 'shard' | 'void' | 'bio' | 'spike' | 'bolt';

interface FireConfig {
  /** Sekunden zwischen zwei Salven. */
  interval: number;
  /** lob = Wurf mit Schwerkraft, burst = schneller Feuerstoß aus drei Schüssen. */
  /** pulse = elektrischer Ring mit kurzer Reichweite (blinkt vorher). */
  kind: 'aimed' | 'spread' | 'triple' | 'acid' | 'orb' | 'lob' | 'burst' | 'pulse';
  style: ShotStyle;
  bulletSpeed: number;
  /** Mündungen relativ zur Sprite-Mitte, in Pixeln. */
  muzzles: [number, number][];
}

interface EnemyType {
  frames: string[][];
  palette: Palette;
  /** Animationsgeschwindigkeit in Frames pro Sekunde. */
  fps: number;
  hp: number;
  /** Trefferradius in Welt-Einheiten. */
  radius: number;
  score: number;
  coins: number;
  explosion: 1 | 2 | 3;
  debris: number;
  /** Bestimmt Treffer- und Explosionsgeräusch. */
  material: Material;
  fire: FireConfig | null;
  pool: number;
  /** Chance, eine Power-up-Kapsel fallen zu lassen. */
  drop: number;
  /** Zerplatzt beim Tod in mehrere kleinere Gegner. */
  split?: { type: EnemyTypeId; count: number };
  /** Brütet laufend Gegner aus oder wirft sie (speed/hold für das Verfolgen). */
  spawner?: { type: EnemyTypeId; interval: number; speed?: number; hold?: number };
  /** Nur der Zellkern (dieser Radius) nimmt Schaden, die Membran drumherum schluckt Schüsse. */
  coreRadius?: number;
  /** Wirft jeden Treffer als Splitter auf den Spieler zurück. */
  reflect?: boolean;
  /** Eigendrehung des Sprites in rad/s. */
  spin?: number;
  /** Wendigkeit beim Verfolgen in rad/s (Standard 2.4). */
  turn?: number;
  /** Energieschild: fängt Schaden ab und lädt sich nach einer Pause wieder auf. */
  shield?: { hp: number; regen: number; delay: number };
  /** Lädt einen Laserstrahl auf und feuert ihn senkrecht nach unten; mit turn folgt er dem Spieler. */
  lance?: { interval: number; charge: number; fire: number; width: number; turn?: number; color?: number; tipY?: number };
  /** Zieht das Spielerschiff im Umkreis an (Gravitationsmine). */
  gravity?: { radius: number; strength: number };
  /** Getarnt: nur vor und nach dem Feuern sichtbar, sonst bloß ein Flimmern. */
  cloak?: boolean;
  /** Ring aus Geschossen beim Tod. */
  deathRing?: { count: number; style: ShotStyle; speed: number };
  /** Nach `after` Sekunden: schlüpft als anderer Gegner (type) oder platzt in einen Geschossring (burst). */
  hatch?: { type?: EnemyTypeId; burst?: number; after: number };
  /** Weicht in Abständen ruckartig zur Seite aus (Versatz auf die Bahn des Musters). */
  jink?: { interval: number; distance: number };
}

const one = (rows: string[]) => [rows];

export const ENEMY_TYPES: Record<EnemyTypeId, EnemyType> = {
  // Sektor 1: Imperium
  drone: { frames: one(DRONE_ROWS), palette: ENEMY_PALETTE, fps: 0, hp: 1, radius: 0.85, score: 100, coins: 1, explosion: 1, debris: 0xa02a5a, material: 'metal', fire: null, pool: 48, drop: 0 },
  fighter: {
    frames: one(FIGHTER_ROWS), palette: ENEMY_PALETTE, fps: 0, hp: 4, radius: 1.05, score: 300, coins: 3, explosion: 2, debris: 0xa02a5a, material: 'metal',
    fire: { interval: 1.6, kind: 'aimed', style: 'normal', bulletSpeed: 15, muzzles: [[0, -7]] },
    pool: 16, drop: 0.12,
  },
  heavy: {
    frames: one(HEAVY_ROWS), palette: ENEMY_PALETTE, fps: 0, hp: 22, radius: 1.5, score: 1000, coins: 8, explosion: 3, debris: 0x6a6a80, material: 'metal',
    fire: { interval: 2.2, kind: 'spread', style: 'normal', bulletSpeed: 11, muzzles: [[0, -9], [-10, -5], [10, -5]] },
    pool: 6, drop: 1,
  },

  // Sektor 2: Der Schwarm
  swarmling: { frames: SWARMLING_FRAMES, palette: SWARM_PALETTE, fps: 14, hp: 1, radius: 0.7, score: 60, coins: 1, explosion: 1, debris: 0x9aff3a, material: 'flesh', fire: null, pool: 80, drop: 0 },
  spitter: {
    frames: SPITTER_FRAMES, palette: SWARM_PALETTE, fps: 3, hp: 6, radius: 1.05, score: 350, coins: 3, explosion: 2, debris: 0x9aff3a, material: 'flesh',
    fire: { interval: 2.1, kind: 'acid', style: 'acid', bulletSpeed: 9, muzzles: [[0, SPITTER_MOUTH_Y]] },
    pool: 14, drop: 0.15,
  },
  brood: {
    frames: BROOD_FRAMES, palette: SWARM_PALETTE, fps: 2.5, hp: 18, radius: 1.45, score: 900, coins: 6, explosion: 3, debris: 0x5e7a2a, material: 'flesh',
    fire: null, pool: 8, drop: 1,
    split: { type: 'swarmling', count: 5 },
    spawner: { type: 'swarmling', interval: 2.6 },
  },
  // Ei der Königin: treibt langsam nach unten und schlüpft als Brüter, wenn man es nicht rechtzeitig zerschießt
  egg: {
    frames: EGG_SAC_FRAMES.slice(0, 3), palette: SWARM_PALETTE, fps: 5, hp: 4, radius: 0.9, score: 150, coins: 1, explosion: 1, debris: 0x9aff3a, material: 'flesh',
    fire: null, pool: 10, drop: 0,
    hatch: { type: 'brood', after: 4.5 },
  },

  // Sektor 4: Der Schleim
  droplet: {
    frames: DROPLET_FRAMES, palette: SLIME_PALETTE, fps: 6, hp: 2, radius: 0.65, score: 80, coins: 1, explosion: 1, debris: 0x6ad88a, material: 'slime',
    fire: null, pool: 40, drop: 0,
    split: { type: 'splash', count: 2 },
  },
  splash: { frames: [SPLASH_ROWS], palette: SLIME_PALETTE, fps: 0, hp: 1, radius: 0.45, score: 30, coins: 0, explosion: 1, debris: 0x6ad88a, material: 'slime', fire: null, pool: 60, drop: 0 },
  oozer: {
    frames: OOZER_FRAMES, palette: SLIME_PALETTE, fps: 3, hp: 6, radius: 1.0, score: 350, coins: 3, explosion: 2, debris: 0x6ad88a, material: 'slime',
    fire: { interval: 2.2, kind: 'lob', style: 'slime', bulletSpeed: 0, muzzles: [[0, OOZER_MOUTH_Y]] },
    pool: 12, drop: 0.15,
  },
  amoeba: {
    frames: AMOEBA_FRAMES, palette: SLIME_PALETTE, fps: 2, hp: 14, radius: 1.55, score: 900, coins: 6, explosion: 3, debris: 0xc06aff, material: 'slime',
    fire: { interval: 2.8, kind: 'aimed', style: 'slime', bulletSpeed: 8, muzzles: [[0, 0]] },
    pool: 6, drop: 1,
    coreRadius: 0.6,
  },

  // Sektor 5: Gürtel-Miliz
  interceptor: {
    frames: one(INTERCEPTOR_ROWS), palette: TERRAN_PALETTE, fps: 0, hp: 3, radius: 0.85, score: 250, coins: 2, explosion: 2, debris: 0x6a7a3a, material: 'metal',
    fire: { interval: 1.5, kind: 'burst', style: 'tracer', bulletSpeed: 20, muzzles: [[0, -6]] },
    pool: 16, drop: 0.08,
  },
  frigate: {
    frames: one(FRIGATE_ROWS), palette: TERRAN_PALETTE, fps: 0, hp: 14, radius: 1.4, score: 1000, coins: 7, explosion: 3, debris: 0x6a7680, material: 'metal',
    fire: { interval: 2.4, kind: 'aimed', style: 'tracer', bulletSpeed: 16, muzzles: [[0, -12]] },
    pool: 6, drop: 1,
    spawner: { type: 'rocket', interval: 3.2, speed: 10, hold: 4 },
  },
  rocket: {
    frames: one(ROCKET_ROWS), palette: TERRAN_PALETTE, fps: 0, hp: 1, radius: 0.45, score: 50, coins: 0, explosion: 1, debris: 0xff8a1a, material: 'metal',
    fire: null, pool: 30, drop: 0,
    turn: 1.5,
  },
  miner: {
    frames: MINER_FRAMES, palette: TERRAN_PALETTE, fps: 4, hp: 8, radius: 1.1, score: 500, coins: 5, explosion: 2, debris: 0xffd040, material: 'metal',
    fire: null, pool: 8, drop: 0.3,
    spawner: { type: 'rockSmall', interval: 2.4, speed: 8, hold: 0.5 },
  },
  rockSmall: {
    frames: one(ROCK_SMALL_ROWS), palette: TERRAN_PALETTE, fps: 0, hp: 3, radius: 0.75, score: 40, coins: 1, explosion: 1, debris: 0x7e6448, material: 'metal',
    fire: null, pool: 40, drop: 0,
    spin: 2.2,
  },
  rockBig: {
    frames: one(ROCK_BIG_ROWS), palette: TERRAN_PALETTE, fps: 0, hp: 8, radius: 1.25, score: 120, coins: 2, explosion: 2, debris: 0x7e6448, material: 'metal',
    fire: null, pool: 12, drop: 0.05,
    spin: 0.9,
    split: { type: 'rockSmall', count: 3 },
  },

  // Sektor 6: Kristallwesen
  shard: {
    frames: SHARD_FRAMES, palette: CRYSTAL_PALETTE, fps: 6, hp: 1, radius: 0.6, score: 70, coins: 1, explosion: 1, debris: 0xa8e0ff, material: 'crystal',
    fire: null, pool: 40, drop: 0,
    spin: 6,
  },
  prism: {
    frames: PRISM_FRAMES, palette: CRYSTAL_PALETTE, fps: 2, hp: 7, radius: 1.1, score: 500, coins: 4, explosion: 2, debris: 0xa8e0ff, material: 'crystal',
    fire: { interval: 2.6, kind: 'triple', style: 'shard', bulletSpeed: 14, muzzles: [[0, -7]] },
    pool: 10, drop: 0.2,
    reflect: true,
  },
  bud: {
    frames: BUD_FRAMES, palette: CRYSTAL_PALETTE, fps: 0.67, hp: 6, radius: 0.9, score: 300, coins: 2, explosion: 2, debris: 0xc0a0ff, material: 'crystal',
    fire: null, pool: 10, drop: 0.1,
    hatch: { burst: 14, after: 4.5 },
  },

  // Sektor 7: Der Ereignishorizont
  gravmine: {
    frames: GRAVMINE_FRAMES, palette: VOID_PALETTE, fps: 3, hp: 5, radius: 0.85, score: 300, coins: 2, explosion: 2, debris: 0xff5ab0, material: 'void',
    fire: null, pool: 12, drop: 0.1,
    gravity: { radius: 9, strength: 5 },
    deathRing: { count: 12, style: 'void', speed: 7 },
    spin: 0.8,
  },
  voideye: {
    frames: VOIDEYE_FRAMES, palette: VOID_PALETTE, fps: 1.5, hp: 8, radius: 1.0, score: 650, coins: 4, explosion: 2, debris: 0x7affd8, material: 'void',
    fire: null, pool: 8, drop: 0.35,
    lance: { interval: 4, charge: 1.3, fire: 1.6, width: 0.8, turn: 0.35, color: 0x7affd8, tipY: VOIDEYE_PUPIL_Y },
  },
  stalker: {
    frames: one(STALKER_ROWS), palette: VOID_PALETTE, fps: 0, hp: 4, radius: 0.9, score: 450, coins: 3, explosion: 2, debris: 0xb01a70, material: 'void',
    fire: { interval: 2.6, kind: 'triple', style: 'void', bulletSpeed: 14, muzzles: [[0, -6]] },
    pool: 14, drop: 0.12,
    cloak: true,
  },

  // Sektor 8: Die kosmische Tiefe
  jelly: {
    frames: JELLY_FRAMES.slice(0, 2), palette: DEEP_PALETTE, fps: 2, hp: 5, radius: 0.95, score: 300, coins: 2, explosion: 2, debris: 0x5affe0, material: 'slime',
    fire: { interval: 3, kind: 'pulse', style: 'bio', bulletSpeed: 11, muzzles: [[0, 0]] },
    pool: 14, drop: 0.12,
  },
  angler: {
    frames: ANGLER_FRAMES, palette: DEEP_PALETTE, fps: 2, hp: 7, radius: 1.2, score: 600, coins: 4, explosion: 2, debris: 0x3aa8c0, material: 'flesh',
    fire: null, pool: 8, drop: 0.3,
  },
  urchin: {
    frames: one(URCHIN_ROWS), palette: DEEP_PALETTE, fps: 0, hp: 4, radius: 0.8, score: 200, coins: 2, explosion: 1, debris: 0xff5ac0, material: 'flesh',
    fire: null, pool: 20, drop: 0.05,
    spin: 1.2,
    deathRing: { count: 8, style: 'spike', speed: 10 },
  },

  // Sektor 9: Orbitalfriedhof
  satellite: {
    frames: SATELLITE_FRAMES, palette: ORBIT_PALETTE, fps: 1.5, hp: 6, radius: 1.1, score: 450, coins: 3, explosion: 2, debris: 0xe8b840, material: 'metal',
    fire: null, pool: 10, drop: 0.2,
    lance: { interval: 3.8, charge: 1.1, fire: 0.9, width: 0.6, color: 0xff4a3a, tipY: -6 },
  },
  junk: {
    frames: one(JUNK_ROWS), palette: ORBIT_PALETTE, fps: 0, hp: 2, radius: 0.65, score: 40, coins: 1, explosion: 1, debris: 0xc4c8d0, material: 'metal',
    fire: null, pool: 50, drop: 0,
    spin: 3,
  },
  beacon: {
    frames: BEACON_FRAMES, palette: ORBIT_PALETTE, fps: 2, hp: 7, radius: 0.9, score: 500, coins: 4, explosion: 2, debris: 0x7ae8ff, material: 'metal',
    fire: { interval: 2.6, kind: 'aimed', style: 'tracer', bulletSpeed: 15, muzzles: [[0, -2]] },
    pool: 8, drop: 0.3,
    spawner: { type: 'junk', interval: 2.6, speed: 9, hold: 0.7 },
  },

  // Sektor 10: Die Sternenflotten
  forkfighter: {
    frames: one(FORK_ROWS), palette: FLEET_PALETTE, fps: 0, hp: 3, radius: 0.85, score: 350, coins: 2, explosion: 2, debris: 0xe03a2a, material: 'metal',
    fire: { interval: 1.4, kind: 'aimed', style: 'bolt', bulletSpeed: 21, muzzles: [[-6, -6], [6, -6]] },
    pool: 20, drop: 0.08,
    jink: { interval: 1.3, distance: 3.5 },
  },
  gunboat: {
    frames: one(GUNBOAT_ROWS), palette: FLEET_PALETTE, fps: 0, hp: 16, radius: 1.4, score: 1100, coins: 7, explosion: 3, debris: 0x8c8a92, material: 'metal',
    fire: { interval: 2, kind: 'spread', style: 'bolt', bulletSpeed: 15, muzzles: [[-5, -9], [5, -9]] },
    pool: 6, drop: 1,
  },

  // Sektor 3: Die Aufgestiegenen
  glider: {
    frames: one(GLIDER_ROWS), palette: ASCEND_PALETTE, fps: 0, hp: 4, radius: 1.0, score: 400, coins: 3, explosion: 2, debris: 0xe8c860, material: 'crystal',
    fire: { interval: 1.1, kind: 'triple', style: 'aether', bulletSpeed: 17, muzzles: [[0, -6]] },
    pool: 16, drop: 0.1,
  },
  guardian: {
    frames: one(GUARDIAN_ROWS), palette: ASCEND_PALETTE, fps: 0, hp: 9, radius: 1.3, score: 800, coins: 5, explosion: 2, debris: 0xe8c860, material: 'crystal',
    fire: { interval: 3, kind: 'orb', style: 'orb', bulletSpeed: 6.5, muzzles: [[0, -4]] },
    pool: 8, drop: 0.5,
    shield: { hp: 8, regen: 3, delay: 2 },
  },
  lancer: {
    frames: one(LANCER_ROWS), palette: ASCEND_PALETTE, fps: 0, hp: 7, radius: 1.0, score: 700, coins: 4, explosion: 2, debris: 0xe8c860, material: 'crystal',
    fire: null, pool: 10, drop: 0.3,
    lance: { interval: 3.4, charge: 1.2, fire: 0.9, width: 0.9 },
  },
};

export interface PatternParams {
  x: number;
  side: number;
  speed: number;
  amp: number;
  freq: number;
  phase: number;
  stopY: number;
  hold: number;
  /** Startpunkt und -geschwindigkeit, z. B. beim Ausbrüten mitten im Feld. Sonst oben am Rand. */
  y0?: number;
  vx0?: number;
  vy0?: number;
  /** Warp-Gegner: Anzahl der Sprünge. */
  hops?: number;
}

/** Schwierigkeit, wächst mit jeder Runde durch alle Sektoren. */
export interface Difficulty {
  hp: number;
  fireRate: number;
  speed: number;
}

export interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  style: ShotStyle;
  /** Optional: Sinuswelle (Boss-Kanonen). */
  amp?: number;
  freq?: number;
  phase?: number;
  /** Optional: Zielsuche in rad/s (Ätherkugeln). */
  homing?: number;
  life?: number;
  /** Optional: Schwerkraft nach unten (Wurfgeschosse). */
  gravity?: number;
}

export interface SpawnRequest {
  type: EnemyTypeId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Standard: verfolgen ('chase'). Brüter aus Eiern treiben geradeaus ('line'). */
  pattern?: PatternId;
  speed?: number;
  /** Sekunden, die ein verfolgender Gegner nachlenkt. */
  hold?: number;
}

export interface EnemyEffect {
  kind: 'warp' | 'shield' | 'hatch';
  x: number;
  y: number;
}

/** Was Gegner (und Endgegner) pro Frame an die Spiellogik zurückgeben. */
export interface EnemyOutput {
  shots: EnemyShot[];
  spawns: SpawnRequest[];
  effects: EnemyEffect[];
}

export type DamageResult = 'shielded' | 'hit' | 'killed';

const TOP = () => FIELD.halfHeight + 3;
const BOTTOM = () => -FIELD.halfHeight - 4;
const HOVER_ENTER = 1.6;
const CHASE_TURN = 2.4;
const WARP_IN = 0.45;
const WARP_OUT = 0.35;
const WARP_GAP = 0.5;
const LANCE_COLOR = 0xffd870;

/** Kubische Bézierkurve, eindimensional. */
function bezier(a: number, b: number, c: number, d: number, u: number): number {
  const v = 1 - u;
  return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
}

type WarpState = 'in' | 'on' | 'out' | 'away';
type LanceState = 'idle' | 'charge' | 'fire';

export class Enemy {
  readonly sprite: PixelSprite;
  /** Schildblase (nur Gegner mit Schild). */
  private readonly aura: PixelSprite | null;
  readonly debrisColor: THREE.Color;
  active = false;
  /** Kann getroffen werden und verletzt bei Berührung (nicht während eines Warp-Sprungs). */
  solid = true;
  x = 0;
  y = 0;
  hp = 0;
  private pattern: PatternId = 'line';
  private params!: PatternParams;
  private age = 0;
  private fireTimer = 0;
  private fireRate = 1;
  private speedMul = 1;
  private flash = 0;
  private vx = 0;
  private vy = 0;
  private spawnTimer = 0;
  private shieldHp = 0;
  private shieldMax = 0;
  private shieldDelay = 0;
  private shieldFlash = 0;
  private warpState: WarpState = 'on';
  private warpTimer = 0;
  private hopsLeft = 0;
  private spinAngle = 0;
  /** Zeit seit dem letzten Schuss (Tarnung). */
  private sinceFire = 99;
  private beamAngle = -Math.PI / 2;
  private lungeTimer = 0;
  private lungeT = -1;
  private lungeFrom = { x: 0, y: 0 };
  private lungeTo = { x: 0, y: 0 };
  private burstLeft = 0;
  private burstTimer = 0;
  private reflectTimer = 0;
  private lanceState: LanceState = 'idle';
  private lanceTimer = 0;
  private beam: Beam | null = null;
  private jinkTimer = 0;
  private jinkOffset = 0;
  private jinkTarget = 0;
  /** Im letzten Frame auf x aufgerechneter Versatz (wird vor dem Bewegen wieder abgezogen). */
  private jinkApplied = 0;

  constructor(
    readonly typeId: EnemyTypeId,
    readonly type: EnemyType,
    textures: THREE.Texture[],
    auraTextures: THREE.Texture[] | null,
    private readonly beams: Beams,
  ) {
    const rows = type.frames[0];
    this.sprite = new PixelSprite(textures, rows[0].length, rows.length);
    this.sprite.visible = false;
    this.aura = auraTextures ? new PixelSprite(auraTextures, GUARDIAN_SHIELD_FRAMES[0][0].length, GUARDIAN_SHIELD_FRAMES[0].length) : null;
    if (this.aura) this.aura.visible = false;
    this.debrisColor = new THREE.Color(type.debris);
  }

  get meshes(): THREE.Mesh[] {
    return this.aura ? [this.sprite.mesh, this.aura.mesh] : [this.sprite.mesh];
  }

  spawn(pattern: PatternId, params: PatternParams, diff: Difficulty): void {
    const t = this.type;
    this.pattern = pattern;
    this.params = params;
    this.hp = t.hp * diff.hp;
    this.fireRate = diff.fireRate;
    this.speedMul = diff.speed;
    this.age = 0;
    this.flash = 0;
    this.solid = true;
    // Erste Salve zufällig versetzt, damit nicht alle gleichzeitig feuern
    this.fireTimer = t.fire ? t.fire.interval * (0.6 + Math.random() * 0.8) : 0;
    this.spawnTimer = t.spawner ? t.spawner.interval * 0.7 : 0;
    this.shieldMax = this.shieldHp = t.shield ? t.shield.hp * diff.hp : 0;
    this.shieldDelay = 0;
    this.lanceState = 'idle';
    this.lanceTimer = t.lance ? t.lance.interval * randRange(0.5, 1) : 0;
    this.jinkTimer = t.jink ? t.jink.interval * randRange(0.5, 1) : 0;
    this.jinkOffset = this.jinkTarget = this.jinkApplied = 0;

    this.x = params.x;
    this.y = params.y0 ?? TOP();
    this.vx = params.vx0 ?? 0;
    this.vy = params.vy0 ?? -params.speed;
    if (pattern === 'bounce') {
      this.vx = params.side * params.speed * 0.8;
      this.vy = -params.speed * 0.55;
    }
    this.spinAngle = Math.random() * Math.PI * 2;
    this.sinceFire = 99;
    this.lungeTimer = randRange(2, 3);
    this.lungeT = -1;
    this.burstLeft = 0;
    this.reflectTimer = 0;
    this.sprite.mesh.rotation.z = 0;
    this.sprite.mesh.scale.setScalar(1);
    if (pattern === 'warp') {
      this.hopsLeft = params.hops ?? 2;
      this.beginWarp();
    }

    this.active = true;
    this.sprite.visible = true;
    this.move(0, 0, 0, null);
  }

  /** Prisma: darf jetzt einen Treffer zurückwerfen? (begrenzt, damit Dauerfeuer nicht zur Wand wird) */
  reflectReady(): boolean {
    if (!this.type.reflect || this.reflectTimer > 0) return false;
    this.reflectTimer = 0.22;
    return true;
  }

  /** Schaden verrechnen: zuerst der Schild, dann die Hülle. */
  damage(amount: number): DamageResult {
    if (this.shieldHp > 0) {
      this.shieldHp -= amount;
      this.shieldDelay = this.type.shield!.delay;
      this.shieldFlash = 1;
      return 'shielded';
    }
    this.hp -= amount;
    this.flash = 1;
    return this.hp <= 0 ? 'killed' : 'hit';
  }

  kill(): void {
    this.active = false;
    this.sprite.visible = false;
    if (this.aura) this.aura.visible = false;
    this.beams.release(this.beam);
    this.beam = null;
  }

  /** Bewegt den Gegner und sammelt Schüsse, Brut und Effekte ein. Gibt false zurück, wenn er das Feld verlassen hat. */
  update(dt: number, px: number, py: number, out: EnemyOutput): boolean {
    this.age += dt * this.speedMul;
    if (!this.move(dt, px, py, out)) return false;

    if (this.type.spin) {
      this.spinAngle += this.type.spin * dt;
      this.sprite.mesh.rotation.z = this.spinAngle;
    }
    this.reflectTimer = Math.max(0, this.reflectTimer - dt);

    // Schlüpfen oder Platzen: an derselben Stelle als neuer Gegner weiter oder als Geschossring
    const hatch = this.type.hatch;
    if (hatch && this.age >= hatch.after) {
      if (hatch.type) out.spawns.push({ type: hatch.type, x: this.x, y: this.y, vx: 0, vy: 0, pattern: 'line', speed: 2.4 });
      if (hatch.burst) {
        for (let i = 0; i < hatch.burst; i++) {
          const a = (i / hatch.burst) * Math.PI * 2;
          out.shots.push({ x: this.x, y: this.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, style: 'shard' });
        }
      }
      out.effects.push({ kind: 'hatch', x: this.x, y: this.y });
      return false;
    }

    this.flash = Math.max(0, this.flash - dt * 8);
    if (this.pattern !== 'warp') this.sprite.setFlash(this.flash > 0.5 ? 1 : 0);
    if (this.type.fps > 0) this.sprite.setFrame(Math.floor(this.age * this.type.fps) % this.type.frames.length);

    this.updateShield(dt);
    if (this.solid) {
      this.tryFire(dt, px, py, out);
      this.trySpawn(dt, out);
      this.updateLance(dt, px, py);
    }
    this.sinceFire += dt;

    // Tarnung: kurz vor und nach dem Feuern sichtbar, sonst nur ein Flimmern
    if (this.type.cloak) {
      const revealed = this.fireTimer < 0.55 || this.sinceFire < 0.3 || this.flash > 0;
      this.sprite.visible = revealed || Math.floor(this.age * 10) % 7 === 0;
    }
    // Puls-Gegner blinken vor der Entladung
    if (this.type.fire?.kind === 'pulse' && this.fireTimer < 0.6 && this.onScreen()) {
      this.sprite.setFlash(Math.floor(this.age * 14) % 2 ? 0.8 : 0);
      if (this.typeId === 'jelly') this.sprite.setFrame(0);
    }
    return true;
  }

  private onScreen(): boolean {
    return this.y < FIELD.halfHeight - 1 && this.y > -FIELD.halfHeight && Math.abs(this.x) < FIELD.halfWidth;
  }

  private move(dt: number, px: number, py: number, out: EnemyOutput | null): boolean {
    const p = this.params;
    const t = this.age;
    const top = TOP();
    // Ausweich-Versatz abziehen, damit fortlaufend gerechnete Muster (line, chase, bounce) auf der echten Bahn bleiben
    this.x -= this.jinkApplied;
    this.jinkApplied = 0;
    switch (this.pattern) {
      case 'line':
        // Startet oben am Rand oder (beim Ausbrüten) an y0
        this.y = (p.y0 ?? top) - p.speed * t;
        break;
      case 'sine':
        this.x = p.x + p.amp * Math.sin(p.freq * t + p.phase);
        this.y = top - p.speed * t;
        break;
      case 'swoop': {
        // U-förmiger Sturzflug: auf einer Seite herein, unten durch, auf der anderen Seite hinaus
        const w = Math.min(FIELD.halfWidth * 0.8, 16);
        const h = FIELD.halfHeight;
        const u = t / 6;
        if (u >= 1) return false;
        this.x = p.x + bezier(p.side * w, p.side * w, -p.side * w, -p.side * w, u);
        this.y = bezier(top, -h * 0.9, -h * 0.9, top, u);
        break;
      }
      case 'hover': {
        // Einfliegen, schweben und dabei seitlich pendeln, dann nach unten abziehen
        if (t < HOVER_ENTER) {
          const e = 1 - Math.pow(1 - t / HOVER_ENTER, 3);
          this.x = p.x;
          this.y = top + (p.stopY - top) * e;
        } else if (t < HOVER_ENTER + p.hold) {
          this.x = p.x + p.amp * Math.sin((t - HOVER_ENTER) * p.freq + p.phase) - p.amp * Math.sin(p.phase);
          this.y = p.stopY + Math.sin((t - HOVER_ENTER) * 1.3) * 0.6;
        } else {
          // Beschleunigt nach unten abziehen, x bleibt, wo das Pendeln aufgehört hat
          const te = t - HOVER_ENTER - p.hold;
          this.y = p.stopY - te * te * p.speed * 0.6;
        }
        break;
      }
      case 'chase': {
        // Verfolgt den Spieler mit begrenzter Wendigkeit, nach p.hold Sekunden fliegt er geradeaus weiter
        const speed = p.speed * this.speedMul;
        if (t < p.hold && dt > 0) {
          const cur = Math.atan2(this.vy, this.vx);
          let diff = Math.atan2(py - this.y, px - this.x) - cur;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          const turn = this.type.turn ?? CHASE_TURN;
          const a = cur + THREE.MathUtils.clamp(diff, -turn * dt, turn * dt);
          this.vx = Math.cos(a) * speed;
          this.vy = Math.sin(a) * speed;
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // Kopf in Flugrichtung (die Sprites schauen nach unten)
        this.sprite.mesh.rotation.z = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        this.sprite.place(this.x, this.y);
        return Math.abs(this.x) < FIELD.halfWidth + 5 && this.y > BOTTOM() && this.y < top + 8;
      }
      case 'warp':
        return this.moveWarp(dt, out);
      case 'bounce': {
        // Diagonal nach unten, prallt an den Seitenwänden ab
        const wall = FIELD.halfWidth - 1;
        this.x += this.vx * dt * this.speedMul;
        this.y += this.vy * dt * this.speedMul;
        if (Math.abs(this.x) > wall) {
          this.x = Math.sign(this.x) * wall;
          this.vx = -this.vx;
        }
        break;
      }
      case 'strafe': {
        // Seitlicher Überflug auf fester Höhe
        const edge = FIELD.halfWidth + 3;
        this.x = -p.side * edge + p.side * p.speed * t;
        this.y = p.stopY + Math.sin(t * 2) * 0.6;
        this.sprite.place(this.x, this.y);
        return Math.abs(this.x) <= edge + 0.1;
      }
      case 'lunge': {
        // Wie hover einfliegen und lauern, dann blitzschnell auf den Spieler zuschnellen und zurück
        if (t < HOVER_ENTER) {
          const e = 1 - Math.pow(1 - t / HOVER_ENTER, 3);
          this.x = p.x;
          this.y = top + (p.stopY - top) * e;
          break;
        }
        if (t > HOVER_ENTER + p.hold && this.lungeT < 0) {
          const te = t - HOVER_ENTER - p.hold;
          this.y -= te * p.speed * 0.6 * dt * 10;
          break;
        }
        if (this.lungeT < 0) {
          this.x += (p.x - this.x) * Math.min(1, dt * 2) + Math.sin(t * 1.5) * dt * 0.8;
          this.y += (p.stopY - this.y) * Math.min(1, dt * 2);
          this.sprite.mesh.rotation.z *= Math.max(0, 1 - dt * 5);
          this.lungeTimer -= dt;
          if (this.lungeTimer <= 0 && dt > 0) {
            this.lungeT = 0;
            this.lungeFrom = { x: this.x, y: this.y };
            this.lungeTo = { x: px, y: Math.max(py, -FIELD.halfHeight * 0.75) };
            this.sprite.mesh.rotation.z = Math.atan2(this.lungeTo.y - this.y, this.lungeTo.x - this.x) + Math.PI / 2;
          }
        } else {
          this.lungeT += dt;
          const u = Math.min(1, this.lungeT / 0.55);
          const e = u * u * (3 - 2 * u);
          this.x = this.lungeFrom.x + (this.lungeTo.x - this.lungeFrom.x) * e;
          this.y = this.lungeFrom.y + (this.lungeTo.y - this.lungeFrom.y) * e;
          if (u >= 1) {
            this.lungeT = -1;
            this.lungeTimer = randRange(2.4, 3.4);
            // Neue Lauerposition über der Stelle, an der er zugeschnappt hat
            p.x = THREE.MathUtils.clamp(this.x, -FIELD.halfWidth + 2, FIELD.halfWidth - 2);
          }
        }
        break;
      }
      case 'zigzag': {
        // Dreieckswelle: scharfe Richtungswechsel
        const tri = (2 / Math.PI) * Math.asin(Math.sin(t * p.freq));
        this.x = p.x + p.amp * tri;
        this.y = top - p.speed * t;
        break;
      }
    }
    if (this.type.jink) this.applyJink(dt);
    this.sprite.place(this.x, this.y);
    return this.y > BOTTOM();
  }

  /** Ruckartiges Ausweichen zur Seite, auf die feste Bahn des Musters aufgerechnet. */
  private applyJink(dt: number): void {
    const j = this.type.jink!;
    this.jinkTimer -= dt;
    if (this.jinkTimer <= 0) {
      this.jinkTimer = j.interval * randRange(0.7, 1.3);
      const wall = FIELD.halfWidth - 2;
      const dir = Math.random() < 0.5 ? -1 : 1;
      let target = this.jinkTarget + dir * j.distance;
      if (Math.abs(this.x + target) > wall || Math.abs(target) > j.distance * 1.5) target = this.jinkTarget - dir * j.distance;
      this.jinkTarget = THREE.MathUtils.clamp(target, -j.distance * 1.5, j.distance * 1.5);
    }
    this.jinkOffset += (this.jinkTarget - this.jinkOffset) * Math.min(1, dt * 9);
    this.x += this.jinkOffset;
    this.jinkApplied = this.jinkOffset;
  }

  /** Neue Position im oberen Feld wählen und einblenden. */
  private beginWarp(): void {
    const fw = Math.min(FIELD.halfWidth - 3, 16);
    this.x = randRange(-fw, fw);
    this.y = randRange(FIELD.halfHeight * 0.05, FIELD.halfHeight * 0.75);
    this.warpState = 'in';
    this.warpTimer = 0;
  }

  private moveWarp(dt: number, out: EnemyOutput | null): boolean {
    const first = this.warpTimer === 0;
    this.warpTimer += dt;
    let scale = 1;
    switch (this.warpState) {
      case 'in':
        if (first) out?.effects.push({ kind: 'warp', x: this.x, y: this.y });
        scale = Math.min(1, this.warpTimer / WARP_IN);
        if (this.warpTimer >= WARP_IN) this.setWarp('on');
        break;
      case 'on':
        this.x += Math.sin(this.age * 1.7) * dt * 1.2;
        if (this.warpTimer >= this.params.hold) {
          this.setWarp('out');
          out?.effects.push({ kind: 'warp', x: this.x, y: this.y });
        }
        break;
      case 'out':
        scale = Math.max(0, 1 - this.warpTimer / WARP_OUT);
        if (this.warpTimer >= WARP_OUT) this.setWarp('away');
        break;
      case 'away':
        scale = 0;
        if (this.warpTimer >= WARP_GAP) {
          if (--this.hopsLeft < 0) return false;
          this.beginWarp();
        }
        break;
    }
    this.solid = this.warpState === 'on';
    // Beim Ein- und Ausblenden in die Breite gezogen und weiß, wie ein Riss im Raum
    this.sprite.mesh.scale.set(1 + (1 - scale) * 2, Math.max(0.01, scale), 1);
    this.sprite.setFlash(this.solid ? (this.flash > 0.5 ? 1 : 0) : 1);
    this.sprite.visible = this.warpState !== 'away';
    this.sprite.place(this.x, this.y);
    return true;
  }

  private setWarp(state: WarpState): void {
    this.warpState = state;
    this.warpTimer = 0;
  }

  private updateShield(dt: number): void {
    const s = this.type.shield;
    if (!s || !this.aura) return;
    if (this.shieldDelay > 0) this.shieldDelay -= dt;
    else this.shieldHp = Math.min(this.shieldMax, this.shieldHp + s.regen * dt);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 6);
    const on = this.shieldHp > 0.5 && this.solid;
    this.aura.visible = on;
    if (on) {
      this.aura.setFrame(Math.floor(this.age * 8) % 2);
      this.aura.setFlash(this.shieldFlash > 0.5 ? 1 : 0);
      this.aura.place(this.x, this.y, 0.05);
    }
  }

  private tryFire(dt: number, px: number, py: number, out: EnemyOutput): void {
    const fire = this.type.fire;
    if (!fire) return;
    // Nur feuern, wenn sichtbar und oberhalb des Spielers
    if (!this.onScreen() || this.y < py + 3) return;

    // Laufender Feuerstoß
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer > 0) return;
      this.burstTimer = 0.08;
      this.burstLeft--;
      const ox = this.x + fire.muzzles[0][0] * PIXEL;
      const oy = this.y + fire.muzzles[0][1] * PIXEL;
      const a = Math.atan2(py - oy, px - ox) + randRange(-0.05, 0.05);
      out.shots.push({ x: ox, y: oy, vx: Math.cos(a) * fire.bulletSpeed, vy: Math.sin(a) * fire.bulletSpeed, style: fire.style });
      return;
    }

    this.fireTimer -= dt * this.fireRate;
    if (this.fireTimer > 0) return;
    this.fireTimer += fire.interval;
    this.sinceFire = 0;

    const [mx, my] = fire.muzzles[0];
    const ox = this.x + mx * PIXEL;
    const oy = this.y + my * PIXEL;
    const aim = Math.atan2(py - oy, px - ox);
    const v = fire.bulletSpeed;
    const shot = (x: number, y: number, a: number, speed = v, extra: Partial<EnemyShot> = {}) =>
      out.shots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, style: fire.style, ...extra });

    switch (fire.kind) {
      case 'aimed':
        shot(ox, oy, aim);
        break;
      case 'spread':
        // Fächer nach unten aus dem Hauptrohr, dazu gezielte Schüsse aus den Seitentürmen
        for (let i = -2; i <= 2; i++) shot(ox, oy, -Math.PI / 2 + i * 0.28);
        for (const [sx, sy] of fire.muzzles.slice(1)) {
          const x = this.x + sx * PIXEL;
          const y = this.y + sy * PIXEL;
          shot(x, y, Math.atan2(py - y, px - x), v * 1.2);
        }
        break;
      case 'triple':
        for (const d of [-0.12, 0, 0.12]) shot(ox, oy, aim + d);
        break;
      case 'acid':
        for (const d of [-0.35, 0, 0.35]) shot(ox, oy, aim + d, v * randRange(0.85, 1.1));
        break;
      case 'orb':
        shot(ox, oy, aim, v, { homing: 1.3, life: 6 });
        break;
      case 'lob': {
        // Drei Wurfgeschosse in Bögen, die ungefähr beim Spieler landen
        const g = 14;
        for (const flight of [1.1, 1.4, 1.75]) {
          const dx = px + randRange(-2, 2) - ox;
          const dy = py - oy;
          out.shots.push({ x: ox, y: oy, vx: dx / flight, vy: (dy + 0.5 * g * flight * flight) / flight, style: fire.style, gravity: g, life: 4 });
        }
        break;
      }
      case 'burst':
        this.burstLeft = 3;
        this.burstTimer = 0;
        break;
      case 'pulse':
        // Elektrischer Ring mit kurzer Reichweite
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          out.shots.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, style: fire.style, life: 0.55 });
        }
        break;
    }
  }

  private trySpawn(dt: number, out: EnemyOutput): void {
    const sp = this.type.spawner;
    if (!sp || !this.onScreen()) return;
    this.spawnTimer -= dt * this.fireRate;
    if (this.spawnTimer > 0) return;
    this.spawnTimer += sp.interval;
    out.spawns.push({ type: sp.type, x: this.x, y: this.y - 1, vx: randRange(-3, 3), vy: -6, speed: sp.speed, hold: sp.hold });
  }

  /** Laserlanze: Pause → sichtbares Aufladen → Strahl nach unten (oder dem Spieler folgend). */
  private updateLance(dt: number, px: number, py: number): void {
    const l = this.type.lance;
    if (!l) return;
    this.lanceTimer -= dt * (this.lanceState === 'idle' ? this.fireRate : 1);

    if (this.lanceState === 'idle') {
      if (this.lanceTimer > 0 || !this.onScreen()) return;
      this.beam = this.beams.acquire(l.color ?? LANCE_COLOR, l.width, true);
      if (!this.beam) return;
      this.beamAngle = l.turn ? Math.atan2(py - this.y, px - this.x) : -Math.PI / 2;
      this.lanceState = 'charge';
      this.lanceTimer = l.charge;
      this.beam.charge = true;
    } else if (this.lanceTimer <= 0) {
      if (this.lanceState === 'charge') {
        this.lanceState = 'fire';
        this.lanceTimer = l.fire;
        if (this.beam) this.beam.charge = false;
      } else {
        this.beams.release(this.beam);
        this.beam = null;
        this.lanceState = 'idle';
        this.lanceTimer = l.interval;
        return;
      }
    }
    if (this.beam) {
      const tipY = this.y + (l.tipY ?? LANCER_TIP_Y) * PIXEL;
      if (l.turn) {
        // Folgt dem Spieler mit begrenzter Drehrate (beim Laden schneller)
        let diff = Math.atan2(py - tipY, px - this.x) - this.beamAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const turn = l.turn * (this.lanceState === 'charge' ? 3 : 1) * dt;
        this.beamAngle += THREE.MathUtils.clamp(diff, -turn, turn);
      }
      this.beam.x = this.x;
      this.beam.y = tipY;
      this.beam.angle = this.beamAngle;
      this.beam.length = l.turn ? 60 : tipY + FIELD.halfHeight + 4;
    }
  }
}

/** Feste Pools pro Gegnertyp. */
export class Enemies {
  readonly all: Enemy[] = [];
  private readonly pools = {} as Record<EnemyTypeId, Enemy[]>;

  constructor(scene: THREE.Scene, beams: Beams) {
    for (const id of Object.keys(ENEMY_TYPES) as EnemyTypeId[]) {
      const type = ENEMY_TYPES[id];
      const textures = type.frames.map((rows) => makePixelTexture(rows, type.palette));
      const aura = type.shield ? GUARDIAN_SHIELD_FRAMES.map((rows) => makePixelTexture(rows, ASCEND_PALETTE)) : null;
      this.pools[id] = Array.from({ length: type.pool }, () => {
        const e = new Enemy(id, type, textures, aura, beams);
        scene.add(...e.meshes);
        this.all.push(e);
        return e;
      });
    }
  }

  spawn(typeId: EnemyTypeId, pattern: PatternId, params: PatternParams, diff: Difficulty): Enemy | null {
    const enemy = this.pools[typeId].find((e) => !e.active);
    if (!enemy) return null;
    enemy.spawn(pattern, params, diff);
    return enemy;
  }

  get aliveCount(): number {
    let n = 0;
    for (const e of this.all) if (e.active) n++;
    return n;
  }

  clear(): void {
    for (const e of this.all) if (e.active) e.kill();
  }
}
