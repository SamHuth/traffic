// Adapted from slop-footy/src/render/Quality.ts.
import type * as THREE from 'three';
import type { Quality } from '../ui/settings';

/**
 * Render quality. Cost scales with pixel count, i.e. pixelRatio², so the pixel ratio is the main lever:
 * high = up to 2 (retina-sharp), medium = up to 1.5, low = 1 with no shadows.
 * 'auto' starts at medium and steps the pixel ratio down (then drops shadows) if frames run long,
 * and back up when there's headroom.
 */
const CAPS: Record<Exclude<Quality, 'auto'>, { dpr: number; shadows: boolean }> = {
  high: { dpr: 2, shadows: true },
  medium: { dpr: 1.5, shadows: true },
  low: { dpr: 1, shadows: false },
};
const WINDOW = 2; // seconds of frames per decision
const SLOW = 1 / 45; // average frame longer than this → step down
const FAST = 1 / 57; // shorter than this (i.e. hitting vsync) for a few windows → step up
const STEP = 0.25;
const MIN_DPR = 0.75;

export class QualityManager {
  private mode: Quality = 'auto';
  private dpr = 1;
  private shadows = true;
  private sum = 0;
  private frames = 0;
  private elapsed = 0;
  private fastWindows = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly sun: THREE.DirectionalLight,
  ) {}

  get pixelRatio(): number {
    return this.dpr;
  }

  set(mode: Quality): void {
    this.mode = mode;
    const cap = CAPS[mode === 'auto' ? 'medium' : mode];
    this.apply(Math.min(window.devicePixelRatio || 1, cap.dpr), cap.shadows);
    this.sum = this.frames = this.elapsed = this.fastWindows = 0;
  }

  private apply(dpr: number, shadows: boolean): void {
    this.dpr = dpr;
    this.shadows = shadows;
    this.renderer.setPixelRatio(dpr);
    this.sun.castShadow = shadows;
  }

  /** Feed every frame's real dt (only matters in auto). */
  frame(dt: number): void {
    if (this.mode !== 'auto' || dt <= 0 || dt > 0.25) return; // ignore tab-switch hitches
    this.sum += dt;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < WINDOW) return;
    const avg = this.sum / this.frames;
    this.sum = this.frames = this.elapsed = 0;
    const ceiling = Math.min(window.devicePixelRatio || 1, CAPS.medium.dpr);
    if (avg > SLOW) {
      this.fastWindows = 0;
      if (this.dpr > MIN_DPR) this.apply(Math.max(MIN_DPR, this.dpr - STEP), this.shadows);
      else if (this.shadows) this.apply(this.dpr, false);
    } else if (avg < FAST && ++this.fastWindows >= 3) {
      this.fastWindows = 0;
      if (!this.shadows) this.apply(this.dpr, true);
      else if (this.dpr < ceiling) this.apply(Math.min(ceiling, this.dpr + STEP), true);
    }
  }
}
