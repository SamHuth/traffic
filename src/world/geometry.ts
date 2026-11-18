import * as THREE from 'three';
import type { Road } from './Road';

type V3 = [number, number, number];

/** Accumulates quads into one BufferGeometry (no shared vertices: flat-shaded, low-poly). */
export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];

  /** Quad a-b-c-d (a,b at one end, c,d at the other). Winding is fixed so the face points along `n`. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uvs: [number, number][]): void {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const tri = flip ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2];
    const vs = [a, b, c, d];
    for (const i of tri) {
      this.pos.push(...vs[i]);
      this.nor.push(...n);
      this.uv.push(...uvs[i]);
    }
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

export type Ranges = [number, number][];

/** Remove gaps (e.g. side-street mouths) from a range. */
export function subtract(s0: number, s1: number, gaps: Ranges): Ranges {
  let out: Ranges = [[s0, s1]];
  for (const [g0, g1] of gaps) {
    const next: Ranges = [];
    for (const [a, b] of out) {
      if (g1 <= a || g0 >= b) next.push([a, b]);
      else {
        if (g0 > a) next.push([a, g0]);
        if (g1 < b) next.push([g1, b]);
      }
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 0.05);
}

/** Horizontal strip between lateral offsets uA(s) and uB(s) at height y. UVs are world metres / tile. */
export function ribbon(b: GeoBuilder, road: Road, ranges: Ranges, uA: (s: number) => number, uB: (s: number) => number, y: number, tile = 4, step = 2, facing: 1 | -1 = 1): void {
  for (const [s0, s1] of ranges) {
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    for (let i = 0; i < n; i++) {
      const sa = s0 + ((s1 - s0) * i) / n;
      const sb = s0 + ((s1 - s0) * (i + 1)) / n;
      const ua0 = uA(sa), ub0 = uB(sa), ua1 = uA(sb), ub1 = uB(sb);
      const p = (s: number, u: number): V3 => {
        const w = road.toWorld(s, u);
        return [w.x, y, w.z];
      };
      b.quad(p(sa, ua0), p(sa, ub0), p(sb, ua1), p(sb, ub1), [0, facing, 0], [
        [ua0 / tile, sa / tile], [ub0 / tile, sa / tile], [ua1 / tile, sb / tile], [ub1 / tile, sb / tile],
      ]);
    }
  }
}

/** Vertical face along u(s) from y0 to y1, facing +u (`facing` = 1) or -u (-1). */
export function wall(b: GeoBuilder, road: Road, ranges: Ranges, u: (s: number) => number, y0: number, y1: number, facing: 1 | -1, step = 2): void {
  for (const [s0, s1] of ranges) {
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    for (let i = 0; i < n; i++) {
      const sa = s0 + ((s1 - s0) * i) / n;
      const sb = s0 + ((s1 - s0) * (i + 1)) / n;
      const wa = road.toWorld(sa, u(sa));
      const wb = road.toWorld(sb, u(sb));
      const h = (wa.h + wb.h) / 2;
      const nx = -Math.cos(h) * road.ds * facing;
      const nz = Math.sin(h) * road.ds * facing;
      b.quad([wa.x, y0, wa.z], [wa.x, y1, wa.z], [wb.x, y0, wb.z], [wb.x, y1, wb.z], [nx, 0, nz], [
        [sa / 4, y0], [sa / 4, y1], [sb / 4, y0], [sb / 4, y1],
      ]);
    }
  }
}
