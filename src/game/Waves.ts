import { FIELD } from '../config';
import type { Difficulty, EnemyTypeId, PatternId, PatternParams } from '../entities/Enemies';

/**
 * Eine Gruppe gleicher Gegner innerhalb einer Welle.
 * x und dx sind Anteile der Formationsbreite (−1 = links, 1 = rechts), stopY ein Anteil der halben Spielfeldhöhe.
 */
interface SpawnGroup {
  at: number;
  type: EnemyTypeId;
  pattern: PatternId;
  count: number;
  /** Sekunden zwischen zwei Gegnern der Gruppe. */
  every: number;
  x?: number;
  dx?: number;
  side?: 1 | -1;
  amp?: number;
  speed?: number;
  stopY?: number;
  hold?: number;
  hops?: number;
  freq?: number;
}

export type BossId = 'mothership' | 'queen' | 'ark' | 'urschleim' | 'starship' | 'fortress' | 'shardswarm' | 'singularity' | 'leviathan';

export interface Sector {
  name: string;
  subtitle: string;
  waves: SpawnGroup[][];
  boss: BossId;
  bossName: string;
  /** Optionaler Zwischenboss nach der Welle mit diesem Index (ab 1). */
  midBoss?: { after: number; boss: BossId; name: string };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Abprallende Schleimtropfen von einer Seite. */
const drops = (at: number, count: number, side: 1 | -1, x = -0.6, every = 0.5): SpawnGroup => ({
  at, type: 'droplet', pattern: 'bounce', count, every, x, dx: 1.2 / count, side, speed: 10,
});
/** Abfangjäger im seitlichen Überflug. */
const strafe = (at: number, count: number, side: 1 | -1, stopY: number): SpawnGroup => ({
  at, type: 'interceptor', pattern: 'strafe', count, every: 0.45, side, stopY, speed: 14,
});
/** Kristallsplitter im Zickzack. */
const shards = (at: number, count: number, x = 0, dx = 0.15, every = 0.25): SpawnGroup => ({
  at, type: 'shard', pattern: 'zigzag', count, every, x, dx, amp: 3.5, freq: 3, speed: 9,
});

/** Gravitationsminen, die langsam herabtreiben. */
const mines = (at: number, count: number, x = -0.6, dx = 0.4, every = 0.9): SpawnGroup => ({
  at, type: 'gravmine', pattern: 'line', count, every, x, dx, speed: 2.6,
});
/** Sternquallen in sanften Wellen. */
const jellies = (at: number, count: number, x = -0.6, dx = 0.3, every = 0.6): SpawnGroup => ({
  at, type: 'jelly', pattern: 'sine', count, every, x, dx, amp: 2, freq: 0.8, speed: 3,
});

/** Schwarm von oben, der den Spieler verfolgt. */
const swarm = (at: number, count: number, x = 0, dx = 0.12, every = 0.12, speed = 9): SpawnGroup => ({
  at, type: 'swarmling', pattern: 'chase', count, every, x, dx, speed, hold: 3.2,
});

export const SECTORS: Sector[] = [
  {
    name: 'SEKTOR 1',
    subtitle: 'IMPERIALE GRENZE',
    boss: 'mothership',
    bossName: 'MUTTERSCHIFF',
    waves: [
      // 1: zwei Schlangen Drohnen
      [
        { at: 0, type: 'drone', pattern: 'sine', count: 6, every: 0.45, x: -0.45, amp: 3, speed: 7 },
        { at: 2.5, type: 'drone', pattern: 'sine', count: 6, every: 0.45, x: 0.45, amp: 3, speed: 7 },
      ],
      // 2: Sturzflug von beiden Seiten
      [
        { at: 0, type: 'drone', pattern: 'swoop', count: 7, every: 0.3, side: 1 },
        { at: 3, type: 'drone', pattern: 'swoop', count: 7, every: 0.3, side: -1 },
      ],
      // 3: erste Jäger, dazu eine Drohnenreihe
      [
        { at: 0, type: 'fighter', pattern: 'hover', count: 2, every: 0, x: -0.4, dx: 0.8, stopY: 0.45, hold: 7 },
        { at: 1.5, type: 'drone', pattern: 'line', count: 8, every: 0.25, x: -0.8, dx: 0.23, speed: 9 },
      ],
      // 4: Jäger-Staffel zwischen zwei Sturzflügen
      [
        { at: 0, type: 'drone', pattern: 'swoop', count: 6, every: 0.3, side: -1 },
        { at: 0.8, type: 'fighter', pattern: 'hover', count: 3, every: 0.4, x: -0.6, dx: 0.6, stopY: 0.5, hold: 6 },
        { at: 3.5, type: 'drone', pattern: 'swoop', count: 6, every: 0.3, side: 1 },
      ],
      // 5: schwerer Kreuzer mit Begleitschutz
      [
        { at: 0, type: 'heavy', pattern: 'hover', count: 1, every: 0, x: 0, stopY: 0.4, hold: 12 },
        { at: 2, type: 'drone', pattern: 'sine', count: 8, every: 0.4, x: -0.7, amp: 2, speed: 6 },
        { at: 4, type: 'drone', pattern: 'sine', count: 8, every: 0.4, x: 0.7, amp: 2, speed: 6 },
      ],
      // 6: alles zusammen
      [
        { at: 0, type: 'fighter', pattern: 'hover', count: 4, every: 0.3, x: -0.75, dx: 0.5, stopY: 0.55, hold: 8 },
        { at: 2, type: 'drone', pattern: 'swoop', count: 8, every: 0.25, side: 1 },
        { at: 4, type: 'heavy', pattern: 'hover', count: 2, every: 0.5, x: -0.45, dx: 0.9, stopY: 0.3, hold: 10 },
        { at: 6, type: 'drone', pattern: 'swoop', count: 8, every: 0.25, side: -1 },
      ],
      // 7: Zangenangriff, dazu eine schnelle Drohnenreihe
      [
        { at: 0, type: 'drone', pattern: 'swoop', count: 8, every: 0.25, side: 1 },
        { at: 0, type: 'drone', pattern: 'swoop', count: 8, every: 0.25, side: -1 },
        { at: 3, type: 'drone', pattern: 'line', count: 10, every: 0.15, x: -0.9, dx: 0.2, speed: 11 },
      ],
      // 8: Jäger-Wand über Drohnenschlangen
      [
        { at: 0, type: 'fighter', pattern: 'hover', count: 5, every: 0.2, x: -0.8, dx: 0.4, stopY: 0.6, hold: 9 },
        { at: 1.5, type: 'drone', pattern: 'sine', count: 10, every: 0.35, x: -0.35, amp: 4, speed: 8 },
        { at: 3, type: 'drone', pattern: 'sine', count: 10, every: 0.35, x: 0.35, amp: 4, speed: 8 },
      ],
      // 9: zwei Kreuzer mit Jäger-Begleitung
      [
        { at: 0, type: 'heavy', pattern: 'hover', count: 2, every: 0.6, x: -0.5, dx: 1, stopY: 0.45, hold: 12 },
        { at: 2.5, type: 'fighter', pattern: 'hover', count: 4, every: 0.5, x: -0.75, dx: 0.5, stopY: 0.15, hold: 7 },
        { at: 6, type: 'drone', pattern: 'swoop', count: 8, every: 0.25, side: 1 },
      ],
      // 10: letzte Welle vor dem Mutterschiff
      [
        { at: 0, type: 'heavy', pattern: 'hover', count: 1, every: 0, x: 0, stopY: 0.55, hold: 14 },
        { at: 1, type: 'fighter', pattern: 'hover', count: 4, every: 0.3, x: -0.8, dx: 0.53, stopY: 0.3, hold: 9 },
        { at: 3, type: 'drone', pattern: 'swoop', count: 8, every: 0.22, side: -1 },
        { at: 5, type: 'drone', pattern: 'swoop', count: 8, every: 0.22, side: 1 },
        { at: 8, type: 'heavy', pattern: 'hover', count: 2, every: 0.4, x: -0.6, dx: 1.2, stopY: 0.2, hold: 8 },
      ],
    ],
  },
  {
    name: 'SEKTOR 2',
    subtitle: 'DER SCHWARM',
    boss: 'queen',
    bossName: 'SCHWARMKÖNIGIN',
    waves: [
      // 1: der erste Schwarm
      [swarm(0, 12, -0.6), swarm(3, 12, 0.6, -0.12)],
      // 2: Speier hinter einem Schwarm
      [
        { at: 0, type: 'spitter', pattern: 'hover', count: 3, every: 0.4, x: -0.6, dx: 0.6, stopY: 0.55, hold: 9 },
        swarm(1.5, 10, -0.5, 0.11),
      ],
      // 3: zwei Brüter treiben herein
      [
        { at: 0, type: 'brood', pattern: 'line', count: 2, every: 1.5, x: -0.45, dx: 0.9, speed: 2.6 },
        swarm(2, 8, 0.7, -0.1),
      ],
      // 4: Schwarmflut von drei Seiten
      [swarm(0, 14, -0.9, 0.06, 0.1), swarm(2, 14, 0.9, -0.06, 0.1), swarm(4, 14, -0.3, 0.05, 0.1, 11)],
      // 5: Speier-Riegel mit Brüter
      [
        { at: 0, type: 'spitter', pattern: 'hover', count: 5, every: 0.25, x: -0.8, dx: 0.4, stopY: 0.6, hold: 10 },
        { at: 2, type: 'brood', pattern: 'line', count: 1, every: 0, x: 0, speed: 2.4 },
      ],
      // 6: Brutkolonie
      [
        { at: 0, type: 'brood', pattern: 'line', count: 3, every: 1.2, x: -0.6, dx: 0.6, speed: 2.2 },
        { at: 3, type: 'spitter', pattern: 'hover', count: 2, every: 0.5, x: -0.3, dx: 0.6, stopY: 0.65, hold: 8 },
      ],
      // 7: Überrollen
      [
        swarm(0, 15, -0.7, 0.1, 0.08),
        swarm(1.5, 15, 0.7, -0.1, 0.08),
        { at: 2, type: 'spitter', pattern: 'hover', count: 4, every: 0.3, x: -0.6, dx: 0.4, stopY: 0.5, hold: 8 },
      ],
      // 8: letzte Welle vor der Königin
      [
        { at: 0, type: 'brood', pattern: 'line', count: 2, every: 0.8, x: -0.6, dx: 1.2, speed: 2.4 },
        { at: 1, type: 'spitter', pattern: 'hover', count: 4, every: 0.3, x: -0.75, dx: 0.5, stopY: 0.35, hold: 9 },
        swarm(3, 20, 0, 0, 0.09, 10),
      ],
    ],
  },
  {
    name: 'SEKTOR 3',
    subtitle: 'DIE AUFGESTIEGENEN',
    boss: 'ark',
    bossName: 'KRISTALLARCHE',
    waves: [
      // 1: Phasengleiter tauchen auf
      [{ at: 0, type: 'glider', pattern: 'warp', count: 4, every: 0.6, hops: 2, hold: 2.4 }],
      // 2: Wächter mit Gleitern
      [
        { at: 0, type: 'guardian', pattern: 'hover', count: 2, every: 0.5, x: -0.45, dx: 0.9, stopY: 0.55, hold: 11 },
        { at: 2, type: 'glider', pattern: 'warp', count: 3, every: 0.8, hops: 2, hold: 2.2 },
      ],
      // 3: Lanzenträger-Linie
      [
        { at: 0, type: 'lancer', pattern: 'hover', count: 3, every: 0.4, x: -0.6, dx: 0.6, stopY: 0.7, hold: 10, amp: 4 },
        { at: 3, type: 'glider', pattern: 'warp', count: 2, every: 1, hops: 2, hold: 2.2 },
      ],
      // 4: Schildwall mit Lanzen
      [
        { at: 0, type: 'guardian', pattern: 'hover', count: 3, every: 0.4, x: -0.6, dx: 0.6, stopY: 0.45, hold: 11 },
        { at: 2, type: 'lancer', pattern: 'hover', count: 2, every: 0.6, x: -0.8, dx: 1.6, stopY: 0.75, hold: 9, amp: 3 },
      ],
      // 5: Warp-Sturm
      [{ at: 0, type: 'glider', pattern: 'warp', count: 8, every: 0.35, hops: 3, hold: 1.8 }],
      // 6: Lanzengitter
      [
        { at: 0, type: 'lancer', pattern: 'hover', count: 4, every: 0.3, x: -0.75, dx: 0.5, stopY: 0.7, hold: 11, amp: 3 },
        { at: 2, type: 'guardian', pattern: 'hover', count: 2, every: 0.5, x: -0.25, dx: 0.5, stopY: 0.35, hold: 9 },
      ],
      // 7: alles zusammen
      [
        { at: 0, type: 'guardian', pattern: 'hover', count: 2, every: 0.5, x: -0.6, dx: 1.2, stopY: 0.5, hold: 12 },
        { at: 1, type: 'lancer', pattern: 'hover', count: 3, every: 0.4, x: -0.5, dx: 0.5, stopY: 0.75, hold: 10, amp: 4 },
        { at: 3, type: 'glider', pattern: 'warp', count: 6, every: 0.5, hops: 2, hold: 2 },
      ],
      // 8: letzte Welle vor der Arche
      [
        { at: 0, type: 'lancer', pattern: 'hover', count: 5, every: 0.25, x: -0.8, dx: 0.4, stopY: 0.75, hold: 12, amp: 3 },
        { at: 1.5, type: 'guardian', pattern: 'hover', count: 3, every: 0.4, x: -0.5, dx: 0.5, stopY: 0.4, hold: 11 },
        { at: 4, type: 'glider', pattern: 'warp', count: 6, every: 0.4, hops: 3, hold: 1.8 },
      ],
    ],
  },
  {
    name: 'SEKTOR 4',
    subtitle: 'DER SCHLEIM',
    boss: 'urschleim',
    bossName: 'URSCHLEIM',
    waves: [
      // 1: Tropfen von beiden Seiten
      [drops(0, 6, 1), drops(3, 6, -1, 0)],
      // 2: Schleimer werfen über einen Tropfenregen
      [
        { at: 0, type: 'oozer', pattern: 'hover', count: 3, every: 0.4, x: -0.6, dx: 0.6, stopY: 0.55, hold: 9 },
        drops(2, 8, 1, -0.8, 0.4),
      ],
      // 3: eine Amöbe treibt herein
      [
        { at: 0, type: 'amoeba', pattern: 'line', count: 1, every: 0, x: 0, speed: 2.4 },
        drops(1.5, 6, -1, 0.4),
        drops(4, 6, 1, -0.6),
      ],
      // 4: Tropfenflut
      [drops(0, 10, 1, -0.9, 0.3), drops(1.5, 10, -1, -0.3, 0.3), { at: 3, type: 'oozer', pattern: 'hover', count: 2, every: 0.6, x: -0.4, dx: 0.8, stopY: 0.6, hold: 8 }],
      // 5: Amöben-Paar mit Werfern
      [
        { at: 0, type: 'amoeba', pattern: 'line', count: 2, every: 1.2, x: -0.45, dx: 0.9, speed: 2.2 },
        { at: 2, type: 'oozer', pattern: 'hover', count: 2, every: 0.5, x: -0.8, dx: 1.6, stopY: 0.7, hold: 9 },
      ],
      // 6: Schleimerwall
      [
        { at: 0, type: 'oozer', pattern: 'hover', count: 5, every: 0.25, x: -0.8, dx: 0.4, stopY: 0.6, hold: 10 },
        drops(2.5, 8, 1, -0.5, 0.35),
      ],
      // 7: alles zusammen
      [
        { at: 0, type: 'amoeba', pattern: 'line', count: 2, every: 1.5, x: -0.5, dx: 1, speed: 2.4 },
        drops(1, 8, -1, 0.2, 0.35),
        { at: 3, type: 'oozer', pattern: 'hover', count: 3, every: 0.4, x: -0.6, dx: 0.6, stopY: 0.65, hold: 8 },
      ],
      // 8: letzte Welle vor dem Urschleim
      [
        { at: 0, type: 'amoeba', pattern: 'line', count: 3, every: 1, x: -0.6, dx: 0.6, speed: 2.2 },
        { at: 1, type: 'oozer', pattern: 'hover', count: 4, every: 0.3, x: -0.75, dx: 0.5, stopY: 0.7, hold: 10 },
        drops(3, 12, 1, -0.9, 0.25),
      ],
    ],
  },
  {
    name: 'SEKTOR 5',
    subtitle: 'TERRANISCHE MILIZ',
    boss: 'fortress',
    bossName: 'ASTEROIDENFESTUNG',
    midBoss: { after: 4, boss: 'starship', name: 'STAHLRAKETE' },
    waves: [
      // 1: Abfangjäger im Überflug
      [strafe(0, 4, 1, 0.55), strafe(2.5, 4, -1, 0.3)],
      // 2: Felsfeld mit einer Bergbaudrohne
      [
        { at: 0, type: 'rockBig', pattern: 'line', count: 4, every: 1.2, x: -0.7, dx: 0.45, speed: 4 },
        { at: 1, type: 'rockSmall', pattern: 'line', count: 8, every: 0.5, x: 0.8, dx: -0.2, speed: 6 },
        { at: 2, type: 'miner', pattern: 'hover', count: 1, every: 0, x: 0, stopY: 0.65, hold: 10 },
      ],
      // 3: Fregatte mit Jägerschutz
      [
        { at: 0, type: 'frigate', pattern: 'hover', count: 1, every: 0, x: 0, stopY: 0.55, hold: 12 },
        strafe(2, 4, 1, 0.2),
        strafe(4.5, 4, -1, 0.4),
      ],
      // 4: Bergbau-Kolonne
      [
        { at: 0, type: 'miner', pattern: 'hover', count: 2, every: 0.5, x: -0.5, dx: 1, stopY: 0.6, hold: 11 },
        { at: 2, type: 'rockBig', pattern: 'line', count: 3, every: 1, x: 0, dx: 0.3, speed: 4.5 },
        strafe(4, 3, 1, 0.35),
      ],
      // 5: zwei Fregatten
      [
        { at: 0, type: 'frigate', pattern: 'hover', count: 2, every: 0.6, x: -0.5, dx: 1, stopY: 0.6, hold: 12 },
        strafe(3, 5, -1, 0.25),
      ],
      // 6: Felssturm
      [
        { at: 0, type: 'rockBig', pattern: 'line', count: 6, every: 0.7, x: -0.8, dx: 0.3, speed: 5 },
        { at: 0.5, type: 'rockSmall', pattern: 'line', count: 12, every: 0.3, x: 0.9, dx: -0.15, speed: 7 },
        { at: 3, type: 'miner', pattern: 'hover', count: 2, every: 0.6, x: -0.6, dx: 1.2, stopY: 0.7, hold: 9 },
      ],
      // 7: Milizverband
      [
        { at: 0, type: 'frigate', pattern: 'hover', count: 2, every: 0.6, x: -0.6, dx: 1.2, stopY: 0.65, hold: 12 },
        { at: 1.5, type: 'miner', pattern: 'hover', count: 2, every: 0.6, x: -0.25, dx: 0.5, stopY: 0.35, hold: 10 },
        strafe(4, 5, 1, 0.15),
      ],
      // 8: letzte Welle vor der Festung
      [
        { at: 0, type: 'frigate', pattern: 'hover', count: 3, every: 0.5, x: -0.7, dx: 0.7, stopY: 0.6, hold: 13 },
        strafe(2, 5, -1, 0.3),
        { at: 4, type: 'rockBig', pattern: 'line', count: 4, every: 0.8, x: -0.5, dx: 0.35, speed: 4.5 },
        strafe(6, 5, 1, 0.45),
      ],
    ],
  },
  {
    name: 'SEKTOR 6',
    subtitle: 'KRISTALLWESEN',
    boss: 'shardswarm',
    bossName: 'KRISTALLSCHWARM',
    waves: [
      // 1: Splitterschwärme
      [shards(0, 10, -0.6), shards(3, 10, 0.6, -0.15)],
      // 2: Prismen hinter Splittern
      [
        { at: 0, type: 'prism', pattern: 'hover', count: 3, every: 0.4, x: -0.6, dx: 0.6, stopY: 0.6, hold: 10 },
        shards(2, 10, -0.4, 0.1),
      ],
      // 3: Knospen treiben heran
      [
        { at: 0, type: 'bud', pattern: 'line', count: 4, every: 0.9, x: -0.7, dx: 0.45, speed: 2.2 },
        shards(2, 8, 0.5, -0.12),
      ],
      // 4: Prismenwand mit Knospen
      [
        { at: 0, type: 'prism', pattern: 'hover', count: 4, every: 0.3, x: -0.75, dx: 0.5, stopY: 0.65, hold: 11 },
        { at: 2, type: 'bud', pattern: 'line', count: 3, every: 1, x: -0.4, dx: 0.4, speed: 2.4 },
      ],
      // 5: Splitterflut
      [shards(0, 14, -0.9, 0.13, 0.15), shards(1.5, 14, 0.9, -0.13, 0.15)],
      // 6: Knospenfeld
      [
        { at: 0, type: 'bud', pattern: 'line', count: 6, every: 0.6, x: -0.8, dx: 0.32, speed: 2.4 },
        { at: 2, type: 'prism', pattern: 'hover', count: 2, every: 0.6, x: -0.3, dx: 0.6, stopY: 0.7, hold: 9 },
      ],
      // 7: alles zusammen
      [
        { at: 0, type: 'prism', pattern: 'hover', count: 3, every: 0.4, x: -0.6, dx: 0.6, stopY: 0.65, hold: 11 },
        shards(1.5, 12, 0, 0, 0.2),
        { at: 3, type: 'bud', pattern: 'line', count: 4, every: 0.8, x: -0.6, dx: 0.4, speed: 2.4 },
      ],
      // 8: letzte Welle vor dem Schwarm
      [
        { at: 0, type: 'prism', pattern: 'hover', count: 5, every: 0.25, x: -0.8, dx: 0.4, stopY: 0.7, hold: 12 },
        { at: 1.5, type: 'bud', pattern: 'line', count: 5, every: 0.7, x: -0.6, dx: 0.3, speed: 2.4 },
        shards(4, 16, -0.8, 0.1, 0.15),
      ],
    ],
  },
  {
    name: 'SEKTOR 7',
    subtitle: 'DER EREIGNISHORIZONT',
    boss: 'singularity',
    bossName: 'SINGULARITÄT',
    waves: [
      // 1: Minenfeld
      [mines(0, 4), mines(3, 4, 0.6, -0.4)],
      // 2: Schattenjäger
      [
        { at: 0, type: 'stalker', pattern: 'hover', count: 4, every: 0.5, x: -0.6, dx: 0.4, stopY: 0.6, hold: 9, amp: 4 },
        mines(3, 3, -0.4, 0.4),
      ],
      // 3: Leerenaugen beobachten
      [
        { at: 0, type: 'voideye', pattern: 'hover', count: 2, every: 0.6, x: -0.5, dx: 1, stopY: 0.7, hold: 11 },
        { at: 2, type: 'stalker', pattern: 'hover', count: 3, every: 0.5, x: -0.4, dx: 0.4, stopY: 0.4, hold: 8, amp: 3 },
      ],
      // 4: Sog und Schatten
      [
        mines(0, 6, -0.8, 0.32, 0.6),
        { at: 2, type: 'stalker', pattern: 'swoop', count: 6, every: 0.35, side: 1 },
      ],
      // 5: Augenwall
      [
        { at: 0, type: 'voideye', pattern: 'hover', count: 4, every: 0.4, x: -0.75, dx: 0.5, stopY: 0.7, hold: 12 },
        mines(3, 4, -0.5, 0.33),
      ],
      // 6: Schattenschwarm
      [
        { at: 0, type: 'stalker', pattern: 'hover', count: 6, every: 0.3, x: -0.8, dx: 0.32, stopY: 0.55, hold: 10, amp: 3 },
        { at: 3, type: 'stalker', pattern: 'swoop', count: 6, every: 0.3, side: -1 },
      ],
      // 7: alles zusammen
      [
        { at: 0, type: 'voideye', pattern: 'hover', count: 2, every: 0.6, x: -0.6, dx: 1.2, stopY: 0.75, hold: 12 },
        mines(1.5, 5, -0.6, 0.3, 0.7),
        { at: 3, type: 'stalker', pattern: 'hover', count: 4, every: 0.4, x: -0.45, dx: 0.3, stopY: 0.45, hold: 9, amp: 3 },
      ],
      // 8: letzte Welle vor der Singularität
      [
        { at: 0, type: 'voideye', pattern: 'hover', count: 3, every: 0.5, x: -0.7, dx: 0.7, stopY: 0.75, hold: 13 },
        mines(1, 6, -0.8, 0.32, 0.6),
        { at: 4, type: 'stalker', pattern: 'swoop', count: 8, every: 0.25, side: 1 },
      ],
    ],
  },
  {
    name: 'SEKTOR 8',
    subtitle: 'DIE KOSMISCHE TIEFE',
    boss: 'leviathan',
    bossName: 'LEVIATHAN',
    waves: [
      // 1: Quallenschwarm
      [jellies(0, 5), jellies(3, 5, 0.6, -0.3)],
      // 2: Sternigel-Regen
      [
        { at: 0, type: 'urchin', pattern: 'line', count: 8, every: 0.5, x: -0.8, dx: 0.23, speed: 4.5 },
        jellies(2, 4, -0.4, 0.27),
      ],
      // 3: Anglerfische lauern
      [
        { at: 0, type: 'angler', pattern: 'lunge', count: 2, every: 0.8, x: -0.5, dx: 1, stopY: 0.55, hold: 12 },
        jellies(2, 4, -0.6, 0.4),
      ],
      // 4: Igel und Quallen
      [
        { at: 0, type: 'urchin', pattern: 'sine', count: 10, every: 0.35, x: 0, amp: 6, speed: 5 },
        jellies(2, 6, -0.75, 0.3, 0.5),
      ],
      // 5: Rudel
      [
        { at: 0, type: 'angler', pattern: 'lunge', count: 3, every: 0.6, x: -0.6, dx: 0.6, stopY: 0.6, hold: 13 },
        { at: 3, type: 'urchin', pattern: 'line', count: 6, every: 0.4, x: 0.7, dx: -0.28, speed: 5 },
      ],
      // 6: Quallenblüte
      [jellies(0, 8, -0.85, 0.24, 0.35), jellies(2.5, 8, 0.85, -0.24, 0.35)],
      // 7: alles zusammen
      [
        { at: 0, type: 'angler', pattern: 'lunge', count: 2, every: 0.8, x: -0.5, dx: 1, stopY: 0.65, hold: 13 },
        jellies(1.5, 6, -0.6, 0.24),
        { at: 4, type: 'urchin', pattern: 'sine', count: 8, every: 0.35, x: 0, amp: 7, speed: 5 },
      ],
      // 8: letzte Welle vor dem Leviathan
      [
        { at: 0, type: 'angler', pattern: 'lunge', count: 4, every: 0.5, x: -0.75, dx: 0.5, stopY: 0.6, hold: 14 },
        jellies(2, 6, -0.7, 0.28, 0.4),
        { at: 5, type: 'urchin', pattern: 'line', count: 10, every: 0.3, x: -0.9, dx: 0.2, speed: 5.5 },
      ],
    ],
  },
];

/** Ein Schritt im Ablauf: eine Welle oder ein Endgegner. */
type Entry = { kind: 'wave'; sector: number; groups: SpawnGroup[] } | { kind: 'boss'; sector: number; boss: BossId; name: string };

const ENTRIES: Entry[] = SECTORS.flatMap((s, sector): Entry[] => {
  const list: Entry[] = [];
  s.waves.forEach((groups, i) => {
    list.push({ kind: 'wave', sector, groups });
    if (s.midBoss && i + 1 === s.midBoss.after) list.push({ kind: 'boss', sector, boss: s.midBoss.boss, name: s.midBoss.name });
  });
  list.push({ kind: 'boss', sector, boss: s.boss, name: s.bossName });
  return list;
});

/** Anzahl normaler Wellen pro Runde durch alle Sektoren. */
const WAVES_PER_LOOP = SECTORS.reduce((n, s) => n + s.waves.length, 0);

const INTERMISSION = 2.5;

export type SpawnFn = (type: EnemyTypeId, pattern: PatternId, params: PatternParams, diff: Difficulty) => void;

export interface WaveEvents {
  spawn: SpawnFn;
  waveStart(number: number, loop: number): void;
  /** Ein neuer Sektor beginnt (Banner, Nebelfarben, Musik). */
  sectorStart(sector: number, loop: number): void;
  bossStart(boss: BossId, name: string): void;
  waveCleared(): void;
  /**
   * Alle Sektoren geschafft. Gibt true zurück, wenn stattdessen die Stufe (loop) steigen soll,
   * false, wenn die Spiellogik selbst härter macht (nächster Schwierigkeitsgrad).
   */
  campaignComplete(): boolean;
}

/** Fortschritt für einen Spielstand. */
export interface WaveProgress {
  entry: number;
  waveNumber: number;
  loop: number;
}

/** Spielt Wellen und Endgegner aller Sektoren nacheinander ab. Danach beginnt eine neue, härtere Runde. */
export class WaveDirector {
  /** Fortlaufende Wellennummer ab 1. */
  number = 0;
  /** Runde durch alle Sektoren, ab 0. Bestimmt die Schwierigkeit. */
  loop = 0;
  sector = -1;
  private index = -1;
  private time = 0;
  private spawned: number[] = [];
  private intermission = 1.5;
  private running = false;
  private bossRunning = false;

