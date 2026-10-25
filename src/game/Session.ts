import * as THREE from 'three';
import type { Sound } from '../audio/Sound';
import { FIELD, PLAYER } from '../config';
import type { Input } from '../core/Input';
import { nearest, randRange } from '../core/view';
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
import { Sternencabrio } from '../entities/bosses/Sternencabrio';
import { Kosmograd } from '../entities/bosses/Kosmograd';
import { Unitas } from '../entities/bosses/Unitas';
import { Rebellenstaffel } from '../entities/bosses/Rebellenstaffel';
import { Odysseus } from '../entities/bosses/Odysseus';
import { Weltenbrecher } from '../entities/bosses/Weltenbrecher';
import { BOLT_ROWS, FLEET_PALETTE } from '../gfx/fleetArt';
import { Autopilot } from '../dev/Autopilot';
import { BOSS_TUNING } from './BossTuning';
import { VOID_BULLET_ROWS, VOID_PALETTE } from '../gfx/voidArt';
import { BIO_BULLET_ROWS, DEEP_PALETTE, SPIKE_ROWS } from '../gfx/deepArt';
import { SHARD_BULLET_ROWS, CRYSTAL_PALETTE } from '../gfx/crystalArt';
import { SLIMEBALL_ROWS, SLIME_PALETTE } from '../gfx/slimeArt';
import { TRACER_ROWS, TERRAN_PALETTE } from '../gfx/terranArt';
import { BulletPool, steer, sweptDistanceSq } from '../entities/Bullets';
import { Enemies, type Enemy, type EnemyOutput, type ShotStyle } from '../entities/Enemies';
import { Pickups } from '../entities/Pickups';
import { Player } from '../entities/Player';
import { SHIP_PALETTE, SHIP_PALETTE_P2 } from '../gfx/sprites';
import { PowerUps, randomPowerUp } from '../entities/PowerUps';
import { beamDistanceSq, Beams } from '../fx/Beams';
import { explode, impactSparks } from '../fx/explode';
import type { Particles } from '../fx/Particles';
import { ASCEND_PALETTE, AETHER_BOLT_ROWS, AETHER_ORB_ROWS } from '../gfx/ascendArt';
import { BOSS_BULLET_PALETTE, BOSS_BULLET_ROWS, MISSILE_ROWS, POWERUP_PALETTE, type PowerUpKind } from '../gfx/bossArt';
import { BULLET_PALETTE, BULLET_ROWS, ENEMY_BULLET_PALETTE, ENEMY_BULLET_ROWS } from '../gfx/sprites';
import { ACID_ROWS, SWARM_PALETTE } from '../gfx/swarmArt';
import type { Hud } from '../ui/Hud';
import { Shop, type BuyResult } from '../ui/Shop';
import { Title } from '../ui/Title';
import { SaveMenu } from '../ui/SaveMenu';
import { writeSlot, type SaveData } from './SaveGame';
import { DIFFICULTIES, difficultyIndex, loadDifficulty, saveDifficulty } from './Difficulty';
import { Upgrades, UPGRADES, type UpgradeDef, type UpgradeId } from './Upgrades';
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
const AETHER_SPARK = new THREE.Color(0x8ad8ff);
const SHIELD_SPARK = new THREE.Color(0x5af0ff);
const ACID_SPARK = new THREE.Color(0x9aff3a);
const MEMBRANE_SPARK = new THREE.Color(0x6ad88a);
/** Punkte statt Reparatur, wenn die Hülle schon voll ist. */
const REPAIR_BONUS = 500;

type State = 'title' | 'playing' | 'dying' | 'gameover';

/** Sekunden bis ein abgeschossener Spieler im Koop zurückkehrt. */
const RESPAWN_TIME = 10;

