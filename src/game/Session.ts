import * as THREE from 'three';
import type { Sound } from '../audio/Sound';
import { FIELD } from '../config';
import type { Input } from '../core/Input';
import { randRange } from '../core/view';
import { DEV } from '../dev/flags';
import type { BossBase, BossEvents } from '../entities/bosses/BossBase';
import { CrystalArk } from '../entities/bosses/CrystalArk';
import { HiveQueen } from '../entities/bosses/HiveQueen';
import { Mothership } from '../entities/bosses/Mothership';
import { Asteroidenfestung } from '../entities/bosses/Asteroidenfestung';
import { Kristallschwarm } from '../entities/bosses/Kristallschwarm';
import { Stahlrakete } from '../entities/bosses/Stahlrakete';
import { Urschleim } from '../entities/bosses/Urschleim';
import { Leviathan } from '../entities/bosses/Leviathan';
import { Singularitaet } from '../entities/bosses/Singularitaet';
import { VOID_BULLET_ROWS, VOID_PALETTE } from '../gfx/voidArt';
import { BIO_BULLET_ROWS, DEEP_PALETTE, SPIKE_ROWS } from '../gfx/deepArt';
import { SHARD_BULLET_ROWS, CRYSTAL_PALETTE } from '../gfx/crystalArt';
import { SLIMEBALL_ROWS, SLIME_PALETTE } from '../gfx/slimeArt';
import { TRACER_ROWS, TERRAN_PALETTE } from '../gfx/terranArt';
import { BulletPool, steer, sweptDistanceSq } from '../entities/Bullets';
import { Enemies, type Enemy, type EnemyOutput, type ShotStyle } from '../entities/Enemies';
import { Pickups } from '../entities/Pickups';
import { Player } from '../entities/Player';
import { PowerUps, randomPowerUp } from '../entities/PowerUps';
import { beamDistanceSq, Beams } from '../fx/Beams';
import { explode, impactSparks } from '../fx/explode';
import type { Particles } from '../fx/Particles';
import { ASCEND_PALETTE, PSI_BOLT_ROWS, PSI_ORB_ROWS } from '../gfx/ascendArt';
import { BOSS_BULLET_PALETTE, BOSS_BULLET_ROWS, MISSILE_ROWS, POWERUP_PALETTE, type PowerUpKind } from '../gfx/bossArt';
import { BULLET_PALETTE, BULLET_ROWS, ENEMY_BULLET_PALETTE, ENEMY_BULLET_ROWS } from '../gfx/sprites';
import { ACID_ROWS, SWARM_PALETTE } from '../gfx/swarmArt';
import type { Hud } from '../ui/Hud';
import { Shop, type BuyResult } from '../ui/Shop';
import { Title } from '../ui/Title';
import { SaveMenu } from '../ui/SaveMenu';
import { writeSlot, type SaveData } from './SaveGame';
import { DIFFICULTIES, loadDifficulty, saveDifficulty } from './Difficulty';
import { Upgrades, type UpgradeDef } from './Upgrades';
import { SECTORS, WaveDirector, type BossId } from './Waves';
import { LASER_DPS, LASER_TIME, LASER_WIDTH, MISSILE_DAMAGE, MISSILE_TIME, OPTION_TIME, Weapons } from './Weapons';
import { FAN_TIME, SHIELD_TIME } from '../entities/Player';

export interface SessionFx {
  engine: Particles;
  sparks: Particles;
  fire: Particles;
}

export interface SessionHooks {
  shake(amount: number): void;
  /** Ein neuer Sektor beginnt (Nebelfarben). */
  sector(index: number): void;
}

const BULLET_DAMAGE = 1;
const RAM_DAMAGE = 6;
const ENEMY_BULLET_RADIUS = 0.3;
const PLAYER_BULLET_RADIUS = 0.25;
const PLAYER_DEBRIS = new THREE.Color(0x6286cf);
const PSI_SPARK = new THREE.Color(0x8ad8ff);
const SHIELD_SPARK = new THREE.Color(0x5af0ff);
const ACID_SPARK = new THREE.Color(0x9aff3a);
const MEMBRANE_SPARK = new THREE.Color(0x6ad88a);
/** Punkte statt Reparatur, wenn die Hülle schon voll ist. */
const REPAIR_BONUS = 500;

type State = 'title' | 'playing' | 'dying' | 'gameover';

/** Ein Spieldurchlauf: Spieler, Gegner, Endgegner, Projektile, Strahlen, Münzen, Power-ups, Wellen, Punkte. */
export class Session {
  readonly player: Player;
  private readonly playerBullets: BulletPool;
  private readonly missiles: BulletPool;
  /** Gegnerische Geschosse je Aussehen. */
  private readonly hostile: Record<ShotStyle, BulletPool>;
  private readonly beams: Beams;
  private readonly enemies: Enemies;
  private readonly bosses: Record<BossId, BossBase>;
  private boss: BossBase | null = null;
  private bossName = '';
  private readonly weapons: Weapons;
  private readonly pickups: Pickups;
  private readonly powerUps: PowerUps;
  private readonly waves: WaveDirector;
  private readonly out: EnemyOutput = { shots: [], spawns: [], effects: [] };

