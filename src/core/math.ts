export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Move v toward target by at most maxStep. */
export const approach = (v: number, target: number, maxStep: number): number =>
  v < target ? Math.min(v + maxStep, target) : Math.max(v - maxStep, target);
/** Frame-rate independent exponential smoothing. */
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const KMH = 3.6;
export const DEG = Math.PI / 180;
