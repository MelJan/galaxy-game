import type { Controls } from './Input';

/** Fingerweg × GAIN = Schiffsweg: kleine Bewegungen reichen, der Daumen muss nicht übers ganze Display. */
const GAIN = 1.4;
/** Wie entschlossen das Schiff dem Zielpunkt folgt (Steuerausschlag je Welt-Einheit Abstand). */
const FOLLOW = 2.5;
const DEADZONE = 0.04;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Läuft das Spiel auf einem Gerät mit Touchscreen als Hauptbedienung (Handy, Tablet)? */
export const isTouchDevice = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Touch-Steuerung fürs Handy: Finger irgendwo aufs Spielfeld legen und ziehen. Das Schiff fährt denselben Weg mit
 * (relativ zum Startpunkt), der Finger verdeckt es also nicht. Solange ein Finger liegt, wird geschossen.
 * Menüs bleiben normale Knöpfe; Berührungen dort lösen keine Steuerung aus.
 */
export class TouchDrag {
  /** Welt-Einheiten pro CSS-Pixel; setzt das Spiel beim Anpassen der Ansicht. */
  worldPerPx = 0.05;
  private finger: number | null = null;
  private startX = 0;
  private startY = 0;
  private x = 0;
  private y = 0;
  /** Schiffsposition beim Aufsetzen des Fingers (wird am Rand mitgezogen). */
  private anchor: { x: number; y: number } | null = null;

  /** onUse: bei der ersten Berührung (z. B. um die Touch-Oberfläche einzublenden). */
  constructor(surface: HTMLElement, onUse: () => void) {
    const opts = { passive: false };
    surface.addEventListener(
      'touchstart',
      (e) => {
        onUse();
        e.preventDefault();
        if (this.finger !== null) return;
        const t = e.changedTouches[0];
        this.finger = t.identifier;
        this.startX = this.x = t.clientX;
        this.startY = this.y = t.clientY;
        this.anchor = null;
      },
      opts,
    );
    surface.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        const t = this.find(e.changedTouches);
        if (!t) return;
        this.x = t.clientX;
        this.y = t.clientY;
      },
      opts,
    );
    const end = (e: TouchEvent) => {
      if (this.find(e.changedTouches)) this.release();
    };
    surface.addEventListener('touchend', end);
    surface.addEventListener('touchcancel', end);
  }

  /** Finger loslassen (auch beim Pausieren oder Öffnen eines Menüs). */
  release(): void {
    this.finger = null;
    this.anchor = null;
  }

  private find(list: TouchList): Touch | null {
    for (const t of list) if (t.identifier === this.finger) return t;
    return null;
  }

  /**
   * Steuerung für ein Schiff an (x, y), das sich innerhalb der Grenzen bewegen darf. null, wenn kein Finger liegt.
   * Läuft der Zielpunkt über den Rand, wandert der Anker mit, damit die Rückbewegung sofort greift.
   */
  controls(ship: { x: number; y: number }, bounds: { minX: number; maxX: number; minY: number; maxY: number }): Controls | null {
    if (this.finger === null) return null;
    if (!this.anchor) this.anchor = { x: ship.x, y: ship.y };
    let tx = this.anchor.x + (this.x - this.startX) * this.worldPerPx * GAIN;
    let ty = this.anchor.y - (this.y - this.startY) * this.worldPerPx * GAIN;
    const cx = clamp(tx, bounds.minX, bounds.maxX);
    const cy = clamp(ty, bounds.minY, Math.max(bounds.minY, bounds.maxY));
    this.anchor.x += cx - tx;
    this.anchor.y += cy - ty;
    tx = cx;
    ty = cy;
    const ax = (tx - ship.x) * FOLLOW;
    const ay = (ty - ship.y) * FOLLOW;
    return {
      axisX: Math.abs(ax) < DEADZONE ? 0 : clamp(ax, -1, 1),
      axisY: Math.abs(ay) < DEADZONE ? 0 : clamp(ay, -1, 1),
      fire: true,
    };
  }
}
