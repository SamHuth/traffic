import * as THREE from 'three';
import type { Road } from '../world/Road';
import type { Vehicle } from './TrafficSystem';
import { buildVehicleGeometry, TYPES, type VehicleKind } from './vehicleTypes';

const CAP = 140;
const LAMPS_PER = 10;
const OFF = { brake: new THREE.Color(0x3a0a08), head: new THREE.Color(0xb8b4a6) };
const ON = { brake: new THREE.Color(4, 0.35, 0.25), ind: new THREE.Color(5, 2.4, 0.2), red: new THREE.Color(5, 0.3, 0.3), blue: new THREE.Color(0.4, 0.8, 5) };

interface KindMeshes {
  body: THREE.InstancedMesh;
  dark: THREE.InstancedMesh;
  light: THREE.InstancedMesh | null;
}

/** Draws traffic with one InstancedMesh per vehicle type part, and every lamp in one more. */
export class TrafficRenderer {
  readonly group = new THREE.Group();
  private readonly kinds = new Map<VehicleKind, KindMeshes>();
  private readonly lamps: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly lm = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly col = new THREE.Color();

  constructor(private readonly road: Road) {
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.25, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 0.3, metalness: 0.3, flatShading: true });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.8, flatShading: true });
    for (const kind of Object.keys(TYPES) as VehicleKind[]) {
      const g = buildVehicleGeometry(kind);
      const cap = kind === 'police' || kind === 'ambulance' || kind === 'tow' ? 12 : CAP;
      const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
        const im = new THREE.InstancedMesh(geo, mat, cap);
        im.count = 0;
        im.castShadow = true;
        im.frustumCulled = false;
        this.group.add(im);
        return im;
      };
      this.kinds.set(kind, { body: mk(g.body, bodyMat), dark: mk(g.dark, darkMat), light: g.light ? mk(g.light, lightMat) : null });
    }
    const lampGeo = new THREE.BoxGeometry(0.3, 0.15, 0.06);
    this.lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), CAP * 3 * LAMPS_PER);
    this.lamps.count = 0;
    this.lamps.frustumCulled = false;
    this.group.add(this.lamps);
  }

  private readonly headNight = new THREE.Color();
  private readonly tailNight = new THREE.Color();

  update(vehicles: Vehicle[], t: number, cx: number, cz: number, night = 0): void {
    // at night headlights blaze and tail-lights glow even off the brake
    this.headNight.copy(OFF.head).lerp(new THREE.Color(4, 3.8, 3.2), night);
    this.tailNight.copy(OFF.brake).lerp(new THREE.Color(1.6, 0.1, 0.08), night);
    const head = this.headNight;
    const tail = this.tailNight;
    for (const k of this.kinds.values()) {
      k.body.count = k.dark.count = 0;
      if (k.light) k.light.count = 0;
    }
    let li = 0;
    const blink = t % 0.72 < 0.38;
    const flash = t % 0.5 < 0.25;
    const ds = this.road.ds;
    for (const v of vehicles) {
      if (v.hidden) continue;
      const w = this.road.toWorld(v.s, v.u);
      const dx = w.x - cx, dz = w.z - cz;
      if (dx * dx + dz * dz > 700 * 700) continue;
      let h = w.h;
      h += v.yaw;
      if (v.oncoming) h += Math.PI;
      else if (v.v > 0.3) h += Math.atan2(v.dudt, v.v) * ds;
      const km = this.kinds.get(v.type.kind)!;
      if (km.body.count >= km.body.instanceMatrix.count) continue;
      this.q.setFromAxisAngle(this.up, h);
      this.m.compose(this.pos.set(w.x, 0, w.z), this.q, this.one);
      const i = km.body.count++;
      km.body.setMatrixAt(i, this.m);
      km.body.setColorAt(i, this.col.set(v.color));
      km.dark.setMatrixAt(km.dark.count++, this.m);
      if (km.light) km.light.setMatrixAt(km.light.count++, this.m);

      // ---- lamps (car-local: forward -Z, left -X)
      const t0 = v.type;
      const hx = t0.width / 2 - 0.2;
      const rz = t0.length / 2 + 0.02;
      const y = t0.lampY;
      const braking = !v.oncoming && (v.acc < -0.6 || v.v < 0.3) && !v.static;
      // indicate > 0 means toward higher u; in car-local terms that's left (-X) when ds = +1
      const sideLeft = v.indicate !== 0 && (v.indicate > 0 ? ds > 0 : ds < 0);
      const sideRight = v.indicate !== 0 && !sideLeft;
      const indL = (v.hazards || sideLeft) && blink;
      const indR = (v.hazards || sideRight) && blink;
      const lamp = (x: number, ly: number, z: number, c: THREE.Color) => {
        if (li >= this.lamps.instanceMatrix.count) return;
        this.lm.makeTranslation(x, ly, z).premultiply(this.m);
        this.lamps.setMatrixAt(li, this.lm);
        this.lamps.setColorAt(li, c);
        li++;
      };
      lamp(-hx, y, rz, braking ? ON.brake : tail);
      lamp(hx, y, rz, braking ? ON.brake : tail);
      // indicators only exist while they flash, so on/off is unmistakable
      if (indL) lamp(-hx, y - 0.17, rz, ON.ind);
      if (indR) lamp(hx, y - 0.17, rz, ON.ind);
      lamp(-hx, y, -rz, v.static && !v.hazards ? OFF.head : head);
      lamp(hx, y, -rz, v.static && !v.hazards ? OFF.head : head);
      if (indL) lamp(-hx - 0.05, y - 0.15, -rz, ON.ind);
      if (indR) lamp(hx + 0.05, y - 0.15, -rz, ON.ind);
      if (v.beacons) {
        const top = t0.height + 0.15;
        lamp(-0.35, top, -t0.length / 2 + (t0.kind === 'police' ? t0.length * 0.45 : 0.5), flash ? ON.red : OFF.brake);
        lamp(0.35, top, -t0.length / 2 + (t0.kind === 'police' ? t0.length * 0.45 : 0.5), flash ? OFF.brake : t0.kind === 'tow' ? ON.ind : ON.blue);
      }
    }
    for (const k of this.kinds.values()) {
      k.body.instanceMatrix.needsUpdate = true;
      if (k.body.instanceColor) k.body.instanceColor.needsUpdate = true;
      k.dark.instanceMatrix.needsUpdate = true;
      if (k.light) k.light.instanceMatrix.needsUpdate = true;
    }
    this.lamps.count = li;
    this.lamps.instanceMatrix.needsUpdate = true;
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        im.geometry.dispose();
        im.dispose();
      }
    });
  }
}
