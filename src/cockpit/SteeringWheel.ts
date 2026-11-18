import * as THREE from 'three';
import { DEG } from '../core/math';
import type { IndicatorState } from '../vehicle/Indicators';

/** Steering wheel visual turns ±450° (≈13:1 against 35° of road-wheel lock). */
export const WHEEL_LOCK = 450 * DEG;

export class SteeringWheel {
  readonly group = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly indStalk = new THREE.Group();
  private stalkAngle = 0;

  constructor(ds: 1 | -1, mats: { leather: THREE.Material; plastic: THREE.Material; trim: THREE.Material }) {
    const tilt = new THREE.Group();
    tilt.rotation.x = -24 * DEG; // top of the rim leans away from the driver
    this.group.add(tilt);
    tilt.add(this.spin);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.021, 8, 32), mats.leather);
    this.spin.add(rim);
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.05), mats.trim);
    marker.position.set(0, 0.19, 0);
    this.spin.add(marker);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.05, 10), mats.plastic);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -0.025;
    this.spin.add(hub);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), mats.trim);
    badge.position.z = 0.002;
    this.spin.add(badge);
    for (const a of [0, Math.PI, -Math.PI / 2]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.13, a === -Math.PI / 2 ? 0.035 : 0.045, 0.018), mats.plastic);
      spoke.position.set(Math.cos(a) * 0.115, Math.sin(a) * 0.115, -0.015);
      spoke.rotation.z = a;
      this.spin.add(spoke);
    }

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.32, 8), mats.plastic);
    column.rotation.x = Math.PI / 2;
    column.position.z = -0.2;
    tilt.add(column);
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.16), mats.plastic);
    shroud.position.set(0, -0.01, -0.13);
    tilt.add(shroud);

    // indicator stalk on the outboard side, wiper stalk opposite
    this.indStalk.position.set(ds * 0.055, 0.0, -0.075);
    tilt.add(this.indStalk);
    const stalkGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.16, 6);
    stalkGeo.rotateZ(Math.PI / 2);
    stalkGeo.translate(ds * 0.08, 0, 0);
    this.indStalk.add(new THREE.Mesh(stalkGeo, mats.plastic));
    const wiper = new THREE.Mesh(stalkGeo.clone(), mats.plastic);
    wiper.scale.x = -1;
    wiper.position.set(-ds * 0.055, 0, -0.075);
    tilt.add(wiper);
  }

  update(wheel: number, ind: IndicatorState, dt: number): void {
    this.spin.rotation.z = -wheel * WHEEL_LOCK; // right = clockwise from the driver's seat
    // stalk tip moves the way the rim on that side moves for the turn
    const target = ind === 'right' ? -0.2 : ind === 'left' ? 0.2 : 0;
    this.stalkAngle += (target - this.stalkAngle) * Math.min(1, dt * 25);
    this.indStalk.rotation.z = this.stalkAngle;
  }
}
