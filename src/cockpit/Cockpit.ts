import * as THREE from 'three';
import { DEG } from '../core/math';
import { Gauges } from './Gauges';
import { Mirrors } from './Mirrors';
import { SatNav } from './SatNav';
import { SteeringWheel } from './SteeringWheel';
import { disposeTree, faceToward, strut } from './util';

const REPEATER_ON = new THREE.Color(5, 1.7, 0.05);
const REPEATER_OFF = new THREE.Color(0x2b2412);

const std = (color: number, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });

/**
 * The car interior, built from primitives in car-local space (forward = -Z, metres, ground = 0).
 * `ds` is the driver's side: +1 sits on the right (right-hand drive, left-hand traffic).
 */
export class Cockpit {
  readonly root = new THREE.Group();
  readonly eye: THREE.Vector3;
  readonly wheel: SteeringWheel;
  readonly gauges = new Gauges();
  readonly satnav = new SatNav();
  readonly mirrors = new Mirrors();
  private readonly wipers: THREE.Object3D[] = [];
  private readonly repeaters: { left?: THREE.MeshBasicMaterial; right?: THREE.MeshBasicMaterial } = {};
  private wipeT = 0;

  constructor(readonly ds: 1 | -1, bodyColor = 0x2e5f8f) {
    const dx = ds * 0.36; // driver's x
    this.eye = new THREE.Vector3(dx, 1.19, 0.1);
    const m = {
      dash: std(0x3a3e45),
      plastic: std(0x26292e, 0.7),
      leather: std(0x1f2124, 0.55),
      trim: std(0xa3acb6, 0.35, 0.6),
      headliner: std(0xa9a59d, 0.95),
      seat: std(0x3a3f47, 0.95),
      body: std(bodyColor, 0.42, 0.3),
      black: std(0x0c0d0f, 0.6),
      red: new THREE.MeshStandardMaterial({ color: 0xc8261e, emissive: 0x400806, roughness: 0.5 }),
    };
    const add = (mesh: THREE.Mesh) => {
      this.root.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
      mesh.position.set(x, y, z);
      return mesh;
    };

    // ---- dashboard
    box(1.56, 0.3, 0.46, m.dash, 0, 0.75, -0.8);
    box(1.56, 0.03, 0.5, m.dash, 0, 0.905, -0.78).rotation.x = 2 * DEG;
    const lip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.56, 8), m.dash));
    lip.rotation.z = Math.PI / 2;
    lip.position.set(0, 0.87, -0.56);
    box(0.62, 0.18, 0.12, m.plastic, dx, 0.53, -0.6); // knee panel
    // passenger side glovebox seam
    box(0.42, 0.006, 0.01, m.black, -ds * 0.38, 0.8, -0.555);

    // ---- instrument binnacle + cluster
    box(0.48, 0.2, 0.1, m.plastic, dx, 0.97, -0.81);
    const hood = box(0.5, 0.035, 0.14, m.dash, dx, 1.1, -0.79);
    hood.rotation.x = -6 * DEG;
    for (const s of [-1, 1]) box(0.03, 0.19, 0.12, m.dash, dx + s * 0.245, 1.0, -0.77);
    const cluster = add(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1575), new THREE.MeshBasicMaterial({ map: this.gauges.texture, toneMapped: false })));
    cluster.position.set(dx, 0.98, -0.73);
    faceToward(cluster, this.eye);

    // ---- centre stack + console
    box(0.34, 0.3, 0.1, m.plastic, 0, 0.79, -0.58);
    const nav = add(new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.129), new THREE.MeshBasicMaterial({ map: this.satnav.texture, toneMapped: false })));
    nav.position.set(0, 0.86, -0.525);
    faceToward(nav, this.eye);
    for (const s of [-1, 1]) box(0.11, 0.035, 0.02, m.black, s * 0.075, 0.755, -0.527);
    box(0.035, 0.022, 0.012, m.red, 0, 0.72, -0.528); // hazard switch
    box(0.27, 0.26, 0.92, m.plastic, 0, 0.5, -0.12);
    box(0.24, 0.02, 0.3, m.black, 0, 0.635, 0.15); // armrest top
    for (const s of [-1, 1]) {
      // outer dash vents
      box(0.12, 0.05, 0.02, m.black, s * 0.66, 0.86, -0.565);
    }

    // ---- glass frame, pillars, roof
    for (const s of [-1, 1]) {
      add(strut(new THREE.Vector3(s * 0.75, 0.95, -1.0), new THREE.Vector3(s * 0.69, 1.45, -0.42), 0.045, m.dash));
      add(strut(new THREE.Vector3(s * 0.74, 0.98, 0.86), new THREE.Vector3(s * 0.7, 1.43, 0.86), 0.06, m.headliner));
    }
    box(1.48, 0.05, 0.12, m.headliner, 0, 1.46, -0.42);
    box(1.52, 0.03, 2.0, m.headliner, 0, 1.49, 0.58);
    const visor = box(0.36, 0.02, 0.15, m.headliner, dx, 1.465, -0.33);
    visor.rotation.x = -4 * DEG;
    const glass = add(new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.77), new THREE.MeshBasicMaterial({ color: 0xa8cbe4, transparent: true, opacity: 0.06, depthWrite: false })));
    glass.position.set(0, 1.185, -0.7);
    glass.rotation.x = 56 * DEG;
    glass.renderOrder = 10;

    // ---- doors
    for (const s of [-1, 1]) {
      box(0.06, 0.52, 1.8, m.dash, s * 0.8, 0.7, 0.0);
      box(0.13, 0.04, 1.8, m.plastic, s * 0.765, 0.975, 0.0);
      box(0.08, 0.05, 0.4, m.seat, s * 0.74, 0.72, 0.05); // armrest
    }

    // ---- seats (visible when glancing)
    for (const s of [-1, 1]) {
      const sx = s * 0.36;
      box(0.5, 0.12, 0.5, m.seat, sx, 0.42, 0.42);
      const back = box(0.5, 0.66, 0.12, m.seat, sx, 0.8, 0.72);
      back.rotation.x = -12 * DEG;
      if (s !== ds) box(0.26, 0.18, 0.1, m.seat, sx, 1.23, 0.82);
    }

    // ---- bonnet + guards, seen through the windscreen
    const bonnet = box(1.58, 0.07, 1.4, m.body, 0, 0.955, -1.72);
    bonnet.rotation.x = -2.5 * DEG;
    for (const s of [-1, 1]) {
      const guard = box(0.16, 0.1, 1.4, m.body, s * 0.84, 0.965, -1.72);
      guard.rotation.x = -2.5 * DEG;
    }
    box(1.6, 0.03, 0.12, m.black, 0, 0.995, -1.06); // scuttle
    // wipers: pivots at the base of the glass, sweeping in the glass plane
    for (const x of [-0.62, 0.08]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.985, -1.035);
      pivot.rotation.x = 56 * DEG; // local XY = the glass plane
      const arm = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.018, 0.014), m.black);
      blade.position.set(0.29, 0, -0.015); // just outside the glass
      arm.add(blade);
      pivot.add(arm);
      this.root.add(pivot);
      this.wipers.push(arm);
    }

    // ---- steering wheel
    this.wheel = new SteeringWheel(ds, m);
    this.wheel.group.position.set(dx, 0.93, -0.34);
    this.root.add(this.wheel.group);

    // ---- mirrors
    const stem = box(0.02, 0.1, 0.02, m.plastic, 0, 1.43, -0.5);
    stem.rotation.x = 15 * DEG;
    this.mirrors.add(this.root, 'interior', new THREE.Vector3(0, 1.34, -0.5), [0.25, 0.1], new THREE.Vector3(0, 1.32, 2.3), 0, 24, this.eye, m.plastic);
    for (const s of [-1, 1] as const) {
      const sideX = s * 0.97;
      box(0.1, 0.04, 0.08, m.body, s * 0.88, 0.98, -0.86); // arm
      this.mirrors.add(this.root, s === 1 ? 'right' : 'left', new THREE.Vector3(sideX, 1.02, -0.86), [0.16, 0.128], new THREE.Vector3(s * 1.02, 1.02, -0.8), s * 0.2, 30, this.eye, m.body);
      // indicator repeater on the mirror housing: visible from the driver's seat
      const rep = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: REPEATER_OFF, toneMapped: false }));
      rep.position.set(s * 1.0, 0.945, -0.845);
      rep.rotation.y = s * 0.35;
      this.root.add(rep);
      this.repeaters[s === 1 ? 'right' : 'left'] = rep.material as THREE.MeshBasicMaterial;
    }

    this.root.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }

  /** Flash the mirror-mounted repeaters with the indicators. Car-left is always the -X mirror. */
  setIndicators(left: boolean, right: boolean): void {
    this.repeaters.left?.color.copy(left ? REPEATER_ON : REPEATER_OFF);
    this.repeaters.right?.color.copy(right ? REPEATER_ON : REPEATER_OFF);
  }

  /** Sweep the wipers (about one cycle every 1.4 s) while `on`, park them otherwise. */
  updateWipers(dt: number, on: boolean): void {
    if (on || this.wipeT % 1 > 0.02) this.wipeT += dt / 1.4;
    const ph = this.wipeT % 1;
    const a = Math.sin(Math.min(ph / 0.8, 1) * Math.PI) * 1.75;
    for (const w of this.wipers) w.rotation.z = a;
  }

  dispose(): void {
    disposeTree(this.root);
    this.gauges.texture.dispose();
    this.satnav.texture.dispose();
    this.mirrors.target.dispose();
  }
}
