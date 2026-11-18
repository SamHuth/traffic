import * as THREE from 'three';
import type { Road } from '../world/Road';

/** Low-poly props for incidents. All are built in world space using the road frame. */

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
const M = {
  cone: mat(0xff6a1a),
  coneBand: mat(0xf2f2f2),
  hiVis: mat(0xff8c1a),
  hiVisYellow: mat(0xd8e83a),
  skin: [mat(0xe0b08c), mat(0x9a6a4a), mat(0x6e4a34), mat(0xf0c8a8)],
  pants: mat(0x2a3140),
  shirt: [mat(0x3a6ea5), mat(0xa53a3a), mat(0x3a8a5a), mat(0xd9d4c8), mat(0x5a4a7a)],
  police: mat(0x1d2a4a),
  black: mat(0x15171a),
  white: mat(0xf2f0ea),
  grey: mat(0x8a8f96),
  yellow: mat(0xf2c12e),
  mattress: mat(0xe9e3d6),
  melon: mat(0x2f6b2a),
  melonFlesh: mat(0xd8384a),
  water: new THREE.MeshStandardMaterial({ color: 0x5a7f96, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -3 }),
  spray: new THREE.MeshStandardMaterial({ color: 0xdfeef7, roughness: 0.2, transparent: true, opacity: 0.55 }),
  duck: mat(0x6b5236),
  duckling: mat(0xe8c64a),
  beak: mat(0xe8862a),
};

/** Place an object at road-frame (s, u), facing along the road (+ extra yaw). */
export function place(obj: THREE.Object3D, road: Road, s: number, u: number, y = 0, yaw = 0): THREE.Object3D {
  const w = road.toWorld(s, u);
  obj.position.set(w.x, y, w.z);
  obj.rotation.y = w.h + yaw;
  return obj;
}

export function cone(): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.62, 8), M.cone);
  c.position.y = 0.33;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.115, 0.1, 8), M.coneBand);
  band.position.y = 0.4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.38), M.cone);
  base.position.y = 0.02;
  g.add(c, band, base);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A line of cones along a lane edge, tapering across the lane over `taper` metres. */
export function coneTaper(road: Road, s0: number, s1: number, uFrom: number, uTo: number, taper = 30): THREE.Group {
  const g = new THREE.Group();
  for (let s = s0; s <= s1; s += s < s0 + taper ? 4 : 8) {
    const k = Math.min(1, (s - s0) / taper);
    g.add(place(cone(), road, s, uFrom + (uTo - uFrom) * k));
  }
  return g;
}

export interface Person extends THREE.Group {
  userData: { phase: number; kind: string };
}

/** A standing figure. kind: 'civilian' | 'worker' | 'police' | 'phone'. */
export function person(kind: 'civilian' | 'worker' | 'police' | 'phone' = 'civilian', seed = Math.random()): Person {
  const g = new THREE.Group() as Person;
  const pick = <T,>(a: T[]) => a[Math.floor(seed * 997) % a.length];
  const torsoMat = kind === 'worker' ? M.hiVis : kind === 'police' ? M.police : pick(M.shirt);
  const skin = pick(M.skin);
  for (const sx of [-0.1, 0.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.82, 0.16), M.pants);
    leg.position.set(sx, 0.41, 0);
    g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), torsoMat);
  torso.position.y = 1.13;
  g.add(torso);
  if (kind === 'police') {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.28), M.hiVisYellow);
    vest.position.y = 1.2;
    g.add(vest);
  }
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), skin);
  head.position.y = 1.6;
  g.add(head);
  if (kind === 'worker') {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.1, 8), M.yellow);
    hat.position.y = 1.72;
    g.add(hat);
  }
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.12), torsoMat);
  armL.position.set(-0.28, 1.15, 0);
  const armR = armL.clone();
  armR.position.x = 0.28;
  if (kind === 'phone') {
    armR.position.set(0.2, 1.48, 0);
    armR.rotation.z = 2.5;
  }
  g.add(armL, armR);
  g.traverse((o) => (o.castShadow = true));
  g.userData = { phase: seed * 10, kind };
  return g;
}

/** Idle sway + waving for people (call every frame). */
export function animatePeople(root: THREE.Object3D, t: number): void {
  root.traverse((o) => {
    const ud = o.userData as { phase?: number; kind?: string };
    if (ud.phase === undefined || !ud.kind) return;
    o.rotation.z = Math.sin(t * 0.8 + ud.phase) * 0.03;
  });
}

export function lollipop(): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f2c12e';
  x.beginPath();
  x.arc(64, 64, 62, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#111';
  x.font = 'bold 40px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('SLOW', 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
  disc.position.y = 2.1;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 5), M.grey);
  pole.position.y = 0.95;
  g.add(disc, pole);
  return g;
}

/** Trailer-mounted flashing arrow board. Returns the group and its lamp material to flash. */
export function arrowBoard(pointLeft: boolean): { group: THREE.Group; lamps: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  const trailer = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.2), M.yellow);
  trailer.position.y = 0.6;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 0.1), M.black);
  board.position.set(0, 2.1, 0.9);
  const lamps = new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false });
  const arrow = new THREE.Group();
  const dir = pointLeft ? -1 : 1;
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.07, 6), lamps);
    d.position.set(dir * (-0.7 + i * 0.25), 2.1, 0.96);
    arrow.add(d);
  }
  for (const k of [-1, 1]) {
    for (let i = 1; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.07, 6), lamps);
      d.position.set(dir * (0.55 - i * 0.2), 2.1 + k * i * 0.18, 0.96);
      arrow.add(d);
    }
  }
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), M.grey);
  post.position.set(0, 1.3, 0.8);
  for (const w of [-0.75, 0.75]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8), M.black);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(w, 0.3, 0.2);
    g.add(wheel);
  }
  g.add(trailer, board, arrow, post);
  // board faces approaching traffic (+Z is behind the car-forward convention)
  return { group: g, lamps };
}

