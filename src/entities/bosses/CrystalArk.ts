import * as THREE from 'three';
import { randRange } from '../../core/view';
import type { Beam, Beams } from '../../fx/Beams';
import {
  ARK_CORE_FRAMES,
  ARK_H,
  ARK_MOUNTS,
  ARK_SHIELD_FRAMES,
  ARK_W,
  ASCEND_PALETTE,
  GLYPH_FRAMES,
  paintArkHull,
} from '../../gfx/ascendArt';
import type { PixelSprite } from '../../gfx/pixel';
import type { EnemyOutput } from '../Enemies';
import { BossBase, type BossEvents, type BossTarget } from './BossBase';

const GOLD_DEBRIS = new THREE.Color(0xe8c860);
const AETHER_DEBRIS = new THREE.Color(0x8ad8ff);
const BEAM_COLOR = 0x6ab8ff;
const DOWN = -Math.PI / 2;

/** Abstand zwischen zwei Runen beim Vorführen der Folge. */
const SHOW_STEP = 0.75;
const SHOW_LIT = 0.5;
const INPUT_TIME = 15;
/** Kurz nach Beginn der Eingabe zählen Treffer noch nicht (Schüsse, die noch unterwegs waren). */
const INPUT_GRACE = 0.5;
const FAIL_TIME = 1.4;
const OPEN_TIME = 6.5;
const START_LENGTH = 3;
const MAX_LENGTH = 6;
/** Schaden, den eine Rune kurz hintereinander abbekommen muss, damit sie als gewählt gilt. */
const GLYPH_CHARGE = 3;
/** Eine Rune lädt sich nur auf, wenn ein Schiff höchstens so weit seitlich darunter steht. */
const AIM_TOLERANCE = 1.4;
/** So schnell verpufft eine angefangene Ladung wieder (pro Sekunde). */
const GLYPH_DECAY = 2.5;

/**
 * Ablauf des Rätsels: vorführen → nachspielen → bei Fehler rot und Strafe → bei Erfolg fällt der Schild.
 */
type Puzzle = 'show' | 'input' | 'fail' | 'open';

interface Glyph {
  sprite: PixelSprite;
  /** Restzeit des Aufleuchtens beim Vorführen. */
  lit: number;
  /** In dieser Runde schon richtig getroffen. */
  done: boolean;
  /** Angesammelte Treffer; Streifschüsse beim Vorbeifliegen verpuffen wieder. */
  charge: number;
}

type BeamState = 'idle' | 'charge' | 'fire';

/** Ein Strahl mit Lade- und Feuerphase. */
interface Lance {
  beam: Beam | null;
  state: BeamState;
  timer: number;
}

/**
 * Sektor 3, Kristallarche – ein Muster-Rätsel:
 * Vier Runenkristalle leuchten in einer Folge auf, jeder mit eigenem Ton. Wer sie in genau dieser Reihenfolge trifft,
 * bringt den Schild für ein paar Sekunden zum Einsturz, dann ist der Ätherkern verwundbar.
 * Ein falscher Treffer wird bestraft und die Folge wiederholt. Jede Runde wird die Folge länger.
 */
export class CrystalArk extends BossBase {
  private readonly glyphs: Glyph[];
  private readonly core: PixelSprite;
  private readonly shield: PixelSprite;
  private coreHp = 0;
  private coreMax = 1;
  private coreFlash = 0;

  private puzzle: Puzzle = 'show';
  private puzzleTimer = 0;
  private sequence: number[] = [];
  private length = START_LENGTH;
  private showIndex = -1;
  private progress = 0;
  private lastCorrect = -1;
  private grace = 0;

  private spiralAngle = 0;
  private emitTimer = 0;
  private ringTimer = 0;
  private readonly tipLances: Lance[] = [
    { beam: null, state: 'idle', timer: 0 },
    { beam: null, state: 'idle', timer: 0 },
  ];
  private tipSweep = 0;

