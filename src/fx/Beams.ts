import * as THREE from 'three';
import { PIXEL } from '../config';

/**
 * Laserstrahlen: der Dauerlaser des Spielers und die Strahlen der Lanzenträger und der Kristallarche.
 * Ein Strahl ist ein gestrecktes Rechteck mit Shader: harte Farbbänder quer zum Strahl (Pixel-Look), Flackern längs.
 * Im Ladezustand (charge) ist er nur eine dünne, blinkende Strichlinie als Vorwarnung.
 */
export interface Beam {
  active: boolean;
  /** Ursprung und Richtung (Winkel wie atan2, −π/2 = nach unten). */
  x: number;
  y: number;
  angle: number;
  length: number;
  /** Breite in Welt-Einheiten. */
  width: number;
  charge: boolean;
  /** Feindliche Strahlen treffen den Spieler, der eigene Laser nicht. */
  hostile: boolean;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uCharge;
  uniform float uWidthPx;
  uniform float uLengthPx;
  varying vec2 vUv;
  void main() {
    // Abstand zur Strahlmitte, gerastert auf Spiel-Pixel
    float halfW = max(uWidthPx * 0.5, 1.0);
    float d = floor(abs(vUv.x - 0.5) * 2.0 * halfW) / halfW;
    float along = vUv.y * uLengthPx;
    vec3 col;
    if (uCharge > 0.5) {
      // Vorwarnung: dünne, wandernde Strichlinie
      if (d > 0.25) discard;
      if (fract(along / 6.0 - uTime * 5.0) < 0.45) discard;
      col = uColor * (0.8 + 0.6 * step(0.5, fract(uTime * 8.0)));
    } else {
      // Heller Kern in Strahlfarbe, außen dunkler; knapp über der Bloom-Schwelle, damit er leuchtet, aber nicht überstrahlt
      float flicker = 0.88 + 0.12 * sin(uTime * 45.0 + along * 0.7);
      col = d < 0.34 ? mix(vec3(1.0), uColor, 0.35) * 1.05 : d < 0.68 ? uColor * 0.95 : uColor * 0.45;
      col *= flicker;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Beams {
  private readonly beams: Beam[] = [];
  private time = 0;

  constructor(scene: THREE.Scene, capacity = 12) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0); // Ursprung am Strahlanfang, Länge entlang +y
    for (let i = 0; i < capacity; i++) {
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uTime: { value: 0 },
          uCharge: { value: 0 },
          uWidthPx: { value: 4 },
          uLengthPx: { value: 100 },
        },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.beams.push({ active: false, x: 0, y: 0, angle: 0, length: 0, width: 0, charge: false, hostile: true, mesh, material });
    }
  }

  get all(): readonly Beam[] {
    return this.beams;
  }

  acquire(color: THREE.ColorRepresentation, width: number, hostile: boolean): Beam | null {
    const b = this.beams.find((beam) => !beam.active);
    if (!b) return null;
    b.active = true;
    b.width = width;
    b.hostile = hostile;
    b.charge = false;
    (b.material.uniforms.uColor.value as THREE.Color).set(color);
    b.mesh.visible = true;
    return b;
  }

  release(b: Beam | null): void {
    if (!b) return;
    b.active = false;
    b.mesh.visible = false;
  }

  clear(): void {
    for (const b of this.beams) this.release(b);
  }

  /** Meshes an die aktuellen Strahldaten anpassen. */
  update(dt: number): void {
    this.time += dt;
    for (const b of this.beams) {
      if (!b.active) continue;
      const u = b.material.uniforms;
      u.uTime.value = this.time;
      u.uCharge.value = b.charge ? 1 : 0;
      u.uWidthPx.value = b.width / PIXEL;
      u.uLengthPx.value = b.length / PIXEL;
      b.mesh.position.set(b.x, b.y, 0.2);
      b.mesh.rotation.z = b.angle - Math.PI / 2;
      b.mesh.scale.set(b.charge ? b.width * 0.6 : b.width, Math.max(0.01, b.length), 1);
    }
  }
}

/** Abstand² eines Punkts zum Strahl (als Strecke). */
export function beamDistanceSq(b: Beam, px: number, py: number): number {
  const dx = Math.cos(b.angle);
  const dy = Math.sin(b.angle);
  const t = Math.max(0, Math.min(b.length, (px - b.x) * dx + (py - b.y) * dy));
  const cx = b.x + dx * t - px;
  const cy = b.y + dy * t - py;
  return cx * cx + cy * cy;
}
