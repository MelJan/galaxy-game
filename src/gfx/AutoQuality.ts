/** Auflösungsstufen im Smooth-Modus (Anteil der vollen Bildschirmauflösung). */
const LEVELS = [1, 0.8, 0.65, 0.5];
/** Bilder pro Messfenster; gemessen wird der Median (einzelne Ruckler zählen nicht). */
const WINDOW = 120;
/** Mindestziel: Jedes Display schafft 60 Bilder pro Sekunde. */
const MIN_TARGET = 60;
/** Unter diesem Anteil des Ziels wird die Auflösung gesenkt. */
const SLOW = 0.88;
/** So viel muss eine niedrigere Stufe mindestens bringen, sonst liegt es nicht an der Grafik. */
const MIN_GAIN = 1.08;

/**
 * Passt die Render-Auflösung an die Leistung des Geräts an. Ziel ist die beste gemessene Bildrate, mindestens aber
 * 60 (bei 120-Hz-Displays mehr, sobald das Spiel das irgendwo erreicht hat). Liegt das Spiel deutlich
 * darunter, wird die Auflösung eine Stufe gesenkt. Bringt das nichts, geht es zurück, und die Regelung ruht,
 * damit das Bild nicht ohne Nutzen unscharf wird.
 */
export class AutoQuality {
  level = 0;
  /** Zuletzt gemessene Bildrate (Median des Messfensters). */
  fps = 0;
  private bestFps = 0;
  private samples: number[] = [];
  private lastTs = 0;
  /** Bildrate vor dem letzten Herunterregeln (zur Prüfung, ob es geholfen hat). */
  private before: number | null = null;
  /** Nach einer Änderung ein Fenster auslassen (Neuaufbau der Puffer ruckelt kurz). */
  private skip = 0;
  private settled = false;

  /** onChange: Auflösung neu setzen; onMeasure: nach jedem Messfenster (z. B. für eine Anzeige). */
  constructor(
    private readonly onChange: () => void,
    private readonly onMeasure: () => void = () => {},
  ) {}

  /** Anteil der vollen Auflösung für die aktuelle Stufe. */
  get scale(): number {
    return LEVELS[this.level];
  }

  /** Neu anfangen, z. B. nach dem Wechsel des Grafikmodus. */
  reset(): void {
    this.level = 0;
    this.samples = [];
    this.before = null;
    this.settled = false;
    this.skip = 1;
  }

  /** Einmal pro Bild mit dem Zeitstempel aufrufen; active = false (Pause, Menü, Retro-Modus) misst nicht. */
  frame(timestamp: number, active: boolean): void {
    const dt = timestamp - this.lastTs;
    this.lastTs = timestamp;
    if (!active || dt <= 0 || dt > 250) return;
    this.samples.push(dt);
    if (this.samples.length < WINDOW) return;
    const sorted = this.samples.sort((a, b) => a - b);
    this.fps = 1000 / sorted[sorted.length >> 1];
    this.samples = [];
    this.onMeasure();
    if (this.skip > 0) {
      this.skip--;
      return;
    }
    this.bestFps = Math.max(this.bestFps, Math.min(this.fps, 165));
    if (this.settled) return;

    if (this.before !== null) {
      const helped = this.fps >= this.before * MIN_GAIN;
      this.before = null;
      if (!helped) {
        this.level--;
        this.settled = true;
        this.change();
        return;
      }
    }
    const target = Math.max(this.bestFps, MIN_TARGET);
    if (this.fps < target * SLOW && this.level < LEVELS.length - 1) {
      this.before = this.fps;
      this.level++;
      this.change();
    }
  }

  private change(): void {
    this.skip = 1;
    this.onChange();
  }
}
