import { DEFAULT_FLOW } from '../traffic/LaneFlow';
import type { RouteDef } from './RouteDef';

const S = (len: number) => ({ kind: 'straight' as const, len });
const A = (len: number, radius: number, dir: 1 | -1) => ({ kind: 'arc' as const, len, radius, dir });

/** 1 — suburbs to the shops: two lanes, buses, a breakdown, ducks. */
export const MONDAY_CRAWL: RouteDef = {
  id: 'monday-crawl',
  name: 'MONDAY CRAWL',
  blurb: 'Suburban arterial at 8am. Buses, a broken-down ute and something about ducks.',
  seed: 1907,
  speedCapKmh: 65,
  lighting: 'morning',
  flow: { ...DEFAULT_FLOW, crawl: 0.68, spacing: 8.5, surges: [{ t: 75, dur: 30 }, { t: 220, dur: 35 }] },
  ticker: 'Good morning, this is Traffic FM. Slow going on the arterials as usual for a Monday',
  road: {
    laneSections: [{ s: 0, lanes: 2 }, { s: 520, lanes: 3 }, { s: 1700, lanes: 2 }],
    segments: [S(180), A(140, 260, 1), S(220), A(160, 400, -1), S(320), A(110, 260, 1), S(260), A(120, 300, -1), S(300), A(160, 500, 1), S(260)],
  },
  zones: [{ s: 0, theme: 'suburb' }, { s: 1150, theme: 'cbd' }, { s: 1750, theme: 'suburb' }],
  incidents: [
    { kind: 'busStop', s: 330 },
    { kind: 'breakdown', s: 820 },
    { kind: 'doubleParked', s: 1320 },
    { kind: 'ducks', s: 1620 },
    { kind: 'fenderBender', s: 2000, lane: 'median' },
  ],
};

/** 2 — city grid: three lanes, roadworks, a burst main, double parking. */
export const CITY_LOOP: RouteDef = {
  id: 'city-loop',
  name: 'CITY LOOP',
  blurb: 'Three lanes through the CBD at lunchtime. Roadworks, a burst water main, delivery vans everywhere.',
  seed: 2207,
  speedCapKmh: 55,
  lighting: 'midday',
  flow: { ...DEFAULT_FLOW, crawl: 0.85, waveLength: 260, spacing: 8, surges: [{ t: 90, dur: 30 }, { t: 240, dur: 30 }] },
  ticker: 'Lunchtime traffic in the city is heavy. Council roadworks continue on the loop road',
  road: {
    laneSections: [{ s: 0, lanes: 3 }, { s: 1350, lanes: 2 }, { s: 1650, lanes: 3 }],
    segments: [S(260), A(90, 160, 1), S(300), A(90, 160, -1), S(280), A(120, 200, 1), S(300), A(90, 180, -1), S(250), A(110, 220, 1), S(180)],
  },
  zones: [{ s: 0, theme: 'cbd' }],
  incidents: [
    { kind: 'roadworks', s: 520, length: 150, lane: 'kerb' },
    { kind: 'doubleParked', s: 1000 },
    { kind: 'waterMain', s: 1250, lane: 'middle' },
    { kind: 'busStop', s: 1550 },
    { kind: 'lostLoad', s: 1820, lane: 'median', load: 'mattresses' },
  ],
};

/** 3 — motorway: on-ramps, a lane drop, a big crash that gets cleared, watermelons. */
export const MOTORWAY_MERGE: RouteDef = {
  id: 'motorway-merge',
  name: 'MOTORWAY MERGE',
  blurb: 'Four lanes of stop-and-go. A crash ahead closes two lanes until the tow trucks arrive.',
  seed: 3301,
  speedCapKmh: 80,
  lighting: 'overcast',
  flow: { ...DEFAULT_FLOW, crawl: 0.5, waveAmp: 0.85, waveLength: 420, waveSpeed: 5, spacing: 10, surges: [{ t: 60, dur: 25 }, { t: 160, dur: 30 }, { t: 330, dur: 40 }] },
  ticker: 'Motorway outbound: heavy traffic from the on-ramp, delays building',
  road: {
    laneSections: [{ s: 0, lanes: 3 }, { s: 450, lanes: 4 }, { s: 1150, lanes: 3 }, { s: 1900, lanes: 4 }],
    segments: [S(300), A(300, 900, 1), S(400), A(260, 700, -1), S(500), A(300, 800, 1), S(400), A(200, 900, -1), S(300)],
  },
  zones: [{ s: 0, theme: 'industrial' }],
  incidents: [
    { kind: 'breakdown', s: 500, shoulder: true },
    { kind: 'oppositeCrash', s: 900 },
    { kind: 'crash', s: 1600, lanes: ['median', 1], clearAt: 270 },
    { kind: 'lostLoad', s: 2450, lane: 'kerb', load: 'watermelons' },
  ],
};

