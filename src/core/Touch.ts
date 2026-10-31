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
 *
 * Technik: Pointer-Events (iOS ab 13, Android), der Finger wird mit setPointerCapture festgehalten, damit die
 * Bewegung nicht verloren geht. Die Maus zählt nur, wenn die Touch-Oberfläche aktiv ist (Tablet mit Maus, Tests).
 * Mit ?touchdebug in der Adresse zeigt eine Einblendung, welche Ereignisse ankommen (auch im fertigen Spiel).
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
  private readonly debug: HTMLElement | null = null;
  private readonly counts: Record<string, number> = {};

  /** onUse: bei jeder Berührung (z. B. um die Touch-Oberfläche einzublenden). */
  constructor(
    private readonly surface: HTMLElement,
    onUse: () => void,
  ) {
    if (new URLSearchParams(location.search).has('touchdebug')) this.debug = this.createDebug();

    surface.addEventListener('pointerdown', (e) => {
      this.count(`down:${e.pointerType}`);
      if (e.pointerType === 'mouse' && !document.body.classList.contains('touch')) return;
      onUse();
      e.preventDefault();
      if (this.finger !== null) return;
      this.finger = e.pointerId;
      try {
        surface.setPointerCapture(e.pointerId);
      } catch {
        // Ohne Capture geht es auch, solange der Finger auf dem Spielfeld bleibt
      }
      this.startX = this.x = e.clientX;
      this.startY = this.y = e.clientY;
      this.anchor = null;
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.finger) return;
      this.count('move');
      e.preventDefault();
      this.x = e.clientX;
      this.y = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.finger) return;
      this.count(e.type);
      this.release();
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    surface.addEventListener('lostpointercapture', end);
    // Kein Kontextmenü bei langem Drücken, kein Scrollen über Touch-Events
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /** Finger loslassen (auch beim Pausieren oder Öffnen eines Menüs). */
  release(): void {
    if (this.finger !== null) {
      try {
        this.surface.releasePointerCapture(this.finger);
      } catch {
        // schon freigegeben
      }
    }
    this.finger = null;
    this.anchor = null;
  }

  /**
   * Steuerung für ein Schiff an (x, y), das sich innerhalb der Grenzen bewegen darf. null, wenn kein Finger liegt.
   * Läuft der Zielpunkt über den Rand, wandert der Anker mit, damit die Rückbewegung sofort greift.
   */
  controls(ship: { x: number; y: number }, bounds: { minX: number; maxX: number; minY: number; maxY: number }): Controls | null {
    if (this.finger === null) {
      this.showDebug('kein Finger');
      return null;
    }
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
    const c = {
      axisX: Math.abs(ax) < DEADZONE ? 0 : clamp(ax, -1, 1),
      axisY: Math.abs(ay) < DEADZONE ? 0 : clamp(ay, -1, 1),
      fire: true,
    };
    this.showDebug(`steuert x ${c.axisX.toFixed(2)} y ${c.axisY.toFixed(2)}`);
    return c;
  }

  private count(name: string): void {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
  }

  private createDebug(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:6px;bottom:6px;z-index:99;padding:6px;background:rgba(0,0,0,.75);color:#7f7;font:11px monospace;white-space:pre;pointer-events:none';
    document.body.append(el);
    // Auch Berührungen außerhalb des Spielfelds anzeigen: Welches Element liegt oben?
    document.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Element;
        this.count(`ziel ${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}`);
      },
      { capture: true },
    );
    return el;
  }

  private showDebug(state: string): void {
    if (!this.debug) return;
    const touch = document.body.classList.contains('touch') ? 'touch an' : 'touch AUS';
    this.debug.textContent = `${touch} · ${state}\n${Object.entries(this.counts).map(([k, v]) => `${k}: ${v}`).join('\n')}`;
  }
}