  constructor(scene: THREE.Scene, events: BossEvents, beams: Beams) {
    super(events, beams, ASCEND_PALETTE, ARK_W, ARK_H, [paintArkHull()], GOLD_DEBRIS, 'crystal');
    this.glyphs = GLYPH_FRAMES.map((frames) => ({ sprite: this.sprite(frames), lit: 0, done: false, charge: 0 }));
    this.core = this.sprite(ARK_CORE_FRAMES);
    this.shield = this.sprite(ARK_SHIELD_FRAMES);
    this.register(scene);
  }

  protected sprites(): PixelSprite[] {
    return [...this.glyphs.map((g) => g.sprite), this.core, this.shield];
  }

  protected onStart(): void {
    this.coreMax = this.coreHp = 160 * this.hpMul;
    this.length = START_LENGTH;
    this.ringTimer = 2;
    for (const l of this.tipLances) this.resetLance(l, 6);
    for (const s of this.sprites()) s.visible = true;
    this.newSequence();
    this.startShow(false);
  }

  health(): number {
    return Math.max(0, this.coreHp) / this.coreMax;
  }

  /** Zufällige Folge ohne direkte Wiederholung desselben Kristalls. */
  private newSequence(): void {
    this.sequence = [];
    for (let i = 0; i < this.length; i++) {
      let g: number;
      do g = Math.floor(Math.random() * this.glyphs.length);
      while (g === this.sequence[i - 1]);
      this.sequence.push(g);
    }
  }

  private startShow(announce = true): void {
    this.puzzle = 'show';
    this.showIndex = -1;
    this.puzzleTimer = 1.0;
    for (const g of this.glyphs) {
      g.lit = 0;
      g.done = false;
      g.charge = 0;
    }
    if (announce) this.events.banner('MUSTER', 'EINPRÄGEN');
  }

  private resetLance(l: Lance, delay: number): void {
    this.beams.release(l.beam);
    l.beam = null;
    l.state = 'idle';
    l.timer = delay;
  }

  protected stopAttacks(): void {
    for (const l of this.tipLances) this.resetLance(l, 99);
  }

