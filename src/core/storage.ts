/**
 * Einziger Zugriff auf dauerhaften Speicher (Spielstände, Einstellungen).
 * Heute steckt localStorage dahinter. Für eine Desktop-Version (z. B. Electron mit Steam Cloud) wird nur diese
 * Datei gegen Dateizugriffe getauscht; der Rest des Spiels bleibt unverändert.
 * Alle Schlüssel bekommen das Präfix „galaxy.“.
 */
const PREFIX = 'galaxy.';

function backend(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Zugriff verweigert (z. B. blockierte Website-Daten)
    return null;
  }
}

export const storage = {
  get(key: string): string | null {
    try {
      return backend()?.getItem(PREFIX + key) ?? null;
    } catch {
      return null;
    }
  },

  /** Gibt false zurück, wenn nicht gespeichert werden konnte (voll oder gesperrt). */
  set(key: string, value: string): boolean {
    try {
      const b = backend();
      if (!b) return false;
      b.setItem(PREFIX + key, value);
      return true;
    } catch {
      return false;
    }
  },

  getJSON<T>(key: string): T | null {
    const raw = this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setJSON(key: string, value: unknown): boolean {
    return this.set(key, JSON.stringify(value));
  },
};
