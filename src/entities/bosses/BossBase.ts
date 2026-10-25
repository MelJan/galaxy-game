import * as THREE from 'three';
import type { Material } from '../../audio/Sound';
import { FIELD, PIXEL } from '../../config';
import type { Beams } from '../../fx/Beams';
import { makePixelTexture, PixelSprite, type Palette } from '../../gfx/pixel';
import { sweptDistanceSq, type Bullet } from '../Bullets';
import type { Difficulty, EnemyOutput } from '../Enemies';

/** Was ein Endgegner an die Spiellogik meldet: Effekte, Sound, Punkte. */
export interface BossEvents {
  explode(x: number, y: number, size: number, debris: THREE.Color): void;
  /** Funken an einer Einschlagstelle. */
  sparks(x: number, y: number): void;
  /** Blaue Funken an einem Energieschild. */
  shieldSparks(x: number, y: number): void;
  /** Rauch und Glut aus einem Wrack. */
  smoke(x: number, y: number): void;
  hit(): void;
  /** Schuss prallt an Panzerung oder Schild ab. */
  deflect(): void;
  partDestroyed(x: number, y: number, score: number, coins: number, repair: boolean): void;
  shake(amount: number): void;
  /** Schwachpunkt freigelegt: Titel und Untertitel für das Banner. */
  opening(title: string, subtitle: string): void;
  /** Hinweis-Banner während des Kampfs. */
  banner(title: string, subtitle: string, warn?: boolean): void;
  /** Boss-spezifischer Klang. */
  sfx(name: BossSfx, arg?: number): void;
  death(): void;
  defeated(x: number, y: number, debris: THREE.Color): void;
}

export type BossSfx =
  | 'honk'
  | 'detach'
  | 'reflect'
  | 'teleport'
  | 'tick'
  | 'superCharge'
  | 'superFire'
  | 'roar'
  | 'screech'
  | 'sever'
  | 'eggLay'
  | 'glyph'
  | 'glyphFail'
  | 'glyphSuccess'
  | 'split'
  | 'ignite'
  | 'separation'
  | 'tractor'
  | 'regrow'
  | 'pulse'
  | 'gravity'
  | 'swallow'
  | 'whale'
  | 'shed';

/** Ein verwundbarer (oder mit armor gepanzerter) Punkt des Endgegners. */
export interface BossTarget {
  x: number;
  y: number;
  radius: number;
  /** Schild oder Panzerung: Schüsse prallen hier ab. */
  armor?: boolean;
  /** Raketen fliegen dieses Ziel nicht an (z. B. Rätsel-Kristalle). */
  noMissile?: boolean;
  hit(damage: number): void;
}

export type BossPhase = 'enter' | 'fight' | 'opening' | 'core' | 'dying' | 'gone';
export type Mount = { x: number; y: number };

const ENTER_TIME = 4;

export const easeOut = (t: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);
export const easeInOut = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/**
 * Gemeinsame Grundlage aller Endgegner: Einflug von oben, Stehen und Wippen, Hülle als Pixelmaske
 * (Abpraller, Zusammenstöße, Laser), Trefferprüfung über die aktuell verwundbaren Punkte und die Todessequenz.
 */
export abstract class BossBase {
  x = 0;
  y = 0;
  protected phase: BossPhase = 'gone';
  protected time = 0;
  protected phaseTime = 0;
  protected rage = 1;
  protected diff: Difficulty = { hp: 1, fireRate: 1, speed: 1 };
  /** Faktor dieses Bosses aus der Kampagnen-Abstimmung (BossTuning) auf die Lebenspunkte. */
  private tune = 1;
  protected px = 0;
  protected py = 0;
  protected readonly hull: PixelSprite;
  private hullRows: string[];
  private startY = 0;
  private targetY = 0;
  private dyingTimer = 0;
  private cachedTargets: BossTarget[] = [];

