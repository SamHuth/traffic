import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { themeAt } from '../levels/RouteDef';
import { worldMaterials } from './materials';
import { edgeU, MOUTH, type RouteContext } from './RoadMesh';

export interface Lot {
  s: number;
  sg: 1 | -1;
  kind: 'houses' | 'towers' | 'warehouses' | 'stadium';
  width: number;
  depth: number;
  height: number;
  setback: number;
  color: number;
  roofColor: number;
  awning: boolean;
}

const ROOFS = [0x7a3b2e, 0x4b4f55, 0x8c5a3c, 0x5e6b73, 0x9a8f80];

/** Side streets: deterministic positions from each zone's spacing. */
export function planCrossStreets(ctx: Omit<RouteContext, 'crossStreets'>): number[] {
  const rng = new Rng(ctx.route.seed ^ 0x51ab);
  const out: number[] = [];
  let s = 90;
  while (s < ctx.road.length - 60) {
    const t = themeAt(ctx.route, s);
    if (!t.crossStreetEvery) {
      s += 40;
      continue;
    }
    out.push(Math.round(s));
    s += t.crossStreetEvery * rng.range(0.7, 1.3);
  }
  return out;
}

/** Building lots down both sides of the whole route (cheap; built into meshes per chunk). */
export function planLots(ctx: RouteContext): Lot[] {
  const rng = new Rng(ctx.route.seed);
  const lots: Lot[] = [];
  for (const sg of [1, -1] as const) {
    let s = 4;
    while (s < ctx.road.length - 4) {
      const t = themeAt(ctx.route, s);
      const width = rng.range(...t.frontage);
      const blocked = ctx.crossStreets.find((c) => s + width > c - MOUTH - 2 && s < c + MOUTH + 2);
      if (t.crossStreetEvery && blocked !== undefined) {
        s = blocked + MOUTH + 2;
        continue;
      }
      if (t.buildings === 'none') {
        s += 50;
        continue;
      }
      if (t.id === 'stadium' && sg === -1 && !lots.some((l) => l.kind === 'stadium')) {
        lots.push({ s: s + 90, sg, kind: 'stadium', width: 160, depth: 140, height: 28, setback: 12, color: 0xd2cec4, roofColor: 0, awning: false });
        s += 190;
        continue;
      }
      if (t.buildings !== 'warehouses' || rng.next() > 0.25) {
        lots.push({
          s: s + width / 2,
          sg,
          kind: t.buildings,
          width,
          depth: rng.range(...t.depth),
          height: t.buildings === 'towers' ? Math.round(rng.range(...t.height) / 3.6) * 3.6 + 0.6 : rng.range(...t.height),
          setback: rng.range(...t.setback),
          color: rng.pick(t.palette),
          roofColor: rng.pick(ROOFS),
          awning: rng.next() < 0.6,
        });
      }
      const gap = t.buildings === 'houses' ? rng.range(2, 5) : t.buildings === 'towers' ? rng.range(0, 1.5) : rng.range(8, 20);
      s += width + gap;
    }
  }
  return lots;
}

