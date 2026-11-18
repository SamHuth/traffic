import * as THREE from 'three';
import { Audio } from '../audio/Audio';
import { Cockpit } from '../cockpit/Cockpit';
import { HeadCamera } from '../cockpit/HeadCamera';
import { Loop } from '../core/Loop';
import { damp, lerp } from '../core/math';
import { Controls, gearLabel } from '../input/Controls';
import { DesktopInput } from '../input/DesktopInput';
import { TouchInput } from '../input/TouchInput';
import { Shifter } from '../input/widgets/Shifter';
import { isTouchDevice } from '../platform/device';
import { enterFullscreen, isFullscreen, onFullscreenChange } from '../platform/Fullscreen';
import { lockLandscape, RotatePrompt } from '../platform/Orientation';
import { QualityManager } from '../render/Quality';
import { recordJourney } from '../ui/progress';
import { Screens } from '../ui/Screens';
import { driverSide, loadSettings, saveSettings, type Settings } from '../ui/settings';
import { PlayerCar } from '../vehicle/PlayerCar';
import { ROUTES } from '../levels/routes';
import type { RouteDef } from '../levels/RouteDef';
import { Lighting, PRESETS } from '../world/Lighting';
import { facadeUniforms, worldMaterials } from '../world/materials';
import { Rain } from '../world/Rain';
import { RouteWorld } from '../world/RouteWorld';
import { TestLot } from '../world/TestLot';
import type { World } from '../world/World';

