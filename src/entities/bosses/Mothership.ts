import * as THREE from 'three';
import { PIXEL } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import {
  BOSS_H,
  BOSS_MOUNTS,
  BOSS_PALETTE,
  BOSS_W,
  CANNON_MUZZLE_Y,
  CANNON_ROWS,
  CANNON_WRECK_ROWS,
  CORE_FRAMES,
  DOOR_LEFT_ROWS,
  DOOR_RIGHT_ROWS,
  ESCORT_FRAMES,
  paintBossHull,
} from '../../gfx/bossArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { EnemyOutput } from '../Enemies';
import { BossBase, easeInOut, easeOut, type BossEvents, type BossTarget, type Mount } from './BossBase';

const OPEN_TIME = 1.4;
const ESCORT_COUNT = 8;
const ORBIT_RX = 13;
const ORBIT_RY = 7.5;
/** Wie weit die Tore aufgleiten, in Pixeln. */
const DOOR_TRAVEL = 13;
const HULL_DEBRIS = new THREE.Color(0x726a9c);
const ESCORT_DEBRIS = new THREE.Color(0xe03c5a);

interface Cannon {
  sprite: PixelSprite;
  mount: Mount;
  /** −1 links, 0 Mitte, 1 rechts. */
  side: number;
  hp: number;
  alive: boolean;
  flash: number;
  timer: number;
  /** Verbleibende Schüsse der laufenden Salve. */
  stream: number;
  streamTimer: number;
  aim: number;
}

interface Escort {
  sprite: PixelSprite;
  hp: number;
  alive: boolean;
  flash: number;
  fireTimer: number;
  x: number;
  y: number;
  /** 0..1: Start aus dem Hangar bis auf die Umlaufbahn. */
  launch: number;
}

/**
 * Sektor 1, Mutterschiff: Hülle unzerstörbar, drei Kanonen mit Sinuswellen-Schüssen und acht Begleitdrohnen.
 * Danach öffnen sich die Tore, der Kiel sprengt auf und der Fusionskern liegt frei.
 */