  constructor(private readonly events: WaveEvents) {
    this.reset();
  }

  /** Faktor des gewählten Schwierigkeitsgrads auf die Lebenspunkte aller Gegner. */
  hpMul = 1;

  get difficulty(): Difficulty {
    return { hp: (1 + this.loop * 0.5) * this.hpMul, fireRate: 1 + this.loop * 0.25, speed: 1 + this.loop * 0.08 };
  }

  reset(): void {
    // Zum Testen: ?wave=12 startet bei Welle 12, ?boss=2 direkt beim zweiten Endgegner (?boss allein = erster)
    const params = new URLSearchParams(location.search);
    const start = Math.max(1, Math.floor(Number(params.get('wave') ?? 1)) || 1) - 1;
    this.loop = Math.floor(start / WAVES_PER_LOOP);
    this.number = start;
    this.index = this.entryOfWave(start % WAVES_PER_LOOP) - 1;
    if (params.has('boss')) {
      // ?boss=N: N-ter Endgegner in der Ablaufliste (Zwischenbosse mitgezählt)
      const bosses = ENTRIES.map((e, i) => (e.kind === 'boss' ? i : -1)).filter((i) => i >= 0);
      const n = clamp(Math.floor(Number(params.get('boss') || 1)) || 1, 1, bosses.length);
      this.index = bosses[n - 1] - 1;
      this.number = ENTRIES.slice(0, bosses[n - 1]).filter((e) => e.kind === 'wave').length;
    }
    this.sector = -1;
    this.running = false;
    this.bossRunning = false;
    this.intermission = 1.5;
  }

