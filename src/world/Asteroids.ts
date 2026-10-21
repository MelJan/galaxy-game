import * as THREE from 'three';
import { SCROLL_SPEED } from '../config';
import { frustumRectAtZ, randRange } from '../core/view';

const COUNT = 14;

interface Rock {
  mesh: THREE.Mesh;
  speed: number;
  spin: THREE.Vector3;
}

function buildRockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const s = Math.random() * 10;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const bump = 1 + 0.28 * Math.sin(n.x * 4 + s) * Math.sin(n.y * 3.3 + s * 1.7) + 0.12 * Math.sin(n.z * 6 + s);
    v.multiplyScalar(bump);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Asteroiden knapp hinter der Spielebene: die nächste Parallax-Schicht. */
export class Asteroids {
  readonly group = new THREE.Group();
  private readonly rocks: Rock[] = [];

  constructor(camera: THREE.PerspectiveCamera) {
    const geometries = [buildRockGeometry(), buildRockGeometry(), buildRockGeometry()];
    // Toon-Shading mit harten Helligkeitsstufen passt zum Pixel-Look
    const tones = new Uint8Array([35, 90, 170, 255]);
    const gradient = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
    const material = new THREE.MeshToonMaterial({ color: 0x6e6258, gradientMap: gradient });
    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(geometries[i % geometries.length], material);
      const rock: Rock = { mesh, speed: 0, spin: new THREE.Vector3() };
      this.group.add(mesh);
      this.respawn(rock, camera, true);
      this.rocks.push(rock);
    }
  }

  private respawn(rock: Rock, camera: THREE.PerspectiveCamera, initial: boolean): void {
    const z = randRange(-35, -8);
    const r = frustumRectAtZ(camera, z);
    rock.mesh.scale.setScalar(randRange(0.4, 1.7));
    rock.mesh.position.set(
      randRange(r.minX, r.maxX),
      initial ? randRange(r.minY, r.maxY) : r.maxY + randRange(2, 25),
      z,
    );
    rock.speed = SCROLL_SPEED * randRange(1.0, 1.6);
    rock.spin.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1));
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    for (const rock of this.rocks) {
      const m = rock.mesh;
      m.position.y -= rock.speed * dt;
      m.rotation.x += rock.spin.x * dt;
      m.rotation.y += rock.spin.y * dt;
      m.rotation.z += rock.spin.z * dt;
      const r = frustumRectAtZ(camera, m.position.z);
      if (m.position.y < r.minY - 3) this.respawn(rock, camera, false);
    }
  }
}
