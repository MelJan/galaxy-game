import * as THREE from 'three';
import { FIELD } from '../../config';
import { randRange } from '../../core/view';
import type { Beam, Beams } from '../../fx/Beams';
import { CONDUIT_FRAMES, FLEET_PALETTE, LENS_FRAMES, paintWorldbreaker, WB_H, WB_W } from '../../gfx/fleetArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget, type Mount } from './BossBase';

const PLATE_DEBRIS = new THREE.Color(0x8c8a92);
/** Energieleiter am unteren Rand der Kugel (Raster-Koordinaten der Hülle), damit Schüsse von unten sie erreichen. */
const CONDUITS: Mount[] = [36, 62, 92, 148, 178, 204].map((x) => ({ x, y: Math.round(-10 + Math.sqrt(116 ** 2 - (x - 120) ** 2)) }));
/** Um Leiter und Linse herum hält die Hülle keine Schüsse auf (sie sitzen in der Panzerung). */
const CONDUIT_GAP = 1.4;
const LENS_GAP = 3.4;
const LENS: Mount = { x: 120, y: 86 };
const COUNTDOWN = 45;
const CHARGE_TIME = 2.4;
const FIRE_TIME = 1.8;
/** So viele zerstörte Leiter baut die Kugel nach jedem Schuss wieder auf. */
const REBUILD = 2;
/** Freier Rand links und rechts, in dem man dem großen Strahl entkommt. */
const SAFE_EDGE = 3;
const BEAM_COLOR = 0xffa040;
const OPEN_TIME = 1.6;

interface Conduit {
  mount: Mount;
  sprite: PixelSprite;
  hp: number;
  alive: boolean;
  flash: number;
}

type Super = 'idle' | 'charge' | 'fire';
type Focus = 'idle' | 'charge' | 'fire';

/**
 * Endgegner Sektor 10, Weltenbrecher: eine mondgroße Kampfkugel aus Sechseckplatten mit einer Fokuslinse.
 * Ein Countdown läuft: Bis er abläuft, müssen alle sechs Energieleiter zerstört sein. Sonst feuert die Linse
 * einen Strahl über fast die ganze Bildbreite (nur ganz am Rand ist man sicher), und zwei Leiter bauen sich neu auf.
 * Sind alle Leiter zerstört, birst die Linse, und der Kern dahinter ist verwundbar.
 */
