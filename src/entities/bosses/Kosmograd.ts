import * as THREE from 'three';
import { FIELD, PIXEL } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import { KOSMO_CORE_FRAMES, KOSMO_MODULE_FRAMES, KOSMO_WRECK_ROWS, ORBIT_PALETTE } from '../../gfx/orbitArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const STATION_DEBRIS = new THREE.Color(0xc4c8d0);
const MODULES = 6;
/** Abstand der Modulmitte vom Kern (Welt-Einheiten). */
const ARM = 27 * PIXEL;
const BASE_SPIN = 0.45;
const SPIN_PER_MODULE = 0.13;
/** Halber Winkelbereich um „nach unten“, in dem ein Modul feuert. */
const FIRE_WINDOW = 0.55;
const OPEN_TIME = 1.4;

interface Module {
  sprite: PixelSprite;
  hp: number;
  alive: boolean;
  flash: number;
  muzzle: number;
  fireTimer: number;
  x: number;
  y: number;
  angle: number;
}

interface Wreck {
  sprite: PixelSprite;
  active: boolean;
  hp: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
}

/**
 * Zwischenboss in Sektor 9, Kosmograd: eine alte Modulstation, die sich wie ein Rad dreht.
 * Jedes Modul feuert, solange es nach unten zum Spieler zeigt. Zerstörte Module reißen ab und taumeln als Trümmer
 * herab (abschießen oder ausweichen), und die Station dreht sich mit jedem verlorenen Modul schneller.
 * Ohne Module öffnet sich die Andockluke im Kern.
 */
