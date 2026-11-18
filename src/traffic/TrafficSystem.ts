import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { themeAt, type RouteDef } from '../levels/RouteDef';
import type { Road } from '../world/Road';
import { TAPER } from '../world/Road';
import { idm } from './IDM';
import { LaneFlow, type FlowDef } from './LaneFlow';
import { TRAFFIC_KINDS, TYPES, type VehicleKind, type VehicleType } from './vehicleTypes';

export interface Vehicle {
  id: number;
  type: VehicleType;
  color: number;
  s: number;
  v: number;
  acc: number;
  lane: number;
  fromLane: number;
  /** Lane-change progress 0→1; 1 when settled. */
  laneT: number;
  u: number;
  /** Lateral speed (for yaw while changing lanes). */
  dudt: number;
  vFactor: number;
  politeness: number;
  nextDecision: number;
  /** Lane-index direction being signalled (-1, 0, +1). */
  indicate: number;
  pendingLane: number;
  pendingT: number;
  /** Parked/broken/crashed: never moves, never recycled. */
  static: boolean;
  hidden: boolean;
  hazards: boolean;
  /** Flashing roof lights. */
  beacons: boolean;
  /** Opposing-carriageway vehicle (visual only). */
  oncoming: boolean;
  yieldUntil: number;
  honkCd: number;
  waitT: number;
  /** Fixed desired speed (m/s) overriding lane flow, e.g. emergency vehicles. */
  vOverride: number;
  /** Extra lateral offset (m), e.g. pulling over for an ambulance. */
  uNudge: number;
  /** Where uNudge is heading. */
  nudgeTarget: number;
  /** Extra heading (rad), e.g. a car left skewed after a crash. */
  yaw: number;
  /** On the shoulder/footpath: drawn and collidable, but not in any lane. */
  offRoad: boolean;
  /** Zipper courtesy: a car this one is letting in ahead of it. */
  yieldTo: Vehicle | null;
  yieldToUntil: number;
  /** Waiting to merge out of a blocked/ending lane (won't give up). */
  stuck: boolean;
}

export interface PlayerInfo {
  s: number;
  u: number;
  v: number;
  /** Indicated lane-index direction, 0 if off. */
  indicate: number;
  hazards: boolean;
}

export interface TrafficEvents {
  honks: { s: number; u: number }[];
  /** Road-frame push to resolve a collision with the player, and the impact speed. */
  push: { ds: number; du: number; v: number; impact: number } | null;
  letIn: number;
}

const PLAYER_LEN = 4.3;
const PLAYER_HALF_W = 0.9;
const BEHIND = 220;
const AHEAD = 420;
const MAX = 170;
const LC_TIME = 3.2;

interface Entry {
  s: number;
  v: number;
  half: number;
  veh: Vehicle | null; // null = player
}

/**
 * Lane-space traffic around the player: IDM car-following, MOBIL lane changes, per-lane flow, lane
 * closures, courtesy gaps when the player indicates, horns when they cut in, and density
 * maintenance (recycling cars that fall out of the window).
 */
export class TrafficSystem {
  readonly vehicles: Vehicle[] = [];
  readonly flow: LaneFlow;
  t = 0;
  private nextId = 1;
  private readonly rng: Rng;
  private maintainT = 0;
  private courtesy = new Map<number, boolean>();
  private lastPlayerLanes: number[] = [];
  /** s positions where lanes close: lane index ≥ `lanes` is gone from `s`. */
  private readonly closures: { s: number; lanes: number }[] = [];

  constructor(readonly road: Road, readonly route: RouteDef, flow: FlowDef, seed: number) {
    this.rng = new Rng(seed);
    this.flow = new LaneFlow(flow, seed);
    const secs = route.road.laneSections;
    for (let i = 1; i < secs.length; i++) if (secs[i].lanes < secs[i - 1].lanes) this.closures.push({ s: secs[i].s + TAPER * 0.75, lanes: secs[i].lanes });
  }

  // ------------------------------------------------------------------ helpers

