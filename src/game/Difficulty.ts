/** Schwierigkeitsgrad: wählt der Spieler auf dem Titelbildschirm. */
export interface DifficultySetting {
  name: string;
  /** Faktor auf die Lebenspunkte aller Gegner und Endgegner. */
  hp: number;
  /** Faktor auf die Geschwindigkeit gegnerischer Geschosse. */
  bullet: number;
  /** Faktor auf die Punkte, damit ein Highscore auf schwerer Stufe mehr zählt. */
  score: number;
  /** Farbe in der Auswahl (von grün nach rot). */
  color: string;
  description: string;
}

export const DIFFICULTIES: DifficultySetting[] = [
  { name: 'SEHR LEICHT', hp: 0.5, bullet: 0.8, score: 0.5, color: '#6aff9a', description: 'GEGNER HALB SO ZÄH · LANGSAME SCHÜSSE' },
  { name: 'LEICHT', hp: 1, bullet: 1, score: 1, color: '#bfff5a', description: 'ZUM KENNENLERNEN' },
  { name: 'NORMAL', hp: 2, bullet: 1.1, score: 1.5, color: '#ffe24a', description: 'GEGNER DOPPELT SO ZÄH' },
  { name: 'SCHWER', hp: 3, bullet: 1.2, score: 2, color: '#ffa83a', description: 'GEGNER DREIMAL SO ZÄH · SCHNELLERE SCHÜSSE' },
  { name: 'UNMÖGLICH', hp: 5, bullet: 1.3, score: 3, color: '#ff4a5a', description: 'VIEL GLÜCK.' },
];

/** Voreinstellung: Leicht (entspricht dem ursprünglichen Balancing). */
export const DEFAULT_DIFFICULTY = 1;

const STORAGE_KEY = 'galaxy.difficulty';

export function loadDifficulty(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isInteger(v) && v >= 0 && v < DIFFICULTIES.length && localStorage.getItem(STORAGE_KEY) !== null) return v;
  } catch {
    // Standard behalten
  }
  return DEFAULT_DIFFICULTY;
}

export function saveDifficulty(index: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    // ignorieren
  }
}
