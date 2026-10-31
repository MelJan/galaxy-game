import { storage } from '../core/storage';
import { DIFFICULTIES, difficultyIndex } from './Difficulty';
import type { UpgradeId } from './Upgrades';
import { WaveDirector, type SavePosition } from './Waves';

/**
 * Spielstand, aktuelles Format (Version 2). Gespeichert wird immer der Anfang einer Welle oder eines Endgegners.
 *
 * Regeln für Updates, damit alte Spielstände weiter funktionieren:
 * - Nur stabile IDs speichern (Sektor-, Boss-, Schwierigkeits-, Upgrade-IDs), keine Listenpositionen.
 * - Bei jeder Formatänderung SAVE_VERSION erhöhen und in migrate() einen Schritt von der alten Version ergänzen.
 * - Felder nie ersatzlos streichen; neue Felder bekommen in migrate() einen Standardwert.
 * - Für jede Version einen echten Beispiel-Spielstand in den Tests behalten (src/game/SaveGame.test.ts).
 */
export interface SaveData {
  version: 2;
  /** ISO-Zeitstempel. */
  savedAt: string;
  /** Automatischer Name, z. B. „SEKTOR 2 · DER SCHWARM — WELLE 14“. */
  label: string;
  /** ID des Schwierigkeitsgrads, z. B. „normal“. */
  difficulty: string;
  /** Stufe auf Unmöglich (Runden nach dem höchsten Schwierigkeitsgrad). */
  loop: number;
  /** Womit es weitergeht. */
  position: SavePosition;
  /** Fortlaufende Wellennummer vor dieser Position (für Anzeige und Punkte). */
  waveNumber: number;
  score: number;
  gold: number;
  hull: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  /** 1 oder 2 Spieler (ab Koop-Update; fehlt in älteren Ständen → 1). */
  players: number;
  /** Hülle von Spieler 2. */
  hull2: number;
  /** ID der Stufe, auf der der Durchlauf begonnen hat (für den Highscore; fehlt in älteren Ständen → difficulty). */
  startDifficulty: string;
}

export const SAVE_VERSION = 2;
export const SLOT_COUNT = 10;
const STORAGE_KEY = 'saves';

/** Version 1: Position als Index in der damaligen Ablaufliste, Schwierigkeit als Index. */
interface SaveDataV1 {
  version: 1;
  savedAt: string;
  label: string;
  difficulty: number;
  loop: number;
  entry: number;
  waveNumber: number;
  score: number;
  gold: number;
  hull: number;
  upgrades: Partial<Record<UpgradeId, number>>;
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Beliebigen gespeicherten Rohwert in das aktuelle Format bringen.
 * Gibt null zurück für leere, kaputte oder aus einer neueren Spielversion stammende Slots.
 */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  let data = raw as { version?: unknown };

  if (data.version === 1) {
    // v1 → v2: Index der Ablaufliste in stabile Position umrechnen. v1 gab es nur mit dem heutigen Ablauf
    // (Sektoren 1–8 ohne spätere Einschübe), deshalb ist die Umrechnung über die aktuelle Liste eindeutig.
    const v1 = data as SaveDataV1;
    const diff = difficultyIndex(v1.difficulty) ?? 1;
    data = {
      ...v1,
      version: 2,
      difficulty: DIFFICULTIES[diff].id,
      position: WaveDirector.positionOf(num(v1.entry, 0)),
      entry: undefined,
    } as unknown as SaveData;
  }

  if (data.version !== 2) return null;
  const v2 = data as Partial<SaveData>;
  if (!v2.position || typeof v2.position !== 'object' || typeof v2.position.sector !== 'string') return null;
  const difficulty = difficultyIndex(v2.difficulty) !== null ? DIFFICULTIES[difficultyIndex(v2.difficulty)!].id : 'easy';
  return {
    version: 2,
    savedAt: typeof v2.savedAt === 'string' ? v2.savedAt : new Date(0).toISOString(),
    label: typeof v2.label === 'string' ? v2.label : WaveDirector.label({ entry: WaveDirector.entryOf(v2.position), waveNumber: 0, loop: 0 }),
    difficulty,
    loop: Math.max(0, Math.floor(num(v2.loop, 0))),
    position: v2.position,
    waveNumber: Math.max(0, Math.floor(num(v2.waveNumber, 0))),
    score: Math.max(0, Math.floor(num(v2.score, 0))),
    gold: Math.max(0, Math.floor(num(v2.gold, 0))),
    hull: Math.max(1, Math.floor(num(v2.hull, 5))),
    upgrades: v2.upgrades && typeof v2.upgrades === 'object' ? v2.upgrades : {},
    players: v2.players === 2 ? 2 : 1,
    hull2: Math.max(1, Math.floor(num(v2.hull2, num(v2.hull, 5)))),
    startDifficulty: difficultyIndex(v2.startDifficulty) !== null ? DIFFICULTIES[difficultyIndex(v2.startDifficulty)!].id : difficulty,
  };
}

/** Rohdaten aller Slots, unverändert (auch unbekannte Versionen bleiben so erhalten). */
function rawSlots(): unknown[] {
  const raw = storage.getJSON<unknown[]>(STORAGE_KEY);
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: SLOT_COUNT }, (_, i) => list[i] ?? null);
}

export function loadSlots(): (SaveData | null)[] {
  return rawSlots().map(migrate);
}

export function writeSlot(index: number, data: SaveData): boolean {
  const slots = rawSlots();
  slots[index] = data;
  return storage.setJSON(STORAGE_KEY, slots);
}

export function deleteSlot(index: number): void {
  const slots = rawSlots();
  slots[index] = null;
  storage.setJSON(STORAGE_KEY, slots);
}

export function hasSaves(): boolean {
  return loadSlots().some((s) => s !== null);
}

/** „21.10.2026 14:32“ */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
