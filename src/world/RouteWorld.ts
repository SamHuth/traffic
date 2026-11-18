import * as THREE from 'three';
import type { NavInfo } from '../cockpit/SatNav';
import { clamp } from '../core/math';
import { themeAt, type RouteDef } from '../levels/RouteDef';
import { IncidentSystem } from '../incidents/IncidentSystem';
import { TrafficRenderer } from '../traffic/TrafficRenderer';
import { TrafficSystem, type PlayerInfo } from '../traffic/TrafficSystem';
import type { CarPhysics } from '../vehicle/CarPhysics';
import type { PlayerCar } from '../vehicle/PlayerCar';
import { Road } from './Road';
import { buildRoadChunk, edgeU, type RouteContext } from './RoadMesh';
import { buildSceneryChunk, planCrossStreets, planLots, type Lot } from './Scenery';
import type { JourneyStats, World, WorldEvents } from './World';

const CHUNK = 100;
const BEHIND = 250;
const AHEAD = 750;
/** Half the car's width plus a little clearance. */
const HALF_W = 0.95;

/** A level's road, streamed in 100 m chunks around the player. */
export class RouteWorld implements World {
  readonly group = new THREE.Group();
  readonly road: Road;
  readonly ctx: RouteContext;
  readonly speedCapKmh: number;
  private readonly lots: Lot[];
  private readonly chunks = new Map<number, THREE.Group>();
  private readonly ground: THREE.Mesh;
  /** Player's road-frame position (updated in constrain). */
  s = 0;
  u = 0;
  readonly traffic: TrafficSystem;
  private readonly trafficView: TrafficRenderer;
  readonly stats: JourneyStats = { timeS: 0, distanceM: 0, laneChanges: 0, signalled: 0, letIn: 0, bumps: 0 };
  private lastLane = -1;
  private lastSignalT = -99;
  private arrived = false;
  readonly incidents: IncidentSystem;
  private reports: string[] = [];
  /** 0 = day … 1 = night (set by the game from the lighting preset). */
  night = 0;

  constructor(readonly route: RouteDef, ds: 1 | -1, readonly startS = 30) {
    this.road = new Road(route.road, ds);
    const base = { road: this.road, route };
    this.ctx = { ...base, crossStreets: planCrossStreets(base) };
    this.lots = planLots(this.ctx);
    this.speedCapKmh = route.speedCapKmh;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x6c8a4f, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.06;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    this.s = startS;
    this.stream(Infinity);

    this.traffic = new TrafficSystem(this.road, route, route.flow, route.seed + 99);
    this.trafficView = new TrafficRenderer(this.road);
    this.group.add(this.trafficView.group);
    this.incidents = new IncidentSystem(this.road, route, this.traffic, route.incidents, true);
    this.group.add(this.incidents.group);
    const st = this.start();
    const pr = this.road.project(st.x, st.z);
    this.traffic.populate({ s: pr.s, u: pr.u, v: 0, indicate: 0, hazards: false });
  }

  get playerInfo(): PlayerInfo {
    return { s: this.s, u: this.u, v: 0, indicate: 0, hazards: false };
  }

  step(dt: number, car: PlayerCar): WorldEvents {
    const p = car.physics;
    let impact = this.constrain(p);
    const ind = car.indicators;
    const indicate = ind.hazards || ind.state === 'off' ? 0 : (ind.state === 'left' ? 1 : -1) * this.road.ds;
    if (indicate !== 0) this.lastSignalT = this.stats.timeS;
    const info: PlayerInfo = { s: this.s, u: this.u, v: p.v, indicate, hazards: ind.hazards };
    const ev = this.traffic.step(dt, info);

    if (ev.push) {
      const h = this.road.at(this.s).h;
      const fx = -Math.sin(h), fz = -Math.cos(h);
      const nx = -Math.cos(h) * this.road.ds, nz = Math.sin(h) * this.road.ds;
      p.x += fx * ev.push.ds + nx * ev.push.du;
      p.z += fz * ev.push.ds + nz * ev.push.du;
      p.v = ev.push.v;
      if (ev.push.impact > 0.8) {
        impact = Math.max(impact, ev.push.impact);
        this.stats.bumps++;
      }
    }

    // stats: lane changes, and whether you signalled first
    this.stats.timeS += dt;
    this.stats.distanceM += Math.abs(p.v) * dt;
    this.stats.letIn += ev.letIn;
    const lane = this.road.laneAt(this.u);
    if (this.lastLane >= 0 && lane !== this.lastLane) {
      this.stats.laneChanges++;
      if (this.stats.timeS - this.lastSignalT < 4) this.stats.signalled++;
    }
    this.lastLane = lane;

    const frame = this.incidents.update(dt, this.s);
    this.reports = frame.reports;

    // horns and sirens → stereo pan + distance relative to the driver
    const locate = (s: number, u: number) => {
      const w = this.road.toWorld(s, u);
      const dx = w.x - p.x, dz = w.z - p.z;
      const rightX = Math.cos(p.heading), rightZ = -Math.sin(p.heading);
      const dist = Math.hypot(dx, dz);
      return { pan: clamp((dx * rightX + dz * rightZ) / Math.max(dist, 1), -1, 1), dist };
    };
    const honks = ev.honks.map((hk) => locate(hk.s, hk.u));
    const sirens = frame.sirens.map((sr) => locate(sr.s, sr.u)).sort((a, b) => a.dist - b.dist);

    if (!this.arrived && this.s > this.road.length - 70) this.arrived = true;
    return { impact, honks, siren: sirens[0] ?? null, arrived: this.arrived };
  }

