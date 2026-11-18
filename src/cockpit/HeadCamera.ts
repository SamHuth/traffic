import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { CarPhysics } from '../vehicle/CarPhysics';

/**
 * The driver's eyes. Adds the small motions that sell being in a car: pitch under acceleration and
 * braking, roll in corners, glancing over a shoulder, engine shudder and bump jolts.
 */
export class HeadCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private surge = 0;
  private sway = 0;
  private bumpV = 0;
  private bumpY = 0;
  private t = 0;

  constructor(private readonly eye: THREE.Vector3, private readonly ds: 1 | -1) {
    this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.03, 1500);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.copy(eye);
  }

  bump(strength: number): void {
    this.bumpV -= strength;
  }

  update(dt: number, p: CarPhysics, glance: number, lugging: number, rpm: number): void {
    this.t += dt;
    const lat = p.v * p.yawRate; // lateral acceleration
    // glance: further when looking across the car than out of your own window
    const glanceAngle = glance === 0 ? 0 : glance * (Math.sign(glance) === this.ds ? 1.0 : 1.15);
    this.yaw = damp(this.yaw, -(glanceAngle + p.wheel * 0.07), glance !== 0 ? 9 : 6, dt);
    this.pitch = damp(this.pitch, clamp(p.accel * 0.007, -0.035, 0.03), 5, dt);
    this.roll = damp(this.roll, clamp(-lat * 0.006, -0.03, 0.03), 4, dt);
    this.surge = damp(this.surge, clamp(p.accel * 0.006, -0.03, 0.025), 5, dt);
    this.sway = damp(this.sway, clamp(lat * 0.004, -0.02, 0.02), 4, dt);

    // spring for bump jolts
    this.bumpV += (-this.bumpY * 140 - this.bumpV * 12) * dt;
    this.bumpY += this.bumpV * dt;

    const idle = 0.00035 * (rpm / 1000);
    const shake = lugging * 0.004 + idle;
    const sx = Math.sin(this.t * 61) * shake + Math.sin(this.t * 23) * shake * 0.5;
    const sy = Math.sin(this.t * 47 + 1) * shake;

    const c = this.camera;
    const lookAcross = Math.abs(this.yaw) / 1.15;
    c.position.set(
      this.eye.x + this.sway - Math.sign(this.yaw) * lookAcross * 0.06 + sx,
      this.eye.y + this.bumpY + sy,
      this.eye.z + this.surge - lookAcross * 0.05,
    );
    c.rotation.set(this.pitch + this.bumpY * 0.6, this.yaw, this.roll);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    // keep a usable horizontal view on narrow screens
    this.camera.fov = aspect < 1.5 ? 80 : 72;
    this.camera.updateProjectionMatrix();
  }
}