  constructor(
    protected readonly events: BossEvents,
    protected readonly beams: Beams,
    protected readonly palette: Palette,
    protected readonly w: number,
    protected readonly h: number,
    /** Hüllen-Varianten, z. B. geschlossen und mit freigelegtem Kern. */
    private readonly hullVariants: string[][],
    protected readonly debris: THREE.Color,
    /** Klangwelt für Treffer, Abpraller und Explosionen. */
    readonly material: Material,
    private readonly dyingTime = 3.2,
  ) {
    this.hullRows = hullVariants[0];
    this.hull = new PixelSprite(hullVariants.map((rows) => this.texture(rows)), w, h);
  }

  protected texture(rows: string[]): THREE.Texture {
    return makePixelTexture(rows, this.palette);
  }

  protected sprite(frames: string[][]): PixelSprite {
    return new PixelSprite(frames.map((rows) => this.texture(rows)), frames[0][0].length, frames[0].length);
  }

  /** Alle Sprites in die Szene hängen und ausblenden. Am Ende des Konstruktors der Unterklasse aufrufen. */
  protected register(scene: THREE.Scene): void {
    for (const s of this.allSprites()) scene.add(s.mesh);
    this.hide();
  }

  private allSprites(): PixelSprite[] {
    return [this.hull, ...this.sprites()];
  }

  get active(): boolean {
    return this.phase !== 'gone';
  }

  /** Unterkante des Rumpfs in Welt-Koordinaten; darunter bleibt der Spieler. null = keine Grenze. */
  get bottom(): number | null {
    return this.y - (this.h / 2) * PIXEL;
  }

  /** Zugstrahl: zieht den Spieler mit dieser Stärke Richtung (x, y). null = kein Zug. */
  pull: { x: number; y: number; strength: number } | null = null;

  /** Aktive Spielerschüsse (von der Spiellogik gesetzt), z. B. damit Gegner ausweichen können. */
  threats: readonly { x: number; y: number; active: boolean }[] = [];

  /** Spielerschiffe (von der Spiellogik gesetzt), z. B. um zu prüfen, wer unter einem Ziel steht. */
  players: readonly { x: number; alive: boolean }[] = [];

  /** Zusatz zum Namen im Lebensbalken, z. B. ein Countdown. */
  hudSuffix(): string {
    return '';
  }

  /** Schwerkraftquelle, die Geschosse krümmt (g) und im Radius absorb verschluckt. null = keine. */
  well: { x: number; y: number; g: number; absorb: number } | null = null;

  /**
   * Lebenspunkte-Faktor für alles, was zum Sieg zerstört werden muss: Schwierigkeit mal Kampagnen-Abstimmung.
   * Kleinteile, die nachwachsen oder nur im Weg sind (Splitter, Trümmer, Torpedos, Greifer), nehmen nur diff.hp.
   */
  protected get hpMul(): number {
    return this.diff.hp * this.tune;
  }

  start(diff: Difficulty, tune = 1): void {
    this.diff = diff;
    this.tune = tune;
    this.phase = 'enter';
    this.time = this.phaseTime = 0;
    this.startY = FIELD.halfHeight + (this.h / 2) * PIXEL + 4;
    this.targetY = FIELD.halfHeight - (this.h / 2) * PIXEL + 1.2;
    this.x = 0;
    this.y = this.startY;
    this.rage = 1;
    this.setHullVariant(0);
    this.hull.setFlash(0);
    this.hull.visible = true;
    this.onStart();
    this.cachedTargets = [];
    this.hull.place(this.x, this.y, -0.3);
    this.layout();
  }

  hide(): void {
    this.phase = 'gone';
    this.pull = null;
    this.well = null;
    this.stopAttacks();
    for (const s of this.allSprites()) s.visible = false;
  }

  protected setHullVariant(i: number): void {
    this.hullRows = this.hullVariants[i];
    this.hull.setFrame(i);
  }

