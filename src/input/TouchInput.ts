import { approach } from '../core/math';
import type { Controls } from './Controls';
import { Joystick } from './widgets/Joystick';
import { Pedals } from './widgets/Pedals';

/** Landscape phone layout: steering stick (left), pedals (right), stalk and glance buttons. */
export class TouchInput {
  readonly el: HTMLDivElement;
  readonly pedals = new Pedals();
  private readonly joy = new Joystick();
  private glanceL = false;
  private glanceR = false;
  private horn = false;
  private readonly indL: HTMLButtonElement;
  private readonly indR: HTMLButtonElement;
  private readonly haz: HTMLButtonElement;

  constructor(private readonly controls: Controls) {
    this.el = document.createElement('div');
    this.el.className = 'touch-ui';
    this.el.appendChild(this.joy.el);
    this.el.appendChild(this.pedals.el);

    const btn = (cls: string, html: string, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tbtn no-steer ${cls}`;
      b.innerHTML = html;
      b.setAttribute('aria-label', label);
      this.el.appendChild(b);
      return b;
    };
    const arrow = (d: string) => `<svg viewBox="0 0 24 24" width="26" height="26"><path d="${d}" fill="currentColor"/></svg>`;
    this.indL = btn('ind ind-l', arrow('M3 12 L12 4 V9 H21 V15 H12 V20 Z'), 'Left indicator');
    this.indR = btn('ind ind-r', arrow('M21 12 L12 4 V9 H3 V15 H12 V20 Z'), 'Right indicator');
    this.haz = btn('haz', arrow('M12 3 L22 20 H2 Z M12 8 L6.5 17.5 H17.5 Z'), 'Hazard lights');
    const hornBtn = btn('horn', 'HORN', 'Horn');
    const gl = btn('glance glance-l', '‹', 'Look left');
    const gr = btn('glance glance-r', '›', 'Look right');

    const tap = (b: HTMLButtonElement, fn: () => void) =>
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
      });
    tap(this.indL, () => controls.push({ type: 'indicator', dir: 'left' }));
    tap(this.indR, () => controls.push({ type: 'indicator', dir: 'right' }));
    tap(this.haz, () => controls.push({ type: 'hazards' }));
    const hold = (b: HTMLButtonElement, set: (v: boolean) => void) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        set(true);
      });
      const off = () => set(false);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
    };
    hold(hornBtn, (v) => (this.horn = v));
    hold(gl, (v) => (this.glanceL = v));
    hold(gr, (v) => (this.glanceR = v));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update(dt: number): void {
    const c = this.controls;
    const p = this.pedals;
    c.throttle = approach(c.throttle, p.throttle, dt * (p.throttle > c.throttle ? 3.5 : 6));
    c.brake = approach(c.brake, p.brake, dt * (p.brake > c.brake ? 4 : 8));
    c.steer = this.joy.value;
    c.horn = this.horn;
    c.glance = (this.glanceR ? 1 : 0) - (this.glanceL ? 1 : 0);
    p.show(c.throttle, c.brake);
  }

  /** Light the stalk buttons in time with the dashboard arrows. */
  showIndicators(left: boolean, right: boolean, hazards: boolean): void {
    this.indL.classList.toggle('lit', left);
    this.indR.classList.toggle('lit', right);
    this.haz.classList.toggle('on', hazards);
  }
}
