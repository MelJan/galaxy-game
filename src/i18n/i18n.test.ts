import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../game/Difficulty';
import { UPGRADES } from '../game/Upgrades';
import { SECTORS } from '../game/Waves';
import { EN } from './en';
import { keyOf } from '.';

const translated = (de: string) => de === '' || EN[de] !== undefined || EN[keyOf(de)] !== undefined;

/** Quelltext aller Module (über Vite eingelesen, ohne Node-Typen). */
const SOURCES = import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

/** Alle Zeichenketten-Literale in t('…') sowie in Boss-Bannern und -Hinweisen (die Session übersetzt sie). */
function literalsInSource(): string[] {
  const found: string[] = [];
  const str = String.raw`'((?:[^'\\]|\\.)*)'`;
  const patterns = [
    new RegExp(String.raw`\bt\(${str}`, 'g'),
    new RegExp(String.raw`\bt\(\w+ === \d+ \? ${str} : ${str}`, 'g'),
    new RegExp(String.raw`events\.(?:banner|opening)\(${str}, ${str}`, 'g'),
    new RegExp(String.raw`this\.hint = \[${str}, ${str}\]`, 'g'),
  ];
  for (const code of Object.values(SOURCES)) {
    for (const re of patterns) for (const m of code.matchAll(re)) found.push(...m.slice(1).filter((s) => s !== undefined));
  }
  return found.map((s) => s.replace(/\\'/g, "'"));
}

describe('Englische Übersetzung', () => {
  it('deckt Sektoren, Endgegner, Schwierigkeitsgrade und Werft ab', () => {
    const texts = [
      ...SECTORS.flatMap((s) => [s.name, s.subtitle, s.bossName, ...(s.midBosses ?? []).map((m) => m.name)]),
      ...DIFFICULTIES.flatMap((d) => [d.name, d.description]),
      ...UPGRADES.flatMap((u) => [u.name, ...u.effects]),
    ];
    expect(texts.filter((s) => !translated(s))).toEqual([]);
  });

  it('deckt alle festen Texte im Code ab', () => {
    const literals = literalsInSource();
    expect(literals.length).toBeGreaterThan(50);
    expect(literals.filter((s) => !translated(s))).toEqual([]);
  });
});
