import * as THREE from 'three';

export interface GaugeState {
  speedKmh: number;
  rpm: number;
  gear: string;
  left: boolean;
  right: boolean;
  hazards: boolean;
  limiter: boolean;
  tripKm: number;
}

const W = 768;
const H = 288;
const START = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;

/** Instrument cluster drawn to a CanvasTexture; redrawn only when something visible changes. */
export class Gauges {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private lastKey = '';

  constructor() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    this.ctx = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  update(s: GaugeState): void {
    const key = [
      Math.round(s.speedKmh * 2), Math.round(s.rpm / 25), s.gear, s.left, s.right, s.hazards, s.limiter, Math.floor(s.tripKm * 10),
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.draw(s);
    this.texture.needsUpdate = true;
  }

  private dial(cx: number, cy: number, r: number, max: number, major: number, minor: number, labelEvery: number, labelDiv: number, red: number | null, value: number, unit: string): void {
    const g = this.ctx;
    g.save();
    g.translate(cx, cy);
    // face
    const face = g.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
    face.addColorStop(0, '#1d2127');
    face.addColorStop(1, '#0a0b0d');
    g.fillStyle = face;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3c4048';
    g.lineWidth = 4;
    g.stroke();
    if (red !== null) {
      g.strokeStyle = '#c0262b';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(0, 0, r - 12, START + (red / max) * SWEEP, START + SWEEP);
      g.stroke();
    }
    for (let v = 0; v <= max + 1e-6; v += minor) {
      const a = START + (v / max) * SWEEP;
      const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      const r0 = r - (isMajor ? 26 : 16);
      g.strokeStyle = isMajor ? '#e8ecf0' : '#8a9099';
      g.lineWidth = isMajor ? 4 : 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * (r - 7), Math.sin(a) * (r - 7));
      g.stroke();
      if (Math.abs(v / labelEvery - Math.round(v / labelEvery)) < 1e-6) {
        g.fillStyle = '#d9dee4';
        g.font = '600 22px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(Math.round(v / labelDiv)), Math.cos(a) * (r - 46), Math.sin(a) * (r - 46));
      }
    }
    g.fillStyle = '#7d848d';
    g.font = '500 16px system-ui, sans-serif';
    g.fillText(unit, 0, r * 0.42);
    // needle
    const a = START + (Math.min(value, max * 1.04) / max) * SWEEP;
    g.rotate(a);
    g.fillStyle = '#ff6a2a';
    g.shadowColor = 'rgba(255,110,40,0.7)';
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(-14, -4);
    g.lineTo(r - 18, -1.5);
    g.lineTo(r - 18, 1.5);
    g.lineTo(-14, 4);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#2a2e35';
    g.beginPath();
    g.arc(0, 0, 13, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private arrow(cx: number, cy: number, dir: -1 | 1, lit: boolean): void {
    const g = this.ctx;
    g.save();
    g.translate(cx, cy);
    g.scale(-dir * 1.75, 1.75); // the path points left; dir +1 flips it to point right
    g.beginPath();
    g.moveTo(-22, 0);
    g.lineTo(0, -18);
    g.lineTo(0, -8);
    g.lineTo(20, -8);
    g.lineTo(20, 8);
    g.lineTo(0, 8);
    g.lineTo(0, 18);
    g.closePath();
    g.fillStyle = lit ? '#3cf26a' : '#0a0d0b'; // off: just a faint outline
    if (lit) {
      g.shadowColor = '#3cf26a';
      g.shadowBlur = 18;
    }
    g.fill();
    g.restore();
  }

  private draw(s: GaugeState): void {
    const g = this.ctx;
    g.fillStyle = '#050607';
    g.fillRect(0, 0, W, H);
    this.dial(132, 150, 118, 100, 10, 5, 20, 1, null, s.speedKmh, 'km/h');
    this.dial(W - 132, 150, 118, 7000, 1000, 500, 1000, 1000, 6000, s.rpm, '×1000 rpm');
    // centre column: gear readout flanked by the indicator arrows (mid-height, where the
    // driver can actually see them through the wheel)
    this.arrow(W / 2 - 86, 146, -1, s.left);
    this.arrow(W / 2 + 86, 146, 1, s.right);
    if (s.hazards) {
      g.strokeStyle = '#ff3b30';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(W / 2 - 62, 224);
      g.lineTo(W / 2 - 49, 248);
      g.lineTo(W / 2 - 75, 248);
      g.closePath();
      g.stroke();
    }
    g.fillStyle = '#10141a';
    g.fillRect(W / 2 - 44, 84, 88, 124);
    g.strokeStyle = '#2a3038';
    g.lineWidth = 2;
    g.strokeRect(W / 2 - 44, 84, 88, 124);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = s.gear === 'R' ? '#ffb340' : '#e9f1ff';
    g.font = '700 80px system-ui, sans-serif';
    g.fillText(s.gear, W / 2, 154);
    g.fillStyle = s.limiter ? '#ff4a3a' : '#5f6874';
    g.font = '600 15px system-ui, sans-serif';
    g.fillText(s.limiter ? 'SHIFT UP' : 'GEAR', W / 2, 100);
    g.fillStyle = '#8fd3ff';
    g.font = '600 26px ui-monospace, Menlo, monospace';
    g.fillText(`${Math.round(s.speedKmh)}`, W / 2, 236);
    g.fillStyle = '#5f6874';
    g.font = '500 14px system-ui, sans-serif';
    g.fillText(`TRIP ${s.tripKm.toFixed(1)} km`, W / 2, 266);
  }
}