/** Ein Spieler: Schiff, Waffen, eigene Hülle. Gold, Score und Upgrades teilen sich alle. */
interface Pilot {
  ship: Player;
  weapons: Weapons;
  hull: number;
  /** Nimmt am Durchlauf teil (Spieler 2 nur im Zweispieler-Modus). */
  active: boolean;
  /** Sekunden bis zur Rückkehr nach einem Abschuss (nur im Koop). */
  respawn: number;
}

/** Ein Spieldurchlauf: Spieler, Gegner, Endgegner, Projektile, Strahlen, Münzen, Power-ups, Wellen, Punkte. */
export class Session {
  private readonly pilots: Pilot[];
  /** 1 oder 2 Spieler. */
  private players = 1;
  private readonly playerBullets: BulletPool;
  private readonly missiles: BulletPool;
  /** Gegnerische Geschosse je Aussehen. */
  private readonly hostile: Record<ShotStyle, BulletPool>;
  private readonly beams: Beams;
  private readonly enemies: Enemies;
  private readonly bosses: Record<BossId, BossBase>;
  private boss: BossBase | null = null;
  private bossName = '';
  private readonly pickups: Pickups;
  private readonly powerUps: PowerUps;
  private readonly waves: WaveDirector;
  private readonly out: EnemyOutput = { shots: [], spawns: [], effects: [] };

