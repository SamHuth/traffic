import { clamp, smoothstep } from '../core/math';

export interface FlowDef {
  /** Base share of the speed limit drivers actually manage (0–1). */
  crawl: number;
  /** Stop-and-go wave: amplitude 0–1, wavelength (m), backward propagation speed (m/s). */
  waveAmp: number;
  waveLength: number;
  waveSpeed: number;
  /** How differently lanes behave from each other (0–1). */
  laneSpread: number;
  /** Mean bumper gap when spawning queues (m). */
  spacing: number;
  /** Scripted moments where every lane frees up, then compresses again. Times in seconds. */
  surges: { t: number; dur: number }[];
}

export const DEFAULT_FLOW: FlowDef = {
  crawl: 0.6, waveAmp: 0.8, waveLength: 320, waveSpeed: 4.5, laneSpread: 0.7, spacing: 9,
  surges: [{ t: 60, dur: 35 }, { t: 180, dur: 40 }, { t: 330, dur: 40 }],
};

/** Cheap smooth 1-D value noise. */
function noise1(x: number, seed: number): number {
  const h = (i: number) => {
    const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

/**
 * How fast each lane *wants* to go at (s, t), as a fraction of the speed limit. Combines:
 * per-lane drift (so the fast lane changes over time), a backward-travelling stop-and-go wave, and
 * surges where everything opens up for a while.
 */
export class LaneFlow {
  /** Extra local caps (rubbernecking, roadworks): s-range → max fraction. */
  readonly zones: { s0: number; s1: number; cap: number }[] = [];

  constructor(public def: FlowDef, private readonly seed: number) {}

  surge(t: number): number {
    let v = 0;
    for (const s of this.def.surges) {
      const ramp = Math.min(8, s.dur / 3);
      v = Math.max(v, smoothstep(s.t, s.t + ramp, t) * (1 - smoothstep(s.t + s.dur - ramp, s.t + s.dur, t)));
    }
    return v;
  }

  laneBias(lane: number, t: number): number {
    const n = noise1(t / 45 + lane * 3.7, this.seed + lane);
    return 1 + this.def.laneSpread * 0.5 * (2 * n - 1);
  }

  factor(lane: number, s: number, t: number): number {
    const d = this.def;
    const phase = ((s + d.waveSpeed * t) / d.waveLength + lane * 0.13) * Math.PI * 2;
    const w = 0.5 + 0.5 * Math.sin(phase);
    const wave = 1 - d.waveAmp * Math.pow(1 - w, 2.2); // long slow troughs, short gaps
    let f = clamp(d.crawl * this.laneBias(lane, t) * wave, 0.04, 1);
    f = f + (1 - f) * this.surge(t);
    for (const z of this.zones) if (s >= z.s0 && s <= z.s1) f = Math.min(f, z.cap);
    return f;
  }
}
