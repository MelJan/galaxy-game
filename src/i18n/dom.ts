import { getLang, t } from '.';

/** Ursprünglicher (deutscher) Inhalt jedes übersetzten Textknotens. */
const originals = new WeakMap<Text, string>();

/**
 * Feste Texte aus index.html übersetzen: alle Textknoten in Elementen mit data-i18n.
 * Jeder Textknoten ist ein eigener Schlüssel, Zeilenumbrüche und Markup bleiben erhalten.
 */
export function translateDom(): void {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      let original = originals.get(node);
      if (original === undefined) {
        if (!node.data.trim()) continue;
        original = node.data;
        originals.set(node, original);
      }
      const core = original.trim().replace(/\s+/g, ' ');
      node.data = original.replace(original.trim(), t(core));
    }
  }
  document.documentElement.lang = getLang();
}
