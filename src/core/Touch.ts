import type { Controls } from './Input';

/** Fingerweg × GAIN = Schiffsweg: kleine Bewegungen reichen, der Daumen muss nicht übers ganze Display. */
const GAIN = 1.4;

/**
 * Fingerfilter: bei ruhigem Finger Grenzfrequenz MIN_CUTOFF (Hz, glättet Zittern), je Pixel pro Sekunde
 * Fingertempo kommt BETA hinzu (schnelle Bewegungen gehen fast ungefiltert durch).
 */
const MIN_CUTOFF = 2.5;
const BETA = 0.04;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * One-Euro-Filter (Casiez, Roussel, Vogel 2012): Tiefpass, dessen Grenzfrequenz mit der Geschwindigkeit steigt.
 * Kleine Zitterbewegungen werden geglättet, echte Bewegungen kommen mit minimaler Verzögerung an.
 */
class OneEuro {
  private value: number | null = null;
  private speed = 0;

  reset(): void {
    this.value = null;
    this.speed = 0;
  }

  filter(v: number, dt: number): number {
    if (this.value === null || dt <= 0) return (this.value = v);
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.speed += ((v - this.value) / dt - this.speed) * alpha(1);
    this.value += (v - this.value) * alpha(MIN_CUTOFF + BETA * Math.abs(this.speed));
    return this.value;
  }
}

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
  private readonly filterX = new OneEuro();
  private readonly filterY = new OneEuro();
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
      this.filterX.reset();
      this.filterY.reset();
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
   * Steuerung für ein Schiff an (x, y), das sich innerhalb der Grenzen bewegen darf: Zielpunkt, dem es direkt folgt
   * (siehe Player). Einmal pro Spielschritt aufrufen (dt in Sekunden, für den Fingerfilter). null, wenn kein Finger liegt.
   * Läuft der Zielpunkt über den Rand, wandert der Anker mit, damit die Rückbewegung sofort greift.
   */
  controls(ship: { x: number; y: number }, bounds: { minX: number; maxX: number; minY: number; maxY: number }, dt: number): Controls | null {
    if (this.finger === null) {
      this.showDebug('kein Finger');
      return null;
    }
    if (!this.anchor) this.anchor = { x: ship.x, y: ship.y };
    const fx = this.filterX.filter(this.x, dt);
    const fy = this.filterY.filter(this.y, dt);
    let tx = this.anchor.x + (fx - this.startX) * this.worldPerPx * GAIN;
    let ty = this.anchor.y - (fy - this.startY) * this.worldPerPx * GAIN;
    const cx = clamp(tx, bounds.minX, bounds.maxX);
    const cy = clamp(ty, bounds.minY, Math.max(bounds.minY, bounds.maxY));
    this.anchor.x += cx - tx;
    this.anchor.y += cy - ty;
    this.showDebug(`ziel x ${cx.toFixed(1)} y ${cy.toFixed(1)}`);
    return { axisX: 0, axisY: 0, fire: true, moveTo: { x: cx, y: cy } };
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
