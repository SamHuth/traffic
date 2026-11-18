import * as THREE from 'three';
import { asphaltTexture } from './textures';

const std = (color: number, roughness = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

/**
 * Building facade with procedural windows (no textures): window cells are computed from world
 * position along each wall, so any box size gets a sensible grid.
 */
/** Shared uniforms for every facade shader (night → lit windows). */
export const facadeUniforms = { uNight: { value: 0 } };

function facade(base: THREE.MeshStandardMaterial, spacing: number, floor: number, winW: number, winH: number, ground: number): THREE.MeshStandardMaterial {
  base.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = facadeUniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        mat4 fm = modelMatrix;
        #ifdef USE_INSTANCING
          fm = modelMatrix * instanceMatrix;
        #endif
        vWPos = (fm * vec4(position, 1.0)).xyz;
        vWNor = normalize(mat3(fm) * normal);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;\nuniform float uNight;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float winMask = 0.0;
        float winRnd = 0.0;
        if (abs(vWNor.y) < 0.5) {
          vec3 tng = normalize(cross(vec3(0.0, 1.0, 0.0), vWNor));
          float hx = dot(vWPos, tng);
          vec2 cell = vec2(hx / ${spacing.toFixed(2)}, vWPos.y / ${floor.toFixed(2)});
          vec2 f = fract(cell);
          float win = step(${((1 - winW) / 2).toFixed(3)}, f.x) * step(f.x, ${((1 + winW) / 2).toFixed(3)})
                    * step(0.28, f.y) * step(f.y, ${(0.28 + winH).toFixed(3)})
                    * step(${ground.toFixed(2)}, vWPos.y);
          float r = fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453);
          vec3 glass = mix(vec3(0.16, 0.22, 0.3), vec3(0.42, 0.52, 0.6), r * r);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
          winMask = win;
          winRnd = r;
          // shopfronts / ground floor band
          float shop = step(vWPos.y, ${ground.toFixed(2)}) * step(0.4, vWPos.y) * step(0.08, f.x) * step(f.x, 0.92) * ${ground > 0.5 ? '1.0' : '0.0'};
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.14, 0.16), shop * 0.85);
          winMask = max(winMask, shop * 0.8);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.9, 0.7, 0.42) * winMask * step(0.55, winRnd) * uNight * 0.45;`,
      );
  };
  base.customProgramCacheKey = () => `facade-${spacing}-${floor}-${winW}-${winH}-${ground}`;
  return base;
}

export interface WorldMaterials {
  asphalt: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  kerb: THREE.MeshStandardMaterial;
  medianGrass: THREE.MeshStandardMaterial;
  lawn: Record<'suburb' | 'cbd' | 'industrial', THREE.MeshStandardMaterial>;
  paint: THREE.MeshStandardMaterial;
  barrier: THREE.MeshStandardMaterial;
  rail: THREE.MeshStandardMaterial;
  bollard: THREE.MeshStandardMaterial;
  house: THREE.MeshStandardMaterial;
  tower: THREE.MeshStandardMaterial;
  warehouse: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  awning: THREE.MeshStandardMaterial;
  pole: THREE.MeshStandardMaterial;
  lamp: THREE.MeshStandardMaterial;
  trunk: THREE.MeshStandardMaterial;
  leaves: THREE.MeshStandardMaterial;
  tunnelWall: THREE.MeshStandardMaterial;
  tunnelLight: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  crowd: THREE.MeshStandardMaterial;
  stadium: THREE.MeshStandardMaterial;
}

let mats: WorldMaterials | null = null;

export function worldMaterials(): WorldMaterials {
  if (mats) return mats;
  const asphalt = std(0xffffff, 0.95, { map: asphaltTexture() });
  const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  mats = {
    asphalt,
    concrete: std(0xb9b6ae),
    kerb: std(0xa19e97),
    medianGrass: std(0x6d8d4a, 1, decal),
    lawn: { suburb: std(0x6f9150, 1), cbd: std(0xa7a49c, 0.95), industrial: std(0x7d8d55, 1) },
    paint: std(0xeeebe2, 0.75, decal),
    barrier: std(0xc7c3b9, 0.85, { flatShading: true }),
    rail: std(0xaab2b9, 0.4, { metalness: 0.6 }),
    bollard: std(0xe8b923, 0.6, { flatShading: true }),
    house: facade(std(0xffffff, 0.9, { flatShading: true }), 4.6, 3.0, 0.32, 0.42, 0.0),
    tower: facade(std(0xffffff, 0.75, { flatShading: true }), 2.8, 3.6, 0.72, 0.58, 4.2),
    warehouse: facade(std(0xffffff, 0.85, { flatShading: true }), 9, 4.5, 0.2, 0.25, 0.0),
    roof: std(0xffffff, 0.85, { flatShading: true }),
    awning: std(0x2f3a44, 0.7, { flatShading: true }),
    pole: std(0x7f858c, 0.5, { metalness: 0.4 }),
    lamp: std(0xf4f1e6, 0.4, { emissive: 0x332f22 }),
    trunk: std(0x5e4a38, 1, { flatShading: true }),
    leaves: std(0xffffff, 0.95, { flatShading: true }),
    tunnelWall: std(0xcfcab8, 0.6, { flatShading: true }),
    tunnelLight: std(0xfff1c8, 0.4, { emissive: 0xffe2a0, emissiveIntensity: 1.6 }),
    water: std(0x2f5f7a, 0.15, { metalness: 0.2 }),
    crowd: std(0xffffff, 0.9, { flatShading: true }),
    stadium: std(0xd2cec4, 0.8, { flatShading: true, side: THREE.DoubleSide }),
  };
  return mats;
}
