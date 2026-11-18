import { noiseBuffer } from './Audio';

/** Background city rumble and rain, both from filtered noise. */
export class Ambience {
  private readonly city: GainNode;
  private readonly rain: GainNode;

  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    const mk = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 3);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(out);
      src.start();
      return g;
    };
    this.city = mk('lowpass', 260);
    this.rain = mk('highpass', 2400);
  }

  set(city: number, rain: number, shade: number): void {
    const t = this.ctx.currentTime;
    // tunnels: a louder, boomier traffic roar
    this.city.gain.setTargetAtTime(city * (0.05 + (1 - shade) * 0.08), t, 0.5);
    this.rain.gain.setTargetAtTime(rain * 0.05 * shade, t, 0.5);
  }
}
