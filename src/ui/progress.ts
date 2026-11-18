export interface Progress {
  completed: string[];
  /** Best journey time per level, seconds. */
  best: Record<string, number>;
}

const KEY = 'iamtraffic.progress.v1';
const OLD_KEY = 'gridlock.progress.v1'; // pre-rename saves

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (raw) return { completed: [], best: {}, ...(JSON.parse(raw) as Partial<Progress>) };
  } catch {
    /* storage blocked */
  }
  return { completed: [], best: {} };
}

export function recordJourney(id: string, seconds: number): Progress {
  const p = loadProgress();
  if (!p.completed.includes(id)) p.completed.push(id);
  p.best[id] = Math.min(p.best[id] ?? Infinity, seconds);
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
  return p;
}

export const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
