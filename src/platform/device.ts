/** True on phones/tablets (coarse primary pointer). `?touch` / `?desktop` force a mode for testing. */
export function isTouchDevice(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('touch')) return true;
  if (q.has('desktop')) return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 && !window.matchMedia('(pointer: fine)').matches;
}

export const isPortrait = (): boolean => window.innerHeight > window.innerWidth;
