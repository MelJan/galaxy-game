import { storage } from '../core/storage';

/**
 * Grafikmodus.
 * - smooth: volle Auflösung, Pixel-Art bewegt sich stufenlos (Pixelraster wandert mit den Objekten)
 * - retro:  echte Niedrigauflösung, alles rastet auf das grobe Bildschirmraster ein
 */
export const GFX = { smooth: true };

/** Von allen Pixel-Shadern geteilte Uniforms. uPixelScale = Bildschirm-Pixel pro Spiel-Pixel. */
export const gfxUniforms = {
  uSmooth: { value: 1 },
  uPixelScale: { value: 1 },
  /** Breite des weichen Übergangs zwischen zwei Pixeln, in Pixeln (nur Smooth-Modus). */
  uSoftness: { value: 0.35 },
};

const STORAGE_KEY = 'gfx';

export function loadGfxMode(): void {
  const saved = storage.get(STORAGE_KEY);
  if (saved) GFX.smooth = saved === 'smooth';
  gfxUniforms.uSmooth.value = GFX.smooth ? 1 : 0;
}

export function setGfxMode(smooth: boolean): void {
  GFX.smooth = smooth;
  gfxUniforms.uSmooth.value = smooth ? 1 : 0;
  storage.set(STORAGE_KEY, smooth ? 'smooth' : 'retro');
}
