import { renderMarble, type MarbleLayers } from '../shared/marbles';
import { familyMark } from '../scenes/sort/index';
import { GuideCell, drawGuideHand, handPoints } from './cell';
import { PINCH } from './poses';
import type { State } from './timeline';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => clamp01(x) * clamp01(x) * (3 - 2 * clamp01(x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const cache = new Map<number, MarbleLayers>();
function marble(g: CanvasRenderingContext2D, style: number, family: number, x: number, y: number, r: number, alpha = 1) {
  if (r < 1 || alpha <= 0) return;
  let l = cache.get(style);
  if (!l) cache.set(style, (l = renderMarble(style, 96)));
  const d = (2 * r * l.size) / (l.size - 3);
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(l.pattern, x - d / 2, y - d / 2, d, d);
  g.drawImage(l.gloss, x - d / 2, y - d / 2, d, d);
  g.restore();
  familyMark(g, family, x, y, r, alpha);
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

  // 1. Pinch to pick a marble up.
  const D1 = 4.5;
  const pick = new GuideCell({
    duration: D1,
    staticTime: 2.6,
    caption: 'Pinch to pick up a marble',
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
      const markY = lerp(my, pinchY, close >= 1 ? 1 : 0);
      marble(g, 4, 0, mx * w, (close >= 1 ? pinchY : markY) * h, h * 0.085, alpha);
      drawGuideHand(g, w, h, state(handX, handY, close, alpha), orange, size, PINCH);
    },
  });
  badge(pick, 'pinch');

  // 2. Carry it over and let go on the matching shelf.
  const D2 = 5;
  const carry = new GuideCell({
    duration: D2,
    staticTime: 2.3,
    caption: 'Move it and let go on the matching shelf',
    render: (g, w, h, t) => {
      // Shelf with its label marble.
      g.save();
      g.strokeStyle = orange;
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(w * 0.52, h * 0.8);
      g.lineTo(w * 0.9, h * 0.8);
      g.stroke();
      g.restore();
      marble(g, 4, 0, w * 0.71, h * 0.9, h * 0.06);
      const off = pinchAt(w, h);
      const move = ease((t - 0.9) / 1.4);
      const release = ease((t - 2.5) / 0.3);
      const px = lerp(0.22, 0.71, move);
      const py = lerp(0.34, 0.5, move);
      const handX = px - off.x;
      const handY = py - off.y;
      const alpha = clamp01((t - 0.1) / 0.3) * clamp01((4.3 - t) / 0.4);
      const r = h * 0.085;
      // The marble rides the pinch, then drops onto the shelf.
      const drop = ease((t - 2.55) / 0.3);
      const my = t < 2.55 ? py : lerp(py, 0.8 - r / h, drop);
      marble(g, 4, 0, px * w, my * h, r, alpha);
      drawGuideHand(g, w, h, state(handX, handY, 1 - release, alpha), orange, size, PINCH);
      // +1 pops up after the landing.
      if (t > 2.9) {
        g.save();
        g.globalAlpha = clamp01(1 - (t - 2.9) / 1.2) * alpha;
        g.fillStyle = '#fff';
        g.font = '600 18px "Clash Grotesk", sans-serif';
        g.textAlign = 'center';
        g.fillText('+1', px * w, h * 0.68 - (t - 2.9) * 14);
        g.restore();
      }
    },
  });
  badge(carry, 'pinch');

  // 3. A marble that reaches the floor costs a life.
  const D3 = 4.5;
  const miss = new GuideCell({
    duration: D3,
    staticTime: 2.2,
    caption: 'Missed marbles cost a life',
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
      // Falling marble, then a splash.
      const fall = clamp01((t - 0.5) / 1.5);
      const r = h * 0.085;
      const y = lerp(-r, 0.9 - r / h, fall * fall) * h;
      const splash = clamp01((t - 2) / 0.35);
      marble(g, 3, 1, w * 0.4, y, r * (1 - splash));
      // Three lives; the last one empties when the marble lands, then they refill.
      const lost = clamp01((t - 2) / 0.3) * clamp01(1 - (t - 3.7) / 0.4);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.94 - 0.09 * i);
        const yy = h * 0.14;
        if (i === 0 && lost > 0.5) {
          g.save();
          g.strokeStyle = '#ff6b4a';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, yy, h * 0.05, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        } else {
          marble(g, 4, 0, x, yy, h * 0.05);
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

  return [pick, carry, miss];
}