/** 4 — over the harbour and under the hill: lane drops, a tunnel breakdown, an ambulance. */
export const BRIDGE_AND_TUNNEL: RouteDef = {
  id: 'bridge-tunnel',
  name: 'BRIDGE & TUNNEL',
  blurb: 'Over the harbour bridge and into the tunnel at dusk. Listen for sirens.',
  seed: 4404,
  speedCapKmh: 70,
  lighting: 'dusk',
  flow: { ...DEFAULT_FLOW, crawl: 0.55, spacing: 9, surges: [{ t: 120, dur: 30 }, { t: 280, dur: 35 }] },
  ticker: 'Evening peak: bridge approaches slow, tunnel traffic heavy',
  road: {
    laneSections: [{ s: 0, lanes: 2 }, { s: 300, lanes: 3 }, { s: 1350, lanes: 2 }, { s: 2250, lanes: 3 }],
    segments: [S(250), A(150, 350, -1), S(250), A(300, 1200, 1), S(450), A(200, 600, -1), S(500), A(150, 500, 1), S(400)],
  },
  zones: [
    { s: 0, theme: 'suburb' },
    { s: 560, theme: 'bridge' },
    { s: 1300, theme: 'industrial' },
    { s: 1500, theme: 'tunnel' },
    { s: 2150, theme: 'industrial' },
  ],
  incidents: [
    { kind: 'ambulance', s: 700 },
    { kind: 'breakdown', s: 1850 },
    { kind: 'fenderBender', s: 2400, lane: 'median' },
  ],
};

/** 5 — match night in the rain: stadium crowds, a crash, an ambulance. */
export const GAME_NIGHT: RouteDef = {
  id: 'game-night',
  name: 'GAME NIGHT',
  blurb: 'Rain, floodlights and forty thousand fans all leaving at once.',
  seed: 5150,
  speedCapKmh: 60,
  lighting: 'night',
  rain: true,
  flow: { ...DEFAULT_FLOW, crawl: 0.7, spacing: 8.5, surges: [{ t: 100, dur: 30 }, { t: 260, dur: 35 }] },
  ticker: 'Full time at the stadium. Expect heavy traffic and wet roads, take it easy out there',
  road: {
    laneSections: [{ s: 0, lanes: 2 }, { s: 450, lanes: 3 }, { s: 2000, lanes: 2 }],
    segments: [S(200), A(130, 260, -1), S(300), A(160, 300, 1), S(320), A(120, 240, -1), S(320), A(140, 400, 1), S(300), A(120, 300, -1), S(240)],
  },
  zones: [{ s: 0, theme: 'suburb' }, { s: 650, theme: 'stadium' }, { s: 1600, theme: 'cbd' }],
  incidents: [
    { kind: 'fenderBender', s: 520, lane: 'kerb' },
    { kind: 'busStop', s: 980 },
    { kind: 'oppositeCrash', s: 1300 },
    { kind: 'ambulance', s: 1500 },
    { kind: 'crash', s: 1950, lanes: ['kerb'], clearAt: 300 },
  ],
};

export const ROUTES: RouteDef[] = [MONDAY_CRAWL, CITY_LOOP, MOTORWAY_MERGE, BRIDGE_AND_TUNNEL, GAME_NIGHT];
export const MORNING_RUN = MONDAY_CRAWL;
