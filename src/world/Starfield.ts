import * as THREE from 'three';
import { frustumRectAtZ, randRange } from '../core/view';
import { gfxUniforms } from '../gfx/mode';

export interface StarLayer {
  count: number;
  zNear: number;
  zFar: number;
  /** Welt-Einheiten pro Sekunde. Durch die Perspektive wirken ferne Schichten zusätzlich langsamer. */
  speed: number;
  /** Punktgröße in Pixeln: normal und für die seltenen großen Sterne (3 = Kreuzform). */
  size: number;
  bigSize: number;
  bigChance: number;
  brightness: number;
}

export const DEFAULT_STAR_LAYERS: StarLayer[] = [
  { count: 1600, zNear: -250, zFar: -450, speed: 4, size: 1, bigSize: 1, bigChance: 0, brightness: 0.8 },
  { count: 600, zNear: -90, zFar: -200, speed: 7, size: 1, bigSize: 2, bigChance: 0.12, brightness: 1.1 },
  { count: 120, zNear: -15, zFar: -60, speed: 11, size: 2, bigSize: 3, bigChance: 0.25, brightness: 1.6 },
];

const STAR_TINTS = [0xffffff, 0xcfe3ff, 0xa8c8ff, 0xfff1d0, 0xffd6e8];

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uHeight;
  uniform float uPixelScale;
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vSize;

  void main() {
    vec3 p = position;
    // Endlos-Scrolling: Sterne wandern nach unten und tauchen oben wieder auf
    p.y = mod(p.y - uTime * uSpeed + uHeight * 0.5, uHeight) - uHeight * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    // Funkeln in harten Stufen statt weich
    float twinkle = sin(uTime * (1.2 + aPhase * 2.0) + aPhase * 6.2831) > 0.6 ? 1.0 : 0.65;
    vColor = aColor * twinkle;
    vSize = aSize;
    gl_PointSize = max(1.0, floor(aSize * uPixelScale + 0.5));
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uSmooth;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    if (vSize > 2.5) {
      // Kreuzform für große Sterne
      vec2 c = floor(gl_PointCoord * 3.0);
      if (c.x != 1.0 && c.y != 1.0) discard;
    }
    float a = 1.0;
    if (uSmooth > 0.5) {
      vec2 q = abs(gl_PointCoord - 0.5);
      a = 1.0 - smoothstep(0.25, 0.5, max(q.x, q.y));
    }
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

/** Mehrere Sternschichten in unterschiedlicher Tiefe. Das Scrolling läuft komplett auf der GPU. */
export class Starfield {
  readonly group = new THREE.Group();
  private readonly materials: THREE.ShaderMaterial[] = [];

  constructor(camera: THREE.PerspectiveCamera, layers: StarLayer[] = DEFAULT_STAR_LAYERS) {
    const tint = new THREE.Color();
    for (const layer of layers) {
      const r = frustumRectAtZ(camera, layer.zFar, Math.max(camera.aspect, 2.6));
      const w = (r.maxX - r.minX) * 1.25;
      const h = (r.maxY - r.minY) * 1.25;

      const pos = new Float32Array(layer.count * 3);
      const col = new Float32Array(layer.count * 3);
      const size = new Float32Array(layer.count);
      const phase = new Float32Array(layer.count);
      for (let i = 0; i < layer.count; i++) {
        pos[i * 3] = randRange(-w / 2, w / 2);
        pos[i * 3 + 1] = randRange(-h / 2, h / 2);
        pos[i * 3 + 2] = randRange(layer.zFar, layer.zNear);
        tint.setHex(STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)]);
        tint.multiplyScalar(layer.brightness * randRange(0.35, 1));
        col.set([tint.r, tint.g, tint.b], i * 3);
        size[i] = Math.random() < layer.bigChance ? layer.bigSize : layer.size;
        phase[i] = Math.random();
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: layer.speed },
          uHeight: { value: h },
          uPixelScale: gfxUniforms.uPixelScale,
          uSmooth: gfxUniforms.uSmooth,
        },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      this.materials.push(mat);

      const points = new THREE.Points(geo, mat);
      points.position.set((r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2, 0);
      points.frustumCulled = false;
      this.group.add(points);
    }
  }

  update(time: number): void {
    for (const m of this.materials) m.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const child of this.group.children) (child as THREE.Points).geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
