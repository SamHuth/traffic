import type { RouteDef } from '../levels/RouteDef';
import type { JourneyStats } from '../world/World';
import { fmtTime, loadProgress } from './progress';
import type { Quality, Settings } from './settings';

const TIME_OF_DAY: Record<string, string> = { morning: 'Morning', midday: 'Midday', overcast: 'Overcast', dusk: 'Dusk', night: 'Night' };

export interface ScreenHandlers {
  /** A level id, or 'lot' for the test lot. */
  onStart: (mode: string) => void;
  onResume: () => void;
  onQuit: () => void;
  onSettings: (s: Settings) => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
};

const DESKTOP_HELP = `
  <div><kbd>Click + drag</kbd><span>Grab the wheel and steer (let go to centre)</span></div>
  <div><kbd>↑</kbd><kbd>W</kbd><span>Accelerate</span></div>
  <div><kbd>↓</kbd><kbd>S</kbd><span>Brake</span></div>
  <div><kbd>Drag knob</kbd><span>Change gear (or 1–5, R, N)</span></div>
  <div><kbd>A</kbd><kbd>D</kbd><span>Indicators</span></div>
  <div><kbd>Q</kbd><kbd>E</kbd><span>Look left / right</span></div>
  <div><kbd>X</kbd><span>Hazards</span><kbd>Space</kbd><span>Horn</span></div>`;
const TOUCH_HELP = `
  <div><kbd>Left thumb</kbd><span>Steer</span></div>
  <div><kbd>Pedals</kbd><span>Hold to accelerate / brake</span></div>
  <div><kbd>Gear knob</kbd><span>Drag through the gate</span></div>
  <div><kbd>◀ ▶</kbd><span>Indicators</span><kbd>‹ ›</kbd><span>Look</span></div>`;

/** Main menu, pause overlay and a shared settings sheet. */
export class Screens {
  private readonly menu: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly settingsSheet: HTMLDivElement;
  private readonly journey: HTMLDivElement;

