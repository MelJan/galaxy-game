/**
 * Test-Schalter über die URL, z. B. http://localhost:5180/?boss&god&bosshp=0.05
 * - wave=N    bei Welle N starten
 * - boss      direkt beim Endgegner starten
 * - god       Spieler nimmt keinen Schaden
 * - bosshp=X  Lebenspunkte des Endgegners mit X multiplizieren
 * - shop      Werft gleich zu Beginn öffnen
 * - gold=N    mit N Gold starten
 * - diff=N    Schwierigkeitsgrad 0 (sehr leicht) bis 4 (unmöglich)
 * Jeder dieser Schalter überspringt den Titelbildschirm.
 */
const params = new URLSearchParams(location.search);

export const DEV = {
  god: params.has('god'),
  bossHp: Number(params.get('bosshp') ?? 1) || 1,
  shop: params.has('shop'),
  gold: Math.max(0, Number(params.get('gold') ?? 0) || 0),
  difficulty: params.has('diff') ? Math.max(0, Math.min(4, Math.floor(Number(params.get('diff'))) || 0)) : null,
  skipTitle: ['wave', 'boss', 'god', 'bosshp', 'shop', 'gold', 'diff'].some((k) => params.has(k)),
};
