import * as THREE from 'three';

const m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** Point an object's +Z at a target given in its parent's space (no world matrices needed). */
export function faceToward(obj: THREE.Object3D, target: THREE.Vector3): void {
  m.lookAt(target, obj.position, UP);
  obj.quaternion.setFromRotationMatrix(m);
}

/** A cylinder spanning two points (pillars, struts). */
export function strut(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material, sides = 6): THREE.Mesh {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(radius, radius, len, sides);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return mesh;
}

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
