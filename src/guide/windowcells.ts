import { GuideCell, drawGuideHand, handPoints } from './cell';
import { POINT } from './poses';
import type { State } from './timeline';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const BOKEH: [number, number, number, string][] = [
  [0.15, 0.3, 0.16, '255,184,107'], [0.35, 0.2, 0.12, '255,90,74'], [0.6, 0.28, 0.18, '255,208,138'], [0.82, 0.22, 0.12, '106,200,255'],
  [0.5, 0.52, 0.14, '255,122,90'], [0.25, 0.68, 0.2, '255,196,107'], [0.75, 0.64, 0.16, '255,74,106'], [0.9, 0.78, 0.12, '255,208,138'],
];

function badge(cell: GuideCell, text: string) {
  const b = document.createElement('span');
  b.className = 'guide-badge';
  b.textContent = text;
  cell.frame.append(b);
}

/** A tiny fogged window: bokeh lights behind a milky haze with clear strokes cut through it. */
function foggedTile() {
  let fog: HTMLCanvasElement | null = null;
  return (g: CanvasRenderingContext2D, w: number, h: number, cut: (f: CanvasRenderingContext2D) => void) => {
    g.fillStyle = '#070b14';
    g.fillRect(0, 0, w, h);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r, c] of BOKEH) {
      const grad = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * h);
      grad.addColorStop(0, `rgba(${c},0.95)`);
      grad.addColorStop(0.25, `rgba(${c},0.8)`);
      grad.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
    g.restore();
    if (!fog || fog.width !== Math.round(w) || fog.height !== Math.round(h)) {
      fog = document.createElement('canvas');
      fog.width = Math.round(w);
      fog.height = Math.round(h);
    }
    const f = fog.getContext('2d')!;
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, w, h);
    f.fillStyle = 'rgba(196,208,224,0.78)';
    f.fillRect(0, 0, w, h);
    f.globalCompositeOperation = 'destination-out';
    f.lineCap = 'round';
    f.lineJoin = 'round';
    cut(f);
    g.drawImage(fog, 0, 0);
  };
}

const still = (x: number, y: number, extra: Partial<State> = {}): State => ({ x, y, rotation: 0, scale: 1, blend: 0, v: 0, alpha: 1, ...extra });

export function createWindowCells(): GuideCell[] {
  const orange = css('--orange', '#c84a12');

  // 1. Open hand: a wide wipe that slowly fogs over again.
  const D1 = 4.5;
  const wave = (s: number) => ({ x: 0.2 + 0.6 * s, y: 0.52 + 0.16 * Math.sin(s * Math.PI * 2) });
  const tile1 = foggedTile();
  const wipe = new GuideCell({
    duration: D1,
    staticTime: 1.7,
    caption: 'Wipe the glass with your palm',
    render: (g, w, h, t) => {
      tile1(g, w, h, (f) => {
        f.lineWidth = h * 0.36;
        const segs = 30;
        for (let k = 1; k <= segs; k++) {
          const tau = 0.5 + (1.5 * k) / segs;
          if (t < tau) break;
          f.globalAlpha = clamp01(1 - (t - tau) / 2.4);
          const a = wave((k - 1) / segs);
          const b = wave(k / segs);
          f.beginPath();
          f.moveTo(a.x * w, a.y * h);
          f.lineTo(b.x * w, b.y * h);
          f.stroke();
        }
      });
      const p = wave(clamp01((t - 0.5) / 1.5));
      const alpha = clamp01((t - 0.1) / 0.4) * clamp01((2.4 - t) / 0.4);
      drawGuideHand(g, w, h, still(p.x, p.y, { alpha, rotation: 0.12 }), orange, 0.42);
    },
  });
  badge(wipe, 'open hand');

  // 2. One finger: a thin line drawn with the fingertip.
  const D2 = 5;
  const squiggle = (s: number) => ({ x: 0.2 + 0.6 * s, y: 0.5 + 0.2 * Math.sin(s * Math.PI * 3) * (1 - 0.3 * s) });
  const tile2 = foggedTile();
  const tip0 = handPoints(100, 100, still(0.5, 0.5, { blend: 1 }), 0.46, POINT)[8];
  const write = new GuideCell({
    duration: D2,
    staticTime: 2.3,
    caption: 'Draw on the window with one finger',
    render: (g, w, h, t) => {
      const head = clamp01((t - 0.5) / 2.2);
      tile2(g, w, h, (f) => {
        f.lineWidth = 4;
        const segs = 60;
        for (let k = 1; k <= segs; k++) {
          const tau = 0.5 + (2.2 * k) / segs;
          if (t < tau) break;
          f.globalAlpha = clamp01(1 - (t - tau) / 2);
          const a = squiggle((k - 1) / segs);
          const b = squiggle(k / segs);
          f.beginPath();
          f.moveTo(a.x * w, a.y * h);
          f.lineTo(b.x * w, b.y * h);
          f.stroke();
        }
      });
      // The fingertip sits on the head of the line.
      const p = squiggle(head);
      const alpha = clamp01((t - 0.1) / 0.4) * clamp01((3.1 - t) / 0.4);
      const cx = p.x - (tip0.x - 50) / 100;
      const cy = p.y - (tip0.y - 50) / 100;
      drawGuideHand(g, w, h, still(cx, cy, { blend: 1, alpha }), orange, 0.46, POINT);
    },
  });
  badge(write, 'one finger');

  // 3. Wait: the clear patch fogs up again, with a clock filling in.
  const D3 = 4;
  const tile3 = foggedTile();
  const wait = new GuideCell({
    duration: D3,
    staticTime: 1.2,
    caption: 'Leave it and it fogs up again',
    render: (g, w, h, t) => {
      const fade = clamp01(1 - (t - 0.3) / 3.2);
      tile3(g, w, h, (f) => {
        f.globalAlpha = fade;
        f.lineWidth = h * 0.36;
        f.beginPath();
        f.moveTo(w * 0.2, h * 0.52);
        f.bezierCurveTo(w * 0.4, h * 0.36, w * 0.6, h * 0.68, w * 0.8, h * 0.52);
        f.stroke();
        f.lineWidth = 4;
        f.beginPath();
        f.moveTo(w * 0.25, h * 0.82);
        f.lineTo(w * 0.7, h * 0.84);
        f.stroke();
      });
      // Clock.
      const cx = w * 0.86;
      const cy = h * 0.8;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(cx, cy, 11, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#fff';
      g.beginPath();
      g.arc(cx, cy, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01((t - 0.3) / 3.2));
      g.stroke();
      g.restore();
    },
  });
  badge(wait, 'wait');

  return [wipe, write, wait];
}
