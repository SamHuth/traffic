import type * as THREE from 'three';
import type { NavInfo } from '../cockpit/SatNav';
import type { PlayerCar } from '../vehicle/PlayerCar';

export interface WorldEvents {
  /** Impact speed (m/s) if the car hit something this step, else 0. */
  impact: number;
  /** Other drivers' horns, as stereo pan (-1 left … 1 right) and distance (m). */
  honks: { pan: number; dist: number }[];
  /** Nearest emergency siren, if any. */
  siren: { pan: number; dist: number } | null;
  arrived: boolean;
}

export interface JourneyStats {
  timeS: number;
  distanceM: number;
  laneChanges: number;
  signalled: number;
  letIn: number;
  bumps: number;
}

/** Anything the player can drive around in: the test lot, or a level route. */
export interface World {
  readonly group: THREE.Group;
  readonly speedCapKmh: number;
  start(): { x: number; z: number; heading: number };
  /** Advance the world one fixed step: keep the car on the road, run traffic, resolve collisions. */
  step(dt: number, car: PlayerCar): WorldEvents;
  /** Stream chunks around the player. */
  update(x: number, z: number): void;
  nav(): Partial<NavInfo>;
  /** 1 under open sky, lower inside tunnels. */
  shade(): number;
  readonly stats: JourneyStats | null;
  dispose(): void;
}
