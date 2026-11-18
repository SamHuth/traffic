/** Fixed-step simulation with interpolated rendering. */
export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;

  constructor(
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
    readonly dt = 1 / 60,
  ) {}

  start(): void {
    this.last = performance.now();
    const tick = (t: number) => {
      this.raf = requestAnimationFrame(tick);
      const frame = Math.min((t - this.last) / 1000, 0.25); // clamp tab-switch hitches
      this.last = t;
      this.acc += frame;
      let n = 0;
      while (this.acc >= this.dt && n < 8) {
        this.step(this.dt);
        this.acc -= this.dt;
        n++;
      }
      if (n === 8) this.acc = 0;
      this.render(this.acc / this.dt, frame);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
