import * as THREE from 'three';
import { randRange } from '../core/view';
import type { Particles } from './Particles';

/** Farbrampe für Feuer: heiß und hell → rot → dunkel. */
export const FIRE_RAMP = [0xfff6c0, 0xffd84a, 0xff8a2a, 0xd2342a, 0x6a1420];

const RING_COLOR = new THREE.Color(0xfff2d0);
const SPARK_COLOR = new THREE.Color(0xfff2b0);

/**
 * Pixel-Explosion aus drei Teilen: Feuerball, Druckwelle als Partikelring, Trümmer in der Farbe des Gegners.
 * size: 1 = klein (Drohne), 2 = mittel, 3 = groß.
 */
export function explode(fire: Particles, sparks: Particles, x: number, y: number, size: number, debris: THREE.Color): void {
  const fireCount = 14 * size;
  for (let i = 0; i < fireCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = randRange(1, 7) * Math.sqrt(size);
    const r = Math.random() * 0.4 * size;
    fire.emit(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.cos(a) * sp, Math.sin(a) * sp, randRange(0.3, 0.6) * (0.7 + size * 0.3));
  }

  const ringCount = 14 + 8 * size;
  const ringSpeed = 9 * Math.pow(size, 0.6);
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2;
    sparks.emit(x, y, Math.cos(a) * ringSpeed, Math.sin(a) * ringSpeed, 0.28, RING_COLOR);
  }

  for (let i = 0; i < 5 * size; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = randRange(3, 12);
    sparks.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, randRange(0.5, 0.9), debris);
  }
}

/** Kleine Funken an der Einschlagstelle eines Projektils. */
export function impactSparks(sparks: Particles, x: number, y: number): void {
  for (let i = 0; i < 4; i++) {
    sparks.emit(x, y, randRange(-6, 6), randRange(-2, 8), 0.15, SPARK_COLOR);
  }
}