type State = 'menu' | 'playing' | 'paused' | 'ended';
/** A level id, or 'lot' for the test lot. */
export type Mode = string;
type PauseReason = 'user' | 'rotate' | 'hidden' | 'fullscreen';

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly carRoot = new THREE.Group();
  private readonly lighting: Lighting;
  private readonly quality: QualityManager;
  private readonly controls = new Controls();
  private readonly car = new PlayerCar();
  private readonly audio = new Audio();
  private readonly touch: boolean;
  private readonly desktop: DesktopInput | null = null;
  private readonly touchUi: TouchInput | null = null;
  private readonly shifter: Shifter;
  private readonly screens: Screens;
  private readonly rotate: RotatePrompt;
  private readonly hud: HTMLDivElement;
  private readonly hints: HTMLDivElement | null = null;
  private readonly debug: HTMLDivElement | null = null;
  private cockpit!: Cockpit;
  private head!: HeadCamera;
  private world!: World;
  private mode: Mode = ROUTES[0].id;
  private route: RouteDef | null = null;
  private readonly rain = new Rain();
  private readonly headlights: THREE.SpotLight;
  private readonly cabinLight: THREE.PointLight;
  private shade = 1;
  private navTimer = 0;
  private settings: Settings;
  private state: State = 'menu';
  private pauseReason: PauseReason = 'user';
  private enteredFullscreen = false;
  private tripM = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private readonly camPos = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.settings = loadSettings();
    this.touch = isTouchDevice();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    root.appendChild(this.renderer.domElement);

    this.lighting = new Lighting(this.scene);
    this.quality = new QualityManager(this.renderer, this.lighting.sun);
    this.quality.set(this.settings.quality);
    this.scene.add(this.carRoot);
    this.scene.add(this.rain.lines);
    // the player's own headlights, for dusk and night
    this.headlights = new THREE.SpotLight(0xfff0d8, 0, 90, 0.5, 0.55, 1.1);
    this.headlights.position.set(0, 0.8, -2.3);
    this.headlights.target.position.set(0, 0, -30);
    this.carRoot.add(this.headlights, this.headlights.target);
    // instrument glow so the cabin isn't a black hole at night
    this.cabinLight = new THREE.PointLight(0xc6d2ff, 0, 1.4, 1.5);
    this.cabinLight.position.set(0, 1.05, -0.45);
    this.carRoot.add(this.cabinLight);

    // ---- HUD
    this.hud = document.createElement('div');
    this.hud.className = 'hud hidden';
    root.appendChild(this.hud);
    this.shifter = new Shifter((g) => this.controls.push({ type: 'gear', gear: g }));
    this.controls.onGear = (g) => {
      this.car.requestGear(g);
    };
    this.controls.onPause = () => (this.state === 'playing' ? this.pause('user') : this.state === 'paused' && this.resume());

    if (this.touch) {
      this.touchUi = new TouchInput(this.controls);
      this.hud.appendChild(this.touchUi.el);
      const wrap = document.createElement('div');
      wrap.className = 'touch-shifter';
      wrap.appendChild(this.shifter.el);
      this.hud.appendChild(wrap);
    } else {
      this.desktop = new DesktopInput(this.controls);
      this.desktop.sensitivity = this.settings.mouseSensitivity;
      this.hud.appendChild(this.shifter.el);
      this.hints = document.createElement('div');
      this.hints.className = 'hints';
      this.hints.textContent = 'Click + drag to steer · ↑ / ↓ pedals · drag the gear knob into 1st · A / D indicate · Esc pause';
      this.hud.appendChild(this.hints);
    }
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'pause-btn no-steer';
    pauseBtn.type = 'button';
    pauseBtn.setAttribute('aria-label', 'Pause');
    pauseBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
    pauseBtn.addEventListener('click', () => this.pause('user'));
    this.hud.appendChild(pauseBtn);
    if (new URLSearchParams(location.search).has('debug')) {
      (window as unknown as { __game: Game }).__game = this; // for automated checks
      this.debug = document.createElement('div');
      this.debug.className = 'debug';
      this.hud.appendChild(this.debug);
    }

    this.screens = new Screens(root, this.settings, this.touch, {
      onStart: (mode) => void this.start(mode),
      onResume: () => this.resume(),
      onQuit: () => this.quit(),
      onSettings: (s) => this.applySettings(s),
    }, ROUTES);
    this.rotate = new RotatePrompt(document.body, this.touch);
    this.rotate.onChange((blocked) => {
      if (blocked && this.state === 'playing') this.pause('rotate');
      else if (!blocked && this.state === 'paused' && this.pauseReason === 'rotate') this.resume();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause('hidden');
    });
    onFullscreenChange((fs) => {
      if (!fs && this.enteredFullscreen && this.state === 'playing') this.pause('fullscreen');
    });

    this.buildWorld();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.screens.showMenu();

    new Loop(
      (dt) => this.step(dt),
      (a, dt) => this.render(a, dt),
    ).start();

    const q = new URLSearchParams(location.search);
    if (q.has('autostart')) void this.start(q.get('autostart') || ROUTES[0].id, true);
  }

  /** (Re)build everything that depends on which side the driver sits. */
  private buildWorld(): void {
    const ds = driverSide(this.settings);
    document.documentElement.style.setProperty('--ds', String(ds));
    if (this.cockpit) {
      this.carRoot.remove(this.cockpit.root, this.head.camera);
      this.cockpit.dispose();
    }
    this.cockpit = new Cockpit(ds);
    this.cockpit.mirrors.sideMirrors = this.settings.quality !== 'low';
    this.head = new HeadCamera(this.cockpit.eye, ds);
    this.carRoot.add(this.cockpit.root, this.head.camera);
    this.resize();

    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.route = ROUTES.find((r) => r.id === this.mode) ?? null;
    this.world = this.route ? new RouteWorld(this.route, ds, Number(new URLSearchParams(location.search).get('s')) || 30) : new TestLot(ds);
    this.scene.add(this.world.group);
    this.applyLook();
    this.car.speedCapKmh = this.world.speedCapKmh;
    this.cockpit.satnav.set(this.world.nav());
    if (this.state === 'menu') this.placeAtStart();
  }

  /** Time of day, weather and night-time lighting for the current level. */
  private applyLook(): void {
    const preset = PRESETS[this.route?.lighting ?? 'morning'] ?? PRESETS.morning;
    this.lighting.apply(preset);
    const night = preset.night;
    this.renderer.toneMappingExposure = preset.exposure;
    facadeUniforms.uNight.value = night;
    const m = worldMaterials();
    m.lamp.emissiveIntensity = 1 + night * 7;
    const wet = !!this.route?.rain;
    m.asphalt.roughness = wet ? 0.38 : 0.95;
    m.asphalt.metalness = wet ? 0.25 : 0;
    m.asphalt.color.setScalar(wet ? 0.7 : 1);
    this.rain.lines.visible = wet;
    this.headlights.intensity = night > 0.3 ? 22 * night : 0;
    this.cabinLight.intensity = night > 0.8 ? 0.5 : 0;
    if (this.world instanceof RouteWorld) this.world.night = night;
  }

  private placeAtStart(): void {
    const s = this.world.start();
    this.car.physics.place(s.x, s.z, s.heading);
    this.car.drivetrain.requestGear(0, 0);
    this.tripM = 0;
  }

  private async start(mode: Mode, skipFullscreen = false): Promise<void> {
    // fresh world (and traffic) every drive
    this.mode = mode;
    this.buildWorld();
    // all of these need the click's user gesture
    this.audio.init();
    this.audio.setVolume(this.settings.volume);
    if (!skipFullscreen) {
      this.enteredFullscreen = await enterFullscreen();
      await lockLandscape();
    }
    this.placeAtStart();
    this.controls.reset();
    this.screens.hideAll();
    this.hud.classList.remove('hidden');
    this.state = 'playing';
    this.desktop?.setEnabled(true);
    this.audio.setActive(true);
    if (this.hints) {
      this.hints.classList.remove('fade');
      setTimeout(() => this.hints?.classList.add('fade'), 12000);
    }
    if (this.rotate.blocked) this.pause('rotate');
  }

  private pause(reason: PauseReason): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pauseReason = reason;
    this.desktop?.setEnabled(false);
    this.controls.reset();
    this.audio.sfx?.horn(false);
    this.audio.setActive(false);
    this.screens.showPause();
  }

  private async resume(): Promise<void> {
    if (this.state !== 'paused' || this.rotate.blocked) return;
    if (this.enteredFullscreen && !isFullscreen()) await enterFullscreen();
    this.screens.hideAll();
    this.state = 'playing';
    // re-enable keyboard on the next tick so the Esc/P keyup doesn't immediately re-pause
    setTimeout(() => this.desktop?.setEnabled(true), 0);
    this.audio.setActive(true);
  }

  private quit(): void {
    this.state = 'menu';
    this.audio.sfx?.sirenAt(null);
    this.hud.classList.add('hidden');
    this.desktop?.setEnabled(false);
    this.audio.setActive(false);
    this.placeAtStart();
    this.screens.showMenu();
  }

  private applySettings(s: Settings): void {
    const sideChanged = driverSide(s) !== this.cockpit.ds;
    this.settings = s;
    saveSettings(s);
    this.quality.set(s.quality);
    this.cockpit.mirrors.sideMirrors = s.quality !== 'low';
    if (this.desktop) this.desktop.sensitivity = s.mouseSensitivity;
    this.audio.setVolume(s.volume);
    if (sideChanged) {
      this.buildWorld();
      this.placeAtStart();
    }
  }

  private step(dt: number): void {
    if (this.state !== 'playing') return;
    this.desktop?.update(dt);
    this.touchUi?.update(dt);
    const ev = this.car.step(dt, this.controls);
    const p = this.car.physics;
    this.tripM += Math.abs(p.v) * dt;

    // kerbs, barriers, traffic, the end of the road
    const wev = this.world.step(dt, this.car);
    const hit = wev.impact;
    if (hit > 0) {
      this.head.bump(Math.min(1, hit / 8) * 0.5);
      this.audio.sfx?.thud(Math.min(1, hit / 6));
    }
    for (const h of wev.honks) this.audio.sfx?.honk(h.pan, h.dist);
    this.audio.sfx?.sirenAt(wev.siren);
    if (wev.arrived && this.route && this.world.stats) {
      // journey's end: a postcard, never a score
      this.state = 'ended';
      this.desktop?.setEnabled(false);
      this.controls.reset();
      this.audio.sfx?.horn(false);
      this.audio.sfx?.sirenAt(null);
      this.hud.classList.add('hidden');
      recordJourney(this.route.id, this.world.stats.timeS);
      const i = ROUTES.indexOf(this.route);
      this.screens.showJourneyEnd(this.route, this.world.stats, ROUTES[i + 1] ?? null);
      return;
    }

    const sfx = this.audio.sfx;
    if (sfx) {
      if (ev.relay) sfx.relay(ev.relay);
      if (ev.grind) sfx.grind();
      sfx.horn(this.controls.horn);
    }
  }

  private render(alpha: number, dt: number): void {
    const p = this.car.physics;
    const d = this.car.drivetrain;
    const ind = this.car.indicators;
    this.carRoot.position.set(lerp(p.prevX, p.x, alpha), 0, lerp(p.prevZ, p.z, alpha));
    this.carRoot.rotation.y = lerp(p.prevHeading, p.heading, alpha);

    const playing = this.state === 'playing';
    this.head.update(dt, p, playing ? this.controls.glance : 0, d.lugging, d.rpm);
    this.cockpit.wheel.update(p.wheel, ind.state, dt);
    this.cockpit.gauges.update({
      speedKmh: this.car.speedKmh,
      rpm: this.state === 'menu' ? 0 : d.rpm,
      gear: gearLabel(d.gear),
      left: ind.leftLit,
      right: ind.rightLit,
      hazards: ind.hazards,
      limiter: d.limiter,
      tripKm: this.tripM / 1000,
    });
    this.cockpit.satnav.update(dt);
    this.shifter.update(d.gear, dt);
    this.touchUi?.showIndicators(ind.leftLit, ind.rightLit, ind.hazards);
    this.cockpit.setIndicators(ind.leftLit, ind.rightLit);
    if (playing) this.audio.engine?.update(d.rpm, d.load, d.lugging, d.limiter, Math.abs(p.v));

    this.world.update(this.carRoot.position.x, this.carRoot.position.z);
    // tunnels: dim the sky light and let the ambience boom
    this.shade = damp(this.shade, this.world.shade(), 3, dt);
    this.lighting.setShade(this.shade);
    this.audio.ambience?.set(playing ? 1 : 0, playing && this.route?.rain ? 1 : 0, this.shade);
    this.cockpit.updateWipers(dt, !!this.route?.rain && this.state !== 'menu');
    const cam = this.head.camera.getWorldPosition(this.camPos);
    this.rain.update(dt, cam.x, cam.y, cam.z);
    this.navTimer -= dt;
    if (this.navTimer <= 0) {
      this.navTimer = 0.25;
      this.cockpit.satnav.set(this.world.nav());
    }
    this.lighting.follow(this.carRoot.position.x, this.carRoot.position.z);
    this.cockpit.mirrors.render(this.renderer, this.scene);
    this.renderer.render(this.scene, this.head.camera);
    this.quality.frame(dt);

    if (this.debug) {
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = this.fpsFrames = 0;
      }
      this.debug.textContent = [
        `fps ${this.fps.toFixed(0)}  dpr ${this.quality.pixelRatio.toFixed(2)}`,
        `speed ${this.car.speedKmh.toFixed(1)} km/h  gear ${gearLabel(d.gear)}`,
        `rpm ${d.rpm.toFixed(0)}  clutch ${d.clutch.toFixed(2)}  lug ${d.lugging.toFixed(2)}`,
        `steer ${this.controls.steer.toFixed(2)}  wheel ${p.wheel.toFixed(2)}`,
        `thr ${this.controls.throttle.toFixed(2)}  brk ${this.controls.brake.toFixed(2)}`,
      ].join('\n');
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.head?.resize(w / h);
  }
}
