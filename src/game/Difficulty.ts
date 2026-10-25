import { storage } from '../core/storage';

/** Schwierigkeitsgrad: wählt der Spieler auf dem Titelbildschirm. */
export interface DifficultySetting {
  /** Stabile ID für Spielstände und Einstellungen (nie ändern). */
  id: string;
  name: string;
  /** Faktor auf die Lebenspunkte normaler Gegner. */
  hp: number;
  /** Faktor auf die Lebenspunkte der Endgegner. */
  bossHp: number;
  /** Faktor auf die Geschwindigkeit gegnerischer Geschosse. */
  bullet: number;
  /** Faktor auf das Angriffstempo der Endgegner. */
  bossFire: number;
  /** Faktor auf die Anzahl der Gegner je Welle (mindestens einer je Gruppe). */
  count: number;
  /** Faktor auf das Feuertempo normaler Gegner. */
  enemyFire: number;
  /** Faktor auf das Bewegungstempo von Gegnern und Endgegnern. */
  speed: number;
  /** Zusätzliche Hüllenpunkte. */
  hull: number;
  /** Exponent auf die Boss-Abstimmung (BossTuning): unter 1 steigen die Bosse über die Kampagne flacher an. */
  bossRamp: number;
  /** Faktor auf die Punkte, damit ein Highscore auf schwerer Stufe mehr zählt. */
  score: number;
  /** Farbe in der Auswahl (von grün nach rot). */
  color: string;
  description: string;
}

export const DIFFICULTIES: DifficultySetting[] = [
  // Sehr leicht ist für Kinder gedacht: so einfach wie möglich, ohne die Abläufe zu verändern
  {
    // hp 0.04: jeder normale Gegner fällt mit einem Treffer (Schaden 1); Bosse halten noch ein paar Sekunden
    id: 'very-easy', name: 'SEHR LEICHT', hp: 0.04, bossHp: 0.1, bullet: 0.65, bossFire: 0.5, count: 0.6, enemyFire: 0.6, speed: 0.85, hull: 3, bossRamp: 0.6,
    score: 0.5, color: '#6aff9a', description: 'FÜR KINDER · EIN TREFFER GENÜGT',
  },
  { id: 'easy', count: 1, enemyFire: 1, speed: 1, hull: 0, bossRamp: 1, name: 'LEICHT', hp: 1, bossHp: 1, bullet: 1, bossFire: 1, score: 1, color: '#bfff5a', description: 'ZUM KENNENLERNEN' },
  { id: 'normal', count: 1, enemyFire: 1, speed: 1, hull: 0, bossRamp: 1, name: 'NORMAL', hp: 2, bossHp: 2, bullet: 1.1, bossFire: 1.05, score: 1.5, color: '#ffe24a', description: 'GEGNER DOPPELT SO ZÄH' },
  { id: 'hard', count: 1, enemyFire: 1, speed: 1, hull: 0, bossRamp: 1, name: 'SCHWER', hp: 3, bossHp: 3, bullet: 1.2, bossFire: 1.15, score: 2, color: '#ffa83a', description: 'GEGNER DREIMAL SO ZÄH · SCHNELLERE SCHÜSSE' },
  { id: 'impossible', count: 1, enemyFire: 1, speed: 1, hull: 0, bossRamp: 1, name: 'UNMÖGLICH', hp: 5, bossHp: 5, bullet: 1.3, bossFire: 1.3, score: 3, color: '#ff4a5a', description: 'VIEL GLÜCK.' },
];

/** Voreinstellung: Leicht (entspricht dem ursprünglichen Balancing). */
export const DEFAULT_DIFFICULTY = 1;

const STORAGE_KEY = 'difficulty';

/** Index zu einer gespeicherten ID; ältere Stände speicherten den Index als Zahl. */
export function difficultyIndex(value: unknown): number | null {
  if (typeof value === 'string') {
    const i = DIFFICULTIES.findIndex((d) => d.id === value);
    if (i >= 0) return i;
    const n = Number(value);
    if (value !== '' && Number.isInteger(n) && n >= 0 && n < DIFFICULTIES.length) return n;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DIFFICULTIES.length) return value;
  return null;
}

export function loadDifficulty(): number {
  return difficultyIndex(storage.get(STORAGE_KEY)) ?? DEFAULT_DIFFICULTY;
}

export function saveDifficulty(index: number): void {
  storage.set(STORAGE_KEY, DIFFICULTIES[index].id);
}
