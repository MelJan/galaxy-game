import * as THREE from 'three';
import { FIELD } from '../../config';
import { randRange } from '../../core/view';
import type { Beams } from '../../fx/Beams';
import { ACE_LEADER_ROWS, ACE_ROWS, FLEET_PALETTE } from '../../gfx/fleetArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const FIGHTER_DEBRIS = new THREE.Color(0xe03a2a);
const ACES = 4;
/** Ab so vielen übrigen Assen beginnen die Sturzflüge. */
const KAMIKAZE_FROM = 2;
const DODGE_SPEED = 17;
const DODGE_COOLDOWN = 1.0;
const DIVE_SPEED = 22;
const DIVE_TELEGRAPH = 0.7;

type AceState = 'fly' | 'telegraph' | 'dive' | 'return';

interface Ace {
  sprite: PixelSprite;
  hp: number;
  alive: boolean;
  flash: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dodge: number;
  dodgeCooldown: number;
  fireTimer: number;
  state: AceState;
  stateTimer: number;
  bank: number;
}

/**
 * Zwischenboss in Sektor 10, Rebellenstaffel: vier Asse in Gabelflüglern, die in Formation fliegen.
 * Sie sehen Schüsse kommen und weichen seitlich aus, mit kurzer Erholungszeit danach.
 * Man muss sie mit breitem Feuer oder Täuschung erwischen. Sind nur noch zwei übrig, stürzen sie sich abwechselnd
 * auf den Spieler. Im Sturzflug können sie nicht ausweichen.
 */
