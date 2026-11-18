import { isPortrait } from './device';

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

/** Only Android Chrome (in fullscreen) honours this; everywhere else the rotate prompt covers it. */
export async function lockLandscape(): Promise<void> {
  try {
    await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape');
  } catch {
    /* unsupported */
  }
}

/** Full-screen "rotate your phone" overlay shown on touch devices while in portrait. */
export class RotatePrompt {
  readonly el: HTMLDivElement;
  private listeners: ((blocked: boolean) => void)[] = [];

  constructor(parent: HTMLElement, private readonly enabled: boolean) {
    this.el = document.createElement('div');
    this.el.className = 'rotate-prompt';
    this.el.innerHTML = `
      <svg viewBox="0 0 100 100" width="96" height="96" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <rect class="phone" x="34" y="18" width="32" height="56" rx="5"/>
        <path d="M22 70 a32 32 0 0 0 24 18" /><path d="M42 82 l4 6 -7 3" />
      </svg>
      <p>Rotate your phone to landscape</p>`;
    parent.appendChild(this.el);
    const check = () => this.update();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    this.update();
  }

  get blocked(): boolean {
    return this.enabled && isPortrait();
  }

  onChange(cb: (blocked: boolean) => void): void {
    this.listeners.push(cb);
  }

  private update(): void {
    const b = this.blocked;
    this.el.classList.toggle('show', b);
    for (const l of this.listeners) l(b);
  }
}
