import * as THREE from 'three';

export interface LightPreset {
  skyTop: number;
  skyHorizon: number;
  ground: number;
  sun: number;
  sunIntensity: number;
  hemiIntensity: number;
  sunDir: [number, number, number];
  fogNear: number;
  fogFar: number;
  /** 0 = day, 1 = full night (street lamps, lit windows, headlights). */
  night: number;
  exposure: number;
}

export const PRESETS: Record<string, LightPreset> = {
  morning: {
    skyTop: 0x5b8fd6, skyHorizon: 0xdfe8ee, ground: 0x6b6e66, sun: 0xfff1d8, sunIntensity: 2.4, hemiIntensity: 1.9,
    sunDir: [-0.5, 0.75, -0.45], fogNear: 140, fogFar: 650, night: 0, exposure: 1.05,
  },
  midday: {
    skyTop: 0x3f7fd6, skyHorizon: 0xd4e4f2, ground: 0x6b6e66, sun: 0xffffff, sunIntensity: 2.8, hemiIntensity: 1.7,
    sunDir: [-0.25, 0.95, -0.2], fogNear: 180, fogFar: 700, night: 0, exposure: 1.0,
  },
  overcast: {
    skyTop: 0x8e9aa6, skyHorizon: 0xc3c9ce, ground: 0x5f625e, sun: 0xe8ecf0, sunIntensity: 0.9, hemiIntensity: 2.4,
    sunDir: [-0.3, 0.9, -0.3], fogNear: 90, fogFar: 520, night: 0.1, exposure: 1.05,
  },
  dusk: {
    skyTop: 0x3a4a7a, skyHorizon: 0xf0a070, ground: 0x4a4440, sun: 0xffb27a, sunIntensity: 1.6, hemiIntensity: 1.1,
    sunDir: [0.2, 0.18, -0.95], fogNear: 120, fogFar: 600, night: 0.55, exposure: 1.1,
  },
  night: {
    skyTop: 0x05070d, skyHorizon: 0x1c2333, ground: 0x0e0f12, sun: 0x9fb4d8, sunIntensity: 0.35, hemiIntensity: 0.55,
    sunDir: [0.3, 0.8, 0.3], fogNear: 60, fogFar: 420, night: 1, exposure: 1.25,
  },
};

/** Hemisphere + shadowed sun that follows the player, gradient sky dome and matching fog. */
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly sky: THREE.Mesh;
  private readonly dir = new THREE.Vector3();
  private preset: LightPreset;
  private shade = 1;

  constructor(private readonly scene: THREE.Scene, preset: LightPreset = PRESETS.morning) {
    this.preset = preset;
    this.hemi = new THREE.HemisphereLight(preset.skyHorizon, preset.ground, preset.hemiIntensity);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(preset.sun, preset.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 1;
    sc.far = 300;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0);
          #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    this.apply(preset);
  }

  get night(): number {
    return this.preset.night;
  }

  /** Dim everything (tunnels): 1 = open sky, lower = darker. */
  setShade(k: number): void {
    this.shade = k;
    this.sun.intensity = this.preset.sunIntensity * k * k;
    this.hemi.intensity = this.preset.hemiIntensity * (0.25 + 0.75 * k);
  }

  apply(p: LightPreset): void {
    this.preset = p;
    this.hemi.color.set(p.skyHorizon);
    this.hemi.groundColor.set(p.ground);
    this.hemi.intensity = p.hemiIntensity;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.dir.set(...p.sunDir).normalize();
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    (u.top.value as THREE.Color).set(p.skyTop);
    (u.horizon.value as THREE.Color).set(p.skyHorizon);
    this.scene.fog = new THREE.Fog(p.skyHorizon, p.fogNear, p.fogFar);
    this.scene.background = new THREE.Color(p.skyHorizon);
    this.setShade(this.shade);
  }

  /** Keep the shadow frustum and the sky centred on the player. */
  follow(x: number, z: number): void {
    // snap to texel-sized steps so shadows don't shimmer as the car moves
    const step = 140 / 2048;
    const fx = Math.round(x / step) * step;
    const fz = Math.round(z / step) * step;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.dir.x * 150, this.dir.y * 150, fz + this.dir.z * 150);
    this.sky.position.set(x, 0, z);
  }
}