// ---- shared unit geometries
let geos: ReturnType<typeof makeGeos> | null = null;
function makeGeos() {
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  // gable roof, ridge along Z, footprint 1×1, height 1
  const gable = new THREE.BufferGeometry();
  const v = [
    -0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, -0.5, 0, 0.5, // left slope
    0.5, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1, -0.5, 0.5, 0, -0.5, // right slope
    -0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, 0.5, // back gable
    0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, -0.5, // front gable
  ];
  gable.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  gable.computeVertexNormals();
  const pole = new THREE.CylinderGeometry(0.07, 0.1, 8, 6);
  pole.translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(2.2, 0.1, 0.12);
  arm.translate(1.1, 7.95, 0);
  const lightPole = mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()])!;
  const lamp = new THREE.BoxGeometry(0.7, 0.12, 0.3);
  lamp.translate(2.05, 7.85, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.17, 2.6, 6);
  trunk.translate(0, 1.3, 0);
  const canopy = new THREE.IcosahedronGeometry(1, 0);
  const bowl = new THREE.CylinderGeometry(1, 0.85, 1, 28, 1, true);
  bowl.translate(0, 0.5, 0);
  const tower = mergeGeometries([
    new THREE.CylinderGeometry(0.5, 0.8, 40, 6).translate(0, 20, 0).toNonIndexed(),
    new THREE.BoxGeometry(6, 3, 1).translate(0, 41, 0).toNonIndexed(),
  ])!;
  const legs = new THREE.BoxGeometry(0.34, 0.85, 0.2).translate(0, 0.43, 0).toNonIndexed();
  const torso = new THREE.BoxGeometry(0.44, 0.65, 0.26).translate(0, 1.18, 0).toNonIndexed();
  const head = new THREE.IcosahedronGeometry(0.13, 0).translate(0, 1.63, 0).toNonIndexed();
  const personGeo = mergeGeometries([legs, torso, head])!;
  return { box, gable, lightPole, lamp, trunk, canopy, bowl, tower, personGeo };
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const mat4 = (x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number) =>
  tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromAxisAngle(UP, rotY), tmpS.set(sx, sy, sz)).clone();

