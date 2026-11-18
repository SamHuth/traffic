import type { IncidentDef } from '../incidents/types';
import type { FlowDef } from '../traffic/LaneFlow';
import type { RoadSpec } from '../world/Road';
import { THEMES, type Theme, type ThemeId } from '../world/themes';

export interface RouteDef {
  id: string;
  name: string;
  seed: number;
  road: RoadSpec;
  /** Theme from `s` onward. */
  zones: { s: number; theme: ThemeId }[];
  speedCapKmh: number;
  ticker: string;
  flow: FlowDef;
  incidents: IncidentDef[];
  /** Lighting preset name (see world/Lighting.ts). */
  lighting: string;
  rain?: boolean;
  /** One-line description for the level select. */
  blurb: string;
}

export function themeAt(route: RouteDef, s: number): Theme {
  let t = route.zones[0].theme;
  for (const z of route.zones) if (s >= z.s) t = z.theme;
  return THEMES[t];
}

/** Split [s0, s1) at zone boundaries. */
export function zoneParts(route: RouteDef, s0: number, s1: number): { a: number; b: number; theme: Theme }[] {
  const cuts = route.zones.map((z) => z.s).filter((s) => s > s0 && s < s1);
  const pts = [s0, ...cuts, s1];
  return pts.slice(0, -1).map((a, i) => ({ a, b: pts[i + 1], theme: themeAt(route, a) }));
}
