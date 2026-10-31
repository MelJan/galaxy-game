import { t } from '../i18n';

import { TouchDrag } from './Touch';

const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Steuerung eines Schiffs: Richtung (−1..1) und Feuern. */
export interface Controls {
  axisX: number;
  axisY: number;
  fire: boolean;
  /** Touch: Zielpunkt, dem das Schiff direkt folgt (statt über axisX/axisY zu steuern). */
  moveTo?: { x: number; y: number };
}

const DEADZONE = 0.22;
/** Ab dieser Auslenkung zählt der Stick in Menüs als Richtungsdruck. */
const MENU_THRESHOLD = 0.6;
const REPEAT_DELAY = 0.4;
const REPEAT_RATE = 0.14;

/**
 * Tasten in der Standard-Belegung (Xbox-Layout, wie Chrome/Edge sie für XInput-Controller liefern).
 * A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, Back = 8, Start = 9, Steuerkreuz = 12–15.
 */
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

interface PadState {
  index: number;
  id: string;
  controls: Controls;
  /** Gedrückte virtuelle Tasten im letzten Frame (für Flankenerkennung). */
  held: Set<string>;
  /** Wiederholung der Menü-Richtung beim Gedrückthalten. */
  repeatDir: string | null;
  repeatTimer: number;
}

