import * as THREE from 'three';
import { frustumRectAtZ } from '../core/view';
import { GLSL_BAYER } from '../gfx/glsl';
import { gfxUniforms } from '../gfx/mode';

const NEBULA_Z = -700;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uAspect;
  uniform float uPixelScale;
  uniform float uSmooth;
  uniform vec3 uDeep;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uHi;
  varying vec2 vUv;

  ${GLSL_BAYER}

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vUv * vec2(uAspect, 1.0) * 2.2;
    p.y += uTime * uSpeed;
    vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
    float n = fbm(p + 2.0 * q);

    vec3 col = uDeep;
    col = mix(col, uA, smoothstep(0.4, 0.85, n));
    col = mix(col, uB, smoothstep(0.5, 0.95, q.x) * 0.7);
    col += uHi * pow(smoothstep(0.65, 1.0, n), 3.0) * 0.5;

    // Ränder abdunkeln, damit die Ebene nicht als Fläche auffällt
    vec2 e = abs(vUv - 0.5) * 2.0;
    col *= 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));

    // Farbstufen mit geordnetem Dithering: Retro-Look statt weicher Verläufe
    // Im Smooth-Modus weglassen: ein am Bildschirm klebendes Muster über bewegtem Nebel wirkt starr
    if (uSmooth < 0.5) col = floor(col * 110.0 + bayer4(floor(gl_FragCoord.xy / uPixelScale))) / 110.0;

    gl_FragColor = vec4(col, 1.0);
  }
`;

interface NebulaTheme {
  deep: THREE.Vector3;
  a: THREE.Vector3;
  b: THREE.Vector3;
  hi: THREE.Vector3;
}

const v = (r: number, g: number, b: number) => new THREE.Vector3(r, g, b);

/** Farben je Sektor: violett-blau (Imperium), blutrot-giftgrün (Schwarm), tiefblau-gold (Aufgestiegene). */
export const NEBULA_THEMES: NebulaTheme[] = [
  { deep: v(0.004, 0.004, 0.016), a: v(0.085, 0.02, 0.16), b: v(0.015, 0.09, 0.2), hi: v(0.4, 0.1, 0.32) },
  { deep: v(0.012, 0.003, 0.004), a: v(0.12, 0.012, 0.03), b: v(0.03, 0.085, 0.012), hi: v(0.36, 0.26, 0.05) },
  { deep: v(0.003, 0.006, 0.02), a: v(0.02, 0.05, 0.17), b: v(0.13, 0.09, 0.015), hi: v(0.45, 0.4, 0.2) },
  // Schleim: dunkles Petrol, Giftgrün, violette Schlieren
  { deep: v(0.002, 0.012, 0.01), a: v(0.01, 0.1, 0.07), b: v(0.08, 0.02, 0.13), hi: v(0.25, 0.5, 0.2) },
  // Miliz: staubiges Braun, Rost, Grau
  { deep: v(0.01, 0.008, 0.006), a: v(0.09, 0.05, 0.025), b: v(0.05, 0.05, 0.06), hi: v(0.45, 0.25, 0.1) },
  // Kristallwesen: Eisblau, Weiß, Violett
  { deep: v(0.004, 0.008, 0.02), a: v(0.04, 0.09, 0.16), b: v(0.07, 0.03, 0.15), hi: v(0.4, 0.5, 0.6) },
  // Ereignishorizont: fast schwarz, Magenta-Schlieren, grünes Glimmen
  { deep: v(0.001, 0.0, 0.003), a: v(0.06, 0.005, 0.06), b: v(0.0, 0.05, 0.04), hi: v(0.5, 0.1, 0.35) },
  // Kosmische Tiefe: Tiefseeblau, Türkis, rosa Plankton
  { deep: v(0.0, 0.008, 0.02), a: v(0.0, 0.07, 0.11), b: v(0.06, 0.01, 0.06), hi: v(0.15, 0.5, 0.55) },
  // Orbitalfriedhof: kühles Graublau mit Erdblau-Schimmer
  { deep: v(0.004, 0.006, 0.012), a: v(0.04, 0.05, 0.08), b: v(0.01, 0.06, 0.12), hi: v(0.3, 0.35, 0.45) },
  // Sternenflotten: tiefes Dunkelrot und Orange, wie ein Gefechtsfeld
  { deep: v(0.008, 0.003, 0.006), a: v(0.09, 0.02, 0.04), b: v(0.02, 0.03, 0.09), hi: v(0.5, 0.25, 0.1) },
];

/** Weit entfernte Nebel-Ebene mit prozeduralem Shader. */
export class Nebula {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(camera: THREE.PerspectiveCamera) {
    const r = frustumRectAtZ(camera, NEBULA_Z, Math.max(camera.aspect, 2.6));
    const w = (r.maxX - r.minX) * 1.4;
    const h = (r.maxY - r.minY) * 1.4;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0.012 },
        uAspect: { value: w / h },
        uPixelScale: gfxUniforms.uPixelScale,
        uSmooth: gfxUniforms.uSmooth,
        uDeep: { value: NEBULA_THEMES[0].deep.clone() },
        uA: { value: NEBULA_THEMES[0].a.clone() },
        uB: { value: NEBULA_THEMES[0].b.clone() },
        uHi: { value: NEBULA_THEMES[0].hi.clone() },
      },
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material);
    this.mesh.position.set((r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2, NEBULA_Z);
    this.mesh.renderOrder = -10;
  }

  private theme: NebulaTheme = NEBULA_THEMES[0];

  /** Farbthema wechseln; ohne instant wird in update() weich überblendet. */
  setTheme(index: number, instant = false): void {
    this.theme = NEBULA_THEMES[index % NEBULA_THEMES.length];
    if (instant) this.blend(1);
  }

  private blend(k: number): void {
    const u = this.material.uniforms;
    (u.uDeep.value as THREE.Vector3).lerp(this.theme.deep, k);
    (u.uA.value as THREE.Vector3).lerp(this.theme.a, k);
    (u.uB.value as THREE.Vector3).lerp(this.theme.b, k);
    (u.uHi.value as THREE.Vector3).lerp(this.theme.hi, k);
  }

  update(time: number, dt = 0): void {
    this.material.uniforms.uTime.value = time;
    if (dt > 0) this.blend(1 - Math.exp(-dt * 0.8));
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
