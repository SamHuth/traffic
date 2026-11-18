import type { Controls, Gear } from '../input/Controls';
import { CarPhysics } from './CarPhysics';
import { Drivetrain } from './Drivetrain';
import { Indicators } from './Indicators';

export interface CarEvents {
  grind: boolean;
  relay: 'tick' | 'tock' | null;
}

export class PlayerCar {
  readonly physics = new CarPhysics();
  readonly drivetrain = new Drivetrain();
  readonly indicators = new Indicators();
  /** km/h governor: kept low on purpose, set per level. */
  speedCapKmh = 60;
  private pendingGrind = false;

  requestGear(g: Gear): void {
    if (!this.drivetrain.requestGear(g, this.physics.v)) this.pendingGrind = true;
  }

  step(dt: number, c: Controls): CarEvents {
    for (const e of c.drain()) {
      if (e.type === 'indicator') this.indicators.press(e.dir);
      else if (e.type === 'hazards') this.indicators.toggleHazards();
    }
    const out = this.drivetrain.step(dt, this.physics.v, c.throttle, this.speedCapKmh / 3.6);
    this.physics.step(dt, c.steer, out.force, c.brake);
    const relay = this.indicators.update(dt, this.physics.wheel);
    const grind = this.pendingGrind;
    this.pendingGrind = false;
    return { grind, relay };
  }

  get speedKmh(): number {
    return Math.abs(this.physics.v) * 3.6;
  }
}
