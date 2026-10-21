import type { UpgradeId } from './Upgrades';

/** Ein Spielstand. Gespeichert wird immer der Anfang einer Welle oder eines Endgegners. */
export interface SaveData {
  version: 1;
  /** ISO-Zeitstempel. */
  savedAt: string;
  /** Automatischer Name, z. B. „SEKTOR 2 · DER SCHWARM — WELLE 14“. */
  label: string;
  difficulty: number;
  /** Stufe auf Unmöglich (Runden nach dem höchsten Schwierigkeitsgrad). */
  loop: number;
  /** Eintrag im Ablauf (Welle oder Endgegner), mit dem es weitergeht. */
  entry: number;
  /** Wellennummer vor diesem Eintrag. */
  waveNumber: number;
  score: number;
  gold: number;
  hull: number;
  upgrades: Partial<Record<UpgradeId, number>>;
}

export const SLOT_COUNT = 10;
const STORAGE_KEY = 'galaxy.saves';

export function loadSlots(): (SaveData | null)[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(raw)) {
      return Array.from({ length: SLOT_COUNT }, (_, i) => (raw[i] && raw[i].version === 1 ? (raw[i] as SaveData) : null));
    }
  } catch {
    // Kaputte oder fehlende Daten: leere Slots
  }
  return Array.from({ length: SLOT_COUNT }, () => null);
}

function storeSlots(slots: (SaveData | null)[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
    return true;
  } catch {
    return false;
  }
}

export function writeSlot(index: number, data: SaveData): boolean {
  const slots = loadSlots();
  slots[index] = data;
  return storeSlots(slots);
}

export function deleteSlot(index: number): void {
  const slots = loadSlots();
  slots[index] = null;
  storeSlots(slots);
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
