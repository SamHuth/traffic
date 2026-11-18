import { clamp } from '../../core/math';

/** Floating thumbstick: appears under the thumb anywhere in its zone. Only X is used (steering). */
export class Joystick {
  readonly el: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId = -1;
  private ox = 0;
  private oy = 0;
  /** -1 … 1 */
  value = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'joy-zone';
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    this.el.appendChild(this.base);

    this.el.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== -1) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      const r = this.el.getBoundingClientRect();
      this.ox = e.clientX - r.left;
      this.oy = e.clientY - r.top;
      this.base.style.left = `${this.ox}px`;
      this.base.style.top = `${this.oy}px`;
      this.base.classList.add('active');
      this.move(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.move(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = -1;
      this.value = 0;
      this.base.classList.remove('active');
      this.base.style.left = '';
      this.base.style.top = '';
      this.knob.style.transform = '';
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  private move(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    const radius = this.base.offsetWidth / 2;
    const dx = clamp(e.clientX - r.left - this.ox, -radius, radius);
    const dy = clamp(e.clientY - r.top - this.oy, -radius * 0.35, radius * 0.35);
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const raw = dx / radius;
    const dead = 0.06;
    const mag = Math.max(0, (Math.abs(raw) - dead) / (1 - dead));
    // mild expo: fine control near centre, full lock at the edge
    this.value = Math.sign(raw) * (0.45 * mag + 0.55 * mag * mag);
  }
}
