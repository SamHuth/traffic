import * as THREE from 'three';
import { zoneParts, type RouteDef } from '../levels/RouteDef';
import { GeoBuilder, ribbon, subtract, wall } from './geometry';
import { worldMaterials } from './materials';
import type { Road } from './Road';
import type { Theme } from './themes';

/** Motorway hard shoulder beyond the kerb lane. */
export const SHOULDER = 2.6;
export const KERB_H = 0.15;
/** Half the along-road width of a side-street mouth. */
export const MOUTH = 6;
const SIDE_ROAD_HALF = 4;

export interface RouteContext {
  road: Road;
  route: RouteDef;
  /** s positions of side streets (both sides of the road). */
  crossStreets: number[];
}

/** u of the outer edge of the drivable surface on the driving side. */
export function edgeU(road: Road, theme: Theme, s: number): number {
  return road.kerbU(s) + (theme.median === 'barrier' ? SHOULDER : 0);
}

/** Road surface, paint, kerbs, footpaths, medians and side streets for [s0, s1). */
export function buildRoadChunk(ctx: RouteContext, s0: number, s1: number): THREE.Group {
  const { road } = ctx;
  const m = worldMaterials();
  const W = road.laneWidth;
  const mh = road.medianHalf;
  const b = {
    asphalt: new GeoBuilder(),
    concrete: new GeoBuilder(),
    kerb: new GeoBuilder(),
    medianGrass: new GeoBuilder(),
    paint: new GeoBuilder(),
    barrier: new GeoBuilder(),
    rail: new GeoBuilder(),
    lawn: { suburb: new GeoBuilder(), cbd: new GeoBuilder(), industrial: new GeoBuilder() },
    tunnelWall: new GeoBuilder(),
    tunnelLight: new GeoBuilder(),
    water: new GeoBuilder(),
  };
  const bollards: THREE.Matrix4[] = [];
  const extra: THREE.Object3D[] = [];
  const kerbU = (s: number) => road.kerbU(s);

  for (const part of zoneParts(ctx.route, s0, s1)) {
    const { a, b: e, theme } = part;
    const motorway = theme.median === 'barrier';
    const edge = (s: number) => edgeU(road, theme, s);
    const R: [number, number][] = [[a, e]];
    ribbon(b.asphalt, road, R, (s) => -edge(s), edge, 0, 6);

    // ---- median
    if (motorway) {
      for (const f of [1, -1] as const) wall(b.barrier, road, R, () => f * 0.22, 0, 0.82, f);
      ribbon(b.barrier, road, R, () => -0.22, () => 0.22, 0.82);
    } else {
      ribbon(b.concrete, road, R, () => -mh, () => mh, KERB_H);
      ribbon(b.medianGrass, road, R, () => -mh + 0.35, () => mh - 0.35, KERB_H + 0.003);
      for (const f of [1, -1] as const) wall(b.kerb, road, R, () => f * mh, 0, KERB_H, f);
    }

    const mouths = theme.crossStreetEvery ? ctx.crossStreets.filter((c) => c > a - MOUTH && c < e + MOUTH) : [];
    const gaps: [number, number][] = mouths.map((c) => [c - MOUTH, c + MOUTH]);
    const sideR = subtract(a, e, gaps);

    for (const sg of [1, -1] as const) {
      // ---- lane paint (dashes between lanes)
      const period = motorway ? 12 : 9;
      const dash = 3;
      for (let k = 1; k < 5; k++) {
        for (let sd = Math.ceil(a / period) * period; sd < e; sd += period) {
          if (road.lanesAt(sd) <= k + 0.05 || road.lanesAt(sd + dash) <= k + 0.05) continue;
          const u = mh + k * W;
          ribbon(b.paint, road, [[sd, sd + dash]], () => sg * (u - 0.06), () => sg * (u + 0.06), 0.006, 4, 1.5);
        }
      }
      if (motorway) {
        ribbon(b.paint, road, R, () => sg * (mh + 0.2), () => sg * (mh + 0.35), 0.006);
        ribbon(b.paint, road, R, (s) => sg * (kerbU(s) - 0.05), (s) => sg * (kerbU(s) + 0.1), 0.006);
        const out = (s: number) => sg * (edge(s) + 0.6);
        if (theme.structure === 'tunnel') {
          // tiled walls, ceiling, light strips, and a park on the roof
          wall(b.tunnelWall, road, R, out, 0, 5.6, (-sg) as 1 | -1);
          ribbon(b.tunnelWall, road, R, (s) => sg * (edge(s) + 0.6), () => 0, 5.6, 4, 2, -1);
          ribbon(b.tunnelLight, road, R, (s) => sg * (road.kerbU(s) * 0.55 - 0.15), (s) => sg * (road.kerbU(s) * 0.55 + 0.15), 5.55, 4, 2, -1);
          ribbon(b.lawn.suburb, road, R, () => 0, (s) => sg * (edge(s) + 90), 5.7, 4, 4);
          wall(b.tunnelWall, road, R, out, 0, 5.7, sg);
        } else if (theme.structure === 'bridge') {
          // parapets, deck underside, water far below
          for (const f of [1, -1] as const) wall(b.barrier, road, R, out, -1.4, 1.05, (f * sg) as 1 | -1);
          ribbon(b.barrier, road, R, (s) => sg * (edge(s) + 0.6), (s) => sg * (edge(s) + 0.9), 1.05);
          ribbon(b.barrier, road, R, () => 0, (s) => sg * (edge(s) + 0.9), -1.4, 4, 2, -1);
          ribbon(b.water, road, R, () => 0, () => sg * 500, -12, 20, 10);
        } else {
          // guard rail + verge
          for (const f of [1, -1] as const) wall(b.rail, road, R, (s) => sg * (edge(s) + 0.5), 0.45, 0.8, (f * sg) as 1 | -1);
          ribbon(b.lawn.industrial, road, R, (s) => sg * edge(s), (s) => sg * (edge(s) + 80), 0.02, 4, 4);
        }
      } else {
        // ---- kerb, footpath, verge
        wall(b.kerb, road, sideR, (s) => sg * kerbU(s), 0, KERB_H, (-sg) as 1 | -1);
        ribbon(b.concrete, road, sideR, (s) => sg * kerbU(s), (s) => sg * (kerbU(s) + theme.footpath), KERB_H);
        if (theme.lawn) ribbon(b.lawn[theme.lawn], road, sideR, (s) => sg * (kerbU(s) + theme.footpath), (s) => sg * (kerbU(s) + theme.footpath + 80), KERB_H - 0.02, 4, 4);
      }
    }

    // ---- tunnel portals: a wall around the mouth at each end
    if (theme.structure === 'tunnel') {
      for (const ps of [a, e]) {
        if (!ctx.route.zones.some((z) => Math.abs(z.s - ps) < 0.5)) continue; // only where the tunnel starts/ends
        const p = road.at(ps);
        const fx = -Math.sin(p.h), fz = -Math.cos(p.h);
        const nx = -Math.cos(p.h) * road.ds, nz = Math.sin(p.h) * road.ds;
        const k = edge(ps) + 0.6;
        const q = (u: number, y: number): [number, number, number] => [p.x + nx * u, y, p.z + nz * u];
        const face: [number, number, number] = ps === a ? [-fx, 0, -fz] : [fx, 0, fz];
        b.tunnelWall.quad(q(-k - 40, 5.6), q(k + 40, 5.6), q(-k - 40, 9), q(k + 40, 9), face, [[0, 0], [1, 0], [0, 1], [1, 1]]);
        for (const sg of [1, -1]) b.tunnelWall.quad(q(sg * k, 0), q(sg * (k + 40), 0), q(sg * k, 5.6), q(sg * (k + 40), 5.6), face, [[0, 0], [1, 0], [0, 1], [1, 1]]);
      }
    }
    if (theme.structure === 'bridge') {
      for (let ps = Math.ceil(a / 70) * 70; ps < e; ps += 70) {
        const p = road.at(ps);
        const pier = new THREE.Mesh(new THREE.BoxGeometry(5, 11, 3), m.barrier);
        pier.position.set(p.x, -7, p.z);
        pier.rotation.y = p.h;
        pier.castShadow = true;
        extra.push(pier);
      }
    }

    // ---- side streets
    for (const c of mouths) {
      if (c < a || c >= e) continue;
      const p = road.at(c);
      const fx = -Math.sin(p.h), fz = -Math.cos(p.h);
      const nx = -Math.cos(p.h) * road.ds, nz = Math.sin(p.h) * road.ds;
      const pt = (along: number, u: number, y: number): [number, number, number] => [p.x + fx * along + nx * u, y, p.z + fz * along + nz * u];
      const k = kerbU(c);
      for (const sg of [1, -1]) {
        const u0 = sg * (k - 0.05), u1 = sg * (k + 90);
        b.asphalt.quad(pt(-SIDE_ROAD_HALF, u0, 0.008), pt(SIDE_ROAD_HALF, u0, 0.008), pt(-SIDE_ROAD_HALF, u1, 0.008), pt(SIDE_ROAD_HALF, u1, 0.008), [0, 1, 0], [[0, 0], [2, 0], [0, 22], [2, 22]]);
        for (let d = 4; d < 88; d += 9) {
          const ua = sg * (k + d), ub = sg * (k + d + 3);
          b.paint.quad(pt(-0.06, ua, 0.014), pt(0.06, ua, 0.014), pt(-0.06, ub, 0.014), pt(0.06, ub, 0.014), [0, 1, 0], [[0, 0], [0, 0], [0, 0], [0, 0]]);
        }
        // no through road: bollards across the mouth
        for (let x = -SIDE_ROAD_HALF + 0.5; x <= SIDE_ROAD_HALF - 0.4; x += 1.2) {
          const [bx, , bz] = pt(x, sg * (k + 2.6), 0);
          bollards.push(new THREE.Matrix4().makeTranslation(bx, 0, bz));
        }
      }
    }
  }

  // ---- end of the route: a barrier wall across the road
  if (s1 >= road.length) {
    const s = road.length - 1;
    const p = road.at(s);
    const fx = -Math.sin(p.h), fz = -Math.cos(p.h);
    const nx = -Math.cos(p.h) * road.ds, nz = Math.sin(p.h) * road.ds;
    const k = road.kerbU(s) + SHOULDER + 1;
    const q = (u: number, y: number): [number, number, number] => [p.x + nx * u, y, p.z + nz * u];
    b.barrier.quad(q(-k, 0), q(k, 0), q(-k, 1.1), q(k, 1.1), [-fx, 0, -fz], [[0, 0], [1, 0], [0, 1], [1, 1]]);
  }

  const group = new THREE.Group();
  const add = (gb: GeoBuilder, mat: THREE.Material, shadow = false) => {
    if (gb.empty) return;
    const mesh = new THREE.Mesh(gb.build(), mat);
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    group.add(mesh);
  };
  add(b.asphalt, m.asphalt);
  add(b.concrete, m.concrete);
  add(b.kerb, m.kerb);
  add(b.medianGrass, m.medianGrass);
  add(b.paint, m.paint);
  add(b.barrier, m.barrier, true);
  add(b.rail, m.rail, true);
  for (const id of ['suburb', 'cbd', 'industrial'] as const) add(b.lawn[id], m.lawn[id]);
  add(b.tunnelWall, m.tunnelWall, true);
  add(b.tunnelLight, m.tunnelLight);
  add(b.water, m.water);
  group.add(...extra);
  if (bollards.length) {
    const geo = new THREE.CylinderGeometry(0.09, 0.11, 0.95, 8);
    geo.translate(0, 0.475, 0);
    const im = new THREE.InstancedMesh(geo, m.bollard, bollards.length);
    bollards.forEach((mx, i) => im.setMatrixAt(i, mx));
    im.castShadow = true;
    group.add(im);
  }
  return group;
}
