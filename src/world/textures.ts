import * as THREE from 'three';
import { Rng } from '../core/rng';

let asphalt: THREE.CanvasTexture | null = null;

/** Speckled asphalt, tiled in world metres. */
export function asphaltTexture(): THREE.CanvasTexture {
  if (asphalt) return asphalt;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#55585d';
  g.fillRect(0, 0, 256, 256);
  const rng = new Rng(7);
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(60, 115);
    g.fillStyle = `rgba(${v},${v},${v + 3},0.5)`;
    g.fillRect(rng.int(0, 255), rng.int(0, 255), 1 + rng.int(0, 1), 1 + rng.int(0, 1));
  }
  // faint tyre-polished bands
  g.fillStyle = 'rgba(30,30,34,0.08)';
  g.fillRect(40, 0, 50, 256);
  g.fillRect(166, 0, 50, 256);
  asphalt = new THREE.CanvasTexture(c);
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.colorSpace = THREE.SRGBColorSpace;
  asphalt.anisotropy = 8;
  return asphalt;
}
