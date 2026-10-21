import * as THREE from 'three';

/**
 * Ringpuffer additiver Pixel-Partikel. Mit Farbrampe durchläuft jedes Partikel die Rampe
 * über seine Lebenszeit (z. B. weiß → gelb → rot), sonst blendet es seine Farbe aus.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly base: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly ramp: THREE.Color[] | null;
  private cursor = 0;

  constructor(
    private readonly capacity: number,
    private readonly sizePx: number,
    ramp: number[] | null = null,
    private readonly damping = 2,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.base = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.ramp = ramp ? ramp.map((hex) => new THREE.Color(hex)) : null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    // Ohne Textur sind Points quadratisch, also echte Pixel
    const mat = new THREE.PointsMaterial({
      size: sizePx,
      sizeAttenuation: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  /** Punktgröße an Bildschirm-Pixel pro Spiel-Pixel anpassen. */
  setPixelScale(scale: number): void {
    (this.points.material as THREE.PointsMaterial).size = Math.max(1, Math.round(this.sizePx * scale));
  }

  emit(x: number, y: number, vx: number, vy: number, life: number, color?: THREE.Color): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = 0;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = 0;
    if (color) {
      this.base[i3] = color.r;
      this.base[i3 + 1] = color.g;
      this.base[i3 + 2] = color.b;
    }
    this.life[i] = this.maxLife[i] = life;
  }

  update(dt: number): void {
    const damp = Math.max(0, 1 - this.damping * dt);
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0;
        continue;
      }
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.vel[i3] *= damp;
      this.vel[i3 + 1] *= damp;

      const f = this.life[i] / this.maxLife[i];
      if (this.ramp) {
        const c = this.ramp[Math.min(this.ramp.length - 1, Math.floor((1 - f) * this.ramp.length))];
        this.col[i3] = c.r;
        this.col[i3 + 1] = c.g;
        this.col[i3 + 2] = c.b;
      } else {
        this.col[i3] = this.base[i3] * f;
        this.col[i3 + 1] = this.base[i3 + 1] * f;
        this.col[i3 + 2] = this.base[i3 + 2] * f;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