  private score = 0;
  private gold = 0;
  private hull = 5;
  /** Dauerhafte Verbesserungen aus der Werft. */
  private readonly upgrades = new Upgrades();
  private readonly shop: Shop;
  private readonly title: Title;
  private readonly saveMenu: SaveMenu;
  /** Gesetzt, wenn gerade alle Sektoren geschafft wurden: Name der neuen Stufe fürs Banner. */
  private pendingCampaign: string | null = null;
  /** Index in DIFFICULTIES. */
  private difficulty = loadDifficulty();
  /** Countdown bis die Werft öffnet (null = keine geplant). */
  private shopTimer: number | null = null;
  private state: State = 'playing';
  private stateTimer = 0;
  private pendingSector: number | null = null;
  private laserSparkTimer = 0;
  private beamsCharging = 0;
  private beamsFiring = 0;

  constructor(
    scene: THREE.Scene,
    private readonly fx: SessionFx,
    private readonly sound: Sound,
    private readonly hud: Hud,
    private readonly hooks: SessionHooks,
  ) {
    this.playerBullets = new BulletPool(scene, 200, BULLET_ROWS, BULLET_PALETTE, true);
    this.missiles = new BulletPool(scene, 40, MISSILE_ROWS, POWERUP_PALETTE, true);
    this.hostile = {
      normal: new BulletPool(scene, 240, ENEMY_BULLET_ROWS, ENEMY_BULLET_PALETTE),
      boss: new BulletPool(scene, 360, BOSS_BULLET_ROWS, BOSS_BULLET_PALETTE),
      acid: new BulletPool(scene, 240, ACID_ROWS, SWARM_PALETTE),
      psi: new BulletPool(scene, 360, PSI_BOLT_ROWS, ASCEND_PALETTE, true),
      orb: new BulletPool(scene, 40, PSI_ORB_ROWS, ASCEND_PALETTE),
      slime: new BulletPool(scene, 160, SLIMEBALL_ROWS, SLIME_PALETTE),
      tracer: new BulletPool(scene, 300, TRACER_ROWS, TERRAN_PALETTE, true),
      shard: new BulletPool(scene, 300, SHARD_BULLET_ROWS, CRYSTAL_PALETTE, true),
      void: new BulletPool(scene, 300, VOID_BULLET_ROWS, VOID_PALETTE),
      bio: new BulletPool(scene, 300, BIO_BULLET_ROWS, DEEP_PALETTE),
      spike: new BulletPool(scene, 120, SPIKE_ROWS, DEEP_PALETTE, true),
    };
    this.beams = new Beams(scene);
    this.enemies = new Enemies(scene, this.beams);
    const events = this.bossEvents();
    this.bosses = {
      mothership: new Mothership(scene, events, this.beams),
      queen: new HiveQueen(scene, events, this.beams),
      ark: new CrystalArk(scene, events, this.beams),
      urschleim: new Urschleim(scene, events, this.beams),
      starship: new Stahlrakete(scene, events, this.beams),
      fortress: new Asteroidenfestung(scene, events, this.beams),
      shardswarm: new Kristallschwarm(scene, events, this.beams),
      singularity: new Singularitaet(scene, events, this.beams),
      leviathan: new Leviathan(scene, events, this.beams),
    };
    this.pickups = new Pickups(scene);
    this.powerUps = new PowerUps(scene);
    this.player = new Player(scene);
    this.player.onFire = () => this.sound.shoot();
    this.weapons = new Weapons(scene, this.beams, this.playerBullets, this.missiles, sound);
    this.waves = new WaveDirector({
      spawn: (type, pattern, params, diff) => {
        this.enemies.spawn(type, pattern, params, diff);
        if (type === 'swarmling') this.sound.swarm();
      },
      waveStart: (number, loop) => this.onWaveStart(number, loop),
      sectorStart: (sector) => this.onSectorStart(sector),
      bossStart: (id, name) => this.startBoss(id, name),
      waveCleared: () => this.onWaveCleared(),
      campaignComplete: () => this.onCampaignComplete(),
    });
    this.player.stats = this.upgrades;
    this.shop = new Shop({
      state: () => ({ gold: this.gold, hull: this.hull, maxHull: this.maxHull, upgrades: this.upgrades }),
      buy: (def) => this.buy(def),
      close: () => this.closeShop(),
      save: () => this.saveMenu.show('save'),
      move: () => this.sound.shopMove(),
    });
    this.title = new Title({
      start: (i) => this.start(i),
      load: () => this.saveMenu.show('load'),
      move: () => this.sound.shopMove(),
    });
    this.saveMenu = new SaveMenu({
      save: (slot) => this.saveTo(slot),
      load: (data) => this.loadSave(data),
      close: () => this.saveMenu.hide(),
      move: () => this.sound.shopMove(),
      deny: () => this.sound.shopDeny(),
    });

    if (DEV.skipTitle) {
      // Zum Testen direkt losfliegen: ?diff=0..4 wählt die Stufe, ?shop öffnet die Werft, ?gold=500 gibt Startgold
      if (DEV.difficulty !== null) this.difficulty = DEV.difficulty;
      this.applyDifficulty();
      this.gold = DEV.gold;
      if (DEV.shop) this.shopTimer = 0.5;
    } else {
      this.applyDifficulty();
      this.state = 'title';
      this.title.show(this.difficulty);
    }
    this.refreshHud();
  }

