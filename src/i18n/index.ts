import { storage } from '../core/storage';
import { EN } from './en';

/**
 * Sprache des Spiels. Deutsch ist der Ausgangstext im Code; t() schlägt die englische Fassung in EN nach.
 *
 * Regeln für Schlüssel in EN:
 * - Schlüssel ist der deutsche Text, Ziffernfolgen darin als „#“ (aus „WELLE 5“ wird „WELLE #“). Die Zahlen werden
 *   in der Übersetzung der Reihe nach wieder für „#“ eingesetzt.
 * - {name} in Text und Übersetzung wird durch vars.name ersetzt (für eingesetzte Namen, die selbst übersetzt sind).
 * Fehlt eine Übersetzung, erscheint der deutsche Text (im Entwicklungsserver mit Warnung in der Konsole).
 */
export type Lang = 'de' | 'en';

const STORAGE_KEY = 'lang';
const listeners: (() => void)[] = [];

function initialLang(): Lang {
  const saved = storage.get(STORAGE_KEY);
  if (saved === 'de' || saved === 'en') return saved;
  // Erster Start: Browsersprache, Deutsch nur für deutschsprachige Browser
  const nav = typeof navigator === 'undefined' ? 'de' : navigator.language;
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let lang: Lang = initialLang();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  storage.set(STORAGE_KEY, next);
  for (const cb of listeners) cb();
}

/** Wird nach jedem Sprachwechsel aufgerufen (Texte neu setzen). */
export function onLangChange(cb: () => void): void {
  listeners.push(cb);
}

/** Schlüssel eines deutschen Texts in EN: Ziffernfolgen als „#“. */
export const keyOf = (de: string): string => de.replace(/\d+/g, '#');

const missing = new Set<string>();

export function t(de: string, vars?: Record<string, string | number>): string {
  let out = de;
  if (lang === 'en' && de) {
    // Genauer Treffer zuerst (Einzahl/Mehrzahl), sonst mit Ziffern als „#“
    const exact = EN[de];
    const en = exact ?? EN[keyOf(de)];
    if (exact !== undefined) out = exact;
    else if (en === undefined) {
      if (import.meta.env.DEV && !missing.has(de)) {
        missing.add(de);
        console.warn(`Übersetzung fehlt: "${keyOf(de)}"`);
      }
    } else {
      const nums = de.match(/\d+/g) ?? [];
      let i = 0;
      out = en.replace(/#/g, () => nums[i++] ?? '#');
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return out;
}

/** Nur für Tests im Entwicklungsserver: bisher fehlende Übersetzungen. */
export function missingTranslations(): string[] {
  return [...missing];
}
