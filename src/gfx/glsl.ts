/** 4×4-Bayer-Matrix für geordnetes Dithering im Retro-Look. Liefert 0..1. */
export const GLSL_BAYER = /* glsl */ `
  const float BAYER4[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  float bayer4(vec2 fragCoord) {
    ivec2 p = ivec2(mod(fragCoord, 4.0));
    return (BAYER4[p.x + p.y * 4] + 0.5) / 16.0;
  }
`;

/** 3D-Value-Noise, fbm und Voronoi für nahtlose Oberflächen auf Kugeln. */
export const GLSL_NOISE3 = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p = p * 2.02 + 11.3;
      a *= 0.5;
    }
    return v;
  }

  /** x = Abstand zum nächsten Zellpunkt, y = Zufallswert der Zelle. */
  vec2 voronoi3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    float best = 8.0;
    float id = 0.0;
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int k = -1; k <= 1; k++) {
      vec3 g = vec3(float(k), float(y), float(z));
      vec3 o = vec3(hash3(i + g), hash3(i + g + 19.1), hash3(i + g + 47.7));
      vec3 r = g + o - f;
      float d = dot(r, r);
      if (d < best) {
        best = d;
        id = hash3(i + g + 3.3);
      }
    }
    return vec2(sqrt(best), id);
  }
`;
