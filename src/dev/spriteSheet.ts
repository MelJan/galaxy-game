// Entwickler-Vorschau aller Pixel-Sprites in Vergrößerung: http://localhost:5180/sprites.html
import { bankRight, flipHorizontal, renderPixelArt, type Palette } from '../gfx/pixel';
import {
  BANK_RATIO,
  BULLET_PALETTE,
  BULLET_ROWS,
  COIN_FRAMES,
  COIN_PALETTE,
  DRONE_ROWS,
  ENEMY_BULLET_PALETTE,
  ENEMY_BULLET_ROWS,
  ENEMY_PALETTE,
  FIGHTER_ROWS,
  FLAME_FRAMES,
  FLAME_PALETTE,
  SHIP_DARKEN,
  SHIP_PALETTE,
  SHIP_ROWS,
  HEAVY_ROWS,
} from '../gfx/sprites';

const SCALE = 5;
const sheet = document.getElementById('sheet')!;

function show(label: string, rows: string[], palette: Palette): void {
  const src = renderPixelArt(rows, palette);
  const canvas = document.createElement('canvas');
  canvas.width = src.width * SCALE;
  canvas.height = src.height * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  fig.append(canvas, cap);
  sheet.append(fig);
}

const banked = bankRight(SHIP_ROWS, BANK_RATIO, SHIP_DARKEN);
show('Schiff', SHIP_ROWS, SHIP_PALETTE);
show('Schräglage links', flipHorizontal(banked), SHIP_PALETTE);
show('Schräglage rechts', banked, SHIP_PALETTE);
FLAME_FRAMES.forEach((f, i) => show(`Flamme ${i}`, f, FLAME_PALETTE));
show('Schuss', BULLET_ROWS, BULLET_PALETTE);
show('Drohne', DRONE_ROWS, ENEMY_PALETTE);
show('Jäger', FIGHTER_ROWS, ENEMY_PALETTE);
show('Kreuzer', HEAVY_ROWS, ENEMY_PALETTE);
show('Gegnerschuss', ENEMY_BULLET_ROWS, ENEMY_BULLET_PALETTE);
COIN_FRAMES.forEach((f, i) => show(`Münze ${i}`, f, COIN_PALETTE));

