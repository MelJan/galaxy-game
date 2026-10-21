import * as THREE from 'three';

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const NDC_CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

const dir = new THREE.Vector3();

/** Schnittpunkte der vier Frustum-Kanten mit der Ebene z = const: unten links, unten rechts, oben rechts, oben links. */
export function frustumCornersAtZ(camera: THREE.PerspectiveCamera, z: number): THREE.Vector2[] {
  camera.updateMatrixWorld();
  return NDC_CORNERS.map(([x, y]) => {
    dir.set(x, y, 0.5).unproject(camera).sub(camera.position);
    const t = (z - camera.position.z) / dir.z;
    return new THREE.Vector2(camera.position.x + dir.x * t, camera.position.y + dir.y * t);
  });
}

/** Sichtbarer Bereich auf der Ebene z = const, optional für ein breiteres Seitenverhältnis. */
export function frustumRectAtZ(camera: THREE.PerspectiveCamera, z: number, aspect = camera.aspect): Rect {
  let cam = camera;
  if (aspect !== camera.aspect) {
    cam = camera.clone();
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }
  const corners = frustumCornersAtZ(cam, z);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