  /** Mit gewähltem Schwierigkeitsgrad einen neuen Durchlauf beginnen. */
  private start(difficulty: number): void {
    this.difficulty = difficulty;
    saveDifficulty(difficulty);
    this.title.hide();
    this.restart();
    this.hud.showHint();
    this.sound.waveStart();
  }

  private get setting() {
    return DIFFICULTIES[this.difficulty];
  }

  private applyDifficulty(): void {
    this.waves.hpMul = this.setting.hp;
    this.hud.setDifficulty(this.setting.name, this.setting.color);
  }

  private addScore(points: number): void {
    this.score += Math.round(points * this.setting.score);
  }

  /** Pause ist im Titelbildschirm, in der Werft und nach Game Over gesperrt (dort hat Esc eine eigene Bedeutung). */
  get blocksPause(): boolean {
    return this.shop.isOpen || this.saveMenu.isOpen || this.state === 'title' || this.state === 'gameover';
  }

  /** Ist das Speicher-/Lademenü offen? (Es wird auch während der Pause bedient.) */
  get menuOpen(): boolean {
    return this.saveMenu.isOpen;
  }

  handleMenus(input: Input): void {
    if (this.saveMenu.isOpen) this.saveMenu.handleInput(input);
  }

  /** Speichern aus der Pause heraus (nicht nach Game Over oder im Titel). */
  openSaveMenu(): void {
    if (this.state === 'playing') this.saveMenu.show('save');
  }

  // -------------------------------------------------------------------------
  // Spielstände
  // -------------------------------------------------------------------------

  private saveTo(slot: number): void {
    const progress = this.waves.progress();
    const data: SaveData = {
      version: 1,
      savedAt: new Date().toISOString(),
      label: WaveDirector.label(progress),
      difficulty: this.difficulty,
      loop: progress.loop,
      entry: progress.entry,
      waveNumber: progress.waveNumber,
      score: this.score,
      gold: this.gold,
      hull: this.hull,
      upgrades: this.upgrades.toJSON(),
    };
    if (writeSlot(slot, data)) this.sound.shopBuy();
    else this.sound.shopDeny();
  }

  private loadSave(data: SaveData): void {
    this.saveMenu.hide();
    this.title.hide();
    this.restart();
    this.difficulty = Math.max(0, Math.min(DIFFICULTIES.length - 1, data.difficulty));
    this.applyDifficulty();
    this.upgrades.load(data.upgrades);
    this.score = data.score;
    this.gold = data.gold;
    this.hull = Math.max(1, Math.min(this.maxHull, data.hull));
    this.waves.restore({ entry: data.entry, waveNumber: data.waveNumber, loop: data.loop });
    this.hud.showBanner('SPIELSTAND GELADEN', data.label, false, 2500);
    this.sound.shopOpen();
    this.refreshHud();
  }

  /**
   * Alle Sektoren geschafft: weiter mit dem nächsten Schwierigkeitsgrad, Upgrades, Gold und Score bleiben.
   * Auf der höchsten Stufe steigt stattdessen die Runde (Gegner werden weiter härter).
   */
  private onCampaignComplete(): boolean {
    this.hull = this.maxHull;
    if (this.difficulty < DIFFICULTIES.length - 1) {
      this.difficulty++;
      saveDifficulty(this.difficulty);
      this.applyDifficulty();
      this.pendingCampaign = `WEITER AUF ${this.setting.name} · UPGRADES BLEIBEN`;
      this.refreshHud();
      return false;
    }
    this.pendingCampaign = `STUFE ${this.waves.loop + 2} · ES WIRD NOCH HÄRTER`;
    this.refreshHud();
    return true;
  }

  private get maxHull(): number {
    return this.upgrades.maxHull;
  }

  /** Ist gerade die Werft offen? (Dann pausiert das Spielgeschehen.) */
  get inShop(): boolean {
    return this.shop.isOpen;
  }

  /** Zurück zur Auswahl des Schwierigkeitsgrads. */
  private toTitle(): void {
    this.restart();
    this.state = 'title';
    this.title.show(this.difficulty);
  }

  restart(): void {
    this.enemies.clear();
    for (const b of Object.values(this.bosses)) b.hide();
    this.boss = null;
    this.playerBullets.clear();
    this.missiles.clear();
    for (const pool of Object.values(this.hostile)) pool.clear();
    this.beams.clear();
    this.weapons.reset();
    this.pickups.clear();
    this.powerUps.clear();
    this.waves.reset();
    this.applyDifficulty();
    this.player.reset();
    this.sound.setMusic('normal');
    this.upgrades.reset();
    this.shop.hide();
    this.saveMenu.hide();
    this.pendingCampaign = null;
    this.shopTimer = null;
    this.score = 0;
    this.gold = 0;
    this.hull = this.maxHull;
    this.state = 'playing';
    this.hud.hideGameOver();
    this.refreshHud();
  }

