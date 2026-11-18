// Headless traffic + level-duration test. Run: npm run test:sim
// A bot player drives each route (following traffic in one lane, merging when its lane ends) and we
// assert: the drive takes ≥ 5 minutes, and traffic never locks up for a whole minute.
import { idm } from '../src/traffic/IDM';
import { TrafficSystem, type PlayerInfo } from '../src/traffic/TrafficSystem';
import { ROUTES } from '../src/levels/routes';
import { Road } from '../src/world/Road';
import { IncidentSystem } from '../src/incidents/IncidentSystem';
import { themeAt } from '../src/levels/RouteDef';

const dt = 1 / 30;
let failed = false;
for (const route of ROUTES.filter((r) => !process.env.ONLY || r.id === process.env.ONLY)) {
  const road = new Road(route.road, 1);
  const ts = new TrafficSystem(road, route, route.flow, route.seed + 99);
  let lane = Math.max(0, Math.floor(road.lanesAt(30)) - 1);
  const p: PlayerInfo = { s: 30, u: road.laneCentre(lane), v: 0, indicate: 0, hazards: false };
  const inc = new IncidentSystem(road, route, ts, route.incidents, false);
  ts.populate(p);
  let t = 0;
  let windowStart = 0, windowS = p.s, worstWindow = Infinity;
  let changes = 0, letIn = 0, honks = 0, maxCars = 0, bumps = 0;
  const speeds: number[] = [];
  while (p.s < road.length - 70 && t < 1800) {
    // bot: merge out of an ending lane or a blocked lane (into one that is neither)
    const bad = (l: number) =>
      ts.laneEnd(l, p.s) - p.s < 150 ||
      ts.vehicles.some((v) => v.static && !v.oncoming && !v.offRoad && v.lane === l && v.s + v.type.length / 2 > p.s && v.s - v.type.length / 2 - p.s < 80);
    if (bad(lane)) {
      const n = ts.lanesAt(p.s);
      const next = [lane - 1, lane + 1].find((l) => l >= 0 && l < n && !bad(l));
      if (next !== undefined) {
        lane = next;
        changes++;
      }
    }
    while (lane >= ts.lanesAt(p.s)) lane--;
    p.u = road.laneCentre(lane);
    let lead = Infinity, leadV = 0;
    for (const v of ts.vehicles) {
      if (v.oncoming || v.s <= p.s) continue;
      if (v.lane !== lane && v.fromLane !== lane) continue;
      const g = v.s - v.type.length / 2 - (p.s + 2.15);
      if (g < lead) { lead = g; leadV = v.v; }
    }
    const v0 = themeAt(route, p.s).speedLimit / 3.6;
    const a = Math.max(-9, idm(p.v, v0, lead, leadV, 1.5, 2.5, 1.3));
    p.v = Math.max(0, p.v + a * dt);
    p.s += p.v * dt;
    const ev = ts.step(dt, p);
    inc.update(dt, p.s);
    if (ev.push) { p.s += ev.push.ds; p.v = ev.push.v; if (ev.push.impact > 0.8) bumps++; }
    letIn += ev.letIn;
    honks += ev.honks.length;
    maxCars = Math.max(maxCars, ts.vehicles.length);
    t += dt;
    if (process.env.DEBUG && t - windowStart >= 60 && p.s - windowS < 20) {
      const near = ts.vehicles.filter((v) => !v.oncoming && v.s > (Number(process.env.AT) || p.s - 10) && v.s < (Number(process.env.AT) || p.s - 10) + 70).sort((a, b) => a.s - b.s);
      console.log(`  STUCK t=${t.toFixed(0)} s=${p.s.toFixed(0)} lane=${lane} lanesAt=${ts.lanesAt(p.s)} raw=${road.lanesAt(p.s).toFixed(2)}`);
      for (const v of near.slice(0, 24)) console.log(`    ${v.type.kind.padEnd(9)} s=${v.s.toFixed(1)} lane=${v.fromLane}->${v.lane} T=${v.laneT.toFixed(2)} v=${v.v.toFixed(2)} acc=${v.acc.toFixed(2)} static=${v.static} hidden=${v.hidden} pend=${v.pendingLane} pT=${v.pendingT.toFixed(1)} stuck=${v.stuck} yTo=${v.yieldTo?.id ?? '-'} id=${v.id} ind=${v.indicate}`);
    }
    if (t - windowStart >= 60) {
      worstWindow = Math.min(worstWindow, p.s - windowS);
      speeds.push(((p.s - windowS) / 60) * 3.6);
      windowStart = t;
      windowS = p.s;
    }
  }
  const mins = t / 60;
  const ok = t >= 300 && worstWindow > 20 && t < 1800;
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${route.name.padEnd(16)} ${road.length.toFixed(0)} m in ${mins.toFixed(1)} min  avg ${((road.length / t) * 3.6).toFixed(1)} km/h`);
  console.log(`     per-minute km/h: ${speeds.map((s) => s.toFixed(0)).join(' ')}`);
  console.log(`     worst minute ${worstWindow.toFixed(0)} m · bot merges ${changes} · AI let-ins ${letIn} · honks ${honks} · bumps ${bumps} · peak cars ${maxCars}`);
}
process.exit(failed ? 1 : 0);
