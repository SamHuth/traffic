import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type VehicleKind = 'hatch' | 'sedan' | 'suv' | 'ute' | 'van' | 'bus' | 'truck' | 'police' | 'ambulance' | 'tow';

export interface VehicleType {
  kind: VehicleKind;
  length: number;
  width: number;
  height: number;
  /** IDM: max accel, comfortable decel, desired time gap. Heavy vehicles are lazier. */
  a: number;
  b: number;
  T: number;
  /** Relative spawn weight in general traffic. */
  weight: number;
  colors: number[];
  lampY: number;
}

const CAR_COLOURS = [0xe8e8e8, 0x1d1f22, 0x8a9096, 0xb3b8bd, 0x7a1f1f, 0x1f3b6b, 0x2e5a3a, 0xcfc3a5, 0x4a5a6a, 0xd06a22, 0xf2f2ee, 0x5c2a4a];

export const TYPES: Record<VehicleKind, VehicleType> = {
  hatch: { kind: 'hatch', length: 3.95, width: 1.72, height: 1.45, a: 1.5, b: 2.2, T: 1.3, weight: 26, colors: CAR_COLOURS, lampY: 0.75 },
  sedan: { kind: 'sedan', length: 4.65, width: 1.8, height: 1.45, a: 1.4, b: 2.2, T: 1.4, weight: 30, colors: CAR_COLOURS, lampY: 0.75 },
  suv: { kind: 'suv', length: 4.75, width: 1.9, height: 1.75, a: 1.3, b: 2.1, T: 1.5, weight: 22, colors: CAR_COLOURS, lampY: 0.9 },
  ute: { kind: 'ute', length: 5.3, width: 1.9, height: 1.8, a: 1.2, b: 2.0, T: 1.5, weight: 10, colors: [0xf2f2ee, 0x8a9096, 0x1d1f22, 0x7a1f1f, 0x9c8a62], lampY: 0.9 },
  van: { kind: 'van', length: 5.2, width: 2.0, height: 2.3, a: 1.0, b: 1.8, T: 1.7, weight: 7, colors: [0xf2f2ee, 0xe8e8e8, 0x8a9096], lampY: 0.95 },
  bus: { kind: 'bus', length: 12, width: 2.5, height: 3.1, a: 0.8, b: 1.6, T: 1.9, weight: 2, colors: [0xf4f1e8, 0x2b6cb0, 0xd94b2b], lampY: 1.0 },
  truck: { kind: 'truck', length: 9.5, width: 2.5, height: 3.5, a: 0.7, b: 1.6, T: 2.0, weight: 3, colors: [0xe8e8e8, 0xc0392b, 0x2c3e50, 0x27632a], lampY: 1.0 },
  police: { kind: 'police', length: 4.9, width: 1.85, height: 1.5, a: 2, b: 3, T: 1.0, weight: 0, colors: [0xf4f4f4], lampY: 0.75 },
  ambulance: { kind: 'ambulance', length: 6, width: 2.1, height: 2.7, a: 1.6, b: 2.5, T: 1.2, weight: 0, colors: [0xf7f3e8], lampY: 1.0 },
  tow: { kind: 'tow', length: 7, width: 2.3, height: 2.6, a: 1.0, b: 2, T: 1.6, weight: 0, colors: [0xf2c12e], lampY: 1.0 },
};

export const TRAFFIC_KINDS = (['hatch', 'sedan', 'suv', 'ute', 'van', 'bus', 'truck'] as const).filter((k) => TYPES[k].weight > 0);

const box = (w: number, h: number, l: number, x: number, y: number, z: number) => {
  const g = new THREE.BoxGeometry(w, h, l).toNonIndexed();
  g.translate(x, y, z);
  return g;
};

const wheels = (t: VehicleType, axles: number[]) => {
  const out: THREE.BufferGeometry[] = [];
  const r = t.kind === 'bus' || t.kind === 'truck' ? 0.5 : 0.33;
  for (const z of axles)
    for (const s of [-1, 1]) {
      const g = new THREE.CylinderGeometry(r, r, 0.26, 8).toNonIndexed();
      g.rotateZ(Math.PI / 2);
      g.translate(s * (t.width / 2 - 0.12), r, z);
      out.push(g);
    }
  return out;
};

