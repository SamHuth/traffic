import { clamp } from '../core/math';
import { noiseBuffer } from './Audio';

/**
 * A small four-cylinder: a saw at firing frequency plus a sub square, through a load-dependent
 * low-pass. Lugging adds a slow amplitude wobble. Road/wind noise rises with speed.
 */
export class EngineSound {
  private readonly saw: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private readonly lugLfo: OscillatorNode;
  private readonly lugDepth: GainNode;
  private readonly road: GainNode;
  private readonly roadFilter: BiquadFilterNode;

  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    this.saw = ctx.createOscillator();
    this.saw.type = 'sawtooth';
    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2.5;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    // lugging tremolo
    const trem = ctx.createGain();
    trem.gain.value = 1;
    this.lugLfo = ctx.createOscillator();
    this.lugLfo.frequency.value = 9;
    this.lugDepth = ctx.createGain();
    this.lugDepth.gain.value = 0;
    this.lugLfo.connect(this.lugDepth).connect(trem.gain);

    this.saw.connect(this.filter);
    this.sub.connect(subGain).connect(this.filter);
    this.filter.connect(trem).connect(this.gain).connect(out);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 2);
    noise.loop = true;
    this.roadFilter = ctx.createBiquadFilter();
    this.roadFilter.type = 'lowpass';
    this.roadFilter.frequency.value = 400;
    this.road = ctx.createGain();
    this.road.gain.value = 0;
    noise.connect(this.roadFilter).connect(this.road).connect(out);

    this.saw.start();
    this.sub.start();
    this.lugLfo.start();
    noise.start();
  }

  update(rpm: number, load: number, lugging: number, limiter: boolean, speed: number): void {
    const t = this.ctx.currentTime;
    const f = rpm / 30; // 4-cylinder firing frequency
    this.saw.frequency.setTargetAtTime(f, t, 0.03);
    this.sub.frequency.setTargetAtTime(f / 2, t, 0.03);
    this.filter.frequency.setTargetAtTime(180 + load * 900 + rpm * 0.18, t, 0.05);
    const flutter = limiter ? 0.5 + 0.5 * Math.sin(t * 60) : 1;
    this.gain.gain.setTargetAtTime((0.07 + load * 0.09 + (rpm / 6000) * 0.05) * flutter, t, 0.05);
    this.lugLfo.frequency.setTargetAtTime(6 + rpm / 250, t, 0.1);
    this.lugDepth.gain.setTargetAtTime(clamp(lugging, 0, 1) * 0.6, t, 0.08);
    this.road.gain.setTargetAtTime(clamp(speed / 22, 0, 1) * 0.12, t, 0.2);
    this.roadFilter.frequency.setTargetAtTime(250 + speed * 30, t, 0.2);
  }
}