// Endgegner
import('../gfx/bossArt').then((boss) => {
  show('Mutterschiff', boss.paintBossHull(), boss.BOSS_PALETTE);
  show('Kanone', boss.CANNON_ROWS, boss.BOSS_PALETTE);
  show('Kanonenwrack', boss.CANNON_WRECK_ROWS, boss.BOSS_PALETTE);
  show('Tor links', boss.DOOR_LEFT_ROWS, boss.BOSS_PALETTE);
  show('Tor rechts', boss.DOOR_RIGHT_ROWS, boss.BOSS_PALETTE);
  boss.CORE_FRAMES.forEach((f, i) => show(`Kern ${i}`, f, boss.BOSS_PALETTE));
  boss.ESCORT_FRAMES.forEach((f, i) => show(`Begleitdrohne ${i}`, f, boss.BOSS_PALETTE));
  show('Boss-Schuss', boss.BOSS_BULLET_ROWS, boss.BOSS_BULLET_PALETTE);
});
import('../gfx/bossArt').then((art) => {
  for (const kind of ['repair', 'shield', 'fan', 'laser', 'missile', 'option'] as const) show(kind, art.POWERUP_FRAMES[kind][0], art.POWERUP_PALETTE);
  show('Rakete', art.MISSILE_ROWS, art.POWERUP_PALETTE);
  show('Begleiter', art.OPTION_FRAMES[0], art.POWERUP_PALETTE);
  art.SHIELD_FRAMES.forEach((f, i) => show(`Schild ${i}`, f, art.POWERUP_PALETTE));
});
import('../gfx/swarmArt').then((a) => {
  a.SWARMLING_FRAMES.forEach((f, i) => show(`Schwärmer ${i}`, f, a.SWARM_PALETTE));
  a.SPITTER_FRAMES.forEach((f, i) => show(`Speier ${i}`, f, a.SWARM_PALETTE));
  a.BROOD_FRAMES.forEach((f, i) => show(`Brüter ${i}`, f, a.SWARM_PALETTE));
  show('Säure', a.ACID_ROWS, a.SWARM_PALETTE);
  show('Königin', a.paintQueenHull(), a.SWARM_PALETTE);
  a.EGG_SAC_FRAMES.forEach((f, i) => show(`Eiersack ${i}`, f, a.SWARM_PALETTE));
  show('Tentakel', a.TENTACLE_SEGMENT_ROWS, a.SWARM_PALETTE);
  show('Stachel', a.TENTACLE_TIP_ROWS, a.SWARM_PALETTE);
  show('Auge', a.EYE_ROWS, a.SWARM_PALETTE);
  show('Iris', a.IRIS_ROWS, a.SWARM_PALETTE);
  show('Lid', a.LID_LEFT_ROWS, a.SWARM_PALETTE);
});
import('../gfx/ascendArt').then((a) => {
  show('Gleiter', a.GLIDER_ROWS, a.ASCEND_PALETTE);
  show('Wächter', a.GUARDIAN_ROWS, a.ASCEND_PALETTE);
  a.GUARDIAN_SHIELD_FRAMES.forEach((f, i) => show(`Wächterschild ${i}`, f, a.ASCEND_PALETTE));
  show('Lanzenträger', a.LANCER_ROWS, a.ASCEND_PALETTE);
  show('Psi-Bolzen', a.PSI_BOLT_ROWS, a.ASCEND_PALETTE);
  show('Psi-Kugel', a.PSI_ORB_ROWS, a.ASCEND_PALETTE);
  show('Arche', a.paintArkHull(), a.ASCEND_PALETTE);
  a.PYLON_FRAMES.forEach((f, i) => show(`Pylon ${i}`, f, a.ASCEND_PALETTE));
  show('Pylon-Wrack', a.PYLON_WRECK_ROWS, a.ASCEND_PALETTE);
  a.ARK_CORE_FRAMES.forEach((f, i) => show(`Psi-Kern ${i}`, f, a.ASCEND_PALETTE));
  show('Schildkuppel', a.ARK_SHIELD_FRAMES[0], a.ASCEND_PALETTE);
});
import('../gfx/ascendArt').then((a) => a.GLYPH_FRAMES.forEach((frames, i) => frames.forEach((f, k) => show(`Rune ${i}.${k}`, f, a.ASCEND_PALETTE))));
import('../gfx/slimeArt').then((a) => {
  a.DROPLET_FRAMES.forEach((f, i) => show(`Tropfen ${i}`, f, a.SLIME_PALETTE));
  show('Spritzer', a.SPLASH_ROWS, a.SLIME_PALETTE);
  a.OOZER_FRAMES.forEach((f, i) => show(`Schleimer ${i}`, f, a.SLIME_PALETTE));
  a.AMOEBA_FRAMES.forEach((f, i) => show(`Amöbe ${i}`, f, a.SLIME_PALETTE));
  show('Schleimkugel', a.SLIMEBALL_ROWS, a.SLIME_PALETTE);
  a.BLOB_FRAMES.forEach((frames, i) => show(`Blob ${i}`, frames[0], a.SLIME_PALETTE));
});
import('../gfx/terranArt').then((a) => {
  show('Abfangjäger', a.INTERCEPTOR_ROWS, a.TERRAN_PALETTE);
  show('Fregatte', a.FRIGATE_ROWS, a.TERRAN_PALETTE);
  a.MINER_FRAMES.forEach((f, i) => show(`Bergbau ${i}`, f, a.TERRAN_PALETTE));
  show('Lenkrakete', a.ROCKET_ROWS, a.TERRAN_PALETTE);
  show('Fels klein', a.ROCK_SMALL_ROWS, a.TERRAN_PALETTE);
  show('Fels groß', a.ROCK_BIG_ROWS, a.TERRAN_PALETTE);
  show('Leuchtspur', a.TRACER_ROWS, a.TERRAN_PALETTE);
  show('Stahlrakete', a.paintRocket(true), a.TERRAN_PALETTE);
  show('Oberstufe', a.paintRocket(false), a.TERRAN_PALETTE);
  a.NOZZLE_FRAMES.forEach((f, i) => show(`Düse ${i}`, f, a.TERRAN_PALETTE));
  show('Asteroid 0', a.ASTEROID_FRAMES[0], a.TERRAN_PALETTE);
  show('Asteroid 12', a.ASTEROID_FRAMES[12], a.TERRAN_PALETTE);
  show('Turm', a.TURRET_ROWS, a.TERRAN_PALETTE);
  a.REACTOR_FRAMES.forEach((f, i) => show(`Reaktor ${i}`, f, a.TERRAN_PALETTE));
});
import('../gfx/crystalArt').then((a) => {
  a.SHARD_FRAMES.forEach((f, i) => show(`Splitter ${i}`, f, a.CRYSTAL_PALETTE));
  a.PRISM_FRAMES.forEach((f, i) => show(`Prisma ${i}`, f, a.CRYSTAL_PALETTE));
  a.BUD_FRAMES.forEach((f, i) => show(`Knospe ${i}`, f, a.CRYSTAL_PALETTE));
  show('Splitterschuss', a.SHARD_BULLET_ROWS, a.CRYSTAL_PALETTE);
  a.RING_SHARD_FRAMES.forEach((f, i) => show(`Ring ${i}`, f, a.CRYSTAL_PALETTE));
  a.SWARM_CORE_FRAMES.forEach((f, i) => show(`Schwarmkern ${i}`, f, a.CRYSTAL_PALETTE));
});
import('../gfx/voidArt').then((a) => {
  a.GRAVMINE_FRAMES.forEach((f, i) => show(`Mine ${i}`, f, a.VOID_PALETTE));
  a.VOIDEYE_FRAMES.forEach((f, i) => show(`Leerenauge ${i}`, f, a.VOID_PALETTE));
  show('Schattenjäger', a.STALKER_ROWS, a.VOID_PALETTE);
  show('Leerenschuss', a.VOID_BULLET_ROWS, a.VOID_PALETTE);
  a.HOLE_FRAMES.forEach((f, i) => show(`Loch ${i}`, f, a.VOID_PALETTE));
  a.GENERATOR_FRAMES.forEach((f, i) => show(`Generator ${i}`, f, a.VOID_PALETTE));
});
import('../gfx/deepArt').then((a) => {
  a.JELLY_FRAMES.forEach((f, i) => show(`Qualle ${i}`, f, a.DEEP_PALETTE));
  a.ANGLER_FRAMES.forEach((f, i) => show(`Angler ${i}`, f, a.DEEP_PALETTE));
  show('Sternigel', a.URCHIN_ROWS, a.DEEP_PALETTE);
  show('Leuchtschuss', a.BIO_BULLET_ROWS, a.DEEP_PALETTE);
  show('Stachel', a.SPIKE_ROWS, a.DEEP_PALETTE);
  a.LEVI_HEAD_FRAMES.forEach((f, i) => show(`Leviathan-Kopf ${i}`, f, a.DEEP_PALETTE));
  a.LEVI_SEGMENT_FRAMES.forEach((f, i) => show(`Segment ${i}`, f, a.DEEP_PALETTE));
  show('Schwanz', a.LEVI_TAIL_ROWS, a.DEEP_PALETTE);
});
