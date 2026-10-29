import { FINGERTIP_INDEX } from '../types';
import { GuideCell, drawGuideHand, handPoints } from './cell';
import type { State } from './timeline';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const D = 6;
const TRAIL = 1.4;

/** Slow figure-eight for one hand; periodic in D seconds, so the loop is seamless. */
function pose(t: number, cx: number, phase: number): State {
  const a = (t / D) * Math.PI * 2 + phase;
  return { x: cx + 0.11 * Math.sin(a), y: 0.48 + 0.2 * Math.sin(2 * a), rotation: 0.18 * Math.sin(a), scale: 1, blend: 0, v: 0, alpha: 1 };
}

/** Two hands trace figure-eights; every fingertip leaves a fading trail, left hand blue, right hand orange. */
export function createCanvasCell(caption: string) {
  const orange = css('--orange', '#c84a12');
  const blue = css('--blue', '#0a3699');
  const hands = [
    { cx: 0.26, phase: 0, color: blue },
    { cx: 0.74, phase: Math.PI, color: orange },
  ];
  return new GuideCell({
    duration: D,
    staticTime: 1.6,
    caption,
    render: (g, w, h, t) => {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const steps = 34;
      for (const hand of hands) {
        for (const tip of FINGERTIP_INDEX) {
          g.strokeStyle = hand.color;
          for (let i = steps; i >= 1; i--) {
            const a = handPoints(w, h, pose(t - (i * TRAIL) / steps, hand.cx, hand.phase), 0.36)[tip];
            const b = handPoints(w, h, pose(t - ((i - 1) * TRAIL) / steps, hand.cx, hand.phase), 0.36)[tip];
            const life = 1 - i / steps;
            g.globalAlpha = life * 0.9;
            g.lineWidth = 1.5 + 4.5 * life;
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.stroke();
          }
        }
      }
      g.globalAlpha = 1;
      for (const hand of hands) drawGuideHand(g, w, h, pose(t, hand.cx, hand.phase), hand.color, 0.36);
    },
  });
}
