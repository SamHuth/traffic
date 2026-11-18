import { noiseBuffer } from './Audio';

/** One-shots and the horn, all synthesised. */
export class Sfx {
  private readonly noise: AudioBuffer;
  private hornGain: GainNode | null = null;
  private hornOn = false;
  private hornOscs: OscillatorNode[] = [];

  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode) {
    this.noise = noiseBuffer(ctx, 1);
  }

  /** Indicator relay: 'tick' on, 'tock' off. */
  relay(kind: 'tick' | 'tock'): void {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'tick' ? 3200 : 2300;
    bp.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(bp).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5, 0.05);
  }

  grind(): void {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 3;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 38;
    const depth = this.ctx.createGain();
    depth.gain.value = 500;
    lfo.connect(depth).connect(bp.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(bp).connect(g).connect(this.out);
    src.start(t);
    lfo.start(t);
    src.stop(t + 0.5);
    lfo.stop(t + 0.5);
  }

  thud(strength = 1): void {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.32);
  }

  /** Another driver's horn: a short double toot, panned and attenuated by distance. */
  honk(pan: number, dist: number): void {
    const t0 = this.ctx.currentTime + Math.random() * 0.1;
    const gain = Math.min(0.22, 3 / Math.max(dist, 3)) * 0.9;
    if (gain < 0.01) return;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan * 0.8;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800 - Math.min(1200, dist * 10);
    lp.connect(panner).connect(this.out);
    const pitch = 300 + Math.random() * 180;
    const toots = Math.random() < 0.5 ? [[0, 0.16], [0.24, 0.5]] : [[0, 0.45]];
    for (const [a, b] of toots) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t0 + a);
      g.gain.linearRampToValueAtTime(gain, t0 + a + 0.015);
      g.gain.setValueAtTime(gain, t0 + b - 0.02);
      g.gain.linearRampToValueAtTime(0, t0 + b);
      g.connect(lp);
      for (const f of [pitch, pitch * 1.26]) {
        const o = this.ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(g);
        o.start(t0 + a);
        o.stop(t0 + b + 0.02);
      }
    }
  }

  private siren: { gain: GainNode; pan: StereoPannerNode; lp: BiquadFilterNode } | null = null;

  /** Emergency siren: a two-tone wail, panned and filtered by distance. null = silent. */
  sirenAt(where: { pan: number; dist: number } | null): void {
    const t = this.ctx.currentTime;
    if (!where) {
      this.siren?.gain.gain.setTargetAtTime(0, t, 0.3);
      return;
    }
    if (!this.siren) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 900;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.35;
      const depth = this.ctx.createGain();
      depth.gain.value = 320;
      lfo.connect(depth).connect(o.frequency);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const pan = this.ctx.createStereoPanner();
      o.connect(lp).connect(gain).connect(pan).connect(this.out);
      o.start();
      lfo.start();
      this.siren = { gain, pan, lp };
    }
    this.siren.gain.gain.setTargetAtTime(Math.min(0.12, 6 / Math.max(where.dist, 6)) * 0.9, t, 0.2);
    this.siren.pan.pan.setTargetAtTime(where.pan * 0.85, t, 0.1);
    this.siren.lp.frequency.setTargetAtTime(3000 - Math.min(2400, where.dist * 9), t, 0.2);
  }

  horn(on: boolean): void {
    if (on === this.hornOn) return;
    this.hornOn = on;
    const t = this.ctx.currentTime;
    if (on) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      lp.connect(g).connect(this.out);
      this.hornOscs = [392, 494].map((f) => {
        const o = this.ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(lp);
        o.start(t);
        return o;
      });
      this.hornGain = g;
    } else if (this.hornGain) {
      this.hornGain.gain.setTargetAtTime(0, t, 0.02);
      for (const o of this.hornOscs) o.stop(t + 0.15);
      this.hornOscs = [];
      this.hornGain = null;
    }
  }
}
