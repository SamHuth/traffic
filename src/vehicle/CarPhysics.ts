import { approach, clamp, damp, DEG } from '../core/math';

/**
 * Kinematic bicycle model. At these speeds there's no need for tyre slip, so it stays calm and
 * predictable. Forward is -Z; heading is rotation about +Y.
 */
export class CarPhysics {
  x = 0;
  z = 0;
  heading = 0;
  /** Signed speed along forward, m/s. */
  v = 0;
  /** Steering column position -1 … 1 (what the steering wheel shows). */
  wheel = 0;
  /** Smoothed longitudinal acceleration, m/s² (head motion). */
  accel = 0;
  yawRate = 0;

  prevX = 0;
  prevZ = 0;
  prevHeading = 0;

  readonly wheelbase = 2.6;
  readonly mass = 1250;
  readonly maxSteer = 35 * DEG;

  place(x: number, z: number, heading: number): void {
    this.x = this.prevX = x;
    this.z = this.prevZ = z;
    this.heading = this.prevHeading = heading;
    this.v = this.accel = this.yawRate = this.wheel = 0;
  }

  step(dt: number, steerCmd: number, driveForce: number, brake: number): void {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevHeading = this.heading;

    // a heavy wheel: limited turning rate, a little slower at speed
    const rate = 2.4 / (1 + Math.abs(this.v) / 30);
    this.wheel = approach(this.wheel, clamp(steerCmd, -1, 1), rate * dt);
    const delta = (this.wheel * this.maxSteer) / (1 + Math.abs(this.v) / 20);

    const v0 = this.v;
    const a = driveForce / this.mass;
    const resist = 0.14 + 0.00045 * this.v * this.v + brake * 7.5;
    this.v += a * dt;
    const dv = resist * dt;
    if (Math.abs(this.v) <= dv) this.v = 0;
    else this.v -= Math.sign(this.v) * dv;

    this.yawRate = (-this.v * Math.tan(delta)) / this.wheelbase;
    this.heading += this.yawRate * dt;
    this.x += -Math.sin(this.heading) * this.v * dt;
    this.z += -Math.cos(this.heading) * this.v * dt;
    this.accel = damp(this.accel, (this.v - v0) / dt, 6, dt);
  }

  /** Hard stop against an obstacle (no fail state, just a jolt). */
  bump(): void {
    this.v = 0;
  }
}
