/** -1 = reverse, 0 = neutral, 1–5 = forward gears. */
export type Gear = -1 | 0 | 1 | 2 | 3 | 4 | 5;

export type ControlEvent =
  | { type: 'gear'; gear: Gear }
  | { type: 'indicator'; dir: 'left' | 'right' }
  | { type: 'hazards' }
  | { type: 'pause' };

/** The one place every input device writes to, and the car reads from. */
export class Controls {
  /** Steering command, -1 (full left) … 1 (full right). */
  steer = 0;
  throttle = 0;
  brake = 0;
  horn = false;
  /** Head glance: -1 left, 0 ahead, 1 right. */
  glance = 0;
  private queue: ControlEvent[] = [];
  /** Gear changes are applied immediately (not queued) so the shifter knob never sees a stale gear. */
  onGear: ((g: Gear) => void) | null = null;
  /** Pause works even while the simulation is frozen, so it bypasses the queue too. */
  onPause: (() => void) | null = null;

  push(e: ControlEvent): void {
    if (e.type === 'gear' && this.onGear) this.onGear(e.gear);
    else if (e.type === 'pause') this.onPause?.();
    else this.queue.push(e);
  }

  drain(): ControlEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  reset(): void {
    this.steer = this.throttle = this.brake = this.glance = 0;
    this.horn = false;
    this.queue = [];
  }
}

export const gearLabel = (g: Gear): string => (g === -1 ? 'R' : g === 0 ? 'N' : String(g));
