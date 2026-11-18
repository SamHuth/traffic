import { approach, clamp } from '../core/math';
import type { Controls, Gear } from './Controls';

const GEAR_KEYS: Record<string, Gear> = {
  Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, KeyR: -1, KeyN: 0, Digit0: 0,
};

/**
 * Click and drag anywhere on the view to grab the wheel; drag left/right to turn it. Let go and the
 * wheel self-centres, like taking your hands off a real one. Up/Down (or W/S) are the pedals,
 * ramped for an analog feel. Because steering only happens while the button is held on the view,
 * using the gear shifter never turns the wheel.
 */
export class DesktopInput {
  private keys = new Set<string>();
  private mouseSteer = 0;
  private grabbing = false;
  private grabX = 0;
  private grabSteer = 0;
  private enabled = false;
  sensitivity = 1;

  constructor(private readonly controls: Controls) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyA':
        case 'Comma':
          controls.push({ type: 'indicator', dir: 'left' });
          break;
        case 'KeyD':
        case 'Period':
          controls.push({ type: 'indicator', dir: 'right' });
          break;
        case 'KeyX':
          controls.push({ type: 'hazards' });
          break;
        case 'Escape':
        case 'KeyP':
          controls.push({ type: 'pause' });
          break;
        default:
          if (e.code in GEAR_KEYS) controls.push({ type: 'gear', gear: GEAR_KEYS[e.code] });
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!(e.target instanceof HTMLCanvasElement)) return; // shifter, buttons, menus
      this.grabbing = true;
      this.grabX = e.clientX;
      this.grabSteer = this.mouseSteer;
      document.body.classList.add('grabbing');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.grabbing) return;
      const dx = (e.clientX - this.grabX) / (window.innerWidth * 0.4);
      this.mouseSteer = clamp(this.grabSteer + dx * this.sensitivity, -1, 1);
    });
    const release = () => {
      this.grabbing = false;
      document.body.classList.remove('grabbing');
    };
    window.addEventListener('mouseup', release);
    window.addEventListener('blur', release);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.keys.clear();
      this.grabbing = false;
      this.mouseSteer = 0;
      document.body.classList.remove('grabbing');
    }
    document.body.classList.toggle('can-grab', on);
  }

  update(dt: number): void {
    const c = this.controls;
    const up = this.keys.has('ArrowUp') || this.keys.has('KeyW');
    const down = this.keys.has('ArrowDown') || this.keys.has('KeyS');
    c.throttle = approach(c.throttle, up ? 1 : 0, dt * (up ? 3.5 : 6));
    c.brake = approach(c.brake, down ? 1 : 0, dt * (down ? 3 : 8));
    // hands off: the castor angle brings the wheel back to centre
    if (!this.grabbing) this.mouseSteer = approach(this.mouseSteer, 0, dt * 1.6);
    c.steer = this.mouseSteer;
    c.horn = this.keys.has('Space') || this.keys.has('KeyH');
    c.glance = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
  }
}
