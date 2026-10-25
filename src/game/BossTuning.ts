import type { BossId } from './Waves';

/**
 * Feinabstimmung der Endgegner entlang der Kampagne: Faktoren auf Lebenspunkte (hp) und Angriffstempo (fire),
 * zusätzlich zu Schwierigkeitsgrad und Stufe. hp gilt nur für das, was zum Sieg zerstört werden muss (BossBase.hpMul),
 * nicht für nachwachsende oder störende Kleinteile.
 *
 * Ziel: Jeder Boss ist etwas schwerer als der vorige, die Angriffe werden langsam dichter, und die Lebenspunkte steigen,
 * weil der Spieler durch die Werft mehr Schaden macht. Die Faktoren sind bewusst gestaucht: Mit optimalem Einkauf
 * (Test-Autopilot ?bot) wären noch höhere Werte nötig, um die Kampfdauer konstant steigen zu lassen, aber dann sitzt
 * jeder, der weniger aufgerüstet hat, minutenlang an einem Boss. Richtwert ohne Upgrades auf Sehr leicht: höchstens
 * etwa eine Minute.
 * Bosse, deren Mechanik den Kampf ohnehin streckt (Stahlrakete, Leviathan, Sternencabrio, Odysseus), steigen weniger;
 * Bosse, die gegen Raketen und Begleitdrohnen schnell schmelzen (Kristallschwarm, Kosmograd, Staffel), mehr.
 */
export const BOSS_TUNING: Record<BossId, { hp: number; fire: number }> = {
  mothership: { hp: 1, fire: 0.85 },
  queen: { hp: 1.7, fire: 0.87 },
  ark: { hp: 1.3, fire: 0.89 },
  urschleim: { hp: 2.2, fire: 0.91 },
  rocket: { hp: 1.2, fire: 0.8 },
  fortress: { hp: 1.8, fire: 0.96 },
  shardswarm: { hp: 3.2, fire: 0.98 },
  singularity: { hp: 4.5, fire: 1 },
  leviathan: { hp: 1, fire: 1.02 },
  cabrio: { hp: 1.4, fire: 1.04 },
  kosmograd: { hp: 4, fire: 1.06 },
  unitas: { hp: 2.6, fire: 1.09 },
  squadron: { hp: 5.5, fire: 1.11 },
  odysseus: { hp: 2.2, fire: 1.13 },
  worldbreaker: { hp: 3.2, fire: 1.15 },
};