/** Per-type geometry split into: painted body, dark (glass/tyres/trim), and light (cargo, roof bars). Forward is -Z. */
export function buildVehicleGeometry(kind: VehicleKind): { body: THREE.BufferGeometry; dark: THREE.BufferGeometry; light: THREE.BufferGeometry | null } {
  const t = TYPES[kind];
  const L = t.length, W = t.width, H = t.height;
  const body: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const light: THREE.BufferGeometry[] = [];
  const axF = -L / 2 + 0.85, axR = L / 2 - 0.85;
  switch (kind) {
    case 'hatch':
    case 'sedan':
    case 'suv':
    case 'police': {
      const low = H * 0.5;
      body.push(box(W, low - 0.25, L, 0, 0.25 + (low - 0.25) / 2, 0));
      const cabL = kind === 'hatch' ? L * 0.62 : L * 0.5;
      const cabZ = kind === 'hatch' ? L * 0.12 : kind === 'suv' ? L * 0.08 : L * 0.04;
      dark.push(box(W * 0.9, H - low - 0.06, cabL, 0, low + (H - low - 0.06) / 2, cabZ));
      body.push(box(W * 0.86, 0.06, cabL * 0.92, 0, H - 0.03, cabZ));
      dark.push(box(W + 0.02, 0.12, 0.12, 0, 0.35, -L / 2), box(W + 0.02, 0.12, 0.12, 0, 0.35, L / 2));
      if (kind === 'police') light.push(box(1.1, 0.12, 0.3, 0, H + 0.06, cabZ));
      dark.push(...wheels(t, [axF, axR]));
      break;
    }
    case 'ute': {
      body.push(box(W, 0.6, L, 0, 0.6, 0));
      dark.push(box(W * 0.9, 0.62, L * 0.36, 0, 1.2, -L * 0.13));
      body.push(box(W * 0.86, 0.06, L * 0.33, 0, 1.52, -L * 0.13));
      body.push(box(0.08, 0.35, L * 0.42, -W / 2 + 0.04, 1.07, L * 0.27), box(0.08, 0.35, L * 0.42, W / 2 - 0.04, 1.07, L * 0.27));
      dark.push(box(W - 0.16, 0.05, L * 0.42, 0, 0.92, L * 0.27));
      dark.push(...wheels(t, [axF, axR]));
      break;
    }
    case 'van':
    case 'ambulance': {
      body.push(box(W, H - 0.35, L, 0, 0.35 + (H - 0.35) / 2, 0));
      dark.push(box(W * 0.96, 0.6, 0.1, 0, H * 0.7, -L / 2 - 0.01));
      dark.push(box(W + 0.02, H * 0.22, L * 0.18, 0, H * 0.7, -L / 2 + L * 0.12));
      if (kind === 'ambulance') {
        light.push(box(1.4, 0.15, 0.3, 0, H + 0.08, -L / 2 + 0.4));
        dark.push(box(W + 0.03, 0.3, L * 0.7, 0, 1.0, L * 0.1));
      }
      dark.push(...wheels(t, [axF, axR]));
      break;
    }
    case 'bus': {
      body.push(box(W, H - 0.4, L, 0, 0.4 + (H - 0.4) / 2, 0));
      dark.push(box(W + 0.03, 0.9, L * 0.86, 0, 2.1, L * 0.04));
      dark.push(box(W * 0.94, 1.3, 0.06, 0, 1.9, -L / 2 - 0.02));
      dark.push(...wheels(t, [-L / 2 + 2.4, L / 2 - 3]));
      break;
    }
    case 'truck':
    case 'tow': {
      const cabL = 2.3;
      body.push(box(W, 2.2, cabL, 0, 1.5, -L / 2 + cabL / 2));
      dark.push(box(W * 0.94, 0.8, 0.06, 0, 2.0, -L / 2 - 0.02));
      if (kind === 'truck') light.push(box(W, H - 1.0, L - cabL - 0.3, 0, 1.0 + (H - 1.0) / 2, cabL / 2 + 0.15));
      else {
        dark.push(box(W - 0.3, 0.2, L - cabL - 0.3, 0, 1.0, cabL / 2 + 0.15));
        light.push(box(0.9, 0.12, 0.25, 0, 2.7, -L / 2 + 0.8));
        dark.push(box(0.15, 1.6, 0.15, 0, 1.8, L / 2 - 0.6));
      }
      dark.push(...wheels(t, [-L / 2 + 1.2, L / 2 - 2.6, L / 2 - 1.3]));
      break;
    }
  }
  return {
    body: mergeGeometries(body)!,
    dark: mergeGeometries(dark)!,
    light: light.length ? mergeGeometries(light)! : null,
  };
}
