import * as THREE from 'three';
import type { NavInfo } from '../cockpit/SatNav';
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { CarPhysics } from '../vehicle/CarPhysics';
import type { PlayerCar } from '../vehicle/PlayerCar';
import type { World, WorldEvents } from './World';
import { asphaltTexture } from './textures';

const LOT = 240; // half-size of the paved area, metres
export const LOT_LIMIT = LOT - 4;

/**
 * Phase-2 practice area: a big paved lot with a two-lane test road, parking bays, a cone slalom
 * and some blocky buildings for scale. Replaced by real roads in Phase 3.
 */
export class TestLot implements World {
  readonly group = new THREE.Group();
  readonly speedCapKmh = 60;
  readonly stats = null;

  constructor(private readonly ds: 1 | -1) {
    const rng = new Rng(42);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x5f7d48, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    this.group.add(grass);

    const tex = asphaltTexture().clone();
    tex.repeat.set(LOT / 4, LOT / 4);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(LOT * 2, LOT * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    lot.rotation.x = -Math.PI / 2;
    lot.receiveShadow = true;
    this.group.add(lot);

    // ---- painted lines (one merged instanced mesh of flat quads)
    const paint = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    const quads: { x: number; z: number; w: number; l: number; rot?: number; mat: THREE.Material }[] = [];
    // test road along Z: lane width 3.5, centre dashes, edge lines
    for (let z = -LOT + 6; z < LOT - 6; z += 12) quads.push({ x: 0, z, w: 0.12, l: 3, mat: paint });
    for (const x of [-3.6, 3.6]) quads.push({ x, z: 0, w: 0.15, l: LOT * 2 - 12, mat: paint });
    // a parallel two-lane road for lane-change practice
    for (let z = -LOT + 6; z < LOT - 6; z += 12) quads.push({ x: -ds * 10.5, z, w: 0.12, l: 3, mat: paint });
    quads.push({ x: -ds * 14.1, z: 0, w: 0.15, l: LOT * 2 - 12, mat: paint });
    // parking bays
    for (let i = 0; i < 16; i++) quads.push({ x: ds * 30, z: -60 + i * 2.6, w: 5, l: 0.1, mat: yellow });
    // stop line
    quads.push({ x: -ds * 1.8, z: -LOT + 20, w: 3.4, l: 0.4, mat: paint });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    for (const mat of [paint, yellow]) {
      const list = quads.filter((q) => q.mat === mat);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const o = new THREE.Object3D();
      list.forEach((q, i) => {
        o.position.set(q.x, 0.01, q.z);
        o.scale.set(q.w, 1, q.l);
        o.rotation.y = q.rot ?? 0;
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      });
      im.receiveShadow = true;
      this.group.add(im);
    }

    // ---- cones: slalom + a lane closure taper
    const coneGeo = new THREE.ConeGeometry(0.17, 0.62, 10);
    coneGeo.translate(0, 0.31, 0);
    const cones: [number, number][] = [];
    for (let i = 0; i < 10; i++) cones.push([ds * 48 + (i % 2 ? 1.2 : -1.2), -40 - i * 9]);
    for (let i = 0; i < 9; i++) cones.push([-ds * (1.8 + Math.min(i, 5) * 0.35), -120 - i * 4]);
    const coneMesh = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6, flatShading: true }), cones.length);
    const o = new THREE.Object3D();
    cones.forEach(([x, z], i) => {
      o.position.set(x, 0, z);
      o.updateMatrix();
      coneMesh.setMatrixAt(i, o.matrix);
    });
    coneMesh.castShadow = true;
    this.group.add(coneMesh);

    // ---- buildings around the edge, light poles along the road
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0);
    const palette = [0xb8b1a5, 0x8f9aa6, 0xc9b79c, 0x9c8f86, 0xd3d0c8, 0x7f8c8d];
    const count = 90;
    const bMesh = new THREE.InstancedMesh(bGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), count);
    for (let i = 0; i < count; i++) {
      const side = i % 4;
      const along = rng.range(-LOT, LOT);
      const off = LOT + rng.range(8, 40);
      const [x, z] = side === 0 ? [along, -off] : side === 1 ? [along, off] : side === 2 ? [-off, along] : [off, along];
      o.position.set(x, 0, z);
      o.scale.set(rng.range(12, 30), rng.range(8, 45), rng.range(12, 30));
      o.rotation.y = 0;
      o.updateMatrix();
      bMesh.setMatrixAt(i, o.matrix);
      bMesh.setColorAt(i, new THREE.Color(rng.pick(palette)));
    }
    bMesh.castShadow = bMesh.receiveShadow = true;
    this.group.add(bMesh);

    const pole = new THREE.CylinderGeometry(0.08, 0.1, 8, 6);
    pole.translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(1.6, 0.12, 0.18);
    arm.translate(-0.8, 8, 0);
    const poleMesh = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x80858c, roughness: 0.5, metalness: 0.4 }), 40);
    const armMesh = new THREE.InstancedMesh(arm, poleMesh.material, 40);
    for (let i = 0; i < 40; i++) {
      const s = i % 2 ? 1 : -1;
      o.position.set(s * 5.2, 0, -LOT + 10 + Math.floor(i / 2) * 24);
      o.rotation.y = s > 0 ? 0 : Math.PI;
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      poleMesh.setMatrixAt(i, o.matrix);
      armMesh.setMatrixAt(i, o.matrix);
    }
    poleMesh.castShadow = armMesh.castShadow = true;
    this.group.add(poleMesh, armMesh);
  }

  /** Start on the test road, in the kerb-side lane for this traffic side. */
  start(): { x: number; z: number; heading: number } {
    return { x: -this.ds * 1.8, z: LOT - 20, heading: 0 };
  }

  step(_dt: number, car: PlayerCar): WorldEvents {
    return { impact: this.constrain(car.physics), honks: [], siren: null, arrived: false };
  }

  private constrain(p: CarPhysics): number {
    if (Math.abs(p.x) <= LOT_LIMIT && Math.abs(p.z) <= LOT_LIMIT) return 0;
    const hit = Math.abs(p.v);
    p.x = clamp(p.x, -LOT_LIMIT, LOT_LIMIT);
    p.z = clamp(p.z, -LOT_LIMIT, LOT_LIMIT);
    if (hit > 0.5) p.bump();
    return hit > 0.5 ? hit : 0;
  }

  update(): void {}

  shade(): number {
    return 1;
  }

  nav(): Partial<NavInfo> {
    return { title: 'TEST LOT', progress: null, distanceLeftM: null, speedLimit: 40, ticker: 'Test lot open all day     •     Mind the cones' };
  }

  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