export class Weltenbrecher extends BossBase {
  private readonly conduits: Conduit[];
  private readonly lens: PixelSprite;
  private countdown = COUNTDOWN;
  /** Countdown-Länge: bei ruhigerem Angriffstempo (Sehr leicht) entsprechend mehr Zeit. */
  private get countdownTime(): number {
    return Math.round(COUNTDOWN / Math.min(1, this.diff.fireRate));
  }
  private lastTick = 0;
  private superState: Super = 'idle';
  private superTimer = 0;
  private superBeam: Beam | null = null;
  private focus: Focus = 'idle';
  private focusTimer = 0;
  private focusAngle = -Math.PI / 2;
  private focusBeam: Beam | null = null;
  private coreHp = 0;
  private coreMax = 1;
  private coreFlash = 0;
  private volleyTimer = 0;
  private launchTimer = 0;
  private spiral = 0;
  private spiralTimer = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, FLEET_PALETTE, WB_W, WB_H, [paintWorldbreaker()], PLATE_DEBRIS, 'metal', 4.2);
    this.conduits = CONDUITS.map((mount) => ({ mount, sprite: this.sprite(CONDUIT_FRAMES), hp: 0, alive: false, flash: 0 }));
    this.lens = this.sprite(LENS_FRAMES);
    this.hint = ['6 ENERGIELEITER', 'VOR ABLAUF DES COUNTDOWNS ZERSTÖREN'];
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [...this.conduits.map((c) => c.sprite), this.lens];
  }

  private get conduitMax(): number {
    return 24 * this.hpMul;
  }

  private get alive(): number {
    return this.conduits.filter((c) => c.alive).length;
  }

  health(): number {
    const c = this.conduits.reduce((n, c) => n + (c.alive ? Math.max(0, c.hp) : 0), 0) / (this.conduits.length * this.conduitMax);
    return 0.5 * Math.max(0, this.coreHp) / this.coreMax + 0.5 * c;
  }

  /** Freie Schussbahn zu den Leitern und zur Linse: Dort prallt nichts an der Hülle ab. */
  private exposedAt(x: number, y: number): boolean {
    const l = this.world(LENS);
    if ((l.x - x) ** 2 + (l.y - y) ** 2 < LENS_GAP ** 2) return true;
    return this.conduits.some((c) => {
      if (!c.alive) return false;
      const p = this.world(c.mount);
      return (p.x - x) ** 2 + (p.y - y) ** 2 < CONDUIT_GAP ** 2;
    });
  }

  protected blocksShot(x: number, y: number): boolean {
    return !this.exposedAt(x, y) && super.blocksShot(x, y);
  }

  protected hullRaycast(x: number, y0: number, halfWidth: number): number | null {
    // Der Laser erreicht Leiter und Linse; deren Ziele liegen in der Spalte
    const l = this.world(LENS);
    if (Math.abs(l.x - x) < LENS_GAP) return null;
    if (this.conduits.some((c) => c.alive && Math.abs(this.world(c.mount).x - x) < 1)) return null;
    return super.hullRaycast(x, y0, halfWidth);
  }

  hudSuffix(): string {
    if (this.phase !== 'fight') return '';
    if (this.superState !== 'idle') return ' · !!';
    const s = Math.ceil(this.countdown);
    return ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  protected onStart(): void {
    this.coreMax = this.coreHp = 160 * this.hpMul;
    this.coreFlash = 0;
    for (const c of this.conduits) {
      Object.assign(c, { hp: this.conduitMax, alive: true, flash: 0 });
      c.sprite.visible = true;
      c.sprite.setFrame(0);
    }
    this.lens.visible = true;
    this.lens.setFrame(0);
    this.countdown = this.countdownTime;
    this.lastTick = this.countdown;
    this.superState = 'idle';
    this.focus = 'idle';
    this.focusTimer = 4;
    this.volleyTimer = 2;
    this.launchTimer = 6;
    this.spiral = 0;
    this.spiralTimer = 0;
  }

  protected stopAttacks(): void {
    this.beams.release(this.superBeam);
    this.beams.release(this.focusBeam);
    this.superBeam = this.focusBeam = null;
    this.superState = 'idle';
    this.focus = 'idle';
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.5) * this.diff.fireRate;
    this.coreFlash = Math.max(0, this.coreFlash - dt * 8);
    for (const c of this.conduits) c.flash = Math.max(0, c.flash - dt * 8);
    const lens = this.world(LENS);

    if (this.phase === 'fight') this.updateCountdown(dt, lens);
    if (this.phase === 'opening' && this.phaseTime >= OPEN_TIME) {
      this.setPhase('core');
      this.lens.setFrame(2);
      this.events.opening('LINSE GEBORSTEN', 'TRIFF DEN KERN');
    }

    // Bolzensalven von den Positionslichtern der Kugel
    this.volleyTimer -= dt * this.rage;
    if (this.volleyTimer <= 0 && this.superState === 'idle') {
      this.volleyTimer = this.phase === 'core' ? 1.2 : 1.8;
      for (let i = 0; i < 3; i++) {
        const o = this.world({ x: randRange(30, 210), y: randRange(60, 95) });
        if (!this.hullContains(o.x, o.y)) continue;
        const a = Math.atan2(py - o.y, px - o.x);
        out.shots.push({ x: o.x, y: o.y, vx: Math.cos(a) * 15, vy: Math.sin(a) * 15, style: 'bolt' });
      }
    }

    // Startbuchten schicken Gabelflügler los
    this.launchTimer -= dt * this.rage;
    if (this.launchTimer <= 0) {
      this.launchTimer = this.phase === 'core' ? 9 : 7;
      for (const side of [-1, 1]) {
        const o = this.world({ x: 120 + side * 70, y: 70 });
        out.spawns.push({ type: 'forkfighter', x: o.x, y: o.y, vx: side * 3, vy: -6, pattern: 'chase', speed: 9, hold: 2.5 });
      }
    }

    // Offener Kern: Spirale aus der Linse und ein nachgeführter Fokusstrahl
    if (this.phase === 'core') {
      // Fächer schwenkt hin und her; Salventakt hängt am Angriffstempo
      this.spiral += dt * 2.4;
      this.spiralTimer -= dt * this.rage;
      if (this.spiralTimer <= 0) {
        this.spiralTimer = 0.3;
        // Auf ruhigen Stufen zwei statt drei Geschosse je Salve
        const n = this.diff.fireRate < 0.8 ? 2 : 3;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + Math.sin(this.spiral) * 1.1 + (i - (n - 1) / 2) * 0.5;
          out.shots.push({ x: lens.x, y: lens.y - 1.5, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, style: 'normal' });
        }
      }
      this.updateFocus(dt, lens, px, py);
    }
  }

  private updateCountdown(dt: number, lens: { x: number; y: number }): void {
    if (this.superState === 'idle') {
      this.countdown -= dt;
      const s = Math.ceil(this.countdown);
      if (s < this.lastTick && s <= 10 && s > 0) this.events.sfx('tick', s <= 5 ? 1 : 0);
      this.lastTick = s;
      if (this.countdown <= 0) {
        this.superState = 'charge';
        this.superTimer = CHARGE_TIME;
        this.events.banner('WELTENBRECHER LÄDT', 'AN DEN RAND!', true);
        this.events.sfx('superCharge');
        this.superBeam = this.beams.acquire(BEAM_COLOR, this.superWidth(), true);
        if (this.superBeam) this.superBeam.charge = true;
      }
    } else {
      this.superTimer -= dt;
      if (this.superState === 'charge' && this.superTimer <= 0) {
        this.superState = 'fire';
        this.superTimer = FIRE_TIME;
        if (this.superBeam) this.superBeam.charge = false;
        this.events.sfx('superFire');
        this.events.shake(1.2);
      } else if (this.superState === 'fire') {
        this.events.shake(0.25);
        if (this.superTimer <= 0) {
          this.beams.release(this.superBeam);
          this.superBeam = null;
          this.superState = 'idle';
          this.rebuild();
          this.countdown = this.countdownTime;
          this.lastTick = this.countdown;
        }
      }
    }
    if (this.superBeam) {
      this.superBeam.width = this.superWidth();
      this.superBeam.x = lens.x;
      this.superBeam.y = lens.y;
      this.superBeam.angle = -Math.PI / 2;
      this.superBeam.length = lens.y + FIELD.halfHeight + 4;
    }
  }

  private superWidth(): number {
    return Math.max(4, 2 * (FIELD.halfWidth - SAFE_EDGE));
  }

  /** Nach dem Schuss: zwei zerstörte Leiter wachsen nach. */
  private rebuild(): void {
    const dead = this.conduits.filter((c) => !c.alive);
    for (const c of dead.sort(() => Math.random() - 0.5).slice(0, REBUILD)) {
      Object.assign(c, { alive: true, hp: this.conduitMax, flash: 1 });
      c.sprite.setFrame(0);
    }
    if (dead.length) {
      this.events.sfx('regrow');
      this.events.banner('LEITER WIEDERHERGESTELLT', 'NEUER COUNTDOWN', true);
    }
  }

  private updateFocus(dt: number, lens: { x: number; y: number }, px: number, py: number): void {
    // Pause nach Angriffstempo; auf ruhigen Stufen länger vorwarnen und kürzer brennen
    const calm = Math.min(1, this.diff.fireRate);
    this.focusTimer -= this.focus === 'idle' ? dt * this.rage : dt;
    if (this.focus === 'idle' && this.focusTimer <= 0) {
      this.focus = 'charge';
      this.focusTimer = 1.2 / calm;
      this.focusAngle = Math.atan2(py - lens.y, px - lens.x);
      this.focusBeam = this.beams.acquire(BEAM_COLOR, 1, true);
      if (this.focusBeam) this.focusBeam.charge = true;
    } else if (this.focus === 'charge' && this.focusTimer <= 0) {
      this.focus = 'fire';
      this.focusTimer = 2 * calm;
      if (this.focusBeam) this.focusBeam.charge = false;
    } else if (this.focus === 'fire' && this.focusTimer <= 0) {
      this.focus = 'idle';
      this.focusTimer = 4.5;
      this.beams.release(this.focusBeam);
      this.focusBeam = null;
    }
    if (this.focusBeam) {
      // Folgt dem Spieler langsam
      const want = Math.atan2(py - lens.y, px - lens.x);
      const d = Math.atan2(Math.sin(want - this.focusAngle), Math.cos(want - this.focusAngle));
      const turn = 0.4 * Math.min(1, this.diff.fireRate) * dt;
      this.focusAngle += THREE.MathUtils.clamp(d, -turn, turn);
      this.focusBeam.x = lens.x;
      this.focusBeam.y = lens.y;
      this.focusBeam.angle = this.focusAngle;
      this.focusBeam.length = 60;
    }
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    for (const c of this.conduits) {
      if (!c.alive) continue;
      const p = this.world(c.mount);
      list.push({
        x: p.x,
        y: p.y,
        radius: 0.95,
        hit: (dmg) => {
          c.hp -= dmg;
          c.flash = 1;
          this.events.hit();
          if (c.hp > 0) return;
          c.alive = false;
          c.sprite.setFrame(2);
          this.events.explode(p.x, p.y, 2, PLATE_DEBRIS);
          this.events.partDestroyed(p.x, p.y, 1200, 6, this.alive === 3);
          this.events.shake(0.4);
          if (this.alive === 0 && this.phase === 'fight') {
            this.beams.release(this.superBeam);
            this.superBeam = null;
            this.superState = 'idle';
            this.setPhase('opening');
            this.events.sfx('separation');
          }
        },
      });
    }
    const l = this.world(LENS);
    list.push({
      x: l.x,
      y: l.y,
      radius: 1.9,
      armor: this.phase !== 'core',
      hit: (dmg) => {
        this.coreHp -= dmg;
        this.coreFlash = 1;
        this.events.hit();
        if (this.coreHp <= 0) this.startDying();
      },
    });
    return list;
  }

  protected layout(): void {
    for (const c of this.conduits) {
      const p = this.world(c.mount);
      if (c.alive) c.sprite.setFrame(Math.floor(this.time * 5) % 2);
      c.sprite.setFlash(c.flash > 0.5 ? 1 : 0);
      c.sprite.place(p.x, p.y, -0.2);
    }
    const l = this.world(LENS);
    const charging = this.superState === 'charge' && Math.floor(this.time * 12) % 2 === 0;
    if (this.phase !== 'core' && this.phase !== 'dying') this.lens.setFrame(Math.floor(this.time * 3) % 2);
    this.lens.setFlash(this.phase === 'dying' || this.coreFlash > 0.5 || charging || this.superState === 'fire' ? 1 : 0);
    this.lens.place(l.x, l.y, -0.2);
  }
}
