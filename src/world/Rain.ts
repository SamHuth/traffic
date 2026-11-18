import * as THREE from 'three';

const N = 2200;
const BOX = 26;
const H = 16;

/** Streaks of rain in a box that follows the camera. */
export class Rain {
  readonly lines: THREE.LineSegments;
  private readonly off = new Float32Array(N * 3);
  private readonly pos: Float32Array;

  constructor() {
    for (let i = 0; i < N; i++) {
      this.off[i * 3] = (Math.random() * 2 - 1) * BOX;
      this.off[i * 3 + 1] = Math.random() * H;
      this.off[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
    }
    this.pos = new Float32Array(N * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaabbd0, transparent: true, opacity: 0.32, fog: true }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  update(dt: number, cx: number, cy: number, cz: number): void {
    if (!this.lines.visible) return;
    const o = this.off;
    const p = this.pos;
    for (let i = 0; i < N; i++) {
      o[i * 3 + 1] -= 17 * dt;
      if (o[i * 3 + 1] < -2) o[i * 3 + 1] += H;
      const x = cx + o[i * 3], y = cy + o[i * 3 + 1] - 2, z = cz + o[i * 3 + 2];
      p[i * 6] = x;
      p[i * 6 + 1] = y;
      p[i * 6 + 2] = z;
      p[i * 6 + 3] = x + 0.04;
      p[i * 6 + 4] = y + 0.55;
      p[i * 6 + 5] = z + 0.06;
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