/**
 * Tastatur und Gamepads. Gamepads steuern Schiffe (controlsFor) und bedienen zusätzlich alle Menüs:
 * Steuerkreuz/Stick → Pfeiltasten, A → Enter, B → Escape, X → Entf, Y → „PadY“ (Speichern), Start → „Start“.
 * Browser melden ein Gamepad erst, nachdem darauf eine Taste gedrückt wurde.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly pads = new Map<number, PadState>();
  private lastPoll = 0;
  /** Touch-Steuerung (Handy), sobald das Spielfeld angemeldet ist. */
  touch: TouchDrag | null = null;
  /** Wird aufgerufen, wenn ein Controller verbunden oder getrennt wird (Nummer ab 1, Name). */
  onPadChange: ((connected: boolean, slot: number, id: string) => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('gamepadconnected', (e) => {
      this.poll();
      this.onPadChange?.(true, this.slotOf(e.gamepad.index), e.gamepad.id);
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      const slot = this.slotOf(e.gamepad.index);
      this.pads.delete(e.gamepad.index);
      this.onPadChange?.(false, slot, e.gamepad.id);
    });
  }

  /** Spielfeld für die Touch-Steuerung anmelden; onUse läuft bei jeder Berührung. */
  attachTouch(surface: HTMLElement, onUse: () => void): void {
    this.touch = new TouchDrag(surface, onUse);
  }

  /** Virtueller Tastendruck, z. B. von einem Bildschirm-Knopf (wirkt wie ein kurzer Druck auf die Taste). */
  press(code: string): void {
    this.pressed.add(code);
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** Angesammelte Tastendrücke verwerfen, z. B. beim Öffnen eines Menüs (sonst kauft Dauerfeuer sofort etwas). */
  clearPressed(): void {
    this.pressed.clear();
  }

  /** True genau einmal pro Tastendruck (auch für virtuelle Tasten vom Gamepad). */
  wasPressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** Anzahl verbundener Gamepads. */
  get padCount(): number {
    return this.pads.size;
  }

  /** Nummer (ab 1) eines Gamepads in der Reihenfolge der Browser-Indizes. */
  private slotOf(index: number): number {
    return [...this.pads.keys()].sort((a, b) => a - b).indexOf(index) + 1 || this.pads.size + 1;
  }

  private padList(): PadState[] {
    return [...this.pads.values()].sort((a, b) => a.index - b.index);
  }

  /** Linke Tastaturhälfte: WASD, Feuer Leertaste. */
  get keysLeft(): Controls {
    return {
      axisX: (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0),
      axisY: (this.isDown('KeyW') ? 1 : 0) - (this.isDown('KeyS') ? 1 : 0),
      fire: this.isDown('Space'),
    };
  }

  /** Rechte Tastaturhälfte: Pfeiltasten, Feuer Enter (oder rechte Umschalttaste, Ziffernblock 0/Enter). */
  get keysRight(): Controls {
    return {
      axisX: (this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('ArrowLeft') ? 1 : 0),
      axisY: (this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('ArrowDown') ? 1 : 0),
      fire: this.isDown('Enter', 'NumpadEnter', 'ShiftRight', 'Numpad0'),
    };
  }

  /** Ganze Tastatur (Ein-Spieler-Modus): WASD oder Pfeile, Leertaste feuert. */
  get keyboard(): Controls {
    const l = this.keysLeft;
    const r = this.keysRight;
    return { ...merge([l, r]), fire: l.fire };
  }

  /**
   * Steuerung für Spieler 0 oder 1.
   * Ein Spieler: Tastatur und alle Gamepads gleichzeitig.
   * Zwei Spieler ohne Gamepad: Spieler 1 WASD + Leertaste, Spieler 2 Pfeiltasten + Enter.
   * Zwei Spieler mit einem Gamepad: Spieler 1 ganze Tastatur, Spieler 2 Gamepad.
   * Zwei Spieler mit zwei Gamepads: jeder sein Gamepad, dazu WASD (Spieler 1) bzw. Pfeiltasten (Spieler 2).
   */
  controlsFor(player: number, players: number): Controls {
    const pads = this.padList().map((p) => p.controls);
    if (players === 1) return merge([this.keyboard, ...pads]);
    if (pads.length >= 2) return player === 0 ? merge([this.keysLeft, pads[0]]) : merge([this.keysRight, pads[1]]);
    if (pads.length === 1) return player === 0 ? this.keyboard : pads[0];
    return player === 0 ? this.keysLeft : this.keysRight;
  }

  /** Wer steuert welchen Spieler im Koop gerade? (Für den Hinweis auf dem Titelbildschirm.) */
  get coopDevices(): [string, string] {
    if (this.pads.size >= 2) return [t('CONTROLLER 1 / WASD'), t('CONTROLLER 2 / PFEILE + ENTER')];
    if (this.pads.size === 1) return [t('TASTATUR'), 'CONTROLLER'];
    return [t('WASD + LEERTASTE'), t('PFEILTASTEN + ENTER')];
  }

  /** Einmal pro Frame aufrufen: Gamepads abfragen und Menütasten erzeugen. */
  update(): void {
    this.poll();
  }

  private poll(): void {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - (this.lastPoll || now));
    this.lastPoll = now;
    const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const gp of list) {
      if (!gp || !gp.connected) continue;
      let state = this.pads.get(gp.index);
      if (!state) {
        state = { index: gp.index, id: gp.id, controls: { axisX: 0, axisY: 0, fire: false }, held: new Set(), repeatDir: null, repeatTimer: 0 };
        this.pads.set(gp.index, state);
      }
      this.readPad(gp, state, dt);
    }
  }

  private readPad(gp: Gamepad, state: PadState, dt: number): void {
    const btn = (i: number) => {
      const b = gp.buttons[i];
      return !!b && (b.pressed || b.value > 0.5);
    };
    let x = gp.axes[0] ?? 0;
    let y = -(gp.axes[1] ?? 0);
    if (Math.abs(x) < DEADZONE) x = 0;
    if (Math.abs(y) < DEADZONE) y = 0;

    let up = false, down = false, left = false, right = false;
    if (gp.mapping === 'standard') {
      up = btn(BTN.UP);
      down = btn(BTN.DOWN);
      left = btn(BTN.LEFT);
      right = btn(BTN.RIGHT);
    } else {
      // Nicht erkannte Controller (z. B. im DirectInput-Modus): Steuerkreuz oft als „Hat“-Achse 9
      const hat = gp.axes[9];
      if (hat !== undefined && Math.abs(hat) <= 1.05) {
        const dir = Math.round((hat + 1) * 3.5); // 0 = oben, dann im Uhrzeigersinn bis 7
        up = dir === 0 || dir === 1 || dir === 7;
        right = dir >= 1 && dir <= 3;
        down = dir >= 3 && dir <= 5;
        left = dir >= 5 && dir <= 7;
      }
    }
    if (left || right) x = (right ? 1 : 0) - (left ? 1 : 0);
    if (up || down) y = (up ? 1 : 0) - (down ? 1 : 0);

    const len = Math.hypot(x, y);
    if (len > 1) [x, y] = [x / len, y / len];
    const fire = btn(BTN.A) || btn(BTN.X) || btn(BTN.RB) || btn(BTN.RT) || btn(BTN.LB);
    state.controls = { axisX: x, axisY: y, fire };

    // Menütasten mit Flankenerkennung
    const virtual = new Set<string>();
    if (btn(BTN.A)) virtual.add('Enter');
    if (btn(BTN.B)) virtual.add('Escape');
    if (btn(BTN.X)) virtual.add('Delete');
    if (btn(BTN.Y)) virtual.add('PadY');
    if (btn(BTN.START)) virtual.add('Start');
    if (btn(BTN.BACK)) virtual.add('Escape');
    for (const code of virtual) if (!state.held.has(code)) this.pressed.add(code);
    state.held = virtual;

    // Richtung für Menüs, mit Wiederholung beim Halten
    const dir =
      y > MENU_THRESHOLD ? 'ArrowUp' : y < -MENU_THRESHOLD ? 'ArrowDown' : x > MENU_THRESHOLD ? 'ArrowRight' : x < -MENU_THRESHOLD ? 'ArrowLeft' : null;
    if (dir !== state.repeatDir) {
      state.repeatDir = dir;
      state.repeatTimer = REPEAT_DELAY;
      if (dir) this.pressed.add(dir);
    } else if (dir) {
      state.repeatTimer -= dt;
      if (state.repeatTimer <= 0) {
        state.repeatTimer = REPEAT_RATE;
        this.pressed.add(dir);
      }
    }
  }

  /** Steuerung aller Eingabegeräte zusammen (Ein-Spieler-Modus). */
  get axisX(): number {
    return this.controlsFor(0, 1).axisX;
  }

  get axisY(): number {
    return this.controlsFor(0, 1).axisY;
  }

  get fire(): boolean {
    return this.controlsFor(0, 1).fire;
  }
}

/** Mehrere Eingaben zusammenführen: Richtung addiert (begrenzt), Feuern, wenn irgendeine feuert. */
function merge(list: Controls[]): Controls {
  let x = 0;
  let y = 0;
  let fire = false;
  for (const c of list) {
    x += c.axisX;
    y += c.axisY;
    fire ||= c.fire;
  }
  return { axisX: Math.max(-1, Math.min(1, x)), axisY: Math.max(-1, Math.min(1, y)), fire };
}
