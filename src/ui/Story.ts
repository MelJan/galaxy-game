import type { Input } from '../core/Input';

/**
 * Was hinter den Tafeln zu sehen ist (die Spiellogik bewegt dazu Schiff und Erde):
 * parked/landed = Schiff steht auf der Erde, launch = Countdown und Start, depart = Start ohne Countdown,
 * space = Schiff schwebt im All, land = Erde taucht auf, Schiff setzt auf.
 */
export type Scene = 'parked' | 'launch' | 'depart' | 'space' | 'land' | 'landed';

/**
 * text: Tafel (Überschrift sofort, Text wird getippt). roll: Credits rollen von unten nach oben durch.
 * scene: nur die Szene läuft für time Sekunden, ohne Tafel. Ohne scene gilt die Szene des vorigen Schritts weiter.
 */
export type StoryStep =
  | { kind: 'text'; title: string; text: string; scene?: Scene }
  | { kind: 'roll'; html: string; scene?: Scene }
  | { kind: 'scene'; scene: Scene; time: number };

/** Getippte Zeichen pro Sekunde. */
const TYPE_SPEED = 38;
/** So lange bleibt eine fertige Tafel stehen, bevor es von selbst weitergeht (plus etwas je Zeichen zum Lesen). */
const HOLD = 3;
const HOLD_PER_CHAR = 0.045;
/** Rollgeschwindigkeit der Credits in CSS-Pixeln pro Sekunde. */
const ROLL_SPEED = 48;

/**
 * Vorspann und Abspann: Tafeln mit Schreibmaschinentext vor dem laufenden Sternenhimmel, dazwischen kleine Szenen.
 * Enter, Leertaste, A oder Antippen: Text sofort ganz zeigen, sonst weiter. Esc oder B: alles überspringen.
 */
export class Story {
  private readonly root = document.getElementById('story')!;
  private readonly panel = document.getElementById('story-panel')!;
  private readonly titleEl = document.getElementById('story-title')!;
  private readonly typed = document.getElementById('story-typed')!;
  private readonly ghost = document.getElementById('story-ghost')!;
  private readonly roll = document.getElementById('story-roll')!;
  private steps: StoryStep[] = [];
  private index = 0;
  private chars = 0;
  private hold = 0;
  private rollY = 0;
  private rollHeight = 0;
  private sceneName: Scene = 'space';
  private sceneTime = 0;
  private onDone: (() => void) | null = null;

  /** onType: bei getippten Zeichen (für ein leises Tippgeräusch). */
  constructor(private readonly onType: () => void) {}

  get isOpen(): boolean {
    return this.onDone !== null;
  }

  /** Aktuelle Szene und wie lange sie schon läuft (Sekunden). */
  get scene(): { name: Scene; time: number } {
    return { name: this.sceneName, time: this.sceneTime };
  }

  play(steps: StoryStep[], done: () => void): void {
    this.steps = steps;
    this.onDone = done;
    this.root.classList.remove('hidden');
    this.show(0);
  }

  /** Ausblenden ohne Rückruf (z. B. beim Neustart). */
  stop(): void {
    this.onDone = null;
    this.root.classList.add('hidden');
  }

  update(dt: number, input: Input): void {
    if (!this.onDone) return;
    if (input.wasPressed('Escape')) {
      this.finish();
      return;
    }
    this.sceneTime += dt;
    const next = input.wasPressed('Enter') || input.wasPressed('Space') || input.wasPressed('Start');
    const step = this.steps[this.index];
    if (step.kind === 'scene') {
      this.hold -= dt;
      if (next || this.hold <= 0) this.show(this.index + 1);
      return;
    }
    if (step.kind === 'roll') {
      this.rollY -= ROLL_SPEED * dt;
      this.roll.style.transform = `translateY(${this.rollY}px)`;
      if (next || this.rollY < -this.rollHeight) this.show(this.index + 1);
      return;
    }
    const length = step.text.length;
    if (this.chars < length) {
      const before = Math.floor(this.chars);
      this.chars = next ? length : Math.min(length, this.chars + TYPE_SPEED * dt);
      const now = Math.floor(this.chars);
      if (!next && now > before && now % 2 === 0 && step.text[now - 1] !== ' ') this.onType();
      this.renderText(step.text);
    } else {
      this.hold -= dt;
      if (next || this.hold <= 0) this.show(this.index + 1);
    }
  }

  private show(i: number): void {
    if (i >= this.steps.length) {
      this.finish();
      return;
    }
    this.index = i;
    const step = this.steps[i];
    if (step.scene && (step.scene !== this.sceneName || step.kind === 'scene' || i === 0)) {
      this.sceneName = step.scene;
      this.sceneTime = 0;
    }
    this.panel.classList.toggle('hidden', step.kind !== 'text');
    this.roll.classList.toggle('hidden', step.kind !== 'roll');
    // In reinen Szenen ohne Abdunkeln, damit man das Schiff gut sieht
    this.root.classList.toggle('bare', step.kind === 'scene');
    if (step.kind === 'scene') {
      this.hold = step.time;
      return;
    }
    if (step.kind === 'roll') {
      this.roll.innerHTML = step.html;
      this.rollHeight = this.roll.offsetHeight;
      this.rollY = this.root.clientHeight;
      this.roll.style.transform = `translateY(${this.rollY}px)`;
      return;
    }
    this.titleEl.textContent = step.title;
    // Einflug-Animation der Überschrift neu starten
    this.titleEl.style.animation = 'none';
    void this.titleEl.offsetWidth;
    this.titleEl.style.animation = '';
    this.chars = 0;
    this.hold = HOLD + step.text.length * HOLD_PER_CHAR;
    this.renderText(step.text);
  }

  /** Getippter Teil sichtbar, der Rest unsichtbar: so springen die Zeilen beim Tippen nicht. */
  private renderText(text: string): void {
    const n = Math.floor(this.chars);
    this.typed.textContent = text.slice(0, n);
    this.ghost.textContent = text.slice(n);
  }

  private finish(): void {
    const done = this.onDone;
    this.stop();
    done?.();
  }
}
