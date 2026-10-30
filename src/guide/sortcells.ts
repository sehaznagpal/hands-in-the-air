import { renderMarble, type MarbleLayers } from '../shared/marbles';
import { GuideCell, drawGuideHand, handPoints } from './cell';
import { PINCH } from './poses';
import type { State } from './timeline';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => clamp01(x) * clamp01(x) * (3 - 2 * clamp01(x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const cache = new Map<number, MarbleLayers>();
function marble(g: CanvasRenderingContext2D, style: number, x: number, y: number, r: number, alpha = 1) {
  if (r < 1 || alpha <= 0) return;
  let l = cache.get(style);
  if (!l) cache.set(style, (l = renderMarble(style, 96)));
  const d = (2 * r * l.size) / (l.size - 3);
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(l.pattern, x - d / 2, y - d / 2, d, d);
  g.drawImage(l.gloss, x - d / 2, y - d / 2, d, d);
  g.restore();
}

function badge(cell: GuideCell, text: string) {
  const b = document.createElement('span');
  b.className = 'guide-badge';
  b.textContent = text;
  cell.frame.append(b);
}

const state = (x: number, y: number, blend: number, alpha = 1): State => ({ x, y, rotation: 0, scale: 1, blend, v: 0, alpha });

export function createSortCells(): GuideCell[] {
  const orange = css('--orange', '#c84a12');
  const size = 0.46;
  /** Where the pinch (between thumb and index tips) is, relative to the hand centre, in cell fractions. */
  const pinchAt = (w: number, h: number) => {
    const p = handPoints(w, h, state(0.5, 0.5, 1), size, PINCH);
    return { x: (p[4].x + p[8].x) / 2 / w - 0.5, y: (p[4].y + p[8].y) / 2 / h - 0.5 };
  };
  const shelf = (g: CanvasRenderingContext2D, w: number, h: number, glow: number) => {
    g.save();
    if (glow > 0) {
      g.fillStyle = `rgba(200,74,18,${0.16 * glow})`;
      g.strokeStyle = orange;
      g.globalAlpha = glow;
      g.setLineDash([6, 5]);
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(w * 0.5, h * 0.14, w * 0.44, h * 0.7, 10);
      g.fill();
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    g.strokeStyle = orange;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.52, h * 0.8);
    g.lineTo(w * 0.9, h * 0.8);
    g.stroke();
    g.restore();
    // The label marble sits at the shelf's left end.
    marble(g, 4, w * 0.54 - h * 0.075, h * 0.8 - h * 0.06, h * 0.06);
  };

  // 1. Pinch to grab a marble.
  const D1 = 4.5;
  const pick = new GuideCell({
    duration: D1,
    staticTime: 2.6,
    caption: 'Pinch to grab a marble',
    render: (g, w, h, t) => {
      const off = pinchAt(w, h);
      const mx = 0.5;
      const my = 0.74;
      const close = ease((t - 1.3) / 0.45);
      const lift = ease((t - 1.9) / 0.9);
      const approach = ease((t - 0.3) / 0.9);
      const handX = mx - off.x;
      const handY = lerp(lerp(0.3, my - off.y, approach), 0.42 - off.y, lift);
      const alpha = clamp01((t - 0.1) / 0.3) * clamp01((4.1 - t) / 0.4);
      const pinchY = handY + off.y;
      marble(g, 4, mx * w, (close >= 1 ? pinchY : my) * h, h * 0.085, alpha);
      drawGuideHand(g, w, h, state(handX, handY, close, alpha), orange, size, PINCH);
    },
  });
  badge(pick, 'pinch');

  // 2. Hold it over the shelf with the same colour: the shelf lights up.
  const D2 = 4.5;
  const hold = new GuideCell({
    duration: D2,
    staticTime: 2.6,
    caption: 'Put each marble on the shelf with the same marble',
    render: (g, w, h, t) => {
      const off = pinchAt(w, h);
      const move = ease((t - 0.6) / 1.4);
      const px = lerp(0.2, 0.72, move);
      const py = lerp(0.36, 0.42, move);
      const alpha = clamp01((t - 0.1) / 0.3) * clamp01((4.1 - t) / 0.4);
      shelf(g, w, h, ease((t - 1.7) / 0.3) * alpha);
      marble(g, 4, px * w, py * h, h * 0.085, alpha);
      drawGuideHand(g, w, h, state(px - off.x, py - off.y, 1, alpha), orange, size, PINCH);
    },
  });
  badge(hold, 'hold');

  // 3. Open your fingers to drop it: it slides into the shelf.
  const D3 = 4.5;
  const drop = new GuideCell({
    duration: D3,
    staticTime: 2.2,
    caption: 'Open your fingers to drop it',
    render: (g, w, h, t) => {
      const off = pinchAt(w, h);
      const px = 0.72;
      const py = 0.4;
      const open = ease((t - 1.2) / 0.35);
      const alpha = clamp01((t - 0.1) / 0.3) * clamp01((4.1 - t) / 0.4);
      shelf(g, w, h, alpha);
      const r = h * 0.085;
      const fall = ease((t - 1.45) / 0.45);
      marble(g, 4, px * w, lerp(py, 0.8 - r / h, fall) * h, r, alpha);
      drawGuideHand(g, w, h, state(px - off.x, py - off.y, 1 - open, alpha), orange, size, PINCH);
      if (t > 1.9) {
        g.save();
        g.globalAlpha = clamp01(1 - (t - 1.9) / 1.2) * alpha;
        g.fillStyle = '#fff';
        g.font = '600 18px "Clash Grotesk", sans-serif';
        g.textAlign = 'center';
        g.fillText('+1', px * w, h * 0.66 - (t - 1.9) * 14);
        g.restore();
      }
    },
  });
  badge(drop, 'open');

  // 4. A wrong shelf or a dropped marble costs a life (5 lives).
  const D4 = 4.5;
  const miss = new GuideCell({
    duration: D4,
    staticTime: 2.2,
    caption: 'Wrong shelf or a dropped marble costs a life (5 lives)',
    render: (g, w, h, t) => {
      g.save();
      g.strokeStyle = orange;
      g.globalAlpha = 0.6;
      g.lineWidth = 2;
      g.setLineDash([8, 6]);
      g.beginPath();
      g.moveTo(w * 0.06, h * 0.9);
      g.lineTo(w * 0.94, h * 0.9);
      g.stroke();
      g.restore();
      const fall = clamp01((t - 0.5) / 1.5);
      const r = h * 0.085;
      const y = lerp(-r, 0.9 - r / h, fall * fall) * h;
      const splash = clamp01((t - 2) / 0.35);
      marble(g, 3, w * 0.4, y, r * (1 - splash));
      const lost = clamp01((t - 2) / 0.3) * clamp01(1 - (t - 3.7) / 0.4);
      for (let i = 0; i < 5; i++) {
        const x = w * (0.94 - 0.07 * i);
        const yy = h * 0.14;
        if (i === 0 && lost > 0.5) {
          g.save();
          g.strokeStyle = '#ff6b4a';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, yy, h * 0.04, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        } else {
          marble(g, 4, x, yy, h * 0.04);
        }
      }
      if (t > 2 && t < 3.7) {
        g.save();
        g.fillStyle = '#ff9a7a';
        g.font = '600 15px "Clash Grotesk", sans-serif';
        g.textAlign = 'center';
        g.globalAlpha = clamp01((t - 2) / 0.2);
        g.fillText('−1 life', w * 0.4, h * 0.8);
        g.restore();
      }
    },
  });
  badge(miss, 'watch out');

  return [pick, hold, drop, miss];
}
