/**
 * Kleiner Pixel-Painter für große Sprites: zeichnet pixelgenau (ohne Kantenglättung) in ein Zeichenraster,
 * das danach wie handgezeichnete Pixel-Art mit makePixelTexture zur Textur wird. '.' ist transparent.
 */

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Deterministisches Rauschen 0..1 für organische Texturen (gleiche Eingabe = gleiches Ergebnis). */
export function hash2(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Bayer-Schwelle 0..1 für geordnetes Dithering. */
export function bayer(x: number, y: number): number {
  return (BAYER4[(x & 3) + (y & 3) * 4] + 0.5) / 16;
}

export class Painter {
  private px: string[][];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  }

  get(x: number, y: number): string {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y][x] : '.';
  }

  filled(x: number, y: number): boolean {
    return this.get(x, y) !== '.';
  }

  set(x: number, y: number, ch: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = ch;
  }

  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch);
  }

  /** Gefülltes Polygon per Scanline: ein Pixel wird gesetzt, wenn seine Mitte innen liegt. */
  poly(points: [number, number][], ch: string): void {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      points.forEach(([x0, y0], i) => {
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= yc && yc < y1) || (y1 <= yc && yc < y0)) xs.push(x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0));
      });
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, ch);
      }
    }
  }

  /** Gefüllter Kreis um die Mitte des Pixels (cx, cy). */
  circle(cx: number, cy: number, r: number, ch: string): void {
    const r2 = r * r + 0.25;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) this.set(x, y, ch);
      }
    }
  }

  /** Gefüllte Ellipse um die Mitte des Pixels (cx, cy). Mit ch = '.' wird ausgeschnitten. */
  ellipse(cx: number, cy: number, rx: number, ry: number, ch: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.02) this.set(x, y, ch);
      }
    }
  }

  /** Bresenham-Linie. */
  line(x0: number, y0: number, x1: number, y1: number, ch: string): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Jedes Pixel umfärben. Gelesen wird aus einer Kopie, damit sich Änderungen nicht gegenseitig beeinflussen. */
  map(fn: (ch: string, x: number, y: number, get: (x: number, y: number) => string) => string): void {
    const src = this.px.map((row) => [...row]);
    const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y][x] : '.');
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.px[y][x] = fn(src[y][x], x, y, get);
  }

  /** Linke Hälfte inklusive Mittelspalte auf die rechte spiegeln. */
  mirrorX(): void {
    const c = Math.floor(this.w / 2);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < c; x++) this.px[y][this.w - 1 - x] = this.px[y][x];
  }

  /** Kontur um alle gefüllten Pixel (4er-Nachbarschaft). */
  outline(ch = 'k'): void {
    this.map((c, x, y, get) => {
      if (c !== '.') return c;
      const near = get(x - 1, y) !== '.' || get(x + 1, y) !== '.' || get(x, y - 1) !== '.' || get(x, y + 1) !== '.';
      return near ? ch : c;
    });
  }

  rows(): string[] {
    return this.px.map((row) => row.join(''));
  }
}