  protected setPhase(phase: BossPhase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Weltposition eines Punkts im Rumpf-Raster. */
  protected world(m: Mount): { x: number; y: number } {
    return { x: this.x + (m.x - this.w / 2) * PIXEL, y: this.y + (this.h / 2 - m.y) * PIXEL };
  }

  /** Liegt der Punkt auf der Hülle? Standard: nicht-transparentes Pixel der Rumpf-Maske. */
  hullContains(x: number, y: number): boolean {
    if (this.phase === 'gone') return false;
    const px = Math.floor((x - this.x) / PIXEL + this.w / 2);
    const py = Math.floor(this.h / 2 - (y - this.y) / PIXEL);
    return (this.hullRows[py]?.[px] ?? '.') !== '.';
  }

  update(dt: number, px: number, py: number, out: EnemyOutput): void {
    if (this.phase === 'gone') return;
    this.px = px;
    this.py = py;
    this.time += dt;
    this.phaseTime += dt;

    if (this.phase === 'enter') {
      this.y = this.startY + (this.targetY - this.startY) * easeOut(this.phaseTime / ENTER_TIME);
      if (this.phaseTime >= ENTER_TIME) {
        this.setPhase('fight');
        if (this.hint) this.events.banner(this.hint[0], this.hint[1]);
      }
    } else {
      // Bleibt oben stehen und wippt nur leicht
      this.y = this.targetY + Math.sin(this.time * 0.9) * 0.25;
    }

    if (this.phase === 'dying') {
      this.updateDying(dt);
      if (this.phaseTime >= this.dyingTime) {
        const c = this.deathCenter();
        this.events.defeated(c.x, c.y, this.debris);
        this.hide();
        return;
      }
    } else if (this.phase !== 'enter') {
      this.tick(dt, px, py, out);
    }
    this.hull.place(this.x, this.y, -0.3);
    this.layout();
    this.cachedTargets = this.phase === 'enter' || this.phase === 'dying' ? [] : this.targets();
  }

  /** Der Schwachpunkt ist zerstört: Todessequenz starten. */
  protected startDying(): void {
    this.setPhase('dying');
    this.dyingTimer = 0;
    this.stopAttacks();
    this.events.death();
  }

  /** Kettenexplosionen quer über den Rumpf, die Hülle blitzt auf. */
  private updateDying(dt: number): void {
    this.dyingTimer -= dt;
    if (this.dyingTimer <= 0) {
      this.dyingTimer = 0.09;
      const p = this.dyingPoint();
      if (p) {
        this.events.explode(p.x, p.y, Math.random() < 0.3 ? 2 : 1, this.debris);
        this.events.shake(0.35);
      }
    }
    this.hull.setFlash(Math.floor(this.phaseTime * 14) % 3 === 0 ? 0.7 : 0);
  }

  /** Ort der großen Schlussexplosion. */
  protected deathCenter(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /** Hinweis-Banner zu Kampfbeginn (wie man den Boss besiegt), null = keiner. */
  protected hint: [string, string] | null = null;

  /** Eigener Text für das Sieg-Banner (sonst „<NAME> ZERSTÖRT“). */
  defeatTitle: string | null = null;

  /** Hält die Hülle an dieser Stelle Schüsse auf? Standard: überall, wo Rumpf ist. */
  protected blocksShot(x: number, y: number): boolean {
    return this.hullContains(x, y);
  }

  /** Zufälliger Punkt für die Kettenexplosionen beim Tod. Standard: irgendwo auf der Rumpf-Maske. */
  protected dyingPoint(): { x: number; y: number } | null {
    for (let tries = 0; tries < 20; tries++) {
      const hx = Math.floor(Math.random() * this.w);
      const hy = Math.floor(Math.random() * this.h);
      if (this.hullRows[hy][hx] === '.') continue;
      return this.world({ x: hx + 0.5, y: hy + 0.5 });
    }
    return null;
  }

  /**
   * Spielerschuss prüfen: zuerst die verwundbaren Punkte, dann die Hülle.
   * Getroffen wird das Ziel, das der Schuss auf seiner Flugstrecke als erstes erreicht
   * (wichtig, wenn Splitter einen Kern verdecken). Gibt true zurück, wenn der Schuss verbraucht ist.
   */
  hitTestBullet(b: Bullet, damage: number): boolean {
    if (this.phase === 'gone') return false;
    let first: BossTarget | null = null;
    let firstT = Infinity;
    const dx = b.x - b.prevX;
    const dy = b.y - b.prevY;
    const len = dx * dx + dy * dy || 1;
    for (const t of this.cachedTargets) {
      if (sweptDistanceSq(b, t.x, t.y) > (t.radius + 0.25) ** 2) continue;
      const along = ((t.x - b.prevX) * dx + (t.y - b.prevY) * dy) / len;
      if (along < firstT) [first, firstT] = [t, along];
    }
    if (first) {
      if (first.armor) {
        this.events.shieldSparks(b.x, b.y);
        this.events.deflect();
      } else first.hit(damage);
      return true;
    }
    // Panzerung: an drei Punkten entlang der Flugstrecke prüfen
    for (const s of [1, 0.5, 0]) {
      const x = b.prevX + (b.x - b.prevX) * s;
      const y = b.prevY + (b.y - b.prevY) * s;
      if (this.blocksShot(x, y)) {
        this.events.sparks(x, y);
        this.events.deflect();
        return true;
      }
    }
    return false;
  }

  /**
   * Laser von (x, y0) senkrecht nach oben: wo trifft er den Boss zuerst?
   * Liefert die Höhe des Treffers und, falls es ein Schwachpunkt ist, das Ziel.
   */
  raycastUp(x: number, y0: number, halfWidth: number): { y: number; target: BossTarget | null } | null {
    if (this.phase === 'gone') return null;
    let best: { y: number; target: BossTarget | null } | null = null;
    for (const t of this.cachedTargets) {
      if (Math.abs(t.x - x) > t.radius + halfWidth) continue;
      const y = t.y - t.radius * 0.6;
      if (y > y0 && (!best || y < best.y)) best = { y, target: t };
    }
    const hullY = this.hullRaycast(x, y0, halfWidth);
    if (hullY !== null && (!best || hullY < best.y)) best = { y: hullY, target: null };
    return best;
  }

  /** Höhe, an der ein senkrechter Strahl von (x, y0) die Hülle trifft. Standard: Rumpf-Maske, drei Spalten. */
  protected hullRaycast(x: number, y0: number, halfWidth: number): number | null {
    let best: number | null = null;
    const hw = Math.max(1, Math.round(halfWidth / PIXEL));
    const cx = Math.floor((x - this.x) / PIXEL + this.w / 2);
    for (const col of [cx - hw, cx, cx + hw]) {
      if (col < 0 || col >= this.w) continue;
      for (let row = this.h - 1; row >= 0; row--) {
        if (this.hullRows[row][col] === '.') continue;
        const y = this.y + (this.h / 2 - (row + 1)) * PIXEL;
        if (y <= y0) continue;
        if (best === null || y < best) best = y;
        break;
      }
    }
    return best;
  }

  /** Aktuell verwundbare Punkte (für den Test-Autopiloten). */
  vulnerableTargets(): readonly BossTarget[] {
    return this.cachedTargets.filter((t) => !t.armor);
  }

  /** Ziele für Zielsuch-Raketen. */
  missileTargets(): { x: number; y: number }[] {
    return this.cachedTargets.filter((t) => !t.armor && !t.noMissile);
  }

  /** Restliche Lebenskraft 0..1 für den Lebensbalken. */
  abstract health(): number;

  /** Berührt der Spieler die Hülle oder einen gefährlichen Anbau? */
  touchesPlayer(px: number, py: number, r: number): boolean {
    if (this.phase === 'gone' || this.phase === 'dying') return false;
    return this.hullContains(px, py) || this.touchExtra(px, py, r);
  }

  protected touchExtra(_px: number, _py: number, _r: number): boolean {
    return false;
  }

  /** Strahlen und laufende Angriffe abbrechen (Tod, Ausblenden). */
  protected stopAttacks(): void {}

  protected abstract sprites(): PixelSprite[];
  protected abstract onStart(): void;
  /** Kampflogik je nach Phase (fight, opening, core). */
  protected abstract tick(dt: number, px: number, py: number, out: EnemyOutput): void;
  /** Aktuell treffbare Punkte. */
  protected abstract targets(): BossTarget[];
  /** Alle Sprites relativ zur Rumpfposition setzen. */
  protected abstract layout(): void;
}