  start(): { x: number; z: number; heading: number } {
    const lane = this.road.openLanes(this.startS) - 1; // kerb lane
    const p = this.road.toWorld(this.startS, this.road.laneCentre(lane));
    this.s = this.startS;
    return { x: p.x, z: p.z, heading: p.h };
  }

  /** Lateral limits for a car centre at s: [median side, kerb side]. */
  limits(s: number): [number, number] {
    const t = themeAt(this.route, s);
    const lo = this.road.medianHalf + (t.median === 'barrier' ? 0.3 : 0) + HALF_W;
    let hi = edgeU(this.road, t, s) - HALF_W;
    if (t.crossStreetEvery && this.ctx.crossStreets.some((c) => Math.abs(s - c) < 3)) hi = this.road.kerbU(s) + 1.2;
    return [lo, hi];
  }

  private constrain(p: CarPhysics): number {
    const pr = this.road.project(p.x, p.z, this.s);
    this.s = pr.s;
    this.u = pr.u;
    const [lo, hi] = this.limits(pr.s);
    const sMin = 3;
    const sMax = this.road.length - 4;
    const fwdX = -Math.sin(p.heading);
    const fwdZ = -Math.cos(p.heading);
    let impact = 0;

    const cu = clamp(pr.u, lo, hi);
    if (cu !== pr.u) {
      const h = this.road.at(pr.s).h;
      const nx = -Math.cos(h) * this.road.ds;
      const nz = Math.sin(h) * this.road.ds;
      const du = cu - pr.u;
      p.x += nx * du;
      p.z += nz * du;
      const lateral = Math.abs(p.v * (fwdX * nx + fwdZ * nz));
      if (lateral > 0.4) {
        p.v *= 0.55;
        impact = lateral;
      } else p.v *= 0.985; // scraping along the kerb
      this.u = cu;
    }
    const cs = clamp(pr.s, sMin, sMax);
    if (cs !== pr.s) {
      const a = this.road.at(pr.s);
      const ds = cs - pr.s;
      p.x += -Math.sin(a.h) * ds;
      p.z += -Math.cos(a.h) * ds;
      impact = Math.max(impact, Math.abs(p.v));
      p.bump();
      this.s = cs;
    }
    return impact;
  }

  update(x: number, z: number): void {
    // near a bridge the ground drops away to water
    let water = false;
    for (let d = -300; d <= 600 && !water; d += 50) water = themeAt(this.route, this.s + d).structure === 'bridge';
    const gm = this.ground.material as THREE.MeshStandardMaterial;
    gm.color.setHex(water ? 0x2f5f7a : 0x6c8a4f);
    gm.roughness = water ? 0.2 : 1;
    this.ground.position.set(x, water ? -12.05 : -0.06, z);
    this.stream(2);
    this.trafficView.update(this.traffic.vehicles, this.traffic.t, x, z, this.night);
  }

  /** Build missing chunks in range (at most `budget` per call) and drop far ones. */
  private stream(budget: number): void {
    const last = Math.floor(this.road.length / CHUNK);
    const i0 = Math.max(0, Math.floor((this.s - BEHIND) / CHUNK));
    const i1 = Math.min(last, Math.floor((this.s + AHEAD) / CHUNK));
    for (const [i, g] of this.chunks) {
      if (i >= i0 && i <= i1) continue;
      this.group.remove(g);
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) mesh.geometry.dispose();
        else if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      this.chunks.delete(i);
    }
    // nearest chunks first
    const order: number[] = [];
    for (let i = i0; i <= i1; i++) if (!this.chunks.has(i)) order.push(i);
    order.sort((a, b) => Math.abs(a * CHUNK - this.s) - Math.abs(b * CHUNK - this.s));
    for (const i of order.slice(0, budget)) {
      const s0 = i * CHUNK;
      const s1 = Math.min(this.road.length, s0 + CHUNK);
      const g = new THREE.Group();
      g.add(buildRoadChunk(this.ctx, s0, s1), buildSceneryChunk(this.ctx, this.lots, s0, s1));
      this.chunks.set(i, g);
      this.group.add(g);
    }
  }

  /** How much open sky the player is under (tunnels → dark). */
  shade(): number {
    const inTunnel = (s: number) => themeAt(this.route, s).structure === 'tunnel';
    if (!inTunnel(this.s)) return 1;
    // ease in over the first/last 40 m
    let k = 0;
    for (let d = 10; d <= 40; d += 10) if (!inTunnel(this.s - d) || !inTunnel(this.s + d)) k += 0.25;
    return 0.28 + 0.72 * (k * 0.5);
  }

  nav(): Partial<NavInfo> {
    return {
      title: this.route.name,
      progress: clamp(this.s / this.road.length, 0, 1),
      distanceLeftM: Math.max(0, this.road.length - this.s),
      speedLimit: themeAt(this.route, this.s).speedLimit,
      ticker: this.reports.length ? this.reports.join('     •     ') : this.route.ticker,
    };
  }

  dispose(): void {
    this.s = -1e9; // everything out of range
    this.stream(0);
    (this.ground.material as THREE.Material).dispose();
    this.ground.geometry.dispose();
    this.trafficView.dispose();
    this.incidents.dispose();
  }
}