  constructor(parent: HTMLElement, private settings: Settings, touch: boolean, private readonly h: ScreenHandlers, private readonly routes: RouteDef[]) {
    this.menu = el('div', 'screen menu', `
      <div class="menu-card wide">
        <p class="eyebrow">A slow drive through a busy city</p>
        <h1 class="logo">I AM TRAFFIC</h1>
        <p class="tag">No rush. Nowhere to be. Just you, the radio, and lanes that never quite move together.</p>
        <div class="levels"></div>
        <div class="menu-actions">
          <button class="btn ghost" data-act="start" data-id="lot">Test lot</button>
          <button class="btn ghost" data-act="settings">Settings</button>
        </div>
      </div>
      <div class="help">${touch ? TOUCH_HELP : DESKTOP_HELP}</div>`);
    this.journey = el('div', 'screen journey', '');
    this.pause = el('div', 'screen pause', `
      <div class="menu-card small">
        <h2>Paused</h2>
        <div class="menu-actions col">
          <button class="btn primary" data-act="resume">Resume</button>
          <button class="btn" data-act="settings">Settings</button>
          <button class="btn ghost" data-act="quit">Main menu</button>
        </div>
      </div>`);
    this.settingsSheet = el('div', 'screen settings', this.settingsHtml(touch));
    parent.append(this.menu, this.pause, this.settingsSheet, this.journey);

    const wire = (root: HTMLElement) =>
      root.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
        const act = btn?.dataset.act;
        if (act === 'start') h.onStart(btn!.dataset.id!);
        else if (act === 'resume') h.onResume();
        else if (act === 'quit') h.onQuit();
        else if (act === 'settings') this.settingsSheet.classList.add('show');
        else if (act === 'close') this.settingsSheet.classList.remove('show');
      });
    wire(this.menu);
    wire(this.pause);
    wire(this.settingsSheet);
    wire(this.journey);
    this.bindSettings();
  }

  private settingsHtml(touch: boolean): string {
    const s = this.settings;
    const seg = (name: string, opts: [string, string][], val: string) =>
      `<div class="seg" data-name="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === val ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    return `
      <div class="menu-card sheet">
        <h2>Settings</h2>
        <label class="row"><span>Traffic drives on the</span>${seg('trafficSide', [['left', 'Left'], ['right', 'Right']], s.trafficSide)}</label>
        <label class="row"><span>Graphics</span>${seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']], s.quality)}</label>
        ${touch ? '' : `<label class="row"><span>Steering sensitivity</span><input type="range" min="0.5" max="2" step="0.05" name="mouseSensitivity" value="${s.mouseSensitivity}"></label>`}
        <label class="row"><span>Volume</span><input type="range" min="0" max="1" step="0.05" name="volume" value="${s.volume}"></label>
        <div class="menu-actions"><button class="btn primary" data-act="close">Done</button></div>
      </div>`;
  }

  private bindSettings(): void {
    const root = this.settingsSheet;
    root.querySelectorAll<HTMLDivElement>('.seg').forEach((seg) =>
      seg.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
        if (!b) return;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        const name = seg.dataset.name!;
        if (name === 'trafficSide') this.settings.trafficSide = b.dataset.v as Settings['trafficSide'];
        if (name === 'quality') this.settings.quality = b.dataset.v as Quality;
        this.h.onSettings(this.settings);
      }),
    );
    root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const v = Number(inp.value);
        if (inp.name === 'volume') this.settings.volume = v;
        if (inp.name === 'mouseSensitivity') this.settings.mouseSensitivity = v;
        this.h.onSettings(this.settings);
      }),
    );
  }

  showMenu(): void {
    const prog = loadProgress();
    const list = this.menu.querySelector('.levels')!;
    list.innerHTML = this.routes
      .map((r, i) => {
        const done = prog.completed.includes(r.id);
        const best = prog.best[r.id];
        return `<button class="level" data-act="start" data-id="${r.id}">
          <span class="num">${i + 1}</span>
          <span class="info"><b>${r.name}</b><small>${r.blurb}</small></span>
          <span class="meta">${TIME_OF_DAY[r.lighting] ?? ''}${r.rain ? ' · Rain' : ''}${done ? `<em>✓ ${best ? fmtTime(best) : ''}</em>` : ''}</span>
        </button>`;
      })
      .join('');
    this.menu.classList.add('show');
    this.pause.classList.remove('show');
    this.journey.classList.remove('show');
  }

  /** The end-of-journey postcard. Stats only, never a score. */
  showJourneyEnd(route: RouteDef, st: JourneyStats, next: RouteDef | null): void {
    const pct = st.laneChanges ? Math.round((st.signalled / st.laneChanges) * 100) : 100;
    const line =
      st.bumps === 0 && pct >= 80 ? 'A tidy drive. Your driving instructor would be proud.' :
      st.bumps > 3 ? 'A few scrapes along the way. Maybe call the insurer.' :
      pct < 50 ? 'Indicators are free, you know.' : 'Made it. That is all anyone can ask on a day like this.';
    this.journey.innerHTML = `
      <div class="menu-card postcard">
        <p class="eyebrow">You have arrived</p>
        <h2>${route.name}</h2>
        <p class="tag">${line}</p>
        <div class="stats">
          <div><b>${fmtTime(st.timeS)}</b><span>journey time</span></div>
          <div><b>${(st.distanceM / 1000).toFixed(2)} km</b><span>distance</span></div>
          <div><b>${st.laneChanges}</b><span>lane changes</span></div>
          <div><b>${pct}%</b><span>signalled</span></div>
          <div><b>${st.letIn}</b><span>cars let in</span></div>
          <div><b>${st.bumps}</b><span>bumps</span></div>
        </div>
        <div class="menu-actions">
          ${next ? `<button class="btn primary" data-act="start" data-id="${next.id}">Next: ${next.name}</button>` : ''}
          <button class="btn" data-act="start" data-id="${route.id}">Drive again</button>
          <button class="btn ghost" data-act="quit">Main menu</button>
        </div>
      </div>`;
    this.journey.classList.add('show');
  }

  showPause(): void {
    this.pause.classList.add('show');
    this.menu.classList.remove('show');
  }

  hideAll(): void {
    this.journey.classList.remove('show');
    this.menu.classList.remove('show');
    this.pause.classList.remove('show');
    this.settingsSheet.classList.remove('show');
  }
}