/** Buildings, street lights and trees for [s0, s1). */
export function buildSceneryChunk(ctx: RouteContext, lots: Lot[], s0: number, s1: number): THREE.Group {
  geos ??= makeGeos();
  const m = worldMaterials();
  const { road } = ctx;
  const rng = new Rng(ctx.route.seed + Math.floor(s0) * 7919);
  type Inst = { m: THREE.Matrix4; c?: number };
  const L: Record<string, Inst[]> = { house: [], tower: [], warehouse: [], roof: [], awning: [], plant: [], pole: [], lamp: [], trunk: [], canopy: [], bowl: [], flood: [], crowd: [] };

  for (const lot of lots) {
    if (lot.s < s0 || lot.s >= s1) continue;
    const t = themeAt(ctx.route, lot.s);
    const front = t.median === 'barrier' ? edgeU(road, t, lot.s) + 8 : road.kerbU(lot.s) + t.footpath;
    const uc = lot.sg * (front + lot.setback + lot.depth / 2);
    const p = road.toWorld(lot.s, uc);
    const body = mat4(p.x, 0, p.z, p.h, lot.depth, lot.height, lot.width);
    if (lot.kind === 'houses') {
      L.house.push({ m: body, c: lot.color });
      L.roof.push({ m: mat4(p.x, lot.height, p.z, p.h, lot.depth * 1.12, lot.depth * 0.32, lot.width * 1.06), c: lot.roofColor });
    } else if (lot.kind === 'towers') {
      L.tower.push({ m: body, c: lot.color });
      const pr = road.toWorld(lot.s + rng.range(-3, 3), uc + lot.sg * rng.range(-2, 3));
      L.plant.push({ m: mat4(pr.x, lot.height, pr.z, p.h, rng.range(5, 9), rng.range(2, 4), rng.range(5, 9)), c: 0x8d9196 });
      if (lot.awning) {
        const pa = road.toWorld(lot.s, lot.sg * (front + lot.setback - 1.2));
        L.awning.push({ m: mat4(pa.x, 3.7, pa.z, p.h, 2.4, 0.18, lot.width * 0.96) });
      }
    } else if (lot.kind === 'stadium') {
      L.bowl.push({ m: mat4(p.x, 0, p.z, p.h, lot.depth / 2, lot.height, lot.width / 2), c: lot.color });
      for (const [da, du] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const pf = road.toWorld(lot.s + da * lot.width * 0.42, uc + du * lot.depth * 0.42);
        L.flood.push({ m: mat4(pf.x, 0, pf.z, p.h, 1, 1, 1), c: 0x9aa0a6 });
      }
    } else {
      L.warehouse.push({ m: body, c: lot.color });
      L.roof.push({ m: mat4(p.x, lot.height, p.z, p.h, lot.depth * 1.02, 1.6, lot.width * 1.01), c: 0x9aa0a6 });
    }
  }

  // street lights + trees, skipping side-street mouths
  const inMouth = (s: number) => ctx.crossStreets.some((c) => Math.abs(s - c) < MOUTH + 1);
  for (const sg of [1, -1] as const) {
    const t0 = themeAt(ctx.route, s0);
    const every = t0.streetLightEvery;
    for (let s = Math.ceil(s0 / every) * every + (sg > 0 ? 0 : every / 2); s < s1; s += every) {
      const t = themeAt(ctx.route, s);
      if (t.crossStreetEvery && inMouth(s)) continue;
      const u = sg * (t.median === 'barrier' ? edgeU(road, t, s) + 1.2 : road.kerbU(s) + 0.6);
      const p = road.toWorld(s, u);
      const rot = sg * road.ds > 0 ? p.h : p.h + Math.PI;
      L.pole.push({ m: mat4(p.x, 0, p.z, rot, 1, 1, 1) });
      L.lamp.push({ m: mat4(p.x, 0, p.z, rot, 1, 1, 1) });
    }
    const te = t0.treeEvery;
    for (let s = Math.ceil(s0 / te) * te; s < s1; s += te) {
      const t = themeAt(ctx.route, s);
      const ss = s + rng.range(-3, 3);
      if (t.crossStreetEvery && inMouth(ss)) continue;
      if (rng.next() < 0.2) continue;
      const off = t.id === 'suburb' ? 1.7 : t.id === 'cbd' ? 1.4 : 9 + rng.range(0, 14);
      const base = t.median === 'barrier' ? edgeU(road, t, ss) : road.kerbU(ss);
      const p = road.toWorld(ss, sg * (base + off));
      const y0 = t.median === 'barrier' ? 0 : 0.15;
      const sc = t.id === 'cbd' ? rng.range(1.2, 1.6) : rng.range(1.6, 2.6);
      L.trunk.push({ m: mat4(p.x, y0, p.z, 0, 1, sc / 2, 1) });
      const g = new THREE.Color().setHSL(rng.range(0.22, 0.33), rng.range(0.35, 0.55), rng.range(0.26, 0.38));
      L.canopy.push({ m: mat4(p.x, y0 + 1.3 * sc / 2 + sc * 0.9, p.z, rng.range(0, 6), sc * 1.1, sc, sc * 1.1), c: g.getHex() });
    }
  }

  // match-day crowds on stadium footpaths
  for (const sg of [1, -1] as const) {
    for (let s = s0; s < s1; s += rng.range(1.2, 3.5)) {
      const t = themeAt(ctx.route, s);
      if (t.id !== 'stadium' || inMouth(s)) continue;
      const p = road.toWorld(s, sg * (road.kerbU(s) + rng.range(1.2, t.footpath - 0.5)));
      const shirt = rng.next() < 0.55 ? (rng.next() < 0.5 ? 0x1d3f8f : 0xc8a51e) : rng.pick([0x3a3f47, 0xd9d4c8, 0x7a1f1f, 0x2e5a3a]);
      L.crowd.push({ m: mat4(p.x, 0.15, p.z, p.h + (rng.next() < 0.5 ? 0 : Math.PI) + rng.range(-0.4, 0.4), 1, rng.range(0.92, 1.08), 1), c: shirt });
    }
  }

  const group = new THREE.Group();
  const add = (list: Inst[], geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const col = new THREE.Color();
    list.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      if (it.c !== undefined) im.setColorAt(i, col.set(it.c));
    });
    im.castShadow = cast;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  };
  const g = geos;
  add(L.house, g.box, m.house);
  add(L.tower, g.box, m.tower);
  add(L.warehouse, g.box, m.warehouse);
  add(L.roof, g.gable, m.roof);
  add(L.plant, g.box, m.roof);
  add(L.awning, g.box, m.awning);
  add(L.pole, g.lightPole, m.pole);
  add(L.lamp, g.lamp, m.lamp, false);
  add(L.trunk, g.trunk, m.trunk);
  add(L.canopy, g.canopy, m.leaves);
  add(L.bowl, g.bowl, m.stadium);
  add(L.flood, g.tower, m.pole);
  add(L.crowd, g.personGeo, m.crowd);
  return group;
}