export class Rebellenstaffel extends BossBase {
  private readonly aces: Ace[] = [];
  private formationTimer = 0;
  private diveTimer = 0;
  private maxHp = 1;
  private lastX = 0;
  private lastY = 0;
  private announced = false;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, FLEET_PALETTE, 1, 1, [['.']], FIGHTER_DEBRIS, 'metal');
    for (let i = 0; i < ACES; i++) {
      this.aces.push({
        sprite: this.sprite([i === 0 ? ACE_LEADER_ROWS : ACE_ROWS]),
        hp: 0,
        alive: false,
        flash: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        dodge: 0,
        dodgeCooldown: 0,
        fireTimer: 0,
        state: 'fly',
        stateTimer: 0,
        bank: 0,
      });
    }
    this.hint = ['DIE ASSE WEICHEN AUS', 'BREIT STREUEN · SIE ERHOLEN SICH KURZ'];
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return this.aces.map((a) => a.sprite);
  }

  get bottom(): number | null {
    return null;
  }

  hullContains(): boolean {
    return false;
  }

  protected hullRaycast(): number | null {
    return null;
  }

  protected deathCenter(): { x: number; y: number } {
    return { x: this.lastX, y: this.lastY };
  }

  protected dyingPoint(): { x: number; y: number } {
    return { x: this.lastX + randRange(-1.5, 1.5), y: this.lastY + randRange(-1.5, 1.5) };
  }

  health(): number {
    return this.aces.reduce((n, a) => n + (a.alive ? Math.max(0, a.hp) : 0), 0) / (ACES * this.maxHp);
  }

  private get alive(): Ace[] {
    return this.aces.filter((a) => a.alive);
  }

  protected onStart(): void {
    this.maxHp = 36 * this.hpMul;
    this.aces.forEach((a, i) => {
      Object.assign(a, {
        hp: this.maxHp,
        alive: true,
        flash: 0,
        x: (i - 1.5) * 4,
        y: this.y + 2 + Math.abs(i - 1.5) * 2,
        vx: 0,
        vy: 0,
        dodge: 0,
        dodgeCooldown: 0,
        fireTimer: 1 + i * 0.35,
        state: 'fly',
        stateTimer: 0,
        bank: 0,
      });
      a.sprite.visible = true;
    });
    this.formationTimer = 0;
    this.diveTimer = 3;
    this.announced = false;
  }

  /** Platz in der Formation: ein Keil, der als Ganzes in Achten über das obere Feld zieht. */
  private slot(i: number, count: number): { x: number; y: number } {
    const t = this.formationTimer;
    const hw = Math.min(FIELD.halfWidth - 4, 11);
    const cx = Math.sin(t * 0.45) * hw * 0.75;
    const cy = 9 + Math.sin(t * 0.9) * 2.5;
    const k = i - (count - 1) / 2;
    return { x: cx + k * 4.2, y: cy + Math.abs(k) * 1.8 };
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.6) * this.diff.fireRate;
    this.formationTimer += dt;
    const alive = this.alive;
    const flying = alive.filter((a) => a.state === 'fly');
    const kamikaze = alive.length <= KAMIKAZE_FROM;

    if (kamikaze && !this.announced) {
      this.announced = true;
      this.events.banner('STURZFLUG!', 'DIE LETZTEN ASSE GREIFEN AN', true);
    }

    // Sturzflüge: immer nur eines zur Zeit
    if (kamikaze && alive.every((a) => a.state === 'fly')) {
      this.diveTimer -= dt * this.rage;
      if (this.diveTimer <= 0 && flying.length) {
        this.diveTimer = 2.2;
        const a = flying[Math.floor(Math.random() * flying.length)];
        a.state = 'telegraph';
        a.stateTimer = 0;
        this.events.sfx('screech');
      }
    }

    flying.forEach((a) => {
      const s = this.slot(flying.indexOf(a), flying.length);
      // Federnd zum Formationsplatz
      a.vx += ((s.x - a.x) * 6 - a.vx * 3.5) * dt;
      a.vy += ((s.y - a.y) * 6 - a.vy * 3.5) * dt;
    });

    for (const a of alive) {
      a.flash = Math.max(0, a.flash - dt * 8);
      a.dodgeCooldown -= dt;
      a.stateTimer += dt;

      if (a.state === 'fly') {
        this.tryDodge(a);
        // Doppelschuss, wenn grob über dem Spieler
        a.fireTimer -= dt * this.rage;
        if (a.fireTimer <= 0 && Math.abs(a.x - px) < 7 && a.y > py + 3) {
          a.fireTimer = randRange(1.1, 1.6);
          for (const dx of [-0.7, 0.7]) {
            const ang = Math.atan2(py - a.y, px - a.x);
            out.shots.push({ x: a.x + dx, y: a.y - 1, vx: Math.cos(ang) * 20, vy: Math.sin(ang) * 20, style: 'bolt' });
          }
        }
      } else if (a.state === 'telegraph') {
        a.vx *= Math.max(0, 1 - dt * 5);
        a.vy = 3;
        if (a.stateTimer >= DIVE_TELEGRAPH) {
          const ang = Math.atan2(py - a.y, px - a.x);
          a.vx = Math.cos(ang) * DIVE_SPEED;
          a.vy = Math.sin(ang) * DIVE_SPEED;
          a.state = 'dive';
          a.stateTimer = 0;
          this.events.sfx('ignite');
        }
      } else if (a.state === 'dive') {
        // Leicht nachlenken, dann unten aus dem Bild und von oben zurück
        const want = Math.atan2(py - a.y, px - a.x);
        const cur = Math.atan2(a.vy, a.vx);
        let d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        if (a.y < py + 2) d = 0;
        const na = cur + THREE.MathUtils.clamp(d, -1.2 * dt, 1.2 * dt);
        a.vx = Math.cos(na) * DIVE_SPEED;
        a.vy = Math.sin(na) * DIVE_SPEED;
        if (a.y < -FIELD.halfHeight - 3 || Math.abs(a.x) > FIELD.halfWidth + 3) {
          a.state = 'return';
          a.stateTimer = 0;
          a.x = randRange(-FIELD.halfWidth + 3, FIELD.halfWidth - 3);
          a.y = FIELD.halfHeight + 3;
          a.vx = 0;
          a.vy = -8;
        }
      } else if (a.state === 'return') {
        a.vy += (0 - a.vy) * dt * 0.8;
        if (a.y < 12 || a.stateTimer > 2) a.state = 'fly';
      }

      a.dodge *= Math.max(0, 1 - dt * 6);
      a.x += (a.vx + a.dodge) * dt;
      a.y += a.vy * dt;
      if (a.state === 'fly') a.x = THREE.MathUtils.clamp(a.x, -FIELD.halfWidth + 1.2, FIELD.halfWidth - 1.2);
      a.bank += (THREE.MathUtils.clamp((a.vx + a.dodge) / 18, -1, 1) - a.bank) * Math.min(1, dt * 8);
    }
  }

  /** Weicht einem Schuss aus, der von unten auf das Ass zukommt. */
  private tryDodge(a: Ace): void {
    if (a.dodgeCooldown > 0) return;
    for (const b of this.threats) {
      if (!b.active) continue;
      const dy = a.y - b.y;
      if (dy < 0.5 || dy > 7 || Math.abs(b.x - a.x) > 1.6) continue;
      let dir = a.x >= b.x ? 1 : -1;
      if (Math.abs(a.x + dir * 3) > FIELD.halfWidth - 1.5) dir = -dir;
      a.dodge = dir * DODGE_SPEED;
      a.dodgeCooldown = DODGE_COOLDOWN / Math.max(1, this.diff.fireRate);
      return;
    }
  }

  protected targets(): BossTarget[] {
    return this.alive.map((a) => ({
      x: a.x,
      y: a.y,
      radius: 1.15,
      hit: (dmg: number) => {
        a.hp -= dmg;
        a.flash = 1;
        this.events.hit();
        if (a.hp > 0) return;
        a.alive = false;
        a.sprite.visible = false;
        this.lastX = a.x;
        this.lastY = a.y;
        this.events.explode(a.x, a.y, 2, FIGHTER_DEBRIS);
        this.events.shake(0.5);
        const left = this.alive.length;
        if (left === 0) return this.startDying();
        this.events.partDestroyed(a.x, a.y, 1500, 8, left === 2);
        this.diveTimer = 1.5;
      },
    }));
  }

  protected layout(): void {
    if (this.phase === 'enter') {
      // Einflug von oben in Keilformation
      this.aces.forEach((a, i) => {
        a.x = (i - 1.5) * 4.2;
        a.y = this.y - 8 + Math.abs(i - 1.5) * 1.8;
      });
    }
    for (const a of this.aces) {
      if (!a.alive) continue;
      const telegraph = a.state === 'telegraph' && Math.floor(this.time * 14) % 2 === 0;
      a.sprite.setFlash(this.phase === 'dying' || a.flash > 0.5 || telegraph ? 1 : 0);
      // Im Sturzflug zeigt die Nase in Flugrichtung, sonst nach unten mit Querneigung
      a.sprite.mesh.rotation.z = a.state === 'dive' ? Math.atan2(a.vy, a.vx) + Math.PI / 2 : a.bank * 0.25;
      a.sprite.mesh.scale.x = 1 - Math.abs(a.bank) * 0.35;
      a.sprite.place(a.x, a.y, -0.2);
    }
  }

  protected touchExtra(px: number, py: number, r: number): boolean {
    return this.alive.some((a) => (a.x - px) ** 2 + (a.y - py) ** 2 < (1 + r) ** 2);
  }
}
