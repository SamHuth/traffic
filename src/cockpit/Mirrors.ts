import * as THREE from 'three';
import { faceToward } from './util';

const RT_W = 640;
const RT_H = 128;
/** Regions of the shared render target: [x, width] in pixels. */
const REGION = { left: [0, 160], interior: [160, 320], right: [480, 160] } as const;
type Which = keyof typeof REGION;

interface Mirror {
  which: Which;
  cam: THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
}

/**
 * Interior + side mirrors share one low-res render target (one viewport each), refreshed every
 * other frame. Side mirrors are skipped on Low quality.
 */
export class Mirrors {
  readonly target = new THREE.WebGLRenderTarget(RT_W, RT_H, { samples: 0 });
  private readonly mirrors: Mirror[] = [];
  private frame = 0;
  sideMirrors = true;

  constructor() {
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /**
   * Adds a mirror: `face` is where the glass sits (car-local), `cam` where its camera sits,
   * `yaw` turns the camera outward. The glass is oriented to face `eye`.
   */
  add(parent: THREE.Object3D, which: Which, face: THREE.Vector3, size: [number, number], camPos: THREE.Vector3, yaw: number, fov: number, eye: THREE.Vector3, frame: THREE.Material): void {
    const [x0, w] = REGION[which];
    const geo = new THREE.PlaneGeometry(size[0], size[1]);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      // mirror image: flip horizontally inside this mirror's region
      const u = 1 - uv.getX(i);
      uv.setX(i, (x0 + u * w) / RT_W);
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.target.texture, toneMapped: false }));
    mesh.position.copy(face);
    parent.add(mesh);
    faceToward(mesh, eye);
    // housing behind the glass
    const housing = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.025, size[1] + 0.025, 0.04), frame);
    housing.position.set(0, 0, -0.022);
    mesh.add(housing);

    const cam = new THREE.PerspectiveCamera(fov, w / RT_H, 0.3, 400);
    cam.position.copy(camPos);
    cam.rotation.set(0, Math.PI + yaw, 0);
    parent.add(cam);
    this.mirrors.push({ which, cam, mesh });
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (this.frame++ % 2) return;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    this.target.scissorTest = true;
    for (const m of this.mirrors) {
      if (!this.sideMirrors && m.which !== 'interior') continue;
      const [x, w] = REGION[m.which];
      this.target.viewport.set(x, 0, w, RT_H);
      this.target.scissor.set(x, 0, w, RT_H);
      m.mesh.visible = false;
      renderer.render(scene, m.cam);
      m.mesh.visible = true;
    }
    renderer.setRenderTarget(prev);
  }
}
