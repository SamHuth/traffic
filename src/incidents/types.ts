export type LaneRef = 'kerb' | 'median' | 'middle' | number;

/** Things that happen on a route. `s` is metres along the route. */
export type IncidentDef =
  | { kind: 'breakdown'; s: number; shoulder?: boolean }
  | { kind: 'fenderBender'; s: number; lane: LaneRef }
  | { kind: 'crash'; s: number; lanes: LaneRef[]; clearAt: number }
  | { kind: 'roadworks'; s: number; length: number; lane: LaneRef }
  | { kind: 'lostLoad'; s: number; lane: LaneRef; load: 'mattresses' | 'watermelons' }
  | { kind: 'busStop'; s: number }
  | { kind: 'doubleParked'; s: number }
  | { kind: 'ambulance'; s: number }
  | { kind: 'waterMain'; s: number; lane: LaneRef }
  | { kind: 'ducks'; s: number }
  | { kind: 'oppositeCrash'; s: number };
