import { approach, clamp } from '../../core/math';
import type { Gear } from '../Controls';

/**
 * H-pattern gate, shared by mouse and touch.
 *
 *   1   3   5
 *   |   |   |
 *   +---N---+
 *   |   |   |
 *   2   4   R
 *
 * The knob is moved in small steps along the gate graph toward the pointer, so it can only change
 * column by travelling along the neutral rail. A gear engages past 80% of slot travel.
 */
const COLS = [-1, 0, 1] as const;
const POS: Record<string, [number, number]> = {
  '1': [-1, -1], '2': [-1, 1], '3': [0, -1], '4': [0, 1], '5': [1, -1], '-1': [1, 1], '0': [0, 0],
};
const ENGAGE = 0.8;
const SVGNS = 'http://www.w3.org/2000/svg';

function gearAt(x: number, y: number): Gear {
  if (Math.abs(y) < ENGAGE) return 0;
  const col = COLS.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best), 0 as number);
  if (Math.abs(col - x) > 0.05) return 0;
  const top = y < 0;
  if (col === -1) return top ? 1 : 2;
  if (col === 0) return top ? 3 : 4;
  return top ? 5 : -1;
}

export class Shifter {
  readonly el: HTMLDivElement;
  private readonly knob: SVGGElement;
  private readonly svg: SVGSVGElement;
  private x = 0;
  private y = 0;
  private pointerId = -1;
  private tx = 0;
  private ty = 0;
  /** Gear the widget is currently sitting in (what it last requested). */
  private gear: Gear = 0;

  constructor(private readonly onRequest: (g: Gear) => void) {
    this.el = document.createElement('div');
    this.el.className = 'shifter no-steer';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '-1.7 -1.7 3.4 3.4');
    svg.innerHTML = `
      <defs>
        <radialGradient id="knobGrad" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#5a5f66"/><stop offset="1" stop-color="#14161a"/>
        </radialGradient>
      </defs>
      <rect x="-1.6" y="-1.6" width="3.2" height="3.2" rx="0.45" class="plate"/>
      <path d="M-1 -1 V1 M0 -1 V1 M1 -1 V1 M-1 0 H1" class="gate-slot"/>
      <path d="M-1 -1 V1 M0 -1 V1 M1 -1 V1 M-1 0 H1" class="gate-inner"/>
      <g class="labels">
        <text x="-1" y="-1.3">1</text><text x="0" y="-1.3">3</text><text x="1" y="-1.3">5</text>
        <text x="-1" y="1.52">2</text><text x="0" y="1.52">4</text><text x="1" y="1.52" class="rev">R</text>
      </g>`;
    this.knob = document.createElementNS(SVGNS, 'g');
    this.knob.innerHTML = `<circle r="0.42" class="knob-shadow" cy="0.06"/><circle r="0.4" fill="url(#knobGrad)" class="knob"/><text class="knob-label" y="0.13">N</text>`;
    svg.appendChild(this.knob);
    this.svg = svg;
    this.el.appendChild(svg);

    svg.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== -1) return;
      e.preventDefault();
      e.stopPropagation();
      this.pointerId = e.pointerId;
      svg.setPointerCapture(e.pointerId);
      this.setTarget(e);
      this.el.classList.add('active');
    });
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this.setTarget(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = -1;
      this.el.classList.remove('active');
      this.release();
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    this.render();
  }

  get dragging(): boolean {
    return this.pointerId !== -1;
  }

  private setTarget(e: PointerEvent): void {
    const r = this.svg.getBoundingClientRect();
    this.tx = clamp(((e.clientX - r.left) / r.width) * 3.4 - 1.7, -1.3, 1.3);
    this.ty = clamp(((e.clientY - r.top) / r.height) * 3.4 - 1.7, -1.3, 1.3);
    this.follow();
  }

  /** Walk the knob along the gate toward (tx, ty). */
  private follow(): void {
    const step = 0.04;
    for (let i = 0; i < 80; i++) {
      const onRail = Math.abs(this.y) < 0.001;
      if (!onRail) {
        // in a slot: x is locked to its column; leave toward the rail if the target is in another column
        const col = Math.round(this.x);
        const leaving = Math.abs(this.tx - col) > 0.45;
        const goalY = leaving ? 0 : clamp(this.ty, -1, 1);
        if (Math.abs(this.y - goalY) < 1e-4) break;
        this.y = approach(this.y, goalY, step);
        if (Math.abs(this.y) < 0.001) this.y = 0;
        continue;
      }
      // on the neutral rail
      const wantSlot = Math.abs(this.ty) > 0.3;
      const tCol = COLS.reduce((b, c) => (Math.abs(c - this.tx) < Math.abs(b - this.tx) ? c : b), 0 as number);
      if (wantSlot) {
        if (Math.abs(this.x - tCol) > 1e-4) this.x = approach(this.x, tCol, step);
        else {
          this.x = tCol;
          this.y = approach(this.y, Math.sign(this.ty) * step, step);
        }
      } else {
        const gx = clamp(this.tx, -1, 1);
        if (Math.abs(this.x - gx) < 1e-4) break;
        this.x = approach(this.x, gx, step);
      }
    }
    this.checkGear();
    this.render();
  }

  private release(): void {
    if (Math.abs(this.y) >= ENGAGE - 0.15) {
      this.y = Math.sign(this.y);
      this.x = Math.round(this.x);
    } else {
      this.y = 0;
    }
    this.checkGear();
    this.render();
  }

  private checkGear(): void {
    const g = gearAt(this.x, this.y);
    if (g !== this.gear) {
      this.gear = g;
      this.onRequest(g);
    }
  }

  /** Keep the knob in step with the car's actual gear (keyboard shifts, refused shifts). */
  update(actual: Gear, dt: number): void {
    if (this.dragging) return;
    if (this.gear === actual && (actual !== 0 || Math.abs(this.y) < 1e-3)) {
      // idle in neutral: spring back to the 3/4 plane like a real gearbox
      if (actual === 0 && this.x !== 0) {
        this.x = approach(this.x, 0, dt * 6);
        this.render();
      }
      return;
    }
    const [gx, gy] = POS[String(actual)];
    // route via the rail: drop to y=0, slide x, then into the slot
    if (Math.abs(this.x - gx) > 1e-3 && Math.abs(this.y) > 1e-3) this.y = approach(this.y, 0, dt * 10);
    else if (Math.abs(this.x - gx) > 1e-3) this.x = approach(this.x, gx, dt * 10);
    else this.y = approach(this.y, gy, dt * 10);
    if (Math.abs(this.x - gx) < 1e-3 && Math.abs(this.y - gy) < 1e-3) this.gear = actual;
    this.render();
  }

  private render(): void {
    this.knob.setAttribute('transform', `translate(${this.x.toFixed(3)} ${this.y.toFixed(3)})`);
    const g = gearAt(this.x, this.y);
    const label = this.knob.querySelector('.knob-label');
    if (label) label.textContent = g === -1 ? 'R' : g === 0 ? 'N' : String(g);
  }
}
