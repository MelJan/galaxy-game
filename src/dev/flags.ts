/**
 * Test-Schalter über die URL, z. B. http://localhost:5180/?boss&god&bosshp=0.05
 * - wave=N    bei Welle N starten
 * - boss      direkt beim Endgegner starten
 * - god       Spieler nimmt keinen Schaden
 * - bosshp=X  Lebenspunkte des Endgegners mit X multiplizieren
 * - shop      Werft gleich zu Beginn öffnen
 * - gold=N    mit N Gold starten
 * - diff=N    Schwierigkeitsgrad 0 (sehr leicht) bis 4 (unmöglich)
 * - bot[=S]    Autopilot fliegt Spieler 1, S = Können 0..1 (Standard 1); mit god zählt er Treffer statt Schaden
 * - turbo=N   N Spielschritte pro Bild (Zeitraffer für Testläufe)
 * Jeder dieser Schalter überspringt den Titelbildschirm.
 */
// Nur im Entwicklungsserver aktiv: im fertigen Spiel (npm run build) haben URL-Parameter keine Wirkung
const params = new URLSearchParams(import.meta.env.DEV && typeof location !== 'undefined' ? location.search : '');

export const DEV = {
  god: params.has('god'),
  bossHp: Number(params.get('bosshp') ?? 1) || 1,
  shop: params.has('shop'),
  gold: Math.max(0, Number(params.get('gold') ?? 0) || 0),
  difficulty: params.has('diff') ? Math.max(0, Math.min(4, Math.floor(Number(params.get('diff'))) || 0)) : null,
  /** Startwelle (1-basiert) oder null. */
  wave: params.has('wave') ? Math.max(1, Math.floor(Number(params.get('wave'))) || 1) : null,
  /** N-ter Endgegner (1-basiert) oder null. */
  boss: params.has('boss') ? Math.max(1, Math.floor(Number(params.get('boss') || 1)) || 1) : null,
  /** ?players=2: Zweispieler-Modus. */
  players: params.get('players') === '2' ? 2 : 1,
  bot: params.has('bot'),
  botSkill: Math.max(0, Math.min(1, Number(params.get('bot') || 1))),
  turbo: Math.max(1, Math.min(16, Math.floor(Number(params.get('turbo') ?? 1)) || 1)),
  skipTitle: ['wave', 'boss', 'god', 'bosshp', 'shop', 'gold', 'diff', 'players', 'bot'].some((k) => params.has(k)),
};
