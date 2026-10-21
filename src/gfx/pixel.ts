import * as THREE from 'three';
import { PIXEL } from '../config';
import { GFX, gfxUniforms } from './mode';

/** Zuordnung Zeichen → Farbe. '.' ist immer transparent. */
export type Palette = Record<string, number>;

/** Pixel-Art aus Zeichenzeilen auf ein Canvas malen. */
export function renderPixelArt(rows: string[], palette: Palette): HTMLCanvasElement {
  const width = rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Pixel-Art: Zeile ${y} hat ${row.length} statt ${width} Zeichen`);
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const color = palette[ch];
      if (color === undefined) throw new Error(`Pixel-Art: unbekanntes Zeichen '${ch}' in Zeile ${y}`);
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return canvas;
}

const pixelTextures: THREE.Texture[] = [];

function applyFilter(tex: THREE.Texture): void {
  // Smooth braucht bilineare Filterung für die Kantenglättung im Shader, Retro harte Pixel
  const filter = GFX.smooth ? THREE.LinearFilter : THREE.NearestFilter;
  tex.minFilter = filter;
  tex.magFilter = filter;
}

export function makePixelTexture(rows: string[], palette: Palette): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(renderPixelArt(rows, palette));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.premultiplyAlpha = true;
  applyFilter(tex);
  pixelTextures.push(tex);
  return tex;
}

/** Nach einem Moduswechsel die Filterung aller Pixel-Texturen umstellen. */
export function refreshPixelTextures(): void {
  for (const tex of pixelTextures) {
    applyFilter(tex);
    tex.needsUpdate = true;
  }
}

const spriteVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Kantenglättung für Pixel-Art: innerhalb eines Textur-Pixels wird nicht interpoliert,
// nur an den Pixelgrenzen über uSoftness Pixel (mindestens einen Bildschirm-Pixel). Weich, aber pixelig.
const spriteFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uTexSize;
  uniform float uSmooth;
  uniform float uSoftness;
  uniform float uFlash;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    if (uSmooth > 0.5) {
      vec2 px = vUv * uTexSize;
      vec2 seam = floor(px + 0.5);
      vec2 w = max(fwidth(px), vec2(uSoftness));
      px = seam + clamp((px - seam) / w, -0.5, 0.5);
      uv = px / uTexSize;
    }
    vec4 c = texture2D(uMap, uv);
    if (c.a < 0.02) discard;
    // Treffer-Blitz: Richtung Weiß (Textur ist vormultipliziert, daher Weiß = Alpha)
    c.rgb = mix(c.rgb, vec3(c.a), uFlash);
    gl_FragColor = c;
  }
`;

/** Material für Pixel-Art-Ebenen in beiden Grafikmodi. Die Textur ist vormultipliziert. */
export function createPixelMaterial(map: THREE.Texture, widthPx: number, heightPx: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: spriteVertex,
    fragmentShader: spriteFragment,
    uniforms: {
      uMap: { value: map },
      uTexSize: { value: new THREE.Vector2(widthPx, heightPx) },
      uSmooth: gfxUniforms.uSmooth,
      uSoftness: gfxUniforms.uSoftness,
      uFlash: { value: 0 },
    },
    transparent: true,
    premultipliedAlpha: true,
  });
}

/** Linke Hälfte (letzte Spalte = Mittelachse) zu einem symmetrischen Sprite spiegeln. */
export function mirrorHalf(half: string[]): string[] {
  return half.map((row) => row + [...row.slice(0, -1)].reverse().join(''));
}

export function flipHorizontal(rows: string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''));
}

/**
 * Rechte Hälfte eines symmetrischen Sprites stauchen und abdunkeln: Schräglage-Frame.
 * Der Flügel auf der Kurvenseite neigt sich weg und wirkt dadurch kürzer und dunkler.
 */
export function bankRight(rows: string[], ratio: number, darken: Record<string, string>): string[] {
  const halfW = (rows[0].length + 1) / 2;
  const c = halfW - 1;
  const newLen = Math.round((halfW - 1) * ratio);
  return rows.map((row) => {
    const chars = [...row];
    let out = chars.slice(0, c + 1).join('');
    for (let j = 1; j <= halfW - 1; j++) {
      if (j > newLen) {
        out += '.';
        continue;
      }
      const ch = chars[c + Math.min(halfW - 1, Math.round(j / ratio))];
      out += darken[ch] ?? ch;
    }
    return out;
  });
}

/**
 * Im Retro-Modus eine Position aufs Pixelraster der Spielebene einrasten
 * (ungerade Sprite-Größen liegen auf Pixelmitten). Im Smooth-Modus bleibt sie stufenlos.
 */
export function snapPixel(v: number, sizePx: number): number {
  if (GFX.smooth) return v;
  return sizePx % 2 === 1 ? (Math.floor(v / PIXEL) + 0.5) * PIXEL : Math.round(v / PIXEL) * PIXEL;
}

/** Ebene in der Spielebene mit Pixel-Textur, 1 Textur-Pixel = 1 Spiel-Pixel. */
export class PixelSprite {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(
    private readonly frames: THREE.Texture[],
    readonly widthPx: number,
    readonly heightPx: number,
  ) {
    this.material = createPixelMaterial(frames[0], widthPx, heightPx);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthPx * PIXEL, heightPx * PIXEL), this.material);
  }

  setFrame(i: number): void {
    this.material.uniforms.uMap.value = this.frames[i];
  }

  /** 0 = normal, 1 = komplett weiß. */
  setFlash(amount: number): void {
    this.material.uniforms.uFlash.value = amount;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  /** Mittelpunkt setzen (im Retro-Modus eingerastet aufs Pixelraster). */
  place(x: number, y: number, z = 0): void {
    this.mesh.position.set(snapPixel(x, this.widthPx), snapPixel(y, this.heightPx), z);
  }
}
