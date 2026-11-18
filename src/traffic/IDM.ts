/** Intelligent Driver Model acceleration. gap = bumper-to-bumper distance (m). */
export function idm(v: number, v0: number, gap: number, vLead: number, a: number, b: number, T: number, s0 = 2): number {
  const free = 1 - Math.pow(Math.max(v, 0) / Math.max(v0, 0.1), 4);
  if (!isFinite(gap)) return a * free;
  const sStar = s0 + Math.max(0, v * T + (v * (v - vLead)) / (2 * Math.sqrt(a * b)));
  const g = Math.max(gap, 0.1);
  return a * (free - (sStar / g) * (sStar / g));
}