  update(dt: number, input: Input): void {
    // Speicher-/Lademenü liegt über allem
    if (this.saveMenu.isOpen) {
      this.saveMenu.handleInput(input);
      return;
    }
    // Auf dem Titelbildschirm läuft nur der Hintergrund
    if (this.state === 'title') {
      this.title.handleInput(input);
      return;
    }
    // In der Werft ruht das Spielgeschehen
    if (this.shop.isOpen) {
      this.shop.handleInput(input);
      return;
    }
    if (this.shopTimer !== null && this.state === 'playing') {
      this.shopTimer -= dt;
      if (this.shopTimer <= 0) this.openShop(input);
    }

    if (this.state === 'gameover') {
      if (input.wasPressed('Enter')) this.restart();
      else if (input.wasPressed('Escape')) this.toTitle();
    } else if (this.state === 'dying') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'gameover';
        this.hud.showGameOver(this.score);
        this.sound.gameOver();
      }
    }

    const p = this.player;
    const boss = this.boss?.active ? this.boss : null;
    this.pickups.magnetMul = this.upgrades.magnetMul;
    this.weapons.permanentDrones = this.upgrades.drones;
    // Unter dem Endgegner bleiben, nicht in seinen Rumpf hineinfliegen
    const bottom = boss?.bottom ?? null;
    p.ceiling = bottom !== null ? Math.min(FIELD.halfHeight, bottom - 1.6) : null;
    p.update(dt, input, this.playerBullets, this.fx.engine, this.fx.sparks, !this.weapons.laserActive);
    // Traktorstrahl und Sog: ziehen das Schiff an, man kann dagegen ansteuern
    const pullTo = (x: number, y: number, strength: number) => {
      const dx = x - p.x;
      const dy = y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.position.x += (dx / d) * strength * dt;
      p.position.y += (dy / d) * strength * dt;
    };
    if (p.alive) {
      if (boss?.pull) pullTo(boss.pull.x, boss.pull.y, boss.pull.strength);
      // Gravitationsminen ziehen umso stärker, je näher man ist
      for (const e of this.enemies.all) {
        const g = e.type.gravity;
        if (!e.active || !g) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < g.radius) pullTo(e.x, e.y, g.strength * (1 - d / g.radius));
      }
    }
    this.weapons.update(dt, input, p);
    if (this.state === 'playing') this.waves.update(dt, this.enemies.aliveCount);

    // Gegner und Endgegner bewegen, ihre Ausgaben sammeln und umsetzen
    const out = this.out;
    out.shots.length = out.spawns.length = out.effects.length = 0;
    for (const e of this.enemies.all) {
      if (!e.active) continue;
      if (!e.update(dt, p.x, p.y, out)) e.kill();
    }
    boss?.update(dt, p.x, p.y, out);
    this.applyEnemyOutput();

    // Schwerkraftquelle des Endgegners krümmt alle Geschosse, Spielerschüsse werden verschluckt
    const well = boss?.well;
    if (well) {
      const swallowed = this.playerBullets.attract(dt, well.x, well.y, well.g, well.absorb) + this.missiles.attract(dt, well.x, well.y, well.g * 0.6, well.absorb);
      if (swallowed > 0) this.sound.swallow();
      for (const pool of Object.values(this.hostile)) pool.attract(dt, well.x, well.y, well.g * 0.12, 0);
    }

    this.steerMissiles(dt);
    this.playerBullets.update(dt);
    this.missiles.update(dt);
    for (const pool of Object.values(this.hostile)) pool.update(dt, p.x, p.y);
    this.updateLaser(dt);
    this.beams.update(dt);
    this.beamSounds();
    this.collide();
    this.collect(dt);

    this.hud.setBoss(boss ? this.bossName : null, boss ? boss.health() : 0);
    const w = this.weapons;
    this.hud.setPowerUps([
      { label: `SCHILD ×${p.shieldHits}`, time: p.shielded ? p.shieldTime : 0, cls: 'pu-shield' },
      { label: 'FÄCHER', time: p.fanTime, cls: 'pu-fan' },
      { label: 'LASER', time: w.laserTime, cls: 'pu-laser' },
      { label: 'RAKETEN', time: w.missileTime, cls: 'pu-missile' },
      { label: 'BEGLEITER', time: w.optionTime, cls: 'pu-option' },
    ]);
  }

  // -------------------------------------------------------------------------
  // Gegner-Ausgaben: Schüsse, Brut, Effekte
  // -------------------------------------------------------------------------

  private applyEnemyOutput(): void {
    const styles = new Set<ShotStyle>();
    for (const s of this.out.shots) {
      // Schwierigkeitsgrad: gegnerische Geschosse langsamer oder schneller
      const v = this.setting.bullet;
      this.hostile[s.style].spawn(s.x, s.y, s.vx * v, s.vy * v, { amp: s.amp, freq: s.freq, phase: s.phase, homing: s.homing, life: s.life, gravity: s.gravity ? s.gravity * v * v : 0 });
      styles.add(s.style);
    }
    for (const style of styles) this.sound.enemyShot(style);

    const diff = this.waves.difficulty;
    for (const r of this.out.spawns) {
      const pattern = r.pattern ?? 'chase';
      this.enemies.spawn(r.type, pattern, { x: r.x, y0: r.y, vx0: r.vx, vy0: r.vy, speed: r.speed ?? 9, hold: r.hold ?? 3, side: 1, amp: 0, freq: 0, phase: 0, stopY: 0 }, diff);
      if (r.type === 'swarmling') this.sound.swarm();
    }

    for (const fx of this.out.effects) {
      if (fx.kind === 'warp') {
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          this.fx.sparks.emit(fx.x, fx.y, Math.cos(a) * 7, Math.sin(a) * 3, 0.3, PSI_SPARK);
        }
        this.sound.warp();
      } else if (fx.kind === 'hatch') {
        // Ei schlüpft: grüner Schleim und ein Schmatzen
        explode(this.fx.fire, this.fx.sparks, fx.x, fx.y, 1, ACID_SPARK);
        this.sound.squelch();
      } else this.shieldSparks(fx.x, fx.y);
    }
  }

  private shieldSparks(x: number, y: number): void {
    for (let i = 0; i < 5; i++) this.fx.sparks.emit(x, y, randRange(-6, 6), randRange(-3, 6), 0.18, SHIELD_SPARK);
  }

  // -------------------------------------------------------------------------
  // Zusatzwaffen
  // -------------------------------------------------------------------------

  /** Raketen beschleunigen, zum nächsten Ziel lenken und eine Feuerspur ziehen. */
  private steerMissiles(dt: number): void {
    const targets: { x: number; y: number }[] = [];
    for (const e of this.enemies.all) if (e.active && e.solid) targets.push(e);
    if (this.boss?.active) targets.push(...this.boss.missileTargets());
    for (const m of this.missiles.bullets) {
      if (!m.active) continue;
      const speed = Math.hypot(m.vx, m.vy);
      const k = Math.min(32, speed + 40 * dt) / speed;
      m.vx *= k;
      m.vy *= k;
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (const t of targets) {
        const d = (t.x - m.x) ** 2 + (t.y - m.y) ** 2;
        if (d < bestD) [best, bestD] = [t, d];
      }
      if (best) steer(m, best.x, best.y, m.homing * dt);
      this.fx.engine.emit(m.x, m.y, randRange(-1, 1), randRange(-3, -1), 0.2);
    }
  }

  /** Dauerlaser: senkrecht nach oben bis zum ersten Hindernis, Schaden pro Sekunde. */
  private updateLaser(dt: number): void {
    const beam = this.weapons.laser;
    if (!beam) return;
    const hw = LASER_WIDTH / 2;
    let hitY = FIELD.halfHeight + 4;
    let enemy: Enemy | null = null;
    for (const e of this.enemies.all) {
      if (!e.active || !e.solid || Math.abs(e.x - beam.x) > e.type.radius + hw) continue;
      const y = e.y - e.type.radius * 0.7;
      if (y > beam.y && y < hitY) [hitY, enemy] = [y, e];
    }
    const bossHit = this.boss?.active ? this.boss.raycastUp(beam.x, beam.y, hw) : null;
    const hitsBoss = bossHit !== null && bossHit.y < hitY;
    if (hitsBoss) {
      hitY = bossHit.y;
      enemy = null;
    }
    beam.length = Math.max(0.1, hitY - beam.y);

    const damage = LASER_DPS * this.upgrades.damageMul * dt;
    this.laserSparkTimer -= dt;
    const spark = this.laserSparkTimer <= 0;
    if (spark) this.laserSparkTimer = 0.05;

    if (enemy && enemy.type.coreRadius && Math.abs(enemy.x - beam.x) > enemy.type.coreRadius + hw) {
      // Die Membran schluckt den Laser, nur der Zellkern nimmt Schaden
      if (spark) this.membraneHit(beam.x, hitY);
    } else if (enemy) this.damageEnemy(enemy, damage, beam.x, hitY, spark);
    else if (hitsBoss) {
      const t = bossHit.target;
      if (t && !t.armor) {
        t.hit(damage);
        if (spark) impactSparks(this.fx.sparks, beam.x, hitY);
      } else if (spark) {
        if (t) this.shieldSparks(beam.x, hitY);
        else impactSparks(this.fx.sparks, beam.x, hitY);
        this.sound.clink(this.boss?.material);
      }
    }
  }

  /** Lade- und Feuergeräusch, sobald ein feindlicher Strahl beginnt. */
  private beamSounds(): void {
    let charging = 0;
    let firing = 0;
    for (const b of this.beams.all) {
      if (!b.active || !b.hostile) continue;
      if (b.charge) charging++;
      else firing++;
    }
    if (charging > this.beamsCharging) this.sound.beamCharge();
    if (firing > this.beamsFiring) this.sound.beamFire();
    this.beamsCharging = charging;
    this.beamsFiring = firing;
  }

  // -------------------------------------------------------------------------
  // Wellen, Sektoren, Endgegner
  // -------------------------------------------------------------------------

  private onSectorStart(sector: number): void {
    this.pendingSector = sector;
    this.hooks.sector(sector);
    this.sound.setSector(sector);
  }

  private onWaveStart(number: number, loop: number): void {
    const stage = loop > 0 ? `STUFE ${loop + 1}` : '';
    if (this.pendingCampaign !== null) {
      // Erste Welle nach dem Durchspielen
      this.hud.showBanner('DURCHGESPIELT!', this.pendingCampaign, false, 4500);
      this.pendingCampaign = null;
      this.pendingSector = null;
      this.sound.glyphSuccess();
      return;
    }
    if (this.pendingSector !== null) {
      // Erste Welle eines Sektors: Sektor-Banner statt Wellennummer
      const s = SECTORS[this.pendingSector];
      this.hud.showBanner(s.name, stage ? `${s.subtitle} · ${stage}` : s.subtitle, false, 3200);
      this.pendingSector = null;
    } else {
      this.hud.showBanner(`WELLE ${number}`, stage);
    }
    this.sound.waveStart();
  }

  /** Nach jeder geschafften Welle schwebt eine Kapsel herein: Reparatur, wenn nötig, sonst ein Power-up. */
  private onWaveCleared(): void {
    // Werft nach jeder 5. Welle, außer direkt vor einem Endgegner (danach öffnet sie ohnehin)
    if (this.waves.number % 5 === 0 && !this.waves.nextIsBoss) this.shopTimer = 1.2;
    const kind = this.hull < this.maxHull ? 'repair' : randomPowerUp('repair');
    this.powerUps.spawn(kind, randRange(-6, 6), 20);
  }

  private startBoss(id: BossId, name: string): void {
    this.pendingSector = null;
    this.bossName = name;
    this.hud.showBanner('WARNUNG', `${this.bossName} NÄHERT SICH`, true, 3500);
    this.sound.bossWarning(id);
    this.sound.setMusic(id);
    const diff = this.waves.difficulty;
    this.boss = this.bosses[id];
    this.boss.start({ ...diff, hp: diff.hp * DEV.bossHp });
  }

  /** Verbindet die Endgegner mit Effekten, Sound, Punkten und Beute. */
  private bossEvents(): BossEvents {
    return {
      explode: (x, y, size, debris) => {
        explode(this.fx.fire, this.fx.sparks, x, y, size, debris);
        this.sound.explode(size >= 2 ? 2 : 1, this.boss?.material);
      },
      sparks: (x, y) => impactSparks(this.fx.sparks, x, y),
      shieldSparks: (x, y) => this.shieldSparks(x, y),
      smoke: (x, y) => this.fx.fire.emit(x, y, randRange(-0.5, 0.5), randRange(1.5, 3), randRange(0.3, 0.6)),
      hit: () => this.sound.hit(this.boss?.material),
      deflect: () => this.sound.clink(this.boss?.material),
      partDestroyed: (x, y, score, coins, repair) => {
        this.addScore(score);
        this.pickups.drop(x, y, coins);
        if (repair) this.powerUps.spawn(this.hull < this.maxHull ? 'repair' : randomPowerUp('repair'), x, y);
        this.refreshHud();
      },
      shake: (amount) => this.hooks.shake(amount),
      opening: (title, subtitle) => {
        this.sound.doorOpen();
        this.hud.showBanner(title, subtitle, true, 2200);
      },
      banner: (title, subtitle, warn = false) => this.hud.showBanner(title, subtitle, warn, 1800),
      sfx: (name, arg) => {
        if (name === 'glyph') this.sound.glyph(arg ?? 0);
        else this.sound[name]();
      },
      death: () => {
        this.sound.bossDeath(this.boss?.material ?? 'metal');
        for (const pool of Object.values(this.hostile)) pool.clear();
      },
      defeated: (x, y, debris) => {
        // Große Schlussexplosion, Bildschirmblitz, Goldregen
        explode(this.fx.fire, this.fx.sparks, x, y, 6, debris);
        for (let i = 0; i < 6; i++) explode(this.fx.fire, this.fx.sparks, x + randRange(-9, 9), y + randRange(-3, 3), 2, debris);
        this.sound.explode(3, this.boss?.material);
        this.hooks.shake(1.6);
        this.hud.flash();
        for (let i = 0; i < 8; i++) this.pickups.drop(x + randRange(-9, 9), y + randRange(-3, 2), 5);
        const bonus = 20000 * (this.waves.loop + 1) * (this.waves.sector + 1);
        this.addScore(bonus);
        this.hud.showBanner(this.boss?.defeatTitle ?? `${this.bossName} ZERSTÖRT`, `+${bonus}`, false, 3500);
        this.sound.setMusic('normal');
        this.powerUps.spawn('repair', x - 4, y);
        this.powerUps.spawn(randomPowerUp('repair'), x + 4, y);
        this.waves.finishBoss();
        this.shopTimer = 3.5;
        this.refreshHud();
      },
    };
  }

  // -------------------------------------------------------------------------
  // Treffer und Zusammenstöße
  // -------------------------------------------------------------------------

  /** Schaden an einem Gegner: Schild, Treffer oder Abschuss. */
  private damageEnemy(e: Enemy, amount: number, x: number, y: number, effects = true): void {
    const result = e.damage(amount);
    if (result === 'killed') this.destroyEnemy(e);
    else if (!effects) return;
    else if (result === 'shielded') {
      this.shieldSparks(x, y);
      this.sound.shieldZap();
    } else {
      impactSparks(this.fx.sparks, x, y);
      this.sound.hit(e.type.material);
    }
    // Prismen werfen Treffer als Splitter auf den Spieler zurück
    if (result === 'hit' && e.reflectReady()) {
      const p = this.player;
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      const v = 13 * this.setting.bullet;
      this.hostile.shard.spawn(e.x, e.y, Math.cos(a) * v, Math.sin(a) * v);
      this.sound.enemyShot('shard');
    }
  }

  /** Schuss bleibt in der Membran einer Amöbe stecken. */
  private membraneHit(x: number, y: number): void {
    for (let i = 0; i < 4; i++) this.fx.sparks.emit(x, y, randRange(-4, 4), randRange(-1, 5), 0.2, MEMBRANE_SPARK);
    this.sound.clink('slime');
  }

  private collide(): void {
    const p = this.player;

    // Spielerschüsse und Raketen gegen Endgegner und Gegner
    for (const [pool, damage] of [
      [this.playerBullets, BULLET_DAMAGE * this.upgrades.damageMul],
      [this.missiles, MISSILE_DAMAGE * this.upgrades.damageMul],
    ] as const) {
      for (const b of pool.bullets) {
        if (!b.active) continue;
        if (this.boss?.active && this.boss.hitTestBullet(b, damage)) {
          pool.kill(b);
          continue;
        }
        for (const e of this.enemies.all) {
          if (!e.active || !e.solid) continue;
          const r = e.type.radius + PLAYER_BULLET_RADIUS;
          if (sweptDistanceSq(b, e.x, e.y) > r * r) continue;
          pool.kill(b);
          const core = e.type.coreRadius;
          if (core && sweptDistanceSq(b, e.x, e.y) > (core + PLAYER_BULLET_RADIUS) ** 2) this.membraneHit(b.x, b.y);
          else this.damageEnemy(e, damage, b.x, b.y);
          break;
        }
      }
    }

    if (!p.canBeHit) return;

    // Gegnerische Geschosse gegen Spieler
    for (const pool of Object.values(this.hostile)) {
      for (const b of pool.bullets) {
        if (!b.active) continue;
        const r = p.hitRadius + ENEMY_BULLET_RADIUS;
        if (sweptDistanceSq(b, p.x, p.y) > r * r) continue;
        pool.kill(b);
        this.damagePlayer();
        return;
      }
    }

    // Feindliche Strahlen
    for (const beam of this.beams.all) {
      if (!beam.active || !beam.hostile || beam.charge) continue;
      if (beamDistanceSq(beam, p.x, p.y) < (beam.width / 2 + p.hitRadius * 0.7) ** 2) {
        this.damagePlayer();
        return;
      }
    }

    // Zusammenstoß mit Gegnern, der Hülle des Endgegners oder seinen Anbauten
    for (const e of this.enemies.all) {
      if (!e.active || !e.solid) continue;
      const r = e.type.radius + p.hitRadius + 0.4;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r * r) continue;
      if (e.damage(RAM_DAMAGE) === 'killed') this.destroyEnemy(e);
      this.damagePlayer();
      return;
    }
    if (this.boss?.touchesPlayer(p.x, p.y, p.hitRadius)) this.damagePlayer();
  }

  private destroyEnemy(e: Enemy): void {
    const t = e.type;
    explode(this.fx.fire, this.fx.sparks, e.x, e.y, t.explosion, e.debrisColor);
    this.sound.explode(t.explosion, t.material);
    this.hooks.shake(t.explosion === 3 ? 0.6 : t.explosion === 2 ? 0.25 : 0.08);
    this.pickups.drop(e.x, e.y, t.coins);
    if (Math.random() < t.drop) {
      this.powerUps.spawn(this.hull < this.maxHull && Math.random() < 0.5 ? 'repair' : randomPowerUp(), e.x, e.y);
    }
    // Ring aus Geschossen beim Tod (Minen, Sternigel)
    if (t.deathRing) {
      const { count, style, speed } = t.deathRing;
      const v = speed * this.setting.bullet;
      const off = Math.random() * Math.PI;
      for (let i = 0; i < count; i++) {
        const a = off + (i / count) * Math.PI * 2;
        this.hostile[style].spawn(e.x, e.y, Math.cos(a) * v, Math.sin(a) * v);
      }
      this.sound.enemyShot(style);
    }
    // Brüter zerplatzen in Schwärmer
    if (t.split) {
      this.sound.squelch();
      this.sound.swarm();
      const diff = this.waves.difficulty;
      for (let i = 0; i < t.split.count; i++) {
        const a = (i / t.split.count) * Math.PI * 2;
        this.enemies.spawn(
          t.split.type,
          'chase',
          { x: e.x, y0: e.y, vx0: Math.cos(a) * 7, vy0: Math.sin(a) * 7, speed: 9, hold: 3, side: 1, amp: 0, freq: 0, phase: 0, stopY: 0 },
          diff,
        );
      }
    }
    this.addScore(t.score * this.waves.number);
    e.kill();
    this.refreshHud();
  }

  private damagePlayer(): void {
    const p = this.player;
    if (DEV.god) return;

    // Schild fängt den Treffer ab
    if (p.shielded) {
      p.absorbHit();
      this.sound.shieldHit();
      this.hooks.shake(0.3);
      impactSparks(this.fx.sparks, p.x, p.y);
      return;
    }

    this.hull--;
    this.hooks.shake(0.7);
    impactSparks(this.fx.sparks, p.x, p.y);
    this.refreshHud();

    if (this.hull > 0) {
      p.hit();
      this.sound.playerHit();
      return;
    }

    // Schiff zerstört
    explode(this.fx.fire, this.fx.sparks, p.x, p.y, 3, PLAYER_DEBRIS);
    this.sound.explode(3);
    this.hooks.shake(1.2);
    p.destroy();
    this.weapons.reset();
    this.state = 'dying';
    this.stateTimer = 1.6;
  }

  // -------------------------------------------------------------------------
  // Münzen und Power-ups
  // -------------------------------------------------------------------------

  private collect(dt: number): void {
    const p = this.player;
    const coins = this.pickups.update(dt, p.x, p.y, p.alive);
    if (coins > 0) {
      this.gold += coins;
      this.sound.coin();
      this.refreshHud();
    }
    for (const kind of this.powerUps.update(dt, p.x, p.y, p.alive)) this.applyPowerUp(kind);
  }

  private applyPowerUp(kind: PowerUpKind): void {
    const p = this.player;
    const w = this.weapons;
    this.sound.powerUp(kind);
    const banner = (title: string, sub: string) => this.hud.showBanner(title, sub, false, 1200);
    const time = (base: number) => Math.round(base * this.upgrades.durationMul);
    switch (kind) {
      case 'repair':
        if (this.hull < this.maxHull) {
          this.hull++;
          banner('REPARATUR', '+1 HÜLLE');
        } else {
          this.addScore(REPAIR_BONUS);
          banner('HÜLLE VOLL', `+${REPAIR_BONUS}`);
        }
        break;
      case 'shield':
        p.giveShield(time(SHIELD_TIME));
        banner('SCHILD', '3 TREFFER');
        break;
      case 'fan':
        p.giveFan(time(FAN_TIME));
        banner('FÄCHERSCHUSS', `${time(FAN_TIME)} SEKUNDEN`);
        break;
      case 'laser':
        w.laserTime = time(LASER_TIME);
        banner('DAUERLASER', `${time(LASER_TIME)} SEKUNDEN`);
        break;
      case 'missile':
        w.missileTime = time(MISSILE_TIME);
        banner('ZIELSUCH-RAKETEN', `${time(MISSILE_TIME)} SEKUNDEN`);
        break;
      case 'option':
        w.optionTime = time(OPTION_TIME);
        banner('BEGLEITER', `${time(OPTION_TIME)} SEKUNDEN`);
        break;
    }
    this.refreshHud();
  }

  // -------------------------------------------------------------------------
  // Werft
  // -------------------------------------------------------------------------

  private openShop(input: Input): void {
    this.shopTimer = null;
    // Münzen, die noch im Bild sind, gehen nicht verloren
    const coins = this.pickups.collectAll();
    if (coins > 0) this.gold += coins;
    this.weapons.stopLaser();
    input.clearPressed();
    this.hud.hideBanner();
    this.shop.show();
    this.sound.shopOpen();
    this.refreshHud();
  }

  private closeShop(): void {
    this.shop.hide();
    this.refreshHud();
  }

  private buy(def: UpgradeDef): BuyResult {
    const price = this.upgrades.price(def);
    let result: BuyResult = 'ok';
    if (price === null) result = 'max';
    else if (def.id === 'repair' && this.hull >= this.maxHull) result = 'full';
    else if (price > this.gold) result = 'poor';
    if (result !== 'ok' || price === null) {
      this.sound.shopDeny();
      return result;
    }
    this.gold -= price;
    this.upgrades.buy(def.id);
    // Mehr Panzerung bringt das neue Segment gleich repariert mit
    if (def.id === 'hull' || def.id === 'repair') this.hull = Math.min(this.maxHull, this.hull + 1);
    this.sound.shopBuy();
    this.refreshHud();
    return 'ok';
  }

  private refreshHud(): void {
    this.hud.setScore(this.score);
    this.hud.setGold(this.gold);
    this.hud.setHull(this.hull, this.maxHull);
  }
}