  /** Position der n-ten normalen Welle (ab 0) in der Ablaufliste. */
  private entryOfWave(n: number): number {
    let seen = 0;
    for (let i = 0; i < ENTRIES.length; i++) {
      if (ENTRIES[i].kind !== 'wave') continue;
      if (seen++ === n) return i;
    }
    return 0;
  }

  /**
   * Wo ein Spielstand weitermachen soll: mitten in einer Welle oder einem Bosskampf an deren Anfang,
   * zwischen zwei Einträgen am nächsten.
   */
  progress(): WaveProgress {
    if (this.running) return { entry: this.index, waveNumber: this.number - 1, loop: this.loop };
    if (this.bossRunning) return { entry: this.index, waveNumber: this.number, loop: this.loop };
    return { entry: this.index + 1, waveNumber: this.number, loop: this.loop };
  }

  /** Spielstand übernehmen: der nächste gestartete Eintrag ist progress.entry. */
  restore(p: WaveProgress): void {
    this.index = p.entry - 1;
    this.number = p.waveNumber;
    this.loop = p.loop;
    this.sector = -1;
    this.running = false;
    this.bossRunning = false;
    this.intermission = 1.5;
  }

  /** Automatischer Name für einen Spielstand. */
  static label(p: WaveProgress): string {
    const e = ENTRIES[p.entry % ENTRIES.length];
    const s = SECTORS[e.sector];
    const what = e.kind === 'boss' ? e.name : `WELLE ${p.waveNumber + 1}`;
    return `${s.name} · ${s.subtitle} — ${what}`;
  }

