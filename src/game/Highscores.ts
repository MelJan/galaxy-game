import { storage } from '../core/storage';

const STORAGE_KEY = 'highscores';

/**
 * Bester Score je Schwierigkeitsgrad (stabile ID, z. B. „very-easy“). Ein Durchlauf zählt für die Stufe, auf der er
 * begonnen hat, auch wenn er nach dem Durchspielen auf schwereren Stufen weiterläuft.
 */
export function loadHighscores(): Record<string, number> {
  const raw = storage.getJSON<Record<string, unknown>>(STORAGE_KEY);
  const scores: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) scores[id] = Math.floor(v);
  }
  return scores;
}

export function highscore(difficulty: string): number {
  return loadHighscores()[difficulty] ?? 0;
}

/** Score eintragen. true, wenn er den bisherigen Rekord dieser Stufe schlägt. */
export function submitHighscore(difficulty: string, score: number): boolean {
  const scores = loadHighscores();
  if (score <= (scores[difficulty] ?? 0)) return false;
  scores[difficulty] = Math.floor(score);
  storage.setJSON(STORAGE_KEY, scores);
  return true;
}
