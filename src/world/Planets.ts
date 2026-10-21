import * as THREE from 'three';
import { PIXEL, SCROLL_SPEED } from '../config';
import { randRange } from '../core/view';
import { GLSL_BAYER, GLSL_NOISE3 } from '../gfx/glsl';
import { GFX } from '../gfx/mode';
import { createPixelMaterial } from '../gfx/pixel';

type Kind = 'terran' | 'gas' | 'lava' | 'rock';
const KIND_ID: Record<Kind, number> = { terran: 0, gas: 1, lava: 2, rock: 3 };

interface PlanetDef {
  kind: Kind;
  /** 4 Farbrampen × 4 Helligkeitsstufen (Nacht → Licht). Bedeutung je nach Typ, siehe Shader. */
  ramps: number[];
  atmosphere: number | null;
  ring: [number, number, number] | null;
  ringChance: number;
  spin: number;
  /** Faktor für die letzte Farbrampe, > 1 lässt sie über den Bloom-Schwellwert leuchten. */
  glow?: number;
}

const DEFS: PlanetDef[] = [
  {
    kind: 'terran', // erdähnlich: Ozean, Land, Gebirge, Wolken
    ramps: [
      0x0b1640, 0x13306e, 0x1f5aa6, 0x3d8ad6,
      0x0f2a1a, 0x1f5a2c, 0x3c8c3a, 0x7cc35a,
      0x2a1f18, 0x5a4128, 0x8f6a3c, 0xc9a36a,
      0x3a4058, 0x8a93ad, 0xc4cee2, 0xe8eef8,
    ],
    atmosphere: 0x6ab0ff,
    ring: null,
    ringChance: 0,
    spin: 0.12,
  },
  {
    kind: 'terran', // fremde Welt: violetter Ozean, Türkis-Land
    ramps: [
      0x1a0b33, 0x3a1466, 0x5e2a9e, 0x8a52d6,
      0x0b2a2a, 0x146060, 0x22a08a, 0x6be0c0,
      0x2a1a20, 0x5a3040, 0x8f4c5c, 0xd07c8a,
      0x403050, 0x9a88b0, 0xd0c0e0, 0xece0f4,
    ],
    atmosphere: 0xc08aff,
    ring: [0x5a4a7a, 0x9a88c0, 0xdcd0f0],
    ringChance: 0.3,
    spin: 0.1,
  },
  {
    kind: 'gas', // Jupiter-artig: drei Bänder, roter Sturm
    ramps: [
      0x2a1a12, 0x6b4426, 0xb07a46, 0xe0b27a,
      0x3a2418, 0x8a5a34, 0xcf9a5c, 0xf2d0a0,
      0x20140e, 0x4a3020, 0x7a5034, 0xa87850,
      0x3a0f0a, 0x8a2a1a, 0xd0583a, 0xf09060,
    ],
    atmosphere: 0xffd090,
    ring: [0x6a5a48, 0xa8947a, 0xe0cdb0],
    ringChance: 0.6,
    spin: 0.18,
  },
  {
    kind: 'gas', // Eisriese in Blau
    ramps: [
      0x0a1438, 0x16307a, 0x2a5ac0, 0x5a9ae8,
      0x0c2040, 0x1a4a8a, 0x3a7ad0, 0x8ac0f8,
      0x081028, 0x10245a, 0x1c4090, 0x3a6cc0,
      0x1a0a3a, 0x3a1a7a, 0x6a3ab8, 0xa070e8,
    ],
    atmosphere: 0x8ac8ff,
    ring: [0x3a5070, 0x6a8ab0, 0xb0d0f0],
    ringChance: 0.7,
    spin: 0.16,
  },
  {
    kind: 'lava', // Kruste mit glühenden Rissen
    ramps: [
      0x120808, 0x2a1010, 0x4a1c18, 0x6e2c20,
      0x1a0e0c, 0x3a1c16, 0x602e22, 0x8a4430,
      0x1a0e0c, 0x3a1c16, 0x602e22, 0x8a4430,
      0xff5a1a, 0xff8a2a, 0xffc040, 0xfff0a0,
    ],
    atmosphere: 0xff6a3a,
    ring: null,
    ringChance: 0,
    spin: 0.08,
    glow: 1.3,
  },
  {
    kind: 'rock', // Mond mit Kratern
    ramps: [
      0x1a1c26, 0x3a3e52, 0x6a7088, 0xa6aec4,
      0x20222e, 0x474c62, 0x7c8298, 0xc0c8dc,
      0x14151e, 0x2c3040, 0x50566c, 0x848aa2,
      0x262a38, 0x5a6078, 0x9aa2bc, 0xe4ecff,
    ],
    atmosphere: null,
    ring: null,
    ringChance: 0,
    spin: 0.06,
  },
];