  private score = 0;
  private gold = 0;
  /** Dauerhafte Verbesserungen aus der Werft. */
  private readonly upgrades = new Upgrades();
  private readonly shop: Shop;
  private readonly title: Title;
  private readonly saveMenu: SaveMenu;
  private creditsOpen = false;
  /** Gesetzt, wenn gerade alle Sektoren geschafft wurden: Name der neuen Stufe fürs Banner. */
  private pendingCampaign: string | null = null;
  /** Index in DIFFICULTIES. */
  private difficulty = loadDifficulty();
  /** Countdown bis die Werft öffnet (null = keine geplant). */
  private shopTimer: number | null = null;
  /** Nur Entwicklung (?bot): Autopilot und Messwerte für das Balancing. */
  private readonly bot = DEV.bot ? new Autopilot(DEV.botSkill) : null;
  readonly devStats = {
    time: 0,
    hits: 0,
    bossStart: 0,
    bossHits: 0,
    /** Treffer nach Quelle (Geschossart, Strahl, Gegnertyp, Boss). */
    hitBy: {} as Record<string, number>,
    bosses: [] as { name: string; wave: number; time: number; hits: number; maxHull: number; upgrades: string }[],
  };
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
      aether: new BulletPool(scene, 360, AETHER_BOLT_ROWS, ASCEND_PALETTE, true),
      orb: new BulletPool(scene, 40, AETHER_ORB_ROWS, ASCEND_PALETTE),
      slime: new BulletPool(scene, 160, SLIMEBALL_ROWS, SLIME_PALETTE),
      tracer: new BulletPool(scene, 300, TRACER_ROWS, TERRAN_PALETTE, true),
      shard: new BulletPool(scene, 300, SHARD_BULLET_ROWS, CRYSTAL_PALETTE, true),
      void: new BulletPool(scene, 300, VOID_BULLET_ROWS, VOID_PALETTE),
      bio: new BulletPool(scene, 300, BIO_BULLET_ROWS, DEEP_PALETTE),
      spike: new BulletPool(scene, 120, SPIKE_ROWS, DEEP_PALETTE, true),
      bolt: new BulletPool(scene, 300, BOLT_ROWS, FLEET_PALETTE, true),
    };
    this.beams = new Beams(scene);
    this.enemies = new Enemies(scene, this.beams);
    const events = this.bossEvents();
    this.bosses = {
      mothership: new Mothership(scene, events, this.beams),
      queen: new HiveQueen(scene, events, this.beams),
      ark: new CrystalArk(scene, events, this.beams),
      urschleim: new Urschleim(scene, events, this.beams),
      rocket: new Stahlrakete(scene, events, this.beams),
      fortress: new Asteroidenfestung(scene, events, this.beams),
      shardswarm: new Kristallschwarm(scene, events, this.beams),
      singularity: new Singularitaet(scene, events, this.beams),
      leviathan: new Leviathan(scene, events, this.beams),
      cabrio: new Sternencabrio(scene, events, this.beams),
      kosmograd: new Kosmograd(scene, events, this.beams),
      unitas: new Unitas(scene, events, this.beams),
      squadron: new Rebellenstaffel(scene, events, this.beams),
      odysseus: new Odysseus(scene, events, this.beams),
      worldbreaker: new Weltenbrecher(scene, events, this.beams),
    };
    this.pickups = new Pickups(scene);
    this.powerUps = new PowerUps(scene);
    this.pilots = [SHIP_PALETTE, SHIP_PALETTE_P2].map((palette) => {
      const ship = new Player(scene, palette);
      ship.onFire = () => this.sound.shoot();
      ship.stats = this.upgrades;
      return { ship, weapons: new Weapons(scene, this.beams, this.playerBullets, this.missiles, sound), hull: 5, active: true, respawn: 0 };
    });
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
    this.shop = new Shop({
      state: () => ({ gold: this.gold, hull: this.lowestHull, maxHull: this.maxHull, upgrades: this.upgrades }),
      buy: (def) => this.buy(def),
      close: () => this.closeShop(),
      save: () => this.saveMenu.show('save'),
      move: () => this.sound.shopMove(),
    });
    this.title = new Title({
      start: (i) => this.start(i),
      load: () => this.saveMenu.show('load'),
      credits: () => {
        this.creditsOpen = true;
        document.getElementById('credits')!.classList.remove('hidden');
      },
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
      // Zum Testen direkt losfliegen: ?diff=0..4 wählt die Stufe, ?shop öffnet die Werft, ?gold=500 gibt Startgold,
      // ?players=2 startet im Zweispieler-Modus
      if (DEV.difficulty !== null) this.difficulty = DEV.difficulty;
      this.setPlayers(DEV.players);
      for (const pl of this.pilots) if (pl.active) pl.ship.reset();
      this.applyDifficulty();
      this.gold = DEV.gold;
      // ?boss=N: mit dem Gold starten, das man bis dahin ungefähr gesammelt hätte, und erst in die Werft
      if (DEV.boss !== null && !DEV.gold) {
        const w = this.waves.number;
        this.gold = Math.round(17 * w * (1 + w / 80));
        if (this.gold > 0) this.shopTimer = 0.5;
      }
      if (DEV.shop) this.shopTimer = 0.5;
    } else {
      this.applyDifficulty();
      this.setPlayers(1);
      this.state = 'title';
      this.title.show(this.difficulty);
    }
    this.refreshHud();
  }

  // -------------------------------------------------------------------------
  // Spieler
  // -------------------------------------------------------------------------

  /** Ein- oder Zweispieler: Spieler 2 ein- oder ausblenden, Startpositionen nebeneinander. */
  private setPlayers(n: number): void {
    this.players = n === 2 ? 2 : 1;
    this.pilots[1].active = this.players === 2;
    this.pilots[0].ship.startX = this.players === 2 ? -4 : 0;
    this.pilots[1].ship.startX = 4;
    if (!this.pilots[1].active) {
      this.pilots[1].ship.destroy();
      this.pilots[1].weapons.reset();
    }
    this.hud.setPlayers(this.players);
  }

  private get activePilots(): Pilot[] {
    return this.pilots.filter((p) => p.active);
  }

  /** Schiffe aller Spieler im Durchlauf (Ziele für Gegner, Münzen, Kapseln). */
  private get ships(): Player[] {
    return this.activePilots.map((p) => p.ship);
  }

  /** Nächstes lebendes Schiff; wenn keins lebt, Spieler 1 (Gegner zielen dann ins Leere). */
  private aimAt(x: number, y: number): Player {
    return nearest(this.ships, x, y) ?? this.pilots[0].ship;
  }

  /** Mittelpunkt der lebenden Schiffe (für die Parallaxe des Hintergrunds). */
  get focus(): { x: number; y: number } {
    const alive = this.ships.filter((s) => s.alive);
    const list = alive.length ? alive : [this.pilots[0].ship];
    return { x: list.reduce((n, s) => n + s.x, 0) / list.length, y: list.reduce((n, s) => n + s.y, 0) / list.length };
  }

  private get anyDamaged(): boolean {
    return this.activePilots.some((p) => p.hull < this.maxHull);
  }

  private get lowestHull(): number {
    return Math.min(...this.activePilots.map((p) => p.hull));
  }

  /** Im Koop: abgeschossener Spieler kehrt mit halber Hülle zurück. */
  private revive(pl: Pilot, index: number): void {
    pl.ship.reset();
    pl.ship.hit();
    pl.hull = Math.ceil(this.maxHull / 2);
    this.hud.showBanner(`SPIELER ${index + 1}`, 'IST WIEDER DABEI', false, 1800);
    this.sound.powerUp('repair');
    this.refreshHud();
  }

  /** Mit gewähltem Schwierigkeitsgrad einen neuen Durchlauf beginnen. */
  private start(difficulty: number): void {
    this.difficulty = difficulty;
    saveDifficulty(difficulty);
    this.title.hide();
    this.setPlayers(this.title.players);
    this.restart();
    this.hud.showHint();
    this.sound.waveStart();
  }

  private get setting() {
    return DIFFICULTIES[this.difficulty];
  }

  private applyDifficulty(): void {
    this.waves.hpMul = this.setting.hp;
    this.waves.countMul = this.setting.count;
    this.waves.fireMul = this.setting.enemyFire;
    this.waves.speedMul = this.setting.speed;
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
      version: 2,
      savedAt: new Date().toISOString(),
      label: WaveDirector.label(progress),
      difficulty: DIFFICULTIES[this.difficulty].id,
      loop: progress.loop,
      position: WaveDirector.positionOf(progress.entry),
      waveNumber: progress.waveNumber,
      score: this.score,
      gold: this.gold,
      hull: this.pilots[0].hull,
      upgrades: this.upgrades.toJSON(),
      players: this.players,
      hull2: this.pilots[1].hull,
    };
    if (writeSlot(slot, data)) this.sound.shopBuy();
    else this.sound.shopDeny();
  }

  private loadSave(data: SaveData): void {
    this.saveMenu.hide();
    this.title.hide();
    this.setPlayers(data.players);
    this.restart();
    this.difficulty = difficultyIndex(data.difficulty) ?? 1;
    this.applyDifficulty();
    this.upgrades.load(data.upgrades);
    this.score = data.score;
    this.gold = data.gold;
    this.pilots[0].hull = Math.max(1, Math.min(this.maxHull, data.hull));
    this.pilots[1].hull = Math.max(1, Math.min(this.maxHull, data.hull2));
    this.waves.restore({ entry: WaveDirector.entryOf(data.position), waveNumber: data.waveNumber, loop: data.loop });
    this.hud.showBanner('SPIELSTAND GELADEN', data.label, false, 2500);
    this.sound.shopOpen();
    this.refreshHud();
  }

  /**
   * Alle Sektoren geschafft: weiter mit dem nächsten Schwierigkeitsgrad, Upgrades, Gold und Score bleiben.
   * Auf der höchsten Stufe steigt stattdessen die Runde (Gegner werden weiter härter).
   */
  private onCampaignComplete(): boolean {
    for (const pl of this.pilots) pl.hull = this.maxHull;
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
    return this.upgrades.maxHull + this.setting.hull;
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
    this.pickups.clear();
    this.powerUps.clear();
    this.waves.reset();
    this.applyDifficulty();
    for (const pl of this.pilots) {
      pl.weapons.reset();
      pl.respawn = 0;
      if (pl.active) pl.ship.reset();
      else pl.ship.destroy();
    }
    this.sound.setMusic('normal');
    this.upgrades.reset();
    this.shop.hide();
    this.saveMenu.hide();
    this.pendingCampaign = null;
    this.shopTimer = null;
    this.score = 0;
    this.gold = 0;
    for (const pl of this.pilots) pl.hull = this.maxHull;
    this.state = 'playing';
    this.hud.hideGameOver();
    this.refreshHud();
  }

  update(dt: number, input: Input): void {
    this.devStats.time += dt;
    // Musik-Intensität: ruhig im Titel, in Menüs und zwischen den Wellen, dichter je mehr Gegner da sind
    const calm = this.state === 'title' || this.shop.isOpen || this.saveMenu.isOpen;
    const busy = this.boss?.active ? 1 : Math.min(1, this.enemies.aliveCount / 10);
    this.sound.setIntensity(calm ? 0.05 : busy, dt);

    // Speicher-/Lademenü liegt über allem
    if (this.saveMenu.isOpen) {
      this.saveMenu.handleInput(input);
      return;
    }
    // Credits schließen mit Esc oder Enter
    if (this.creditsOpen) {
      if (input.wasPressed('Escape') || input.wasPressed('Enter') || input.wasPressed('Space')) {
        this.creditsOpen = false;
        document.getElementById('credits')!.classList.add('hidden');
      }
      return;
    }
    // Auf dem Titelbildschirm läuft nur der Hintergrund
    if (this.state === 'title') {
      this.title.handleInput(input);
      return;
    }
    // In der Werft ruht das Spielgeschehen
    if (this.shop.isOpen && this.bot) {
      this.botShopping();
      return;
    }
    if (this.shop.isOpen) {
      this.shop.handleInput(input);
      return;
    }
    if (this.shopTimer !== null && this.state === 'playing') {
      this.shopTimer -= dt;
      if (this.shopTimer <= 0) this.openShop(input);
    }

    if (this.state === 'gameover') {
      if (input.wasPressed('Enter') || input.wasPressed('Start')) this.restart();
      else if (input.wasPressed('Escape')) this.toTitle();
    } else if (this.state === 'dying') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'gameover';
        this.hud.showGameOver(this.score);
        this.sound.gameOver();
      }
    }

    const boss = this.boss?.active ? this.boss : null;
    this.pickups.magnetMul = this.upgrades.magnetMul;
    // Unter dem Endgegner bleiben, nicht in seinen Rumpf hineinfliegen
    const bottom = boss?.bottom ?? null;
    const ceiling = bottom !== null ? Math.min(FIELD.halfHeight, bottom - 1.6) : null;
    this.pilots.forEach((pl, i) => {
      if (!pl.active) return;
      const p = pl.ship;
      const controls =
        this.bot && i === 0
          ? this.bot.controls(
              {
                x: p.x,
                y: p.y,
                hitRadius: p.hitRadius,
                ceiling,
                speed: PLAYER.speed * this.upgrades.speedMul,
                bullets: Object.values(this.hostile).flatMap((pool) => pool.bullets),
                bulletRadius: ENEMY_BULLET_RADIUS,
                beams: this.beams.all,
                enemies: this.enemies.all,
                boss,
              },
              dt,
            )
          : input.controlsFor(i, this.players);
      pl.weapons.permanentDrones = this.upgrades.drones;
      p.ceiling = ceiling;
      p.update(dt, controls, this.playerBullets, this.fx.engine, this.fx.sparks, !pl.weapons.laserActive);
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
      } else if (pl.respawn > 0 && this.state === 'playing') {
        // Koop: nach einer Weile zurück ins Spiel
        pl.respawn -= dt;
        if (pl.respawn <= 0) this.revive(pl, i);
      }
      pl.weapons.update(dt, controls, p);
    });
    if (this.state === 'playing') this.waves.update(dt, this.enemies.aliveCount);

    // Gegner und Endgegner bewegen (jeder zielt auf das nächste Schiff), ihre Ausgaben sammeln und umsetzen
    const out = this.out;
    out.shots.length = out.spawns.length = out.effects.length = 0;
    for (const e of this.enemies.all) {
      if (!e.active) continue;
      const t = this.aimAt(e.x, e.y);
      if (!e.update(dt, t.x, t.y, out)) e.kill();
    }
    if (boss) {
      const t = this.aimAt(boss.x, boss.y);
      boss.threats = this.playerBullets.bullets;
      boss.players = this.ships;
      boss.update(dt, t.x, t.y, out);
    }
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
    for (const pool of Object.values(this.hostile)) pool.update(dt, this.ships);
    for (const pl of this.activePilots) this.updateLaser(dt, pl.weapons);
    this.beams.update(dt);
    this.beamSounds();
    this.collide();
    this.collect(dt);

    this.hud.setBoss(boss ? this.bossName + boss.hudSuffix() : null, boss ? boss.health() : 0);
    // Aktive Power-ups, im Koop mit vorangestelltem Spieler
    this.hud.setPowerUps(
      this.activePilots.flatMap((pl, i) => {
        const p = pl.ship;
        const w = pl.weapons;
        const tag = this.players === 2 ? `P${i + 1} ` : '';
        return [
          { label: `${tag}SCHILD ×${p.shieldHits}`, time: p.shielded ? p.shieldTime : 0, cls: 'pu-shield' },
          { label: `${tag}FÄCHER`, time: p.fanTime, cls: 'pu-fan' },
          { label: `${tag}LASER`, time: w.laserTime, cls: 'pu-laser' },
          { label: `${tag}RAKETEN`, time: w.missileTime, cls: 'pu-missile' },
          { label: `${tag}BEGLEITER`, time: w.optionTime, cls: 'pu-option' },
        ];
      }),
    );
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
          this.fx.sparks.emit(fx.x, fx.y, Math.cos(a) * 7, Math.sin(a) * 3, 0.3, AETHER_SPARK);
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
  private updateLaser(dt: number, weapons: Weapons): void {
    const beam = weapons.laser;
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
    const kind = this.anyDamaged ? 'repair' : randomPowerUp('repair');
    this.powerUps.spawn(kind, randRange(-6, 6), 20);
  }

  private startBoss(id: BossId, name: string): void {
    this.pendingSector = null;
    this.bossName = name;
    this.hud.showBanner('WARNUNG', `${this.bossName} NÄHERT SICH`, true, 3500);
    this.sound.bossWarning(id);
    this.sound.setMusic(id);
    const diff = this.waves.difficulty;
    const tune = BOSS_TUNING[id];
    this.boss = this.bosses[id];
    // Endgegner: eigenes Angriffstempo (bossFire statt des Faktors für normale Gegner)
    // Auf Sehr leicht steigt die Abstimmung flacher an (bossRamp < 1)
    const ramp = this.setting.bossRamp;
    const fireRate = (diff.fireRate / this.setting.enemyFire) * tune.fire ** ramp * this.setting.bossFire;
    // Lebenspunkte: Stufe (Runde) mal bossHp statt des Faktors für normale Gegner
    const hp = (diff.hp / this.setting.hp) * this.setting.bossHp;
    this.boss.start({ ...diff, hp: hp * DEV.bossHp, fireRate }, tune.hp ** ramp);
    this.devStats.bossStart = this.devStats.time;
    this.devStats.bossHits = this.devStats.hits;
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
        if (repair) this.powerUps.spawn(this.anyDamaged ? 'repair' : randomPowerUp('repair'), x, y);
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
        else if (name === 'tick') this.sound.tick(!!arg);
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
        this.devStats.bosses.push({
          name: this.bossName,
          wave: this.waves.number,
          time: Math.round(this.devStats.time - this.devStats.bossStart),
          hits: this.devStats.hits - this.devStats.bossHits,
          maxHull: this.maxHull,
          upgrades: JSON.stringify(this.upgrades.toJSON()),
        });
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
      const p = this.aimAt(e.x, e.y);
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

    for (const pl of this.activePilots) this.collidePilot(pl);
  }

  /** Treffer auf ein Spielerschiff: Geschosse, Strahlen, Zusammenstöße. */
  private collidePilot(pl: Pilot): void {
    const p = pl.ship;
    if (!p.canBeHit) return;

    // Gegnerische Geschosse
    for (const [style, pool] of Object.entries(this.hostile)) {
      for (const b of pool.bullets) {
        if (!b.active) continue;
        const r = p.hitRadius + ENEMY_BULLET_RADIUS;
        if (sweptDistanceSq(b, p.x, p.y) > r * r) continue;
        pool.kill(b);
        this.damagePlayer(pl, `schuss:${style}`);
        return;
      }
    }

    // Feindliche Strahlen
    for (const beam of this.beams.all) {
      if (!beam.active || !beam.hostile || beam.charge) continue;
      if (beamDistanceSq(beam, p.x, p.y) < (beam.width / 2 + p.hitRadius * 0.7) ** 2) {
        this.damagePlayer(pl, `strahl:${beam.width.toFixed(1)}`);
        return;
      }
    }

    // Zusammenstoß mit Gegnern, der Hülle des Endgegners oder seinen Anbauten
    for (const e of this.enemies.all) {
      if (!e.active || !e.solid) continue;
      const r = e.type.radius + p.hitRadius + 0.4;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r * r) continue;
      if (e.damage(RAM_DAMAGE) === 'killed') this.destroyEnemy(e);
      this.damagePlayer(pl, `ramm:${e.typeId}`);
      return;
    }
    if (this.boss?.touchesPlayer(p.x, p.y, p.hitRadius)) this.damagePlayer(pl, 'boss');
  }

  private destroyEnemy(e: Enemy): void {
    const t = e.type;
    explode(this.fx.fire, this.fx.sparks, e.x, e.y, t.explosion, e.debrisColor);
    this.sound.explode(t.explosion, t.material);
    this.hooks.shake(t.explosion === 3 ? 0.6 : t.explosion === 2 ? 0.25 : 0.08);
    this.pickups.drop(e.x, e.y, t.coins);
    if (Math.random() < t.drop) {
      this.powerUps.spawn(this.anyDamaged && Math.random() < 0.5 ? 'repair' : randomPowerUp(), e.x, e.y);
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

  private damagePlayer(pl: Pilot, source = '?'): void {
    const p = pl.ship;

    // Schild fängt den Treffer ab
    if (p.shielded) {
      p.absorbHit();
      this.sound.shieldHit();
      this.hooks.shake(0.3);
      impactSparks(this.fx.sparks, p.x, p.y);
      return;
    }
    // ?god: Treffer nur zählen (mit kurzer Unverwundbarkeit wie bei echtem Schaden)
    if (DEV.god) {
      this.devStats.hits++;
      this.devStats.hitBy[source] = (this.devStats.hitBy[source] ?? 0) + 1;
      p.hit();
      return;
    }

    pl.hull--;
    this.hooks.shake(0.7);
    impactSparks(this.fx.sparks, p.x, p.y);
    this.refreshHud();

    if (pl.hull > 0) {
      p.hit();
      this.sound.playerHit();
      return;
    }

    // Schiff zerstört
    explode(this.fx.fire, this.fx.sparks, p.x, p.y, 3, PLAYER_DEBRIS);
    this.sound.explode(3);
    this.hooks.shake(1.2);
    p.destroy();
    pl.weapons.reset();
    // Koop: solange der andere noch fliegt, geht es weiter, der Abgeschossene kommt später zurück
    if (this.activePilots.some((o) => o.ship.alive)) {
      pl.respawn = RESPAWN_TIME;
      this.hud.showBanner(`SPIELER ${this.pilots.indexOf(pl) + 1} ABGESCHOSSEN`, `ZURÜCK IN ${RESPAWN_TIME} SEKUNDEN`, true, 2000);
      return;
    }
    this.state = 'dying';
    this.stateTimer = 1.6;
  }

  // -------------------------------------------------------------------------
  // Münzen und Power-ups
  // -------------------------------------------------------------------------

  private collect(dt: number): void {
    const pilots = this.activePilots;
    const ships = pilots.map((pl) => pl.ship);
    const coins = this.pickups.update(dt, ships);
    if (coins > 0) {
      this.gold += coins;
      this.sound.coin();
      this.refreshHud();
    }
    for (const { kind, who } of this.powerUps.update(dt, ships)) this.applyPowerUp(kind, pilots[who] ?? pilots[0]);
  }

  /** Power-up für den Spieler, der die Kapsel eingesammelt hat. */
  private applyPowerUp(kind: PowerUpKind, pl: Pilot): void {
    const p = pl.ship;
    const w = pl.weapons;
    this.sound.powerUp(kind);
    const tag = this.players === 2 ? `P${this.pilots.indexOf(pl) + 1}: ` : '';
    const banner = (title: string, sub: string) => this.hud.showBanner(tag + title, sub, false, 1200);
    const time = (base: number) => Math.round(base * this.upgrades.durationMul);
    switch (kind) {
      case 'repair':
        if (pl.hull < this.maxHull) {
          pl.hull++;
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
    for (const pl of this.pilots) pl.weapons.stopLaser();
    input.clearPressed();
    this.hud.hideBanner();
    this.shop.show();
    this.sound.shopOpen();
    this.refreshHud();
  }

  /** Autopilot in der Werft: reparieren, dann der Reihe nach Verbesserungen, solange das Gold reicht. */
  private botShopping(): void {
    const order: UpgradeId[] = ['repair', 'guns', 'fireRate', 'damage', 'hull', 'shieldGen', 'drones', 'duration', 'engine', 'magnet'];
    for (let bought = true; bought; ) {
      bought = false;
      for (const id of order) {
        const def = UPGRADES.find((u) => u.id === id)!;
        const price = this.upgrades.price(def);
        if (price === null || price > this.gold || (id === 'repair' && !this.anyDamaged)) continue;
        if (this.buy(def) === 'ok') {
          bought = true;
          break;
        }
      }
    }
    this.closeShop();
  }

  private closeShop(): void {
    this.shop.hide();
    this.refreshHud();
  }

  private buy(def: UpgradeDef): BuyResult {
    const price = this.upgrades.price(def);
    let result: BuyResult = 'ok';
    if (price === null) result = 'max';
    else if (def.id === 'repair' && !this.anyDamaged) result = 'full';
    else if (price > this.gold) result = 'poor';
    if (result !== 'ok' || price === null) {
      this.sound.shopDeny();
      return result;
    }
    this.gold -= price;
    this.upgrades.buy(def.id);
    // Mehr Panzerung bringt das neue Segment gleich repariert mit
    // Im Koop für beide Spieler
    if (def.id === 'hull' || def.id === 'repair') for (const pl of this.pilots) pl.hull = Math.min(this.maxHull, pl.hull + 1);
    this.sound.shopBuy();
    this.refreshHud();
    return 'ok';
  }

  private refreshHud(): void {
    this.hud.setScore(this.score);
    this.hud.setGold(this.gold);
    this.pilots.forEach((pl, i) => this.hud.setHull(i, pl.hull, this.maxHull));
  }
}
