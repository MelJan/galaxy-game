import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSlots, migrate, SAVE_VERSION, writeSlot, type SaveData } from './SaveGame';
import { SECTORS, WaveDirector } from './Waves';

/** Einfacher localStorage-Ersatz für die Tests. */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

/**
 * Echter Spielstand aus Version 1 (so von der Spielversion vom 21.10.2026 geschrieben).
 * Nie ändern: Er prüft, dass alte Spielstände auch nach künftigen Updates noch laden.
 */
const V1_SAVE = {
  version: 1,
  savedAt: '2026-10-21T08:02:16.593Z',
  label: 'SEKTOR 2 · DER SCHWARM — WELLE 13',
  difficulty: 2,
  loop: 0,
  entry: 13,
  waveNumber: 12,
  score: 0,
  gold: 310,
  hull: 5,
  upgrades: { fireRate: 1, guns: 1 },
};

describe('stabile Positionen im Ablauf', () => {
  it('jede Position führt zum selben Eintrag zurück', () => {
    // Bis zum Ende der Liste durchgehen (die Liste hat genau so viele Einträge, wie positionOf eindeutig unterscheidet)
    const seen = new Set<string>();
    for (let entry = 0; ; entry++) {
      const pos = WaveDirector.positionOf(entry);
      const key = JSON.stringify(pos);
      if (seen.has(key)) break;
      seen.add(key);
      expect(WaveDirector.entryOf(pos)).toBe(entry);
    }
    // Alle Sektoren mit Wellen, Endgegnern und Zwischenbossen
    expect(seen.size).toBe(SECTORS.reduce((n, s) => n + s.waves.length + 1 + (s.midBosses?.length ?? 0), 0));
  });

  it('fehlende Welle oder fehlender Sektor führen zu einem sinnvollen Ersatz', () => {
    const lastSwarmWave = WaveDirector.entryOf({ sector: 'swarm', wave: SECTORS[1].waves.length - 1 });
    expect(WaveDirector.entryOf({ sector: 'swarm', wave: 999 })).toBe(lastSwarmWave);
    expect(WaveDirector.entryOf({ sector: 'gibt-es-nicht', wave: 0 })).toBe(0);
    const queen = WaveDirector.entryOf({ sector: 'swarm', boss: 'queen' });
    // Unbekannter Boss im Sektor: dessen letzter Eintrag (der Endgegner)
    expect(WaveDirector.entryOf({ sector: 'swarm', boss: 'gibt-es-nicht' as never })).toBe(queen);
  });
});

describe('Migration', () => {
  it('Version 1 wird in das aktuelle Format umgewandelt', () => {
    const save = migrate(V1_SAVE)!;
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.position).toEqual({ sector: 'swarm', wave: 2 });
    expect(save.difficulty).toBe('normal');
    expect(save.gold).toBe(310);
    expect(save.waveNumber).toBe(12);
    expect(save.upgrades).toEqual({ fireRate: 1, guns: 1 });
    expect('entry' in save).toBe(false);
    // Der Name passt weiterhin zur Position
    expect(WaveDirector.label({ entry: WaveDirector.entryOf(save.position), waveNumber: save.waveNumber, loop: 0 })).toBe(V1_SAVE.label);
  });

  it('kaputte, leere und neuere Formate werden nicht geladen', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate('kaputt')).toBeNull();
    expect(migrate({ version: 99, position: { sector: 'swarm', wave: 0 } })).toBeNull();
    expect(migrate({ version: 2 })).toBeNull();
  });

  it('fehlende Felder bekommen Standardwerte', () => {
    const save = migrate({ version: 2, position: { sector: 'deep', boss: 'leviathan' } })!;
    expect(save.difficulty).toBe('easy');
    expect(save.gold).toBe(0);
    expect(save.hull).toBe(5);
    expect(save.upgrades).toEqual({});
    // Stände vor dem Koop-Update laden als Einzelspieler
    expect(save.players).toBe(1);
    expect(save.hull2).toBe(5);
  });
});

describe('Speicherplätze', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));

  it('Speichern und Laden ergibt denselben Spielstand', () => {
    const save: SaveData = {
      version: 2,
      savedAt: '2026-10-21T10:00:00.000Z',
      label: 'SEKTOR 7 · DER EREIGNISHORIZONT — SINGULARITÄT',
      difficulty: 'hard',
      loop: 0,
      position: { sector: 'void', boss: 'singularity' },
      waveNumber: 58,
      score: 1234567,
      gold: 999,
      hull: 7,
      upgrades: { hull: 2, drones: 1 },
      players: 2,
      hull2: 4,
    };
    expect(writeSlot(3, save)).toBe(true);
    const slots = loadSlots();
    expect(slots[3]).toEqual(save);
    expect(slots.filter(Boolean)).toHaveLength(1);
  });

  it('ein Slot aus einer neueren Version bleibt beim Speichern in andere Slots erhalten', () => {
    const future = { version: 99, irgendwas: true };
    localStorage.setItem('galaxy.saves', JSON.stringify([future]));
    expect(loadSlots()[0]).toBeNull();
    writeSlot(1, migrate(V1_SAVE)!);
    expect(JSON.parse(localStorage.getItem('galaxy.saves')!)[0]).toEqual(future);
  });

  it('alte v1-Slots im Speicher laden als v2', () => {
    localStorage.setItem('galaxy.saves', JSON.stringify([V1_SAVE]));
    expect(loadSlots()[0]?.position).toEqual({ sector: 'swarm', wave: 2 });
  });
});
