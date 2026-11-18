export type IndicatorState = 'off' | 'left' | 'right';

const PERIOD = 0.72;
const ON_TIME = 0.38;
/** Steering column position (fraction of lock) that arms / releases the self-cancel. 0.2 ≈ 90° of wheel. */
const ARM = 0.2;
const RELEASE = 0.05;

/** Indicator stalk + hazards, with self-cancel after a turn like a real column switch. */
export class Indicators {
  state: IndicatorState = 'off';
  hazards = false;
  private phase = 0;
  private armed = false;
  private wasOn = false;

  /** Pushing the stalk the way it's already set, or the other way, returns it to centre. */
  press(dir: 'left' | 'right'): void {
    if (this.state !== 'off') this.state = 'off';
    else {
      this.state = dir;
      this.armed = false;
      this.phase = 0;
    }
  }

  toggleHazards(): void {
    this.hazards = !this.hazards;
    this.phase = 0;
  }

  get flashing(): boolean {
    return this.hazards || this.state !== 'off';
  }

  get blinkOn(): boolean {
    return this.flashing && this.phase % PERIOD < ON_TIME;
  }

  get leftLit(): boolean {
    return this.blinkOn && (this.hazards || this.state === 'left');
  }

  get rightLit(): boolean {
    return this.blinkOn && (this.hazards || this.state === 'right');
  }

  /** Returns 'tick' when the lamp comes on, 'tock' when it goes off (relay sounds). */
  update(dt: number, wheel: number): 'tick' | 'tock' | null {
    if (this.state === 'left') {
      if (wheel < -ARM) this.armed = true;
      else if (this.armed && wheel > -RELEASE) this.state = 'off';
    } else if (this.state === 'right') {
      if (wheel > ARM) this.armed = true;
      else if (this.armed && wheel < RELEASE) this.state = 'off';
    }
    this.phase += dt;
    const on = this.blinkOn;
    let ev: 'tick' | 'tock' | null = null;
    if (on !== this.wasOn) ev = on ? 'tick' : 'tock';
    this.wasOn = on;
    return ev;
  }
}
