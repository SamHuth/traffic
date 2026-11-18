// Adapted from slop-footy's Fullscreen.ts: entered from the Start button rather than a toggle.
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = document as FsDocument;

export const isFullscreen = (): boolean => !!(document.fullscreenElement || doc.webkitFullscreenElement);

/** Must be called from a user gesture. Resolves false if the browser refuses (e.g. iPhone Safari). */
export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) return true;
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  try {
    await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
  } catch {
    /* ignore */
  }
}

export function onFullscreenChange(cb: (fs: boolean) => void): void {
  const fire = () => cb(isFullscreen());
  document.addEventListener('fullscreenchange', fire);
  document.addEventListener('webkitfullscreenchange', fire);
}