  /** Lanes usable at s (a lane that's opening counts once it's half open). */
  lanesAt(s: number): number {
    return Math.floor(this.road.lanesAt(s) + 0.5);
  }

  /** Distance to where `lane` ends ahead of s (Infinity if it doesn't). */
  laneEnd(lane: number, s: number): number {
    let best = Infinity;
    for (const c of this.closures) if (c.s > s && lane >= c.lanes) best = Math.min(best, c.s);
    return best;
  }

  private occupied(v: Vehicle): number[] {
    return v.laneT < 1 ? [v.fromLane, v.lane] : [v.lane];
  }

  playerLanes(p: PlayerInfo): number[] {
    const W = this.road.laneWidth;
    const x = (p.u - this.road.medianHalf) / W;
    const out = new Set<number>([clamp(Math.floor(x), 0, 5)]);
    const f = x - Math.floor(x);
    if (f < PLAYER_HALF_W / W) out.add(Math.floor(x) - 1);
    if (f > 1 - PLAYER_HALF_W / W) out.add(Math.floor(x) + 1);
    return [...out].filter((l) => l >= 0 && l < 6);
  }

  private desired(v: Vehicle): number {
    if (v.vOverride > 0) return v.vOverride;
    const limit = themeAt(this.route, v.s).speedLimit / 3.6;
    const f = this.flow.factor(v.lane, v.s, this.t);
    const heavy = v.type.kind === 'bus' || v.type.kind === 'truck' ? 0.9 : 1;
    return Math.max(0.6, limit * f * v.vFactor * heavy);
  }

  private spawn(kind: VehicleKind, s: number, lane: number, v: number): Vehicle {
    const type = TYPES[kind];
    const veh: Vehicle = {
      id: this.nextId++, type, color: this.rng.pick(type.colors), s, v, acc: 0, lane, fromLane: lane, laneT: 1,
      u: this.road.laneCentre(lane), dudt: 0, vFactor: this.rng.range(0.85, 1.15), politeness: this.rng.range(0.1, 0.6),
      nextDecision: this.t + this.rng.range(0.5, 3), indicate: 0, pendingLane: -1, pendingT: 0, static: false, hidden: false,
      hazards: false, beacons: false, oncoming: false, yieldUntil: 0, honkCd: 0, waitT: 0, vOverride: 0, uNudge: 0, nudgeTarget: 0, yaw: 0, offRoad: false, yieldTo: null, yieldToUntil: 0, stuck: false,
    };
    this.vehicles.push(veh);
    return veh;
  }

  /** True if a vehicle of half-length `half` fits at s in lane without touching anything. */
  private free(lane: number, s: number, half: number): boolean {
    for (const v of this.vehicles) {
      if (v.oncoming || v.offRoad || !this.occupied(v).includes(lane)) continue;
      if (Math.abs(v.s - s) < v.type.length / 2 + half + 2.5) return false;
    }
    return true;
  }

  private randomKind(): VehicleKind {
    const total = TRAFFIC_KINDS.reduce((a, k) => a + TYPES[k].weight, 0);
    let r = this.rng.next() * total;
    for (const k of TRAFFIC_KINDS) if ((r -= TYPES[k].weight) <= 0) return k;
    return 'sedan';
  }

  /** Incident vehicles and lane-blocking props (hidden = invisible obstacle, e.g. a cone taper). */
  addStatic(kind: VehicleKind, s: number, lane: number, opts: { hazards?: boolean; beacons?: boolean; hidden?: boolean; color?: number; u?: number; length?: number } = {}): Vehicle {
    const veh = this.spawn(kind, s, lane, 0);
    veh.static = true;
    veh.hazards = !!opts.hazards;
    veh.beacons = !!opts.beacons;
    veh.hidden = !!opts.hidden;
    if (opts.color !== undefined) veh.color = opts.color;
    if (opts.u !== undefined) veh.uNudge = opts.u - this.road.laneCentre(lane);
    if (opts.length) veh.type = { ...veh.type, length: opts.length };
    veh.u = this.road.laneCentre(lane) + veh.uNudge;
    return veh;
  }

