import * as THREE from 'three';
import { Rng } from '../core/rng';
import { themeAt, type RouteDef } from '../levels/RouteDef';
import type { TrafficSystem, Vehicle } from '../traffic/TrafficSystem';
import { TYPES, type VehicleKind } from '../traffic/vehicleTypes';
import type { Road } from '../world/Road';
import * as P from './props';
import type { IncidentDef, LaneRef } from './types';

interface Zone {
  s0: number;
  s1: number;
  cap: number;
}

/** One live incident: owns its vehicles, props and slow zones, and runs its own timeline. */
interface Live {
  def: IncidentDef;
  group: THREE.Group;
  vehicles: Vehicle[];
  zones: Zone[];
  done: boolean;
  report: string | null;
  /** Free-form per-incident state. */
  st: Record<string, number>;
  tick?: (t: number, dt: number, ps: number) => void;
}

export interface IncidentFrame {
  reports: string[];
  /** Emergency vehicles currently running sirens (road frame). */
  sirens: { s: number; u: number }[];
}

/**
 * Turns a level's incident list into blocked lanes, props, rubbernecking slow-downs, overhead
 * message signs and radio reports, and runs each incident's timeline (crashes are cleared, buses
 * pull out, ducks cross, ambulances come through). `visual` = false skips all meshes (headless test).
 */
export class IncidentSystem {
  readonly group = new THREE.Group();
  private readonly live: Live[] = [];
  private readonly rng: Rng;
  private flashers: THREE.MeshBasicMaterial[] = [];
  private jets: THREE.Mesh[] = [];
  private t = 0;

  constructor(
    private readonly road: Road,
    private readonly route: RouteDef,
    private readonly traffic: TrafficSystem,
    defs: IncidentDef[],
    private readonly visual: boolean,
  ) {
    this.rng = new Rng(route.seed ^ 0x1ce);
    for (const d of defs) this.live.push(this.build(d));
  }

  // ------------------------------------------------------------------ helpers

  private lane(ref: LaneRef, s: number): number {
    const n = this.traffic.lanesAt(s);
    if (typeof ref === 'number') return Math.min(ref, n - 1);
    return ref === 'kerb' ? n - 1 : ref === 'median' ? 0 : Math.floor((n - 1) / 2);
  }

  /** "LEFT"/"RIGHT"/"CENTRE" as the driver sees it. */
  private laneName(lane: number, s: number): string {
    const n = this.traffic.lanesAt(s);
    const kerbSide = this.road.ds > 0 ? 'LEFT' : 'RIGHT';
    const medianSide = this.road.ds > 0 ? 'RIGHT' : 'LEFT';
    return lane === n - 1 ? kerbSide : lane === 0 ? medianSide : 'CENTRE';
  }

  private area(s: number): string {
    const t = themeAt(this.route, s).id;
    return t === 'suburb' ? 'the shops' : t === 'cbd' ? 'the city' : t === 'industrial' ? 'the motorway' : t === 'tunnel' ? 'the tunnel' : t === 'bridge' ? 'the bridge' : 'the stadium';
  }

  private add<T extends THREE.Object3D>(inc: Live, obj: T, s: number, u: number, y = 0, yaw = 0): T {
    if (this.visual) inc.group.add(P.place(obj, this.road, s, u, y, yaw));
    return obj;
  }

  private car(inc: Live, kind: VehicleKind, s: number, lane: number, opts: Parameters<TrafficSystem['addStatic']>[3] & { yaw?: number } = {}): Vehicle {
    const v = this.traffic.addStatic(kind, s, lane, opts);
    v.yaw = opts.yaw ?? 0;
    inc.vehicles.push(v);
    return v;
  }

  private zone(inc: Live, s0: number, s1: number, cap: number): void {
    const z = { s0, s1, cap };
    inc.zones.push(z);
    this.traffic.flow.zones.push(z);
  }