  /** Kommt als Nächstes ein Endgegner? */
  get nextIsBoss(): boolean {
    return ENTRIES[(this.index + 1) % ENTRIES.length].kind === 'boss';
  }

  /** Von der Spiellogik aufgerufen, wenn der Endgegner zerstört ist. */
  finishBoss(): void {
    this.bossRunning = false;
    this.running = false;
    this.intermission = 4;
  }

  update(dt: number, aliveEnemies: number): void {
    if (this.bossRunning) return;
    if (!this.running) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.startNext();
      return;
    }

    this.time += dt;
    const entry = ENTRIES[this.index];
    if (entry.kind !== 'wave') return;
    let allSpawned = true;
    entry.groups.forEach((g, gi) => {
      while (this.spawned[gi] < g.count && this.time >= g.at + this.spawned[gi] * g.every) {
        this.spawnFrom(g, this.spawned[gi]);
        this.spawned[gi]++;
      }
      if (this.spawned[gi] < g.count) allSpawned = false;
    });

    if (allSpawned && aliveEnemies === 0) {
      this.running = false;
      this.intermission = INTERMISSION;
      this.events.waveCleared();
    }
  }

  private startNext(): void {
    this.index++;
    if (this.index >= ENTRIES.length) {
      this.index = 0;
      if (this.events.campaignComplete()) this.loop++;
    }
    const entry = ENTRIES[this.index];
    if (entry.sector !== this.sector) {
      this.sector = entry.sector;
      this.events.sectorStart(entry.sector, this.loop);
    }
    if (entry.kind === 'boss') {
      this.bossRunning = true;
      this.events.bossStart(entry.boss, entry.name);
      return;
    }
    this.number++;
    this.time = 0;
    this.spawned = entry.groups.map(() => 0);
    this.running = true;
    this.events.waveStart(this.number, this.loop);
  }

  private spawnFrom(g: SpawnGroup, i: number): void {
    // Formationen bleiben auf breiten Bildschirmen im mittleren Bereich
    const fw = Math.min(FIELD.halfWidth - 2, 16);
    const params: PatternParams = {
      x: clamp(((g.x ?? 0) + (g.dx ?? 0) * i) * fw, -FIELD.halfWidth + 1.5, FIELD.halfWidth - 1.5),
      side: g.side ?? 1,
      speed: g.speed ?? 8,
      amp: g.amp ?? (g.pattern === 'hover' ? 3 : 0),
      freq: g.freq ?? (g.pattern === 'hover' ? 0.9 : 1.6),
      phase: i * 0.6,
      stopY: (g.stopY ?? 0.5) * FIELD.halfHeight,
      hold: g.hold ?? 6,
      hops: g.hops,
    };
    this.events.spawn(g.type, g.pattern, params, this.difficulty);
  }
}