  remove(v: Vehicle): void {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
  }

  /** Spawn a moving special vehicle (emergency, tow truck) behind the player. */
  addMover(kind: VehicleKind, s: number, lane: number, speed: number): Vehicle {
    const v = this.spawn(kind, s, lane, speed);
    v.vOverride = speed;
    v.color = TYPES[kind].colors[0];
    return v;
  }

  // ------------------------------------------------------------------ populate / maintain

  populate(p: PlayerInfo): void {
    const sp = this.flow.def.spacing;
    for (let lane = 0; lane < 6; lane++) {
      let s = Math.max(5, p.s - BEHIND);
      while (s < Math.min(this.road.length - 50, p.s + AHEAD)) {
        const kind = this.randomKind();
        const len = TYPES[kind].length;
        const sc = s + len / 2;
        const pl = this.playerLanes(p);
        const nearPlayer = pl.includes(lane) && Math.abs(sc - p.s) < len / 2 + PLAYER_LEN / 2 + 3;
        if (lane < this.lanesAt(sc) && this.laneEnd(lane, sc) - sc > 60 && !nearPlayer && this.vehicles.length < MAX && this.free(lane, sc, len / 2)) {
          const veh = this.spawn(kind, sc, lane, 0);
          veh.v = this.desired(veh) * 0.5;
        }
        s += len + sp * this.rng.range(0.4, 1.6);
      }
    }
    this.spawnOncoming(p, true);
  }