  private clear(inc: Live): void {
    for (const v of inc.vehicles) this.traffic.remove(v);
    inc.vehicles = [];
    for (const z of inc.zones) {
      const i = this.traffic.flow.zones.indexOf(z);
      if (i >= 0) this.traffic.flow.zones.splice(i, 1);
    }
    inc.zones = [];
    if (this.visual) {
      this.group.remove(inc.group);
      inc.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    inc.done = true;
  }

  private vms(inc: Live, s: number, lines: string[]): void {
    if (!this.visual || s < 60) return;
    inc.group.add(P.vmsGantry(this.road, s, this.road.kerbU(s), lines));
  }

  /** Cones closing a block of lanes, tapering from the closed edge to the open side. */
  private closure(inc: Live, s: number, lanes: number[], before: number, after: number): void {
    const W = this.road.laneWidth;
    const mh = this.road.medianHalf;
    const lo = Math.min(...lanes);
    const hi = Math.max(...lanes);
    const n = this.traffic.lanesAt(s);
    const kerbSide = hi === n - 1;
    const uEdge = kerbSide ? this.road.kerbU(s) - 0.3 : mh + 0.3;
    const uLine = kerbSide ? mh + lo * W + 0.25 : mh + (hi + 1) * W - 0.25;
    if (this.visual) inc.group.add(P.coneTaper(this.road, s - before, s + after, uEdge, uLine, 40));
    for (const l of lanes) {
      const len = before - 25 + after;
      this.car(inc, 'sedan', s - before + 25 + len / 2, l, { hidden: true, length: len });
    }
  }

  // ------------------------------------------------------------------ incidents

  private build(def: IncidentDef): Live {
    const inc: Live = { def, group: new THREE.Group(), vehicles: [], zones: [], done: false, report: null, st: {} };
    if (this.visual) this.group.add(inc.group);
    const r = this.rng;
    const road = this.road;
    const s = def.s;

    switch (def.kind) {
      case 'breakdown': {
        const kind = r.pick(['hatch', 'sedan', 'ute', 'suv'] as const);
        const t = TYPES[kind];
        const lane = this.traffic.lanesAt(s) - 1;
        const u = def.shoulder ? road.kerbU(s) + 1.3 : road.laneCentre(lane) + 0.4;
        const v = this.car(inc, kind, s, lane, { hazards: true, u });
        v.offRoad = !!def.shoulder;
        if (this.visual) {
          const at = P.place(new THREE.Group(), road, s, u);
          at.add(P.openBonnet(v.color, t.length));
          inc.group.add(at);
          this.add(inc, P.person('phone', r.next()), s - 3, def.shoulder ? road.kerbU(s) + 3 : road.kerbU(s) + 1.4, def.shoulder ? 0 : 0.15, Math.PI / 2);
          this.add(inc, P.triangle(), s - 28, u, 0, 0);
        }
        this.zone(inc, s - 90, s + 25, def.shoulder ? 0.6 : 0.5);
        inc.report = def.shoulder ? `Broken-down car on the shoulder near ${this.area(s)}` : `Broken-down car blocking the ${this.laneName(lane, s)} lane near ${this.area(s)}`;
        break;
      }
      case 'fenderBender': {
        const lane = this.lane(def.lane, s);
        const u = road.laneCentre(lane);
        this.car(inc, r.pick(['hatch', 'sedan', 'suv'] as const), s, lane, { hazards: true, yaw: 0.1 });
        this.car(inc, r.pick(['sedan', 'ute', 'suv'] as const), s + 6.2, lane, { hazards: true, yaw: -0.07 });
        if (this.visual) {
          this.add(inc, P.debris(14, 2.5, 7), s + 3, u);
          const side = lane === this.traffic.lanesAt(s) - 1 ? road.kerbU(s) + 1.2 : u + 1.55;
          this.add(inc, P.person('civilian', r.next()), s + 2, side, side > road.kerbU(s) ? 0.15 : 0, 0.4);
          this.add(inc, P.person('phone', r.next()), s + 3.2, side + 0.3, side > road.kerbU(s) ? 0.15 : 0, -2.4);
        }
        this.zone(inc, s - 140, s + 40, 0.38);
        inc.report = `Minor crash in the ${this.laneName(lane, s)} lane near ${this.area(s)}. Expect delays`;
        break;
      }
      case 'crash': {
        const lanes = def.lanes.map((l) => this.lane(l, s)).filter((l, i, a) => a.indexOf(l) === i);
        const main = lanes[0];
        this.car(inc, 'sedan', s, main, { hazards: true, yaw: 0.55 });
        this.car(inc, 'suv', s + 7, lanes[lanes.length - 1], { hazards: true, yaw: -0.3 });
        this.car(inc, 'hatch', s + 13, main, { hazards: true, yaw: 1.4 });
        this.car(inc, 'police', s - 22, lanes[lanes.length - 1], { beacons: true });
        this.car(inc, 'ambulance', s + 24, main, { beacons: true });
        this.closure(inc, s, lanes, 80, 40);
        if (this.visual) {
          this.add(inc, P.debris(30, 5, 3), s + 6, road.laneCentre(main));
          const u0 = road.laneCentre(main);
          this.add(inc, P.person('police', r.next()), s - 12, u0 + 1, 0, 0.3);
          this.add(inc, P.person('police', r.next()), s + 4, u0 - 1.4, 0, 2);
          this.add(inc, P.person('civilian', r.next()), s + 18, u0 + 0.8, 0, -1);
          const ab = P.arrowBoard(lanes.includes(0) === (road.ds < 0));
          this.add(inc, ab.group, s - 60, road.laneCentre(lanes.includes(this.traffic.lanesAt(s) - 1) ? Math.max(...lanes) : Math.min(...lanes)));
          this.flashers.push(ab.lamps);
        }
        this.zone(inc, s - 180, s + 60, 0.33);
        this.vms(inc, s - 450, ['CRASH AHEAD', `${this.laneName(main, s)} LANE${lanes.length > 1 ? 'S' : ''} CLOSED`]);
        inc.report = `Serious crash ${lanes.length > 1 ? 'closing two lanes' : `in the ${this.laneName(main, s)} lane`} near ${this.area(s)}. Emergency services on scene`;
        inc.tick = (t, _dt, ps) => {
          if (!inc.st.tow && t > def.clearAt - 35) {
            inc.st.tow = 1;
            this.car(inc, 'tow', s + 40, main, { beacons: true });
          }
          if (t > def.clearAt) {
            if (ps < s - 60) {
              this.clear(inc);
              this.traffic.flow.def.surges.push({ t, dur: 35 });
              this.cleared.push(`Crash near ${this.area(s)} has been cleared, all lanes open`);
            } else if (ps > s + 200) this.clear(inc);
          }
        };
        break;
      }
      case 'roadworks': {
        const lane = this.lane(def.lane, s);
        const len = def.length;
        this.closure(inc, s, [lane], 70, len);
        if (this.visual) {
          const u = road.laneCentre(lane);
          for (let i = 0; i < 3; i++) this.add(inc, P.person('worker', r.next()), s + 10 + i * (len / 3), u + r.range(-0.8, 0.8), 0, r.range(0, 6));
          const ab = P.arrowBoard(lane === 0 ? road.ds < 0 : road.ds > 0);
          this.add(inc, ab.group, s - 45, u);
          this.flashers.push(ab.lamps);
          const kerbSide = lane === this.traffic.lanesAt(s) - 1;
          const signU = kerbSide ? road.kerbU(s) + 1.5 : road.medianHalf - 0.2;
          this.add(inc, P.warningSign(['ROAD', 'WORK', 'AHEAD']), s - 220, signU, kerbSide ? 0.15 : 0.15);
          this.add(inc, P.warningSign(['40']), s - 120, signU, 0.15);
          const lol = P.person('worker', r.next());
          if (this.visual) lol.add(P.lollipop().translateX(0.35));
          this.add(inc, lol, s - 70, signU, 0.15, Math.PI);
          // a yellow digger in the work zone
          const dig = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 3), new THREE.MeshStandardMaterial({ color: 0xf2b21e, flatShading: true }));
          body.position.y = 1.2;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 3.4), body.material);
          arm.position.set(0, 2.4, -2.2);
          arm.rotation.x = -0.5;
          dig.add(body, arm);
          dig.traverse((o) => (o.castShadow = true));
          this.add(inc, dig, s + len * 0.6, u, 0, 0.3);
        }
        const limit = themeAt(this.route, s).speedLimit;
        this.zone(inc, s - 90, s + len + 20, Math.min(1, 40 / limit) * 0.7);
        inc.report = `Roadworks: ${this.laneName(lane, s)} lane closed near ${this.area(s)}`;
        this.vms(inc, s - 500, ['ROADWORKS', `${this.laneName(lane, s)} LANE CLOSED`]);
        break;
      }
      case 'lostLoad': {
        const lane = this.lane(def.lane, s);
        const u = road.laneCentre(lane);
        const n = this.traffic.lanesAt(s);
        const truck = this.car(inc, def.load === 'mattresses' ? 'ute' : 'truck', s + 30, n - 1, { hazards: true, u: road.kerbU(s) - 1.0 });
        truck.offRoad = themeAt(this.route, s).median === 'barrier';
        this.car(inc, 'sedan', s - 4, lane, { hidden: true, length: 16 });
        if (this.visual) {
          if (def.load === 'mattresses') {
            this.add(inc, P.mattress(), s - 5, u - 0.5, 0, 0.4);
            this.add(inc, P.mattress(), s + 1, u + 0.8, 0, -0.8);
            this.add(inc, P.mattress(), s + 4, u - 0.2, 0.22, 0.1);
          } else this.add(inc, P.melons(26, 3, 11), s - 2, u);
          this.add(inc, P.person('civilian', r.next()), s + 2, u + 1.2, 0, 1.5);
        }
        this.zone(inc, s - 120, s + 40, 0.4);
        inc.report = def.load === 'mattresses' ? `A truck has lost a load of mattresses near ${this.area(s)}` : `Watermelons all over the ${this.laneName(lane, s)} lane near ${this.area(s)}. Yes, watermelons`;
        break;
      }
      case 'busStop': {
        const lane = this.traffic.lanesAt(s) - 1;
        const bus = this.car(inc, 'bus', s, lane, { color: 0xf4f1e8 });
        bus.indicate = -1;
        if (this.visual) {
          this.add(inc, P.busShelter(), s + 2, road.kerbU(s) + 3.2, 0.15);
          for (let i = 0; i < 3; i++) this.add(inc, P.person('civilian', r.next()), s + i * 1.2, road.kerbU(s) + 1.6, 0.15, Math.PI / 2);
        }
        inc.tick = (t, _dt, ps) => {
          if (!inc.st.seen && ps > s - 250) inc.st.seen = t;
          if (bus.static && ((ps > s - 60 && ps < s) || (inc.st.seen && t - inc.st.seen > 30))) {
            bus.static = false;
            bus.indicate = 0;
            inc.vehicles = inc.vehicles.filter((v) => v !== bus);
          }
        };
        break;
      }
      case 'doubleParked': {
        const lane = this.traffic.lanesAt(s) - 1;
        this.car(inc, 'van', s, lane, { hazards: true, u: road.laneCentre(lane) + 0.3 });
        if (this.visual) this.add(inc, P.person('civilian', r.next()), s + 3.5, road.kerbU(s) + 1, 0.15, Math.PI / 2);
        this.zone(inc, s - 60, s + 15, 0.6);
        break;
      }
      case 'ambulance': {
        inc.report = null;
        inc.tick = (_t, _dt, ps) => {
          if (inc.st.sent || ps < s) return;
          inc.st.sent = 1;
          const amb = this.traffic.addMover('ambulance', Math.max(10, ps - 170), 0, 15);
          amb.beacons = true;
          inc.vehicles.push(amb);
          this.cleared.push('Emergency vehicles responding, please move over and let them through');
        };
        break;
      }
      case 'waterMain': {
        const lane = this.lane(def.lane, s);
        const u = road.laneCentre(lane);
        this.car(inc, 'sedan', s, lane, { hidden: true, length: 22 });
        if (this.visual) {
          const f = P.fountain();
          this.add(inc, f.group, s, u);
          this.jets.push(f.jet);
          for (let i = -2; i <= 2; i++) this.add(inc, P.cone(), s - 12, u + i * 0.8);
          this.add(inc, P.person('worker', r.next()), s + 8, u + 1, 0, 2);
        }
        this.zone(inc, s - 100, s + 30, 0.36);
        inc.report = `Burst water main flooding the ${this.laneName(lane, s)} lane near ${this.area(s)}`;
        break;
      }
      case 'ducks': {
        inc.report = null;
        let duckObj: THREE.Group | null = null;
        inc.tick = (t, _dt, ps) => {
          if (!inc.st.start && ps > s - 120 && ps < s) {
            inc.st.start = t;
            const n = this.traffic.lanesAt(s);
            for (let l = 0; l < n; l++) this.car(inc, 'sedan', s, l, { hidden: true, length: 2 });
            if (this.visual) {
              duckObj = P.ducks();
              inc.group.add(duckObj);
            }
            this.cleared.push('Reports of a family of ducks crossing the road. Please be patient');
          }
          if (inc.st.start) {
            const k = (t - inc.st.start) / 24;
            if (duckObj) {
              const u = this.road.kerbU(s) + 2 - k * (this.road.kerbU(s) + 4);
              P.place(duckObj, this.road, s, u, 0.15, -Math.PI / 2);
              duckObj.children.forEach((c, i) => (c.position.y = Math.abs(Math.sin(t * 9 + i)) * 0.05));
            }
            if (k > 1 && inc.vehicles.length) {
              for (const v of inc.vehicles) this.traffic.remove(v);
              inc.vehicles = [];
              if (duckObj) duckObj.visible = false;
            }
          }
        };
        break;
      }
      case 'oppositeCrash': {
        for (const [ds, yaw, kind, beacons] of [[0, 0.5, 'sedan', false], [6, -0.3, 'ute', false], [-18, 0, 'police', true], [14, 0, 'police', true]] as const) {
          const v = this.car(inc, kind, s + ds, 0, { hazards: !beacons, beacons, yaw });
          v.oncoming = true;
          v.u = -road.laneCentre(0);
        }
        if (this.visual) this.add(inc, P.person('police', r.next()), s, -road.laneCentre(0) - 1.6, 0, 1);
        this.zone(inc, s - 120, s + 40, 0.42);
        inc.report = `Crash on the other side of the road near ${this.area(s)}, rubbernecking delays in your direction`;
        break;
      }
    }
    return inc;
  }

  /** One-off radio lines (crash cleared, ambulance) shown for a while after they happen. */
  private cleared: string[] = [];
  private clearedT = 0;

  update(dt: number, ps: number): IncidentFrame {
    this.t = this.traffic.t;
    for (const inc of this.live) if (!inc.done) inc.tick?.(this.t, dt, ps);
    if (this.cleared.length) {
      this.clearedT += dt;
      if (this.clearedT > 40) {
        this.cleared.shift();
        this.clearedT = 0;
      }
    }
    if (this.visual) {
      const on = this.t % 0.9 < 0.45;
      for (const f of this.flashers) f.color.setHex(on ? 0xffb020 : 0x3a2a06);
      for (const j of this.jets) j.scale.set(1 + Math.sin(this.t * 13) * 0.08, 1 + Math.sin(this.t * 7) * 0.12, 1 + Math.cos(this.t * 11) * 0.08);
      P.animatePeople(this.group, this.t);
    }
    const reports = [
      ...this.cleared,
      ...this.live.filter((i) => !i.done && i.report && ps < i.def.s + 30 && i.def.s - ps < 1500).map((i) => i.report!),
    ];
    const sirens = this.traffic.vehicles.filter((v) => v.beacons && v.vOverride > 0).map((v) => ({ s: v.s, u: v.u }));
    return { reports, sirens };
  }

  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