/** Diamond roadside warning sign with text. */
export function warningSign(lines: string[], orange = true): THREE.Group {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.translate(128, 128);
  x.rotate(Math.PI / 4);
  x.fillStyle = orange ? '#f28c1e' : '#f2c12e';
  x.fillRect(-88, -88, 176, 176);
  x.strokeStyle = '#111';
  x.lineWidth = 8;
  x.strokeRect(-80, -80, 160, 160);
  x.rotate(-Math.PI / 4);
  x.fillStyle = '#111';
  x.font = 'bold 30px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, 0, (i - (lines.length - 1) / 2) * 34));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  board.position.y = 2.1;
  // plane faces +Z: back toward approaching traffic
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), M.grey);
  pole.position.y = 0.9;
  g.add(board, pole);
  return g;
}

/** Overhead variable-message sign spanning the carriageway, with amber LED text. */
export function vmsGantry(road: Road, s: number, uFar: number, text: string[]): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = '#060606';
  x.fillRect(0, 0, 512, 160);
  x.fillStyle = '#ffb020';
  x.shadowColor = '#ffb020';
  x.shadowBlur = 8;
  x.font = 'bold 44px ui-monospace, Menlo, monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  text.forEach((l, i) => x.fillText(l, 256, 80 + (i - (text.length - 1) / 2) * 54));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const uMid = (road.medianHalf + uFar) / 2;
  const span = uFar - road.medianHalf + 2;
  for (const u of [road.medianHalf - 0.6, uFar + 1.2]) {
    const post = place(new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.35), M.grey), road, s, u, 3.5);
    post.castShadow = true;
    g.add(post);
  }
  const beam = place(new THREE.Group(), road, s, uMid, 6.8);
  const truss = new THREE.Mesh(new THREE.BoxGeometry(span, 0.4, 0.4), M.grey);
  truss.castShadow = true;
  const board = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 0.25), M.black);
  board.position.y = -0.9;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, -0.9, 0.14);
  // the face looks back at approaching traffic (+Z in road-aligned space)
  beam.add(truss, board, face);
  g.add(beam);
  return g;
}

export function debris(n: number, spread: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1 + rnd() * 0.3, 0.03, 0.08 + rnd() * 0.25), rnd() < 0.5 ? M.black : M.grey);
    m.position.set((rnd() - 0.5) * spread, 0.02, (rnd() - 0.5) * spread);
    m.rotation.y = rnd() * 6;
    g.add(m);
  }
  return g;
}

export function mattress(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 2), M.mattress);
  m.position.y = 0.11;
  m.castShadow = true;
  return m;
}

export function melons(n: number, spread: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const smashed = rnd() < 0.35;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(smashed ? 0.2 : 0.22, 0), smashed ? M.melonFlesh : M.melon);
    m.scale.set(1.3, smashed ? 0.4 : 1, 1);
    m.position.set((rnd() - 0.5) * spread, smashed ? 0.06 : 0.2, (rnd() - 0.5) * spread * 1.5);
    m.rotation.y = rnd() * 6;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** Burst water main: a puddle and an animated fountain. */
export function fountain(): { group: THREE.Group; jet: THREE.Mesh } {
  const g = new THREE.Group();
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(5, 18), M.water);
  puddle.rotation.x = -Math.PI / 2;
  puddle.scale.set(1, 1.8, 1);
  puddle.position.y = 0.012;
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 10, 1, true), M.spray);
  jet.rotation.x = Math.PI;
  jet.position.y = 2.5;
  g.add(puddle, jet);
  return { group: g, jet };
}

/** A mother duck and ducklings in a line (local +X is the walking direction). */
export function ducks(): THREE.Group {
  const g = new THREE.Group();
  const one = (scale: number, m: THREE.Material) => {
    const d = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.24), m);
    body.position.y = 0.16;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), m);
    head.position.set(0.2, 0.34, 0);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.08), M.beak);
    beak.position.set(0.31, 0.32, 0);
    d.add(body, head, beak);
    d.scale.setScalar(scale);
    return d;
  };
  g.add(one(1, M.duck));
  for (let i = 1; i <= 5; i++) {
    const d = one(0.5, M.duckling);
    d.position.x = -i * 0.45;
    g.add(d);
  }
  return g;
}

/** Simple bus shelter on the footpath. */
export function busShelter(): THREE.Group {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 4), M.grey);
  roof.position.y = 2.4;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2, 4), new THREE.MeshStandardMaterial({ color: 0xbfd6e2, transparent: true, opacity: 0.4 }));
  back.position.set(0.75, 1.3, 0);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 2.4), M.grey);
  bench.position.set(0.45, 0.5, 0);
  g.add(roof, back, bench);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Car bonnet propped open, as a child of a world-placed group at the car's position. */
export function openBonnet(color: number, carLen: number): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 1.1), mat(color, { roughness: 0.5 }));
  b.geometry.translate(0, 0, 0.55);
  b.position.set(0, 0.95, -carLen / 2 + 1.15);
  b.rotation.x = 1.1;
  b.castShadow = true;
  return b;
}

export function triangle(): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-0.25, 0);
  shape.lineTo(0.25, 0);
  shape.lineTo(0, 0.43);
  shape.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0xe0251b, side: THREE.DoubleSide, emissive: 0x330000 }));
  m.position.y = 0.05;
  return m;
}