export class Mothership extends BossBase {
  private orbit = 0;
  private coreHp = 0;
  private coreFlash = 0;
  private coreTimer = 0;
  private coreStreamTimer = 0;
  private ringOffset = 0;
  private smokeTimer = 0;
  private readonly doors: PixelSprite[];
  private readonly core: PixelSprite;
  private readonly cannons: Cannon[];
  private readonly escorts: Escort[];

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, BOSS_PALETTE, BOSS_W, BOSS_H, [paintBossHull(false), paintBossHull(true)], HULL_DEBRIS, 'metal');
    this.doors = [this.sprite([DOOR_LEFT_ROWS]), this.sprite([DOOR_RIGHT_ROWS])];
    this.core = this.sprite(CORE_FRAMES);
    const mounts: [Mount, number][] = [
      [BOSS_MOUNTS.cannonLeft, -1],
      [BOSS_MOUNTS.cannonCenter, 0],
      [BOSS_MOUNTS.cannonRight, 1],
    ];
    this.cannons = mounts.map(([mount, side]) => ({
      sprite: this.sprite([CANNON_ROWS, CANNON_WRECK_ROWS]),
      mount,
      side,
      hp: 0,
      alive: false,
      flash: 0,
      timer: 0,
      stream: 0,
      streamTimer: 0,
      aim: -Math.PI / 2,
    }));
    this.escorts = Array.from({ length: ESCORT_COUNT }, () => ({
      sprite: this.sprite(ESCORT_FRAMES),
      hp: 0,
      alive: false,
      flash: 0,
      fireTimer: 0,
      x: 0,
      y: 0,
      launch: 0,
    }));
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [...this.doors, this.core, ...this.cannons.map((c) => c.sprite), ...this.escorts.map((e) => e.sprite)];
  }

  protected onStart(): void {
    const hp = this.diff.hp;
    this.orbit = 0;
    this.coreHp = 60 * hp;
    this.coreTimer = 1.5;
    this.coreStreamTimer = 0.8;
    this.cannons.forEach((c, i) => {
      c.hp = (c.side === 0 ? 45 : 35) * hp;
      c.alive = true;
      c.flash = 0;
      c.stream = 0;
      c.timer = 1 + i * 0.9;
      c.sprite.setFrame(0);
      c.sprite.visible = true;
    });
    for (const e of this.escorts) {
      e.hp = 4 * hp;
      e.alive = true;
      e.flash = 0;
      e.launch = 0;
      e.fireTimer = randRange(2, 4);
      e.sprite.visible = false;
    }
    for (const d of this.doors) d.visible = true;
    this.core.visible = false;
    this.core.setFlash(0);
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    const deadCannons = this.cannons.filter((c) => !c.alive).length;
    const deadEscorts = this.escorts.filter((e) => !e.alive).length;
    this.rage = (1 + deadCannons * 0.3 + deadEscorts * 0.04) * this.diff.fireRate;
    for (const c of this.cannons) c.flash = Math.max(0, c.flash - dt * 8);
    for (const e of this.escorts) e.flash = Math.max(0, e.flash - dt * 8);
    this.coreFlash = Math.max(0, this.coreFlash - dt * 8);

    if (this.phase === 'fight') {
      this.updateCannons(dt, px, py, out);
      this.updateEscorts(dt, px, py, out, deadEscorts);
      if (deadCannons === this.cannons.length && deadEscorts === ESCORT_COUNT) {
        this.setPhase('opening');
        this.core.visible = true;
        this.events.opening('FUSIONSKERN', 'FREIGELEGT');
        this.openShaft();
      }
    } else if (this.phase === 'opening') {
      if (this.phaseTime >= OPEN_TIME) this.setPhase('core');
    } else if (this.phase === 'core') {
      this.updateCore(dt, px, py, out);
    }
    this.updateSmoke(dt);
  }

  /** Kiel unter dem Kern aufsprengen: Mittelkanonen-Wrack fliegt weg, der Schacht zum Kern ist frei. */
  private openShaft(): void {
    this.setHullVariant(1);
    const center = this.cannons.find((c) => c.side === 0)!;
    center.sprite.visible = false;
    const m = this.world(center.mount);
    this.events.explode(m.x, m.y, 3, HULL_DEBRIS);
    this.events.explode(m.x, m.y + 2, 2, HULL_DEBRIS);
    this.events.shake(0.8);
  }

  private updateCannons(dt: number, px: number, py: number, out: EnemyOutput): void {
    for (const c of this.cannons) {
      if (!c.alive) continue;
      const m = this.world(c.mount);
      const mx = m.x;
      const my = m.y + CANNON_MUZZLE_Y * PIXEL;

      if (c.stream > 0) {
        c.streamTimer -= dt;
        if (c.streamTimer > 0) continue;
        c.streamTimer = 0.07;
        c.stream--;
        if (c.side === 0) {
          // Doppelhelix: zwei gegenläufige Wellen
          for (const phase of [0, Math.PI]) {
            out.shots.push({ x: mx, y: my, vx: Math.cos(c.aim) * 12, vy: Math.sin(c.aim) * 12, amp: 1.8, freq: 7, phase, style: 'boss' });
          }
        } else {
          // Seitenkanonen schlingern gegenläufig
          const phase = c.side < 0 ? 0 : Math.PI;
          out.shots.push({ x: mx, y: my, vx: Math.cos(c.aim) * 11, vy: Math.sin(c.aim) * 11, amp: 2.2, freq: 6, phase, style: 'boss' });
        }
        continue;
      }

      c.timer -= dt * this.rage;
      if (c.timer > 0) continue;
      c.timer = c.side === 0 ? 2.6 : 3.2;
      c.stream = c.side === 0 ? 10 : 9;
      c.streamTimer = 0;
      // Grob auf den Spieler zielen, aber nur in einem Kegel nach unten
      const spread = c.side === 0 ? 0.6 : 0.35;
      c.aim = THREE.MathUtils.clamp(Math.atan2(py - my, px - mx), -Math.PI / 2 - spread, -Math.PI / 2 + spread);
    }
  }

  private updateEscorts(dt: number, px: number, py: number, out: EnemyOutput, dead: number): void {
    // Je weniger Drohnen übrig sind, desto schneller kreisen sie
    this.orbit += dt * 0.8 * (1 + dead * 0.12);
    const core = this.world(BOSS_MOUNTS.core);
    const cy = this.y - 1;
    this.escorts.forEach((e, i) => {
      if (!e.alive) return;
      e.launch = THREE.MathUtils.clamp((this.phaseTime - i * 0.18) / 1.5, 0, 1);
      const l = easeOut(e.launch);
      const a = this.orbit + (i / ESCORT_COUNT) * Math.PI * 2;
      // Start aus der Kernkammer, dann hinaus auf die Ellipse
      e.x = core.x + Math.cos(a) * ORBIT_RX * l;
      e.y = core.y + (cy + Math.sin(a) * ORBIT_RY - core.y) * l;
      e.sprite.visible = e.launch > 0;
      e.sprite.setFrame(Math.floor(this.time * 12 + i) % ESCORT_FRAMES.length);

      if (e.launch < 1 || e.y > this.y - 3) return;
      e.fireTimer -= dt * this.rage;
      if (e.fireTimer > 0) return;
      e.fireTimer = randRange(2.2, 3.6);
      const aim = Math.atan2(py - e.y, px - e.x);
      out.shots.push({ x: e.x, y: e.y, vx: Math.cos(aim) * 13, vy: Math.sin(aim) * 13, style: 'normal' });
    });
  }

  private updateCore(dt: number, px: number, py: number, out: EnemyOutput): void {
    const c = this.world(BOSS_MOUNTS.core);
    // Verzweiflungsangriff: rotierende Ringsalven
    this.coreTimer -= dt * this.rage;
    if (this.coreTimer <= 0) {
      this.coreTimer = 1.9;
      this.ringOffset += 0.37;
      for (let i = 0; i < 14; i++) {
        const a = this.ringOffset + (i / 14) * Math.PI * 2;
        out.shots.push({ x: c.x, y: c.y, vx: Math.cos(a) * 8.5, vy: Math.sin(a) * 8.5, style: 'boss' });
      }
    }
    // Dazwischen eine Sinuswelle Richtung Spieler
    this.coreStreamTimer -= dt;
    if (this.coreStreamTimer <= 0) {
      this.coreStreamTimer = 0.18;
      const aim = Math.atan2(py - c.y, px - c.x);
      out.shots.push({ x: c.x, y: c.y - 1, vx: Math.cos(aim) * 10, vy: Math.sin(aim) * 10, amp: 2.5, freq: 5, phase: 0, style: 'boss' });
    }
  }

  private updateSmoke(dt: number): void {
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0) return;
    this.smokeTimer = 0.12;
    for (const c of this.cannons) {
      if (c.alive || !c.sprite.visible) continue;
      const m = this.world(c.mount);
      this.events.smoke(m.x + randRange(-0.6, 0.6), m.y + randRange(-0.3, 0.6));
    }
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    if (this.phase === 'fight') {
      for (const e of this.escorts) {
        if (!e.alive || e.launch < 0.3) continue;
        list.push({
          x: e.x,
          y: e.y,
          radius: 0.95,
          hit: (dmg) => {
            e.hp -= dmg;
            e.flash = 1;
            if (e.hp > 0) return this.events.hit();
            e.alive = false;
            e.sprite.visible = false;
            this.events.explode(e.x, e.y, 1, ESCORT_DEBRIS);
            this.events.partDestroyed(e.x, e.y, 400, 2, false);
          },
        });
      }
      for (const c of this.cannons) {
        if (!c.alive) continue;
        const m = this.world(c.mount);
        list.push({
          x: m.x,
          y: m.y,
          radius: 1.15,
          hit: (dmg) => {
            c.hp -= dmg;
            c.flash = 1;
            if (c.hp > 0) return this.events.hit();
            c.alive = false;
            c.sprite.setFrame(1);
            this.events.explode(m.x, m.y, 2, HULL_DEBRIS);
            this.events.shake(0.5);
            this.events.partDestroyed(m.x, m.y, 2500, 6, true);
          },
        });
      }
    } else if (this.phase === 'core') {
      const c = this.world(BOSS_MOUNTS.core);
      list.push({
        x: c.x,
        y: c.y,
        radius: 1.25,
        hit: (dmg) => {
          this.coreHp -= dmg;
          this.coreFlash = 1;
          this.events.hit();
          if (this.coreHp <= 0) this.startDying();
        },
      });
    }
    return list;
  }

  protected layout(): void {
    const open = this.phase === 'opening' ? easeInOut(this.phaseTime / OPEN_TIME) : this.phase === 'core' || this.phase === 'dying' ? 1 : 0;
    const dl = this.world(BOSS_MOUNTS.doorLeft);
    const dr = this.world(BOSS_MOUNTS.doorRight);
    this.doors[0].place(dl.x - open * DOOR_TRAVEL * PIXEL, dl.y, -0.1);
    this.doors[1].place(dr.x + open * DOOR_TRAVEL * PIXEL, dr.y, -0.1);

    const core = this.world(BOSS_MOUNTS.core);
    this.core.setFrame(Math.floor(this.time * 9) % CORE_FRAMES.length);
    this.core.setFlash(this.phase === 'dying' || this.coreFlash > 0.5 ? 1 : 0);
    this.core.place(core.x, core.y, -0.2);

    for (const c of this.cannons) {
      const m = this.world(c.mount);
      c.sprite.setFlash(c.flash > 0.5 ? 1 : 0);
      c.sprite.place(m.x, m.y, -0.05);
    }
    for (const e of this.escorts) {
      e.sprite.setFlash(e.flash > 0.5 ? 1 : 0);
      e.sprite.place(e.x, e.y, 0);
    }
  }

  /** Erste Hälfte des Balkens: Kanonen und Drohnen, zweite Hälfte: der Kern. */
  health(): number {
    if (this.phase === 'enter') return 1;
    if (this.phase === 'fight') {
      const max = this.cannons.reduce((n, c) => n + (c.side === 0 ? 45 : 35), 0) * this.diff.hp + ESCORT_COUNT * 4 * this.diff.hp;
      const left = this.cannons.reduce((n, c) => n + Math.max(0, c.alive ? c.hp : 0), 0) + this.escorts.reduce((n, e) => n + (e.alive ? Math.max(0, e.hp) : 0), 0);
      return 0.5 + 0.5 * (left / max);
    }
    return 0.5 * Math.max(0, this.coreHp) / (60 * this.diff.hp);
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    return this.escorts.some((e) => e.alive && e.launch >= 0.3 && (e.x - px) ** 2 + (e.y - py) ** 2 < (r + 0.8) ** 2);
  }
}