export class Kosmograd extends BossBase {
  private readonly core: PixelSprite;
  private readonly modules: Module[] = [];
  private readonly wrecks: Wreck[] = [];
  private spin = 0;
  private cx = 0;
  private cy = 0;
  private coreHp = 0;
  private coreMax = 1;
  private coreFlash = 0;
  private ringTimer = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, ORBIT_PALETTE, 1, 1, [['.']], STATION_DEBRIS, 'metal');
    this.core = this.sprite(KOSMO_CORE_FRAMES);
    for (let i = 0; i < MODULES; i++) {
      this.modules.push({ sprite: this.sprite(KOSMO_MODULE_FRAMES), hp: 0, alive: false, flash: 0, muzzle: 0, fireTimer: 0, x: 0, y: 0, angle: 0 });
      this.wrecks.push({ sprite: this.sprite([KOSMO_WRECK_ROWS]), active: false, hp: 0, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0 });
    }
    this.hint = ['MODULE ABSCHIESSEN', 'DANN ÖFFNET SICH DER KERN'];
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [this.core, ...this.modules.map((m) => m.sprite), ...this.wrecks.map((w) => w.sprite)];
  }

  get bottom(): number | null {
    return this.cy - ARM - 2.4;
  }

  hullContains(): boolean {
    return false;
  }

  protected hullRaycast(): number | null {
    return null;
  }

  protected deathCenter(): { x: number; y: number } {
    return { x: this.cx, y: this.cy };
  }

  protected dyingPoint(): { x: number; y: number } {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 2.5;
    return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r };
  }

  private get moduleMax(): number {
    return 26 * this.hpMul;
  }

  health(): number {
    const mods = this.modules.reduce((n, m) => n + (m.alive ? Math.max(0, m.hp) : 0), 0);
    return (mods + Math.max(0, this.coreHp)) / (MODULES * this.moduleMax + this.coreMax);
  }

  protected onStart(): void {
    this.coreMax = this.coreHp = 90 * this.hpMul;
    this.coreFlash = 0;
    this.spin = 0;
    this.ringTimer = 3;
    this.core.visible = true;
    this.core.setFrame(0);
    this.modules.forEach((m, i) => {
      Object.assign(m, { hp: this.moduleMax, alive: true, flash: 0, muzzle: 0, fireTimer: (i % 3) * 0.15 });
      m.sprite.visible = true;
    });
    for (const w of this.wrecks) {
      w.active = false;
      w.sprite.visible = false;
    }
  }

  private get alive(): number {
    return this.modules.filter((m) => m.alive).length;
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.5) * this.diff.fireRate;
    this.coreFlash = Math.max(0, this.coreFlash - dt * 8);
    const lost = MODULES - this.alive;
    const coreOpen = this.phase === 'core';
    this.spin += (BASE_SPIN + lost * SPIN_PER_MODULE + (coreOpen ? 0.5 : 0)) * dt;

    // Module feuern, solange sie nach unten zeigen
    for (const m of this.modules) {
      m.flash = Math.max(0, m.flash - dt * 8);
      m.muzzle = Math.max(0, m.muzzle - dt);
      if (!m.alive) continue;
      const down = Math.atan2(Math.sin(m.angle + Math.PI / 2), Math.cos(m.angle + Math.PI / 2));
      if (Math.abs(down) > FIRE_WINDOW) continue;
      m.fireTimer -= dt * this.rage;
      if (m.fireTimer > 0) continue;
      m.fireTimer = 0.32;
      m.muzzle = 0.08;
      const tip = { x: m.x + Math.cos(m.angle) * 2, y: m.y + Math.sin(m.angle) * 2 };
      const a = Math.atan2(py - tip.y, px - tip.x);
      out.shots.push({ x: tip.x, y: tip.y, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, style: 'boss' });
    }

    // Der Kern schickt ab und zu einen Ring aus; offen dreht er sich als Spirale
    this.ringTimer -= dt * this.rage;
    if (this.ringTimer <= 0) {
      this.ringTimer = coreOpen ? 0.16 : 4.2;
      const n = coreOpen ? 3 : 12;
      for (let i = 0; i < n; i++) {
        const a = (coreOpen ? this.spin * 2.2 : Math.random()) + (i / n) * Math.PI * 2;
        out.shots.push({ x: this.cx, y: this.cy, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, style: 'normal' });
      }
    }

    // Abgerissene Module taumeln herab
    for (const w of this.wrecks) {
      if (!w.active) continue;
      w.vy -= 6 * dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.rot += w.spin * dt;
      if (w.y < -FIELD.halfHeight - 4 || Math.abs(w.x) > FIELD.halfWidth + 4) {
        w.active = false;
        w.sprite.visible = false;
      } else if (Math.random() < dt * 8) this.events.smoke(w.x, w.y);
    }

    if (this.phase === 'opening' && this.phaseTime >= OPEN_TIME) {
      this.setPhase('core');
      this.core.setFrame(1);
      this.events.opening('ANDOCKLUKE OFFEN', 'TRIFF DEN KERN');
    }
  }

  /** Modul zerstört: reißt ab, taumelt nach außen und unten, die Station dreht schneller. */
  private detach(i: number): void {
    const m = this.modules[i];
    const w = this.wrecks[i];
    m.alive = false;
    m.sprite.visible = false;
    this.events.explode(m.x, m.y, 2, STATION_DEBRIS);
    this.events.partDestroyed(m.x, m.y, 900, 6, this.alive === 3);
    this.events.sfx('detach');
    this.events.shake(0.4);
    const out = { x: Math.cos(m.angle), y: Math.sin(m.angle) };
    Object.assign(w, {
      active: true,
      hp: 6 * this.diff.hp,
      x: m.x,
      y: m.y,
      vx: out.x * 4 - out.y * 2,
      vy: Math.min(0, out.y * 4) - 1,
      rot: m.angle - Math.PI / 2,
      spin: randRange(-3, 3),
    });
    w.sprite.visible = true;
    if (this.alive === 0) {
      this.setPhase('opening');
      this.events.sfx('separation');
    } else this.events.banner('MODUL ABGERISSEN', 'DIE STATION DREHT SCHNELLER', true);
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    this.modules.forEach((m, i) => {
      if (!m.alive) return;
      list.push({
        x: m.x,
        y: m.y,
        radius: 1.1,
        hit: (dmg) => {
          m.hp -= dmg;
          m.flash = 1;
          this.events.hit();
          if (m.hp <= 0) this.detach(i);
        },
      });
    });
    for (const w of this.wrecks) {
      if (!w.active) continue;
      list.push({
        x: w.x,
        y: w.y,
        radius: 1,
        noMissile: true,
        hit: (dmg) => {
          w.hp -= dmg;
          this.events.sparks(w.x, w.y);
          if (w.hp > 0) return;
          w.active = false;
          w.sprite.visible = false;
          this.events.explode(w.x, w.y, 1, STATION_DEBRIS);
          this.events.partDestroyed(w.x, w.y, 150, 1, false);
        },
      });
    }
    list.push({
      x: this.cx,
      y: this.cy,
      radius: 1.5,
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
    this.cx = this.x + Math.sin(this.time * 0.3) * Math.min(FIELD.halfWidth - 7, 5);
    this.cy = this.y - 9 + Math.sin(this.time * 0.45) * 0.8;
    this.core.mesh.rotation.z = this.spin;
    this.core.setFlash(this.phase === 'dying' || this.coreFlash > 0.5 ? 1 : 0);
    this.core.place(this.cx, this.cy, -0.15);
    this.modules.forEach((m, i) => {
      m.angle = this.spin + (i / MODULES) * Math.PI * 2;
      m.x = this.cx + Math.cos(m.angle) * ARM;
      m.y = this.cy + Math.sin(m.angle) * ARM;
      m.sprite.mesh.rotation.z = m.angle - Math.PI / 2;
      m.sprite.setFrame(m.muzzle > 0 ? 1 : 0);
      m.sprite.setFlash(this.phase === 'dying' || m.flash > 0.5 ? 1 : 0);
      m.sprite.place(m.x, m.y, -0.2);
    });
    for (const w of this.wrecks) {
      if (!w.active) continue;
      w.sprite.mesh.rotation.z = w.rot;
      w.sprite.place(w.x, w.y, -0.1);
    }
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    if ((this.cx - px) ** 2 + (this.cy - py) ** 2 < (1.6 + r) ** 2) return true;
    if (this.modules.some((m) => m.alive && (m.x - px) ** 2 + (m.y - py) ** 2 < (1 + r) ** 2)) return true;
    return this.wrecks.some((w) => w.active && (w.x - px) ** 2 + (w.y - py) ** 2 < (1 + r) ** 2);
  }

  protected stopAttacks(): void {
    for (const w of this.wrecks) {
      w.active = false;
      w.sprite.visible = false;
    }
  }
}
