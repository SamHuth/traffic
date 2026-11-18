import * as THREE from 'three';

export interface NavInfo {
  title: string;
  /** 0–1 along the route, or null for free drive. */
  progress: number | null;
  distanceLeftM: number | null;
  speedLimit: number;
  ticker: string;
}

const W = 512;
const H = 300;

/** Centre-console screen: route progress + a scrolling "radio" ticker for traffic reports. */
export class SatNav {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private info: NavInfo = { title: 'FREE DRIVE', progress: null, distanceLeftM: null, speedLimit: 40, ticker: '' };
  private scroll = 0;
  private acc = 0;

  constructor() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    this.ctx = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw();
  }

  set(info: Partial<NavInfo>): void {
    this.info = { ...this.info, ...info };
    this.draw();
  }

  update(dt: number): void {
    this.scroll += dt * 46;
    this.acc += dt;
    if (this.acc < 1 / 15) return; // the ticker only needs ~15 fps
    this.acc = 0;
    this.draw();
  }

  private draw(): void {
    const g = this.ctx;
    const i = this.info;
    g.fillStyle = '#0b1118';
    g.fillRect(0, 0, W, H);
    // header
    g.fillStyle = '#152230';
    g.fillRect(0, 0, W, 44);
    g.fillStyle = '#9fc3e6';
    g.font = '600 20px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(i.title, 16, 23);
    const now = new Date();
    g.textAlign = 'right';
    g.fillText(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`, W - 16, 23);

    // route strip
    g.textAlign = 'left';
    const y = 128;
    g.strokeStyle = '#26394c';
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(40, y);
    g.lineTo(W - 120, y);
    g.stroke();
    if (i.progress !== null) {
      g.strokeStyle = '#3d9cff';
      g.beginPath();
      g.moveTo(40, y);
      g.lineTo(40 + (W - 160) * i.progress, y);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(40 + (W - 160) * i.progress, y, 11, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#9fb3c8';
    g.font = '500 22px system-ui, sans-serif';
    g.fillText(i.distanceLeftM === null ? 'No destination set' : `${(i.distanceLeftM / 1000).toFixed(1)} km to go`, 40, y + 46);

    // speed limit roundel
    const cx = W - 62;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(cx, y, 40, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d0202a';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(cx, y, 35, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#111';
    g.font = '700 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(i.speedLimit), cx, y + 2);

    // radio ticker
    g.fillStyle = '#101a24';
    g.fillRect(0, H - 62, W, 62);
    g.fillStyle = '#ffb347';
    g.font = '700 15px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText('FM 98.1', 14, H - 31);
    if (i.ticker) {
      g.save();
      g.beginPath();
      g.rect(92, H - 62, W - 92, 62);
      g.clip();
      g.fillStyle = '#e8eef5';
      g.font = '500 21px system-ui, sans-serif';
      const text = `${i.ticker}     •     `;
      const tw = g.measureText(text).width;
      const off = this.scroll % tw;
      for (let x = 100 - off; x < W; x += tw) g.fillText(text, x, H - 31);
      g.restore();
    }
  }
}
