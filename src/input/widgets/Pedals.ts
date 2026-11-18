import { clamp } from '../../core/math';

const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * Footwell cut-out with a wide brake and a tall accelerator. Pressing higher up a pedal gives more
 * input (like pushing harder with your toes); the controls ramp toward that target.
 */
export class Pedals {
  readonly el: HTMLDivElement;
  brake = 0;
  throttle = 0;
  private readonly brakeEl: SVGGElement;
  private readonly accelEl: SVGGElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'pedals no-steer';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 220 170');
    svg.innerHTML = `
      <defs>
        <linearGradient id="wellGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0b0c0e"/><stop offset="1" stop-color="#22252a"/>
        </linearGradient>
        <pattern id="tread" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#2c2f35"/><rect width="8" height="3" fill="#3b3f46"/>
        </pattern>
      </defs>
      <path d="M8 22 Q8 6 24 6 H196 Q212 6 212 22 V160 H8 Z" fill="url(#wellGrad)" class="well"/>
      <path d="M8 150 H212" stroke="#3a2e22" stroke-width="16" opacity="0.6"/>`;
    this.brakeEl = this.pedal(svg, 'brake', 22, 62, 96, 70, 'BRAKE');
    this.accelEl = this.pedal(svg, 'accel', 144, 22, 54, 118, 'GO');
    this.el.appendChild(svg);
  }

  private pedal(svg: SVGSVGElement, kind: 'brake' | 'accel', x: number, y: number, w: number, h: number, label: string): SVGGElement {
    const g = document.createElementNS(SVGNS, 'g');
    g.classList.add('pedal', kind);
    g.innerHTML = `
      <rect class="arm" x="${x + w / 2 - 5}" y="0" width="10" height="${y + 8}" fill="#1a1c20"/>
      <g class="pad"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="url(#tread)" stroke="#55595f" stroke-width="2.5"/>
      <text x="${x + w / 2}" y="${y + h / 2 + 5}">${label}</text></g>
      <rect class="hit" x="${x - 10}" y="${y - 14}" width="${w + 20}" height="${h + 22}" fill="transparent"/>`;
    svg.appendChild(g);
    const top = y;
    let pid = -1;
    const set = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const py = ((e.clientY - r.top) / r.height) * 170;
      const v = clamp(1 - (py - top) / h, 0, 1);
      const value = 0.45 + 0.55 * v; // anywhere on the pad is at least ~half
      if (kind === 'brake') this.brake = value;
      else this.throttle = value;
    };
    g.addEventListener('pointerdown', (e) => {
      if (pid !== -1) return;
      e.preventDefault();
      e.stopPropagation();
      pid = e.pointerId;
      g.setPointerCapture(e.pointerId);
      set(e);
    });
    g.addEventListener('pointermove', (e) => {
      if (e.pointerId === pid) set(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      if (kind === 'brake') this.brake = 0;
      else this.throttle = 0;
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    return g;
  }

  /** Visual press depth from the ramped control values. */
  show(throttle: number, brake: number): void {
    const press = (el: SVGGElement, v: number) => {
      const pad = el.querySelector('.pad') as SVGGElement;
      pad.style.transform = `translateY(${(v * 10).toFixed(1)}px) scaleY(${(1 - v * 0.12).toFixed(3)})`;
      el.classList.toggle('down', v > 0.02);
    };
    press(this.accelEl, throttle);
    press(this.brakeEl, brake);
  }
}
