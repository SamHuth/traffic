import { clamp, damp, KMH } from '../core/math';
import type { Gear } from '../input/Controls';

export const IDLE_RPM = 800;
export const REDLINE = 6000;
const WHEEL_R = 0.3;
const EFFICIENCY = 0.9;
const PEAK_TORQUE = 52; // Nm – a deliberately weak engine: this car is heavy and slow
/** Road speed (km/h) at the redline in each gear. Index 0 = reverse. */
const REDLINE_KMH: Record<number, number> = { [-1]: 18, 1: 20, 2: 35, 3: 50, 4: 65, 5: 80 };
/** Torque multiplier while the auto-clutch is slipping (pulling away). The tall ratios of high gears already make them bog. */
const LAUNCH: Record<number, number> = { [-1]: 1, 1: 1, 2: 0.9, 3: 0.85, 4: 0.8, 5: 0.7 };
/** Engine-to-wheel ratio (overall) per gear. */
const RATIO: Record<number, number> = Object.fromEntries(
  Object.entries(REDLINE_KMH).map(([g, kmh]) => [g, ((REDLINE / 60) * 2 * Math.PI * WHEEL_R) / (kmh / KMH)]),
);

function torqueCurve(rpm: number): number {
  const f = rpm < 3200 ? 0.45 + 0.55 * clamp((rpm - IDLE_RPM) / 2400, 0, 1) : 1 - 0.25 * clamp((rpm - 3200) / 2800, 0, 1);
  return PEAK_TORQUE * f;
}

export interface DriveOutput {
  /** Force at the wheels along the car's forward axis, N. */
  force: number;
}

/**
 * Clutchless manual 1–5 + R. An automatic clutch slips below idle so the car never stalls, and
 * creeps in low gears like a real auto-clutch. Pulling away in a high gear bogs and shudders.
 */
export class Drivetrain {
  gear: Gear = 0;
  rpm = IDLE_RPM;
  /** 0 = clutch open/slipping, 1 = locked. */
  clutch = 0;
  /** 0–1: how badly the engine is labouring (drives shudder + sound). */
  lugging = 0;
  /** Engine load 0–1 for the engine sound. */
  load = 0;
  limiter = false;
  private locked = false;

  /** Returns false (and drops to neutral) when the shift is refused: the gears grind. */
  requestGear(g: Gear, v: number): boolean {
    if ((g === -1 && v > 0.8) || (g > 0 && v < -0.8)) {
      this.gear = 0;
      return false;
    }
    this.gear = g;
    return true;
  }

  step(dt: number, v: number, throttleIn: number, speedCap: number): DriveOutput {
    const g = this.gear;
    let throttle = throttleIn;
    if (Math.abs(v) > speedCap) throttle = 0; // governor
    this.limiter = false;

    if (g === 0) {
      const target = IDLE_RPM + throttle * (REDLINE - IDLE_RPM) * 0.92;
      this.rpm = damp(this.rpm, target, target > this.rpm ? 6 : 2.5, dt);
      this.clutch = 0;
      this.locked = false;
      this.lugging = 0;
      this.load = throttle * 0.4;
      if (this.rpm > REDLINE) this.limiter = true;
      return { force: 0 };
    }

    const ratio = RATIO[g];
    const dir = g === -1 ? -1 : 1;
    const wheelRpm = (((v * dir) / WHEEL_R) * ratio * 60) / (2 * Math.PI);
    let torque: number;

    // lock when the wheels catch the slipping engine; stay locked until they drop below idle
    this.locked = this.locked ? wheelRpm >= IDLE_RPM : wheelRpm >= Math.max(IDLE_RPM * 1.02, this.rpm - 40);
    if (this.locked) {
      // clutch locked: engine speed is tied to road speed
      this.clutch = 1;
      this.rpm = wheelRpm;
      const idleHold = clamp((IDLE_RPM * 1.15 - this.rpm) / 200, 0, 1) * 10; // idle controller keeps it creeping
      torque = torqueCurve(this.rpm) * throttle + idleHold * (1 - throttle);
      torque -= (1 - throttle) * (4 + 16 * (this.rpm / REDLINE)); // engine braking
      if (this.rpm > REDLINE) {
        this.limiter = true;
        torque = Math.min(torque, -6);
      }
      this.lugging = g >= 2 && throttle > 0.25 ? clamp((1500 - this.rpm) / 700, 0, 1) * throttle : 0;
      this.load = clamp(throttle, 0, 1);
    } else {
      // auto-clutch slipping: pulling away or crawling
      this.clutch = clamp(wheelRpm / IDLE_RPM, 0, 1);
      const launchRpm = IDLE_RPM + throttle * (g >= 3 ? 500 : 1500); // high gears drag the revs down
      this.rpm = damp(this.rpm, Math.max(launchRpm, wheelRpm), 5, dt);
      const creep = g === 1 || g === 2 || g === -1 ? 0.14 : 0.05;
      torque = torqueCurve(this.rpm) * Math.max(throttle, creep) * LAUNCH[g];
      this.lugging = g >= 3 && throttle > 0.2 ? ((g - 2) / 3) * throttle : 0;
      this.load = Math.max(throttle, 0.15);
    }

    return { force: (torque * ratio * EFFICIENCY * dir) / WHEEL_R };
  }
}
