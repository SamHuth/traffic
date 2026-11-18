import { Ambience } from './Ambience';
import { EngineSound } from './EngineSound';
import { Sfx } from './Sfx';

/** Owns the AudioContext. Created from the Start-button gesture (browsers require one). */
export class Audio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  engine: EngineSound | null = null;
  sfx: Sfx | null = null;
  ambience: Ambience | null = null;
  private volume = 0.8;

  init(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.engine = new EngineSound(this.ctx, this.master);
      this.sfx = new Sfx(this.ctx, this.master);
      this.ambience = new Ambience(this.ctx, this.master);
    }
    void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Quiet everything while paused / in menus. */
  setActive(on: boolean): void {
    if (!this.ctx) return;
    if (on) void this.ctx.resume();
    else void this.ctx.suspend();
  }
}

export function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
