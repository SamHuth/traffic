import { clamp, smoothstep } from '../core/math';

export type Segment =
  | { kind: 'straight'; len: number }
  /** dir +1 bends left, -1 bends right. */
  | { kind: 'arc'; len: number; radius: number; dir: 1 | -1 };

/** From `s` onward the carriageway has `lanes` lanes (changes taper over TAPER metres). */
export interface LaneSection {
  s: number;
  lanes: number;
}

export interface RoadSpec {
  segments: Segment[];
  laneSections: LaneSection[];
  laneWidth?: number;
  medianWidth?: number;
}

export const TAPER = 90;
const STEP = 1;

/**
 * A level's road: a centreline sampled every metre, with lanes on the driving side of a central
 * median and a mirrored opposing carriageway.
 *
 * Road frame: `s` = distance along the centreline, `u` = lateral offset toward the driving side
 * (left for left-hand traffic). Lane 0 is next to the median (the fast lane); the highest index is
 * the kerb lane. Headings use the car convention: forward = (-sin h, -cos h).
 */
export class Road {
  readonly length: number;
  readonly laneWidth: number;
  readonly medianHalf: number;
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;
  private readonly hs: Float64Array;
  private readonly sections: LaneSection[];

  /** ds: +1 = traffic on the left, -1 = on the right. */
  constructor(spec: RoadSpec, readonly ds: 1 | -1) {
    this.laneWidth = spec.laneWidth ?? 3.5;
    this.medianHalf = (spec.medianWidth ?? 2.4) / 2;
    this.sections = [...spec.laneSections].sort((a, b) => a.s - b.s);
    const total = spec.segments.reduce((a, s) => a + s.len, 0);
    const n = Math.floor(total / STEP) + 1;
    this.length = (n - 1) * STEP;
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.hs = new Float64Array(n);
    let x = 0;
    let z = 0;
    let h = 0;
    let i = 0;
    let segIdx = 0;
    let segLeft = spec.segments[0].len;
    this.xs[0] = x;
    this.zs[0] = z;
    this.hs[0] = h;
    for (i = 1; i < n; i++) {
      while (segLeft <= 0 && segIdx < spec.segments.length - 1) segLeft += spec.segments[++segIdx].len;
      const seg = spec.segments[segIdx];
      const dh = seg.kind === 'arc' ? (seg.dir * STEP) / seg.radius : 0;
      // midpoint integration keeps arcs accurate
      const hm = h + dh / 2;
      x += -Math.sin(hm) * STEP;
      z += -Math.cos(hm) * STEP;
      h += dh;
      segLeft -= STEP;
      this.xs[i] = x;
      this.zs[i] = z;
      this.hs[i] = h;
    }
  }

  /** Centreline point and heading at s. */
  at(s: number): { x: number; z: number; h: number } {
    const f = clamp(s, 0, this.length) / STEP;
    const i = Math.min(Math.floor(f), this.xs.length - 2);
    const t = f - i;
    return {
      x: this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t,
      z: this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t,
      h: this.hs[i] + (this.hs[i + 1] - this.hs[i]) * t,
    };
  }

  /** World position of road-frame (s, u). */
  toWorld(s: number, u: number): { x: number; z: number; h: number } {
    const p = this.at(s);
    // left of forward = (-cos h, sin h); the driving side is left when ds = +1
    return { x: p.x - Math.cos(p.h) * u * this.ds, z: p.z + Math.sin(p.h) * u * this.ds, h: p.h };
  }

  /** Nearest road-frame coordinates for a world point. `hint` is the last known s (speeds up search). */
  project(x: number, z: number, hint = -1): { s: number; u: number } {
    const n = this.xs.length;
    let lo = 0;
    let hi = n - 1;
    if (hint >= 0) {
      lo = Math.max(0, Math.floor(hint / STEP) - 60);
      hi = Math.min(n - 1, Math.floor(hint / STEP) + 60);
    }
    let best = lo;
    let bestD = Infinity;
    for (let i = lo; i <= hi; i++) {
      const dx = x - this.xs[i];
      const dz = z - this.zs[i];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const h = this.hs[best];
    const dx = x - this.xs[best];
    const dz = z - this.zs[best];
    const along = dx * -Math.sin(h) + dz * -Math.cos(h);
    const u = (dx * -Math.cos(h) + dz * Math.sin(h)) * this.ds;
    return { s: clamp(best * STEP + along, 0, this.length), u };
  }

  /** Lane count at s as a continuous value (fractional inside a taper). */
  lanesAt(s: number): number {
    let n = this.sections[0].lanes;
    for (let i = 1; i < this.sections.length; i++) {
      const sec = this.sections[i];
      if (s < sec.s) break;
      n = n + (sec.lanes - n) * smoothstep(sec.s, sec.s + TAPER, s);
    }
    return n;
  }

  /** Whole lanes fully open at s (a tapering lane counts as closed). */
  openLanes(s: number): number {
    return Math.floor(this.lanesAt(s) + 1e-6);
  }

  laneCentre(lane: number): number {
    return this.medianHalf + (lane + 0.5) * this.laneWidth;
  }

  /** u of the kerb edge on the driving side. */
  kerbU(s: number): number {
    return this.medianHalf + this.lanesAt(s) * this.laneWidth;
  }

  /** Lane index containing u (may be out of range). */
  laneAt(u: number): number {
    return Math.floor((u - this.medianHalf) / this.laneWidth);
  }
}
