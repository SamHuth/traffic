export type TrafficSide = 'left' | 'right';
export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  /** Which side of the road traffic drives on. 'left' = right-hand-drive car. */
  trafficSide: TrafficSide;
  quality: Quality;
  /** Desktop mouse steering sensitivity, 0.5–2. */
  mouseSensitivity: number;
  volume: number;
}

const KEY = 'iamtraffic.settings.v1';
const OLD_KEY = 'gridlock.settings.v1'; // pre-rename saves
const DEFAULTS: Settings = { trafficSide: 'left', quality: 'auto', mouseSensitivity: 1, volume: 0.8 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage blocked */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

/** +1 when the driver sits on the right (left-hand traffic), -1 otherwise. */
export const driverSide = (s: Settings): 1 | -1 => (s.trafficSide === 'left' ? 1 : -1);