  private maintain(p: PlayerInfo): void {
    const sp = this.flow.def.spacing;
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.static || v.oncoming) continue;
      if (v.vOverride > 0 && v.s < p.s + AHEAD + 20 && v.s < this.road.length - 40) continue; // keep specials until they leave ahead
      if (v.s < p.s - BEHIND - 20 || v.s > p.s + AHEAD + 20 || v.s > this.road.length - 40) this.vehicles.splice(i, 1);
    }
    const lanes = Math.max(this.lanesAt(p.s), this.lanesAt(p.s + AHEAD));
    for (let lane = 0; lane < lanes; lane++) {
      let front: Vehicle | null = null;
      let rear: Vehicle | null = null;
      for (const v of this.vehicles) {
        if (v.oncoming || v.offRoad || !this.occupied(v).includes(lane)) continue;
        if (!front || v.s > front.s) front = v;
        if (!rear || v.s < rear.s) rear = v;
      }
      if (this.vehicles.length >= MAX) break;
      // ahead edge
      const edge = Math.min(p.s + AHEAD, this.road.length - 60);
      const fs = front ? front.s + front.type.length / 2 : p.s + 40;
      const gapAhead = sp * this.rng.range(0.6, 1.5);
      const kind = this.randomKind();
      const sNew = fs + gapAhead + TYPES[kind].length / 2;
      if (sNew < edge && lane < this.lanesAt(sNew) && this.laneEnd(lane, sNew) - sNew > 80 && this.free(lane, sNew, TYPES[kind].length / 2)) {
        const veh = this.spawn(kind, sNew, lane, front ? front.v : 5);
        if (!front) veh.v = this.desired(veh) * 0.6;
      }
      // behind edge
      const bedge = Math.max(5, p.s - BEHIND);
      const rs = rear ? rear.s - rear.type.length / 2 : p.s - 30;
      const kind2 = this.randomKind();
      const sBack = rs - sp * this.rng.range(0.6, 1.5) - TYPES[kind2].length / 2;
      if (sBack > bedge && lane < this.lanesAt(sBack) && this.vehicles.length < MAX && this.free(lane, sBack, TYPES[kind2].length / 2)) this.spawn(kind2, sBack, lane, rear ? rear.v : 5);
    }
    this.spawnOncoming(p, false);
  }

  private spawnOncoming(p: PlayerInfo, initial: boolean): void {
    const list = this.vehicles.filter((v) => v.oncoming);
    for (const v of list) if (!v.static && (v.s < p.s - BEHIND - 40 || v.s > p.s + AHEAD + 120)) this.remove(v);
    const want = 26;
    let n = this.vehicles.filter((v) => v.oncoming && !v.static).length;
    let guard = 0;
    while (n < want && guard++ < 60) {
      const s = initial ? p.s + this.rng.range(-BEHIND, AHEAD + 80) : p.s + AHEAD + this.rng.range(20, 110);
      if (s < 5 || s > this.road.length - 5) continue;
      const lanes = this.lanesAt(s);
      const lane = this.rng.int(0, lanes - 1);
      const crowd = this.vehicles.some((o) => o.oncoming && o.lane === lane && Math.abs(o.s - s) < 14);
      if (crowd) continue;
      const veh = this.spawn(this.randomKind(), s, lane, 0);
      veh.oncoming = true;
      veh.v = (themeAt(this.route, s).speedLimit / 3.6) * this.rng.range(0.55, 0.95);
      veh.u = -this.road.laneCentre(lane);
      n++;
    }
  }

  // ------------------------------------------------------------------ simulation

  step(dt: number, p: PlayerInfo): TrafficEvents {
    this.t += dt;
    const ev: TrafficEvents = { honks: [], push: null, letIn: 0 };
    const road = this.road;

    // per-lane sorted entries (player included)
    const lanes: Entry[][] = [[], [], [], [], [], []];
    const pLanes = this.playerLanes(p);
    for (const l of pLanes) lanes[l].push({ s: p.s, v: p.v, half: PLAYER_LEN / 2, veh: null });
    for (const v of this.vehicles) {
      if (v.oncoming || v.offRoad) continue;
      for (const l of this.occupied(v)) if (l >= 0 && l < 6) lanes[l].push({ s: v.s, v: v.v, half: v.type.length / 2, veh: v });
    }
    for (const l of lanes) l.sort((a, b) => a.s - b.s);

    const leaderOf = (lane: number, s: number, self: Vehicle | null): Entry | null => {
      const arr = lanes[lane];
      if (!arr) return null;
      let best: Entry | null = null;
      for (const e of arr) if (e.veh !== self && e.s > s && (!best || e.s < best.s)) best = e;
      return best;
    };
    const followerOf = (lane: number, s: number, self: Vehicle | null): Entry | null => {
      const arr = lanes[lane];
      if (!arr) return null;
      let best: Entry | null = null;
      for (const e of arr) if (e.veh !== self && e.s <= s && (!best || e.s > best.s)) best = e;
      return best;
    };
    const accWith = (v: Vehicle, lane: number, lead: Entry | null, v0: number): number => {
      const t = v.type;
      let a = idm(v.v, v0, lead ? lead.s - lead.half - (v.s + t.length / 2) : Infinity, lead ? lead.v : 0, t.a, t.b, t.T);
      const end = this.laneEnd(lane, v.s);
      if (end < Infinity) a = Math.min(a, idm(v.v, v0, end - (v.s + t.length / 2), 0, t.a, t.b, t.T, 1));
      return a;
    };

    // ---- courtesy: the car behind in the lane you're signalling into may open a gap
    const pLane = pLanes.length === 1 ? pLanes[0] : Math.floor((p.u - road.medianHalf) / road.laneWidth);
    if (p.indicate === 0) this.courtesy.clear();
    else {
      const target = pLane + p.indicate;
      const cand = followerOf(target, p.s + 3, null);
      if (cand?.veh && !cand.veh.static && p.s - cand.s < 40) {
        const id = cand.veh.id;
        if (!this.courtesy.has(id)) this.courtesy.set(id, this.rng.next() < 0.75);
        if (this.courtesy.get(id)) cand.veh.yieldUntil = this.t + 4;
      }
    }

    // ---- emergency vehicles: cars ahead of them in their lane pull toward the kerb and slow
    const sirens = this.vehicles.filter((v) => v.beacons && v.vOverride > 0);
    for (const v of this.vehicles) {
      if (v.static || v.oncoming || v.beacons) continue;
      const giving = sirens.some((e) => this.occupied(v).includes(e.lane) && v.s > e.s - 5 && v.s - e.s < 90);
      v.nudgeTarget = giving ? 1.7 : 0;
      v.uNudge += (v.nudgeTarget - v.uNudge) * Math.min(1, dt * 1.5);
    }

    // ---- zipper courtesy: the car behind a stuck merger's target slot makes room (most of the time)
    for (const v of this.vehicles) {
      if (!v.stuck || v.pendingLane < 0) continue;
      // the first car far enough back to stop behind the merger yields; anyone already alongside drives on
      let f = followerOf(v.pendingLane, v.s, v);
      const rear = v.s - v.type.length / 2;
      while (f?.veh && !f.veh.static && rear - (f.s + f.half) < 3.5) {
        if (f.veh.yieldTo === v) f.veh.yieldTo = null;
        f = followerOf(v.pendingLane, f.s - 0.01, v);
      }
      if (!f?.veh || f.veh.static || v.s - f.s > 30) continue;
      if ((f.veh.id * 7 + v.id) % 8 === 0) continue; // the odd driver who won't let anyone in
      if (!f.veh.yieldTo || f.veh.yieldTo === v || f.veh.yieldToUntil < this.t) {
        f.veh.yieldTo = v;
        f.veh.yieldToUntil = this.t + 2;
      }
    }

    // ---- accelerations
    for (const v of this.vehicles) {
      if (v.static) {
        v.v = 0;
        v.acc = 0;
        continue;
      }
      if (v.oncoming) continue;
      const v0 = this.desired(v) * (v.uNudge > 0.8 ? 0.35 : 1);
      let a = Infinity;
      for (const l of this.occupied(v)) {
        let lead = leaderOf(l, v.s, v);
        // an emergency vehicle threads past cars that have pulled over
        if (v.beacons) while (lead?.veh && lead.veh.uNudge > 0.8) lead = leaderOf(l, lead.s + 0.01, v);
        a = Math.min(a, accWith(v, l, lead, v0));
      }
      // yielding to the player: treat them as the car in front
      if (v.yieldUntil > this.t && p.s > v.s) {
        const gap = p.s - PLAYER_LEN / 2 - (v.s + v.type.length / 2);
        a = Math.min(a, idm(v.v, v0, gap - 4, p.v, v.type.a, v.type.b, v.type.T));
      }
      const y = v.yieldTo;
      if (y && v.yieldToUntil > this.t && y.s > v.s && this.vehicles.includes(y)) {
        a = Math.min(a, idm(v.v, v0, y.s - y.type.length / 2 - (v.s + v.type.length / 2) - 1, y.v, v.type.a, v.type.b, v.type.T));
      } else v.yieldTo = null;
      v.acc = clamp(a, -9, v.type.a);
    }

    // ---- lane-change decisions (MOBIL)
    for (const v of this.vehicles) {
      if (v.static || v.oncoming || v.laneT < 1 || v.vOverride > 0 || v.uNudge > 0.3) continue;
      if (v.pendingLane >= 0) {
        v.pendingT -= dt;
        if (v.pendingT <= 0) {
          if (this.safeToChange(v, v.pendingLane, leaderOf, followerOf, accWith, true)) {
            v.fromLane = v.lane;
            v.lane = v.pendingLane;
            v.laneT = 0;
            v.stuck = false;
            if (pLanes.includes(v.lane) && v.s > p.s && v.s - p.s < 30) ev.letIn++;
          } else if (v.pendingT < -6 && !v.stuck) v.indicate = 0;
          if (v.laneT === 0 || (v.pendingT < -6 && !v.stuck)) v.pendingLane = -1;
          // a stuck merger re-picks its side if that lane disappears
          if (v.stuck && v.pendingLane >= this.lanesAt(v.s)) v.pendingLane = -1;
        }
        continue;
      }
      if (this.t < v.nextDecision) continue;
      v.nextDecision = this.t + this.rng.range(0.8, 2);
      const n = this.lanesAt(v.s);
      const v0 = this.desired(v);
      const cur = accWith(v, v.lane, leaderOf(v.lane, v.s, v), v0);
      const curLead = leaderOf(v.lane, v.s, v);
      const blocked = (curLead?.veh?.static && curLead.s - curLead.half - v.s < 140) || this.laneEnd(v.lane, v.s) - v.s < 220;
      let best = -1;
      let bestGain = blocked ? -1 : 0.35;
      for (const dir of [-1, 1]) {
        const L = v.lane + dir;
        if (L < 0 || L >= n || this.laneEnd(L, v.s) - v.s < 250) continue;
        const lead = leaderOf(L, v.s, v);
        if (lead?.veh?.static && lead.s - lead.half - v.s < 100) continue;
        const fol = followerOf(L, v.s, v);
        if (!this.safeToChange(v, L, leaderOf, followerOf, accWith, blocked)) continue;
        const aNew = accWith(v, L, lead, this.desiredIn(v, L));
        let folGain = 0;
        if (fol?.veh) {
          const ft = fol.veh.type;
          const old = idm(fol.v, this.desired(fol.veh), lead ? lead.s - lead.half - (fol.s + fol.half) : Infinity, lead?.v ?? 0, ft.a, ft.b, ft.T);
          const nu = idm(fol.v, this.desired(fol.veh), v.s - v.type.length / 2 - (fol.s + fol.half), v.v, ft.a, ft.b, ft.T);
          folGain = nu - old;
        } else if (fol) {
          folGain = Math.min(0, idm(fol.v, 15, v.s - v.type.length / 2 - (fol.s + fol.half), v.v, 1.5, 2, 1.2));
        }
        const gain = aNew - cur + v.politeness * folGain + (blocked ? 3 : 0);
        if (gain > bestGain) {
          bestGain = gain;
          best = L;
        }
      }
      // blocked and nowhere safe right now: pick a side anyway, signal, and wait to be let in
      if (best < 0 && blocked && v.v < 3) {
        const opts = [v.lane - 1, v.lane + 1].filter((L) => L >= 0 && L < n && this.laneEnd(L, v.s) - v.s > 150);
        if (opts.length) {
          best = opts.reduce((a, b) => {
            const la = leaderOf(a, v.s, v), lb = leaderOf(b, v.s, v);
            const free = (l: Entry | null) => (l ? (l.veh?.static ? -1 : l.v) : 99);
            return free(la) >= free(lb) ? a : b;
          });
          v.stuck = true;
        }
      }
      if (best >= 0) {
        v.pendingLane = best;
        v.pendingT = blocked && v.v < 2 ? 1.0 : 2;
        v.indicate = best - v.lane;
      }
    }

    // ---- integrate
    for (const v of this.vehicles) {
      if (v.static) continue;
      if (v.oncoming) {
        v.s -= v.v * dt;
        continue;
      }
      v.v = Math.max(0, v.v + v.acc * dt);
      v.s += v.v * dt;
      const uPrev = v.u;
      if (v.laneT < 1) {
        v.laneT = Math.min(1, v.laneT + dt / LC_TIME);
        const k = v.laneT * v.laneT * (3 - 2 * v.laneT);
        v.u = road.laneCentre(v.fromLane) + (road.laneCentre(v.lane) - road.laneCentre(v.fromLane)) * k + v.uNudge;
        if (v.laneT >= 1) {
          v.fromLane = v.lane;
          v.indicate = 0;
        }
      } else v.u = road.laneCentre(v.lane) + v.uNudge;
      v.dudt = (v.u - uPrev) / dt;
      v.honkCd = Math.max(0, v.honkCd - dt);
    }

    // ---- horns: cut-offs and dawdling
    const entered = pLanes.filter((l) => !this.lastPlayerLanes.includes(l));
    this.lastPlayerLanes = pLanes;
    for (const l of entered) {
      const f = followerOf(l, p.s, null);
      if (!f?.veh || f.veh.static) continue;
      const gap = p.s - PLAYER_LEN / 2 - (f.s + f.half);
      const need = idm(f.v, this.desired(f.veh), gap, p.v, f.veh.type.a, f.veh.type.b, f.veh.type.T);
      if (need < -3.2 && f.veh.yieldUntil < this.t && f.veh.honkCd <= 0) {
        f.veh.honkCd = 8;
        ev.honks.push({ s: f.s, u: f.veh.u });
      }
    }
    for (const l of pLanes) {
      const f = followerOf(l, p.s, null);
      const lead = leaderOf(l, p.s, null);
      if (!f?.veh || f.veh.static) continue;
      const open = !lead || lead.s - lead.half - (p.s + PLAYER_LEN / 2) > 30;
      if (p.v < 0.5 && f.v < 0.5 && open && !p.hazards && p.s - f.s < 15) f.veh.waitT += dt;
      else f.veh.waitT = 0;
      if (f.veh.waitT > 5 && f.veh.honkCd <= 0) {
        f.veh.honkCd = 10;
        f.veh.waitT = 0;
        ev.honks.push({ s: f.s, u: f.veh.u });
      }
    }

    // ---- collisions with the player
    for (const v of this.vehicles) {
      if (v.oncoming || v.hidden) continue;
      const dsx = v.s - p.s;
      const lim = v.type.length / 2 + PLAYER_LEN / 2;
      if (Math.abs(dsx) > lim) continue;
      const du = v.u - p.u;
      const limU = v.type.width / 2 + PLAYER_HALF_W - 0.05;
      if (Math.abs(du) > limU) continue;
      const penS = lim - Math.abs(dsx);
      const penU = limU - Math.abs(du);
      if (penS < penU) {
        if (dsx > 0) {
          // player ran into the back of it
          ev.push = { ds: -penS - 0.05, du: 0, v: Math.min(p.v, v.v) * 0.4, impact: Math.max(0, p.v - v.v) };
        } else if (!v.static) {
          // it ran into the player: it stops dead behind you
          v.s = p.s - lim - 0.1;
          v.v = Math.min(v.v, Math.max(0, p.v));
          if (v.honkCd <= 0) {
            v.honkCd = 6;
            ev.honks.push({ s: v.s, u: v.u });
          }
        } else ev.push = { ds: penS + 0.05, du: 0, v: 0, impact: Math.abs(p.v) };
      } else {
        ev.push = { ds: 0, du: -Math.sign(du || 1) * (penU + 0.03), v: p.v * 0.7, impact: Math.abs(v.dudt) + 0.6 };
        if (!v.static && v.honkCd <= 0) {
          v.honkCd = 6;
          ev.honks.push({ s: v.s, u: v.u });
        }
      }
    }

    this.maintainT -= dt;
    if (this.maintainT <= 0) {
      this.maintainT = 0.5;
      this.maintain(p);
    }
    return ev;
  }

  private desiredIn(v: Vehicle, lane: number): number {
    const save = v.lane;
    v.lane = lane;
    const d = this.desired(v);
    v.lane = save;
    return d;
  }

  private safeToChange(
    v: Vehicle, L: number,
    leaderOf: (l: number, s: number, self: Vehicle | null) => Entry | null,
    followerOf: (l: number, s: number, self: Vehicle | null) => Entry | null,
    accWith: (v: Vehicle, lane: number, lead: Entry | null, v0: number) => number,
    urgent: boolean,
  ): boolean {
    const lead = leaderOf(L, v.s, v);
    const fol = followerOf(L, v.s, v);
    const half = v.type.length / 2;
    if (lead && lead.s - lead.half - (v.s + half) < (urgent ? 1.2 : 2.5)) return false;
    if (fol && v.s - half - (fol.s + fol.half) < (urgent ? 1.2 : 2.5 + fol.v * 0.6)) return false;
    if (fol) {
      const ft = fol.veh?.type ?? { a: 1.5, b: 2.5, T: 1.2 };
      const nu = idm(fol.v, fol.veh ? this.desired(fol.veh) : 15, v.s - half - (fol.s + fol.half), v.v, ft.a, ft.b, ft.T);
      if (nu < (urgent ? -6 : -3)) return false;
    }
    return accWith(v, L, lead, this.desiredIn(v, L)) > -4;
  }
}