/** Tiefenbänder, damit sich die Planeten auf verschiedene Ebenen verteilen. */
const DEPTH_BANDS: [number, number][] = [
  [-90, -120],
  [-150, -190],
  [-230, -270],
  [-320, -380],
];

const RING_EXTENT = 2.2;
const PLAIN_EXTENT = 1.12;
/** Mindestabstand zwischen zwei Planeten auf dem Bildschirm, in Bildhöhen-Hälften. */
const SCREEN_GAP = 0.06;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpin;
  uniform float uSeed;
  uniform float uExtent;
  uniform float uAxisTilt;
  uniform float uRingAngle;
  uniform float uHasRing;
  uniform float uHasAtmo;
  uniform int uType;
  uniform vec3 uLight;
  uniform vec3 uPal[16];
  uniform vec3 uRingPal[3];
  uniform vec3 uAtmo;
  varying vec2 vUv;

  ${GLSL_BAYER}
  ${GLSL_NOISE3}

  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

  // Licht in 4 Stufen mit geordnetem Dithering an den Übergängen
  int lightLevel(float l, float dither) {
    float t = (l + 0.2) * 2.8 + (dither - 0.5) * 0.9;
    return int(clamp(floor(t), 0.0, 3.0));
  }

  void main() {
    // Ein Fragment = ein Spiel-Pixel: direkt auf dem Retro-Bildschirm oder in der Planeten-Textur (Smooth)
    vec2 uv = (vUv * 2.0 - 1.0) * uExtent;
    float d = length(uv);
    float dither = bayer4(gl_FragCoord.xy);
    vec3 col = vec3(0.0);
    bool filled = false;

    if (d < 1.0) {
      vec3 n = vec3(uv, sqrt(1.0 - d * d));
      vec3 p = rotY(rotZ(n, uAxisTilt), uTime * uSpin + uSeed);
      int lvl = lightLevel(dot(n, uLight), dither);
      int m = 0;

      if (uType == 0) {
        float h = fbm3(p * 2.0 + uSeed);
        m = h < 0.48 ? 0 : (h < 0.6 ? 1 : 2);
        float cl = fbm3(rotY(p, uTime * uSpin * 0.6) * 2.6 + vec3(0.0, uSeed * 1.7, 0.0));
        if (cl > 0.6) m = 3;
      } else if (uType == 1) {
        float t = p.y * 3.2 + fbm3(p * vec3(1.2, 3.5, 1.2) + uSeed) * 1.8;
        float b = fract(t * 0.5);
        m = b < 0.34 ? 0 : (b < 0.67 ? 1 : 2);
        vec3 storm = normalize(vec3(0.6, -0.3, 0.75));
        if (length((p - storm) * vec3(1.0, 2.2, 1.0)) < 0.32) m = 3;
      } else if (uType == 2) {
        float h = fbm3(p * 2.4 + uSeed);
        m = h < 0.5 ? 0 : 1;
        float crack = abs(fbm3(p * 3.5 + uSeed * 3.1) - 0.5);
        if (crack < 0.04) {
          // Lava leuchtet auch auf der Nachtseite
          m = 3;
          lvl = min(max(lvl, 2) + (crack < 0.015 ? 1 : 0), 3);
        }
      } else {
        float h = fbm3(p * 2.6 + uSeed);
        m = h < 0.52 ? 0 : 1;
        vec2 cr = voronoi3(p * 2.8 + uSeed);
        float rad = 0.1 + 0.22 * cr.y;
        if (cr.x < rad) { m = 2; lvl = max(lvl - 1, 0); }
        else if (cr.x < rad + 0.06) { m = 3; }
      }

      col = uPal[m * 4 + lvl];
      // Heller Atmosphärensaum am beleuchteten Rand
      if (uHasAtmo > 0.5 && d > 0.92 && lvl >= 2) col = mix(col, uAtmo, 0.5);
      filled = true;
    } else if (uHasAtmo > 0.5 && d < 1.09) {
      float a = 1.0 - (d - 1.0) / 0.09;
      float rimLight = dot(normalize(vec3(uv, 0.0)), uLight) * 0.5 + 0.5;
      if (a * rimLight * 1.4 > dither) {
        col = uAtmo;
        filled = true;
      }
    }

    if (uHasRing > 0.5) {
      vec2 ru = rot2(uv, uRingAngle);
      float rd = length(vec2(ru.x, ru.y / 0.28));
      if (rd > 1.35 && rd < 2.15) {
        float s = fract(rd * 4.0 + uSeed);
        bool front = ru.y < 0.0;
        // Vordere Ringhälfte liegt über dem Planeten, die hintere nur daneben
        if (s > 0.12 && (front || !filled)) {
          int ri = int(clamp(floor(s * 3.0 + (dither - 0.5) * 0.8), 0.0, 2.0));
          col = uRingPal[ri];
          filled = true;
        }
      }
    }

    if (!filled) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Planet {
  def: PlanetDef;
  mesh: THREE.Mesh;
  /** Berechnet die Oberfläche Pixel für Pixel. */
  material: THREE.ShaderMaterial;
  /** Smooth-Modus: Oberfläche als Textur in Pixelauflösung, weich interpoliert dargestellt. */
  target: THREE.WebGLRenderTarget;
  display: THREE.ShaderMaterial;
  band: [number, number];
  radius: number;
  extent: number;
  speed: number;
  /** false, solange kein überlappungsfreier Platz gefunden wurde. */
  active: boolean;
}

/** Position und Bewegung eines Planeten auf dem Bildschirm, in Einheiten der halben Bildhöhe. */
interface ScreenTrack {
  x: number;
  y: number;
  r: number;
  v: number;
}

/** Pixel-Planeten mit Shader-Oberfläche, die in verschiedenen Tiefen nach unten ziehen, ohne sich zu überlappen. */
export class Planets {
  readonly group = new THREE.Group();
  private readonly planets: Planet[] = [];
  private readonly time = { value: 0 };
  private readonly light = { value: new THREE.Vector3(-0.65, 0.55, 0.55).normalize() };
  private retryTimer = 0;
  // Offscreen-Bühne, um die Planetenoberflächen in ihre Texturen zu rendern
  private readonly surfaceScene = new THREE.Scene();
  private readonly surfaceCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  private readonly surfaceQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  private readonly clearColor = new THREE.Color();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.surfaceQuad.position.z = -0.5;
    this.surfaceScene.add(this.surfaceQuad);
    for (const band of DEPTH_BANDS) {
      const planet = this.create(band);
      this.planets.push(planet);
      this.respawn(planet, true);
    }
  }

  private create(band: [number, number]): Planet {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: this.time,
        uLight: this.light,
        uSpin: { value: 0 },
        uSeed: { value: 0 },
        uExtent: { value: 1 },
        uAxisTilt: { value: 0 },
        uRingAngle: { value: 0 },
        uHasRing: { value: 0 },
        uHasAtmo: { value: 0 },
        uType: { value: 0 },
        uPal: { value: Array.from({ length: 16 }, () => new THREE.Color()) },
        uRingPal: { value: Array.from({ length: 3 }, () => new THREE.Color()) },
        uAtmo: { value: new THREE.Color() },
      },
    });
    const target = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    const display = createPixelMaterial(target.texture, 16, 16);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), GFX.smooth ? display : material);
    mesh.visible = false;
    this.group.add(mesh);
    return { def: DEFS[0], mesh, material, target, display, band, radius: 1, extent: 1, speed: 0, active: false };
  }

  private configure(planet: Planet): void {
    // Keine zwei gleichen Planetentypen gleichzeitig im Bild
    const used = new Set(this.planets.filter((p) => p !== planet && p.active).map((p) => p.def));
    const free = DEFS.filter((d) => !used.has(d));
    const def = free[Math.floor(Math.random() * free.length)];
    planet.def = def;
    const u = planet.material.uniforms;
    const z = randRange(planet.band[1], planet.band[0]);
    const hasRing = def.ring !== null && Math.random() < def.ringChance;

    planet.radius = Math.abs(z) * randRange(0.06, 0.12);
    planet.extent = hasRing ? RING_EXTENT : PLAIN_EXTENT;
    planet.speed = SCROLL_SPEED * randRange(0.5, 0.9);
    planet.mesh.position.z = z;
    planet.mesh.scale.setScalar(planet.radius * planet.extent * 2);

    // Texturgröße = Kantenlänge des Quads in Spiel-Pixeln dieser Tiefe
    const camZ = this.camera.position.z;
    const pixelAtDepth = (PIXEL * (camZ - z)) / camZ;
    const size = THREE.MathUtils.clamp(Math.round((planet.radius * planet.extent * 2) / pixelAtDepth), 8, 512);
    planet.target.setSize(size, size);
    (planet.display.uniforms.uTexSize.value as THREE.Vector2).set(size, size);

    u.uType.value = KIND_ID[def.kind];
    u.uSeed.value = Math.random() * 50;
    u.uSpin.value = def.spin * randRange(1.1, 1.8) * (Math.random() < 0.5 ? -1 : 1);
    u.uExtent.value = planet.extent;
    u.uAxisTilt.value = randRange(-0.35, 0.35);
    u.uRingAngle.value = randRange(-0.35, 0.35);
    u.uHasRing.value = hasRing ? 1 : 0;
    u.uHasAtmo.value = def.atmosphere !== null ? 1 : 0;
    def.ramps.forEach((hex, i) => {
      const c = (u.uPal.value[i] as THREE.Color).setHex(hex);
      if (def.glow && i >= 12) c.multiplyScalar(def.glow);
    });
    if (def.ring) def.ring.forEach((hex, i) => (u.uRingPal.value[i] as THREE.Color).setHex(hex));
    if (def.atmosphere !== null) (u.uAtmo.value as THREE.Color).setHex(def.atmosphere);
  }

  /** Halbe sichtbare Höhe in Welt-Einheiten auf der Tiefe z. */
  private halfHeightAt(z: number): number {
    return (this.camera.position.z - z) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
  }

  private track(planet: Planet, x = planet.mesh.position.x, y = planet.mesh.position.y): ScreenTrack {
    const k = 1 / this.halfHeightAt(planet.mesh.position.z);
    return { x: x * k, y: y * k, r: planet.radius * planet.extent * k, v: planet.speed * k };
  }

  /**
   * Prüft, ob sich zwei Planeten jemals überlappen, solange beide im Bild sind.
   * Beide bewegen sich nur senkrecht mit konstanter Geschwindigkeit, also reicht ein Blick auf die Bahnen.
   */
  private collides(a: ScreenTrack, b: ScreenTrack): boolean {
    const rsum = a.r + b.r + SCREEN_GAP;
    if (Math.abs(a.x - b.x) >= rsum) return false;
    // Zeit bis zum Verlassen des Bildes unten (y < -1 - r)
    const tA = (a.y + 1 + a.r) / a.v;
    const tB = (b.y + 1 + b.r) / b.v;
    const T = Math.max(0, Math.min(tA, tB));
    const d0 = a.y - b.y;
    const d1 = d0 - (a.v - b.v) * T;
    if (Math.sign(d0) !== Math.sign(d1)) return true;
    return Math.min(Math.abs(d0), Math.abs(d1)) < rsum;
  }

  private respawn(planet: Planet, initial: boolean): void {
    this.configure(planet);
    const others = this.planets.filter((p) => p !== planet && p.active).map((p) => this.track(p));
    const aspect = this.camera.aspect;
    const h = this.halfHeightAt(planet.mesh.position.z);
    const r = planet.radius * planet.extent;

    for (let attempt = 0; attempt < 40; attempt++) {
      const x = randRange(-aspect * h + r * 0.4, aspect * h - r * 0.4);
      const y = initial ? randRange(-h, h + r) : h + r + randRange(0, h * (0.2 + attempt * 0.05));
      const t = this.track(planet, x, y);
      if (others.every((o) => !this.collides(t, o))) {
        planet.mesh.position.x = x;
        planet.mesh.position.y = y;
        planet.active = true;
        planet.mesh.visible = true;
        return;
      }
    }
    // Kein freier Platz: später noch einmal versuchen
    planet.active = false;
    planet.mesh.visible = false;
  }

  update(dt: number, time: number): void {
    this.time.value = time;
    this.retryTimer -= dt;
    const retry = this.retryTimer <= 0;
    if (retry) this.retryTimer = 1;

    for (const planet of this.planets) {
      if (!planet.active) {
        if (retry) this.respawn(planet, false);
        continue;
      }
      planet.mesh.position.y -= planet.speed * dt;
      const h = this.halfHeightAt(planet.mesh.position.z);
      if (planet.mesh.position.y < -h - planet.radius * planet.extent) this.respawn(planet, false);
    }
  }

  /** Nach einem Wechsel des Grafikmodus das passende Material setzen. */
  applyGfxMode(): void {
    for (const planet of this.planets) planet.mesh.material = GFX.smooth ? planet.display : planet.material;
  }

  /** Smooth-Modus: Oberflächen aller sichtbaren Planeten in ihre Texturen rendern. Vor dem Hauptbild aufrufen. */
  renderSurfaces(renderer: THREE.WebGLRenderer): void {
    if (!GFX.smooth) return;
    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(this.clearColor);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const planet of this.planets) {
      if (!planet.active) continue;
      this.surfaceQuad.material = planet.material;
      renderer.setRenderTarget(planet.target);
      renderer.render(this.surfaceScene, this.surfaceCamera);
    }
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this.clearColor, prevAlpha);
  }
}
