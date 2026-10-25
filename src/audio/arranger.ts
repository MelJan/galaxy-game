import type { Song } from './music';

/**
 * Arrangeur: macht aus einem 4-Takt-Stück eine abwechslungsreiche Abfolge von Abschnitten.
 * Jeder Abschnitt (4 Takte) schaltet Ebenen an und aus, stellt Akkorde um, variiert oder improvisiert die Melodie,
 * transponiert oder baut Spannung auf. Die Musik reagiert außerdem auf die Spielintensität.
 */

export type LeadMode = 'off' | 'main' | 'high' | 'var' | 'improv';
export type DrumMode = 'off' | 'normal' | 'busy' | 'build';

export interface Section {
  name: string;
  drums: DrumMode;
  /** full = Bass der Stilvorlage, pedal = nur langer Grundton pro Takt. */
  bass: 'full' | 'pedal';
  /** Arpeggio und Begleitfiguren der Stilvorlage. */
  harm: boolean;
  lead: LeadMode;
  /** Lautstärke der Melodie (1 = normal). */
  leadVol: number;
  /** Zusätzliche Gegenstimme in Vierteln. */
  counter: boolean;
  /** Weiche Fläche über die Akkorde. */
  pad: boolean;
  /** Akkordfolge umgestellt. */
  alt: boolean;
  /** Reihenfolge der Akkordtöne im Arpeggio. */
  arp: number[];
  /** Halbtöne Transposition (Rückung im Finale). */
  transpose: number;
  /** Trommelwirbel am Ende des vierten Takts. */
  fill: boolean;
  /** Tiefpass-Filter auf der Musik: Start- und Endfrequenz über den Abschnitt. */
  filter: [number, number];
}

const base: Section = {
  name: 'A',
  drums: 'normal',
  bass: 'full',
  harm: true,
  lead: 'main',
  leadVol: 1,
  counter: false,
  pad: false,
  alt: false,
  arp: [0, 1, 2, 3],
  transpose: 0,
  fill: false,
  filter: [18000, 18000],
};
const sec = (over: Partial<Section>): Section => ({ ...base, ...over });

export const SECTIONS: Record<string, Section> = {
  intro: sec({ name: 'intro', drums: 'off', bass: 'pedal', lead: 'off', pad: true, filter: [600, 5000] }),
  A: sec({ name: 'A' }),
  A2: sec({ name: 'A2', counter: true, fill: true }),
  B: sec({ name: 'B', alt: true, lead: 'var', arp: [3, 2, 1, 0], fill: true }),
  B2: sec({ name: 'B2', alt: true, lead: 'improv', drums: 'busy', counter: true, arp: [0, 2, 1, 3], fill: true }),
  break: sec({ name: 'break', drums: 'off', bass: 'pedal', harm: false, lead: 'high', leadVol: 0.7, pad: true, filter: [2200, 2200] }),
  build: sec({ name: 'build', drums: 'build', lead: 'off', counter: true, filter: [500, 18000] }),
  A3: sec({ name: 'A3', drums: 'busy', lead: 'high', counter: true, transpose: 2, fill: true }),
  A3b: sec({ name: 'A3b', drums: 'busy', lead: 'improv', counter: true, alt: true, transpose: 2, arp: [3, 1, 2, 0], fill: true }),
  calm: sec({ name: 'calm', drums: 'off', bass: 'pedal', lead: 'var', leadVol: 0.75, pad: true, filter: [3000, 3000] }),
};

/** Ablauf in einem Sektor: ruhiger Einstieg, Steigerung, Breakdown, Aufbau, Finale – dann von A an wiederholen. */
export const SECTOR_PLAN = ['intro', 'A', 'A2', 'B', 'B2', 'break', 'build', 'A3', 'A3b'];
/** Ablauf im Bosskampf: ohne ruhige Teile. */
export const BOSS_PLAN = ['A', 'A2', 'B', 'build', 'A3', 'B2', 'A3b'];

/** Kleiner deterministischer Zufallsgenerator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Umgestellte Akkordfolge für B-Teile. */
const ALT_ORDER = [2, 0, 3, 1];

export function chordAt(song: Song, bar: number, s: Section): number[] {
  return song.chords[s.alt ? ALT_ORDER[bar] : bar].map((n) => n + s.transpose);
}

export function rootAt(song: Song, bar: number, s: Section): number {
  return song.bassRoots[s.alt ? ALT_ORDER[bar] : bar] + s.transpose;
}

/** Nächster Akkordton (in beliebiger Oktave) zu einer Zieltonhöhe. */
function snap(target: number, chord: number[]): number {
  let best = target;
  let bestD = Infinity;
  for (const c of chord) {
    for (let o = -3; o <= 3; o++) {
      const n = c + o * 12;
      const d = Math.abs(n - target);
      if (d < bestD) [best, bestD] = [n, d];
    }
  }
  return best;
}

/** Rhythmus-Vorlagen für improvisierte Takte (Notenlängen in Sechzehnteln, Summe 16). */
const RHYTHMS = [
  [4, 4, 4, 4],
  [2, 2, 4, 2, 2, 4],
  [3, 3, 2, 4, 4],
  [6, 2, 4, 4],
  [2, 2, 2, 2, 8],
  [4, 2, 2, 6, 2],
  [8, 4, 4],
  [2, 4, 2, 4, 4],
];

/** Melodie für einen Abschnitt erzeugen: [Schritt, MIDI-Note, Länge]. */
export function buildLead(song: Song, s: Section, seed: number): [number, number, number][] {
  const main = song.melody;
  const center = main.reduce((n, [, note]) => n + note, 0) / Math.max(1, main.length);
  const t = s.transpose;
  switch (s.lead) {
    case 'off':
      return [];
    case 'main':
      return main.map(([at, n, len]) => [at, n + t, len]);
    case 'high':
      return main.map(([at, n, len]) => [at, n + t + (n + 12 > 92 ? 0 : 12), len]);
    case 'var': {
      // Gleicher Rhythmus, Tonhöhen verschoben und auf die (ggf. umgestellten) Akkorde eingerastet
      const r = rng(seed);
      const offsets = [0, 2, -3, 4, -1, 3, -2, 5].map((o) => (r() < 0.3 ? -o : o));
      return main.map(([at, n, len], i) => [at, snap(n + t + offsets[i % offsets.length], chordAt(song, Math.floor(at / 16), s)), len]);
    }
    case 'improv': {
      // Zufallsweg über die Akkordtöne mit wechselnden Rhythmen
      const r = rng(seed);
      const out: [number, number, number][] = [];
      let pitch = Math.round(center);
      for (let bar = 0; bar < 4; bar++) {
        const rhythm = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
        const chord = chordAt(song, bar, s);
        let at = bar * 16;
        for (const len of rhythm) {
          // Pausen gelegentlich, sonst ein Schritt nach oben oder unten, zurück zur Mitte gezogen
          if (r() < 0.12) {
            at += len;
            continue;
          }
          const pull = (center - pitch) * 0.25;
          pitch = snap(pitch + Math.round((r() - 0.5) * 9 + pull), chord);
          out.push([at, pitch, len]);
          at += len;
        }
      }
      return out;
    }
  }
}
