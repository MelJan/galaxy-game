/**
 * Spielfeld in Welt-Einheiten. Das Gameplay findet auf der Ebene z = 0 statt.
 * halfWidth wird beim Resize an die sichtbare Breite angepasst (mindestens minHalfWidth).
 */
export const FIELD = { halfWidth: 12, minHalfWidth: 12, halfHeight: 18 };

/** Interne Render-Höhe in Pixeln. Das Bild wird pixelgenau auf das Fenster hochskaliert. */
export const RENDER_HEIGHT = 320;

export const CAMERA = {
  fov: 40,
  /** Sichtbarer Rand über und unter dem Spielfeld. */
  marginY: 1.5,
  /** Abstand des Spielfelds zum linken und rechten Bildrand. */
  marginX: 0.3,
  /** Wie stark sich der Hintergrund gegen die Spielerbewegung verschiebt (Parallax-Effekt). */
  swayX: 0.12,
  swayY: 0.06,
} as const;

/** Größe eines Bildschirm-Pixels in Welt-Einheiten auf der Spielebene. */
export const PIXEL = (2 * (FIELD.halfHeight + CAMERA.marginY)) / RENDER_HEIGHT;

export const PLAYER = {
  speed: 20,
  /** Je höher, desto direkter reagiert das Schiff. */
  accel: 14,
  fireInterval: 0.11,
  bulletSpeed: 55,
  edgeMarginY: 1.6,
} as const;

/** Grund-Scrollgeschwindigkeit der Welt (Einheiten pro Sekunde). */
export const SCROLL_SPEED = 8;