  protected tick(dt: number, px: number, py: number, out: EnemyOutput): void {
    this.rage = (1 + (1 - this.health()) * 0.6) * this.diff.fireRate;
    this.coreFlash = Math.max(0, this.coreFlash - dt * 8);
    for (const g of this.glyphs) {
      g.lit = Math.max(0, g.lit - dt);
      g.charge = Math.max(0, g.charge - GLYPH_DECAY * dt);
    }

    this.updatePuzzle(dt);

    // Beim Vorführen hält die Arche still, damit man zusehen kann
    if (this.puzzle === 'show') return;
    this.updateSpiral(dt, out);
    this.updateTipBeams(dt);

    if (this.puzzle === 'open') {
      const c = this.world(ARK_MOUNTS.core);
      this.ringTimer -= dt * this.rage;
      if (this.ringTimer <= 0) {
        this.ringTimer = 1.8;
        const off = Math.random() * Math.PI;
        for (let i = 0; i < 18; i++) {
          const a = off + (i / 18) * Math.PI * 2;
          out.shots.push({ x: c.x, y: c.y, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, style: 'aether' });
        }
      }
    }
    // Die Strafe für einen falschen Treffer: Ring und zielsuchende Kugeln
    if (this.puzzle === 'fail' && this.puzzleTimer > FAIL_TIME - dt) {
      const c = this.world(ARK_MOUNTS.core);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        out.shots.push({ x: c.x, y: c.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, style: 'aether' });
      }
      for (const side of [-1, 1]) {
        const aim = Math.atan2(py - c.y, px - c.x) + side * 0.5;
        out.shots.push({ x: c.x, y: c.y, vx: Math.cos(aim) * 6.5, vy: Math.sin(aim) * 6.5, style: 'orb', homing: 1.3, life: 6 });
      }
    }
  }

  private updatePuzzle(dt: number): void {
    this.puzzleTimer -= dt;
    this.grace -= dt;
    switch (this.puzzle) {
      case 'show':
        if (this.puzzleTimer > 0) return;
        this.showIndex++;
        if (this.showIndex < this.sequence.length) {
          const g = this.sequence[this.showIndex];
          this.glyphs[g].lit = SHOW_LIT;
          this.events.sfx('glyph', g);
          this.puzzleTimer = SHOW_STEP;
        } else {
          this.puzzle = 'input';
          this.puzzleTimer = INPUT_TIME;
          this.progress = 0;
          this.lastCorrect = -1;
          this.grace = INPUT_GRACE;
          this.events.banner('JETZT', 'UNTER DIE RUNE STELLEN · DER REIHE NACH');
        }
        break;
      case 'input':
        // Zu langsam: noch einmal vorführen, ohne Strafe
        if (this.puzzleTimer <= 0) this.startShow();
        break;
      case 'fail':
        if (this.puzzleTimer <= 0) this.startShow();
        break;
      case 'open':
        if (this.puzzleTimer <= 0) {
          // Schild baut sich wieder auf, die nächste Folge ist länger
          this.length = Math.min(MAX_LENGTH, this.length + 1);
          this.newSequence();
          this.events.banner('SCHILD', 'WIEDER AKTIV', true);
          this.startShow(false);
        }
        break;
    }
  }

  private onGlyphHit(i: number, damage: number): void {
    if (this.puzzle !== 'input' || this.grace > 0) return;
    // Nachzügler-Schüsse auf den zuletzt richtigen Kristall zählen nicht als Fehler
    if (i === this.lastCorrect) return;
    // Es zählt nur die Rune direkt über einem Schiff: Flügelkanonen, Streufeuer und Drohnen streifen Nachbarrunen nur
    const m = this.world(ARK_MOUNTS.glyphs[i]);
    if (!this.players.some((p) => p.alive && Math.abs(p.x - m.x) < AIM_TOLERANCE)) {
      this.events.sparks(m.x, m.y);
      return;
    }
    // Erst gezielter Beschuss wählt eine Rune, einzelne Streifschüsse nicht
    const g = this.glyphs[i];
    g.charge += damage;
    if (g.charge < GLYPH_CHARGE) return;
    for (const other of this.glyphs) other.charge = 0;
    if (i !== this.sequence[this.progress]) {
      this.puzzle = 'fail';
      this.puzzleTimer = FAIL_TIME;
      this.events.sfx('glyphFail');
      this.events.banner('FALSCH', 'DAS MUSTER WIRD WIEDERHOLT', true);
      this.events.shake(0.4);
      return;
    }
    this.glyphs[i].done = true;
    this.glyphs[i].lit = 0.3;
    this.events.sfx('glyph', i);
    this.lastCorrect = i;
    this.progress++;
    if (this.progress < this.sequence.length) return;

    // Geschafft: Schild fällt
    this.puzzle = 'open';
    this.puzzleTimer = OPEN_TIME;
    this.events.sfx('glyphSuccess');
    this.events.banner('SCHILD UNTEN', 'KERN TREFFEN');
    const c = this.world(ARK_MOUNTS.core);
    this.events.explode(c.x, c.y, 2, AETHER_DEBRIS);
    this.events.shake(0.6);
  }

  /** Bullet-Hell-Spirale aus dem Kern, bei offenem Schild schneller und mit drei Armen. */
  private updateSpiral(dt: number, out: EnemyOutput): void {
    this.emitTimer -= dt * this.rage;
    if (this.emitTimer > 0) return;
    const open = this.puzzle === 'open';
    this.emitTimer = open ? 0.1 : 0.16;
    this.spiralAngle += 0.33;
    const c = this.world(ARK_MOUNTS.core);
    const arms = open ? 3 : 2;
    for (let i = 0; i < arms; i++) {
      const a = this.spiralAngle + (i / arms) * Math.PI * 2;
      out.shots.push({ x: c.x, y: c.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, style: 'aether' });
    }
  }

  /** Strahlen aus beiden Hornspitzen, die beim Feuern von außen nach innen schwenken. */
  private updateTipBeams(dt: number): void {
    this.tipLances.forEach((l, i) => {
      const side = i === 0 ? -1 : 1;
      const tip = this.world(ARK_MOUNTS.tips[i]);
      const sweep = l.state === 'fire' ? this.tipSweep : 0;
      this.updateLance(l, dt, tip.x, tip.y, DOWN + side * (0.55 - sweep * 1.05));
    });
    const firing = this.tipLances[0].state === 'fire';
    this.tipSweep = firing ? Math.min(1, this.tipSweep + dt / 2.2) : 0;
  }

  /** Strahl-Steuerung: Pause → Vorwarnung → Feuer. */
  private updateLance(l: Lance, dt: number, x: number, y: number, angle: number): void {
    l.timer -= dt * (l.state === 'idle' ? this.rage : 1);
    if (l.timer <= 0) {
      if (l.state === 'idle') {
        l.beam = this.beams.acquire(BEAM_COLOR, 1.0, true);
        if (l.beam) {
          l.state = 'charge';
          l.timer = 1.2;
          l.beam.charge = true;
        } else l.timer = 0.5;
      } else if (l.state === 'charge') {
        l.state = 'fire';
        l.timer = 2.2;
        if (l.beam) l.beam.charge = false;
      } else this.resetLance(l, 9 * randRange(0.85, 1.15));
    }
    if (l.beam) {
      l.beam.x = x;
      l.beam.y = y;
      l.beam.angle = angle;
      l.beam.length = 60;
    }
  }

  protected targets(): BossTarget[] {
    const list: BossTarget[] = [];
    const input = this.puzzle === 'input';
    this.glyphs.forEach((_g, i) => {
      const m = this.world(ARK_MOUNTS.glyphs[i]);
      // Nur während der Eingabe zählen Treffer; sonst prallen sie ab
      list.push({ x: m.x, y: m.y, radius: 1.0, armor: !input, noMissile: true, hit: (dmg) => this.onGlyphHit(i, dmg) });
    });
    const c = this.world(ARK_MOUNTS.core);
    if (this.puzzle === 'open') {
      list.push({
        x: c.x,
        y: c.y,
        radius: 1.35,
        hit: (dmg) => {
          this.coreHp -= dmg;
          this.coreFlash = 1;
          this.events.hit();
          if (this.coreHp <= 0) this.startDying();
        },
      });
    } else {
      // Die Schildkuppel schluckt alle Schüsse auf den Kern
      list.push({ x: c.x, y: c.y, radius: 2.9, armor: true, hit: () => {} });
    }
    return list;
  }

  protected layout(): void {
    const fail = this.puzzle === 'fail' && Math.floor(this.puzzleTimer * 8) % 2 === 0;
    this.glyphs.forEach((g, i) => {
      const m = this.world(ARK_MOUNTS.glyphs[i]);
      const lit = g.lit > 0 || g.done || this.puzzle === 'open';
      g.sprite.setFrame(fail ? 2 : lit ? 1 : 0);
      // Beim Aufladen glimmt die Rune auf
      g.sprite.setFlash(lit || fail ? 0 : Math.min(0.6, (g.charge / GLYPH_CHARGE) * 0.6));
      g.sprite.place(m.x, m.y, -0.1);
    });

    const c = this.world(ARK_MOUNTS.core);
    this.core.setFrame(Math.floor(this.time * 8) % ARK_CORE_FRAMES.length);
    this.core.setFlash(this.phase === 'dying' || this.coreFlash > 0.5 ? 1 : 0);
    this.core.place(c.x, c.y, -0.2);

    // Schild: an, außer wenn das Muster gelöst ist; beim Einsturz und Wiederaufbau flackernd
    const open = this.puzzle === 'open';
    const flicker = open ? this.puzzleTimer > OPEN_TIME - 0.6 || this.puzzleTimer < 0.8 : false;
    this.shield.visible = this.phase !== 'dying' && (!open || (flicker && Math.floor(this.time * 16) % 2 === 0));
    this.shield.setFrame(Math.floor(this.time * 10) % 2);
    this.shield.setFlash(flicker ? 1 : 0);
    this.shield.place(c.x, c.y, -0.05);
  }
}
