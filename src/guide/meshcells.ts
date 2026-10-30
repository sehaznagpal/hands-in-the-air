import { GuideCell, drawGuideHand } from './cell';
import { Timeline } from './timeline';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => clamp01(x) * clamp01(x) * (3 - 2 * clamp01(x));
export const HOLD = 0.4;
/** Time in seconds of a point u (0 to 1) through the moving part of a loop. */
export const at = (u: number, duration: number) => HOLD + u * (duration - 2 * HOLD);

function badge(cell: GuideCell, text: string) {
  const b = document.createElement('span');
  b.className = 'guide-badge';
  b.textContent = text;
  cell.frame.append(b);
  return (t: string) => {
    if (b.textContent !== t) b.textContent = t;
  };
}

/** Critically damped follower of a sampled value, replayed from a second earlier so it needs no state. */
function follow(sample: (t: number) => number, t: number, omega = 9) {
  const dt = 1 / 60;
  let x = sample(t - 1.2);
  let v = 0;
  for (let s = t - 1.2; s < t; s += dt) {
    const a = omega * omega * (sample(s) - x) - 2 * omega * v;
    v += a * dt;
    x += v * dt;
  }
  return x;
}

function arrow(g: CanvasRenderingContext2D, x: number, y: number, len: number, up: boolean, alpha: number) {
  if (alpha <= 0.01) return;
  const d = up ? -1 : 1;
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x, y - (d * len) / 2);
  g.lineTo(x, y + (d * len) / 2);
  g.moveTo(x - 9, y + (d * len) / 2 - d * 11);
  g.lineTo(x, y + (d * len) / 2);
  g.lineTo(x + 9, y + (d * len) / 2 - d * 11);
  g.stroke();
  g.restore();
}

function chip(g: CanvasRenderingContext2D, w: number, n: number) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath();
  g.roundRect(w - 52, 8, 44, 26, 13);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '600 17px "Clash Grotesk", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), w - 30, 21.5);
  g.restore();
}

/** A tapered diamond-lattice bag outline hanging from (hx, hy), tilted by angle. */
export function miniMesh(g: CanvasRenderingContext2D, hx: number, hy: number, len: number, angle: number, color: string) {
  const wMax = len * 0.3;
  // Half width along the bag: a narrow neck, a full belly, a rounded bottom.
  const at = (f: number) =>
    wMax * (f < 0.9 ? Math.sin(Math.min(1, 0.15 + f * 1.3) * Math.PI * 0.5) : Math.cos(((f - 0.9) / 0.1) * Math.PI * 0.5));
  g.save();
  g.translate(hx, hy);
  g.rotate(angle);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.6;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Hanger
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.07, len * 0.16);
  g.lineTo(-len * 0.07, len * 0.16);
  g.closePath();
  g.stroke();
  const top = len * 0.2;
  const body = len - top;
  g.beginPath();
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const x = -at(f);
    if (i === 0) g.moveTo(x, top + f * body);
    else g.lineTo(x, top + f * body);
  }
  for (let i = steps; i >= 0; i--) {
    const f = i / steps;
    g.lineTo(at(f), top + f * body);
  }
  g.closePath();
  g.stroke();
  g.save();
  g.clip();
  g.lineWidth = 1;
  g.globalAlpha = 0.8;
  const step = len * 0.12;
  g.beginPath();
  for (let k = -8; k <= 8; k++) {
    g.moveTo(k * step - wMax, top);
    g.lineTo(k * step + wMax, top + body);
    g.moveTo(k * step + wMax, top);
    g.lineTo(k * step - wMax, top + body);
  }
  g.stroke();
  g.restore();
  // Tie
  g.beginPath();
  g.ellipse(0, top + body * 0.03, len * 0.07, len * 0.03, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function createMeshCells(): GuideCell[] {
  const orange = css('--orange', '#c84a12');
  const D1 = 3.2;

  // 1 and 2: the open hand rises (adds) or lowers (removes); the counter and arrow follow.
  const rising = new Timeline(D1, [
    { t: 0, x: 0.45, y: 0.68, v: 0 },
    { t: 0.7, x: 0.45, y: 0.3, v: 1 },
    { t: 0.82, x: 0.45, y: 0.3, v: 1 },
    { t: 0.9, x: 0.45, y: 0.3, v: 1, alpha: 0 },
    { t: 0.9001, x: 0.45, y: 0.68, v: 0, alpha: 0 },
    { t: 1, x: 0.45, y: 0.68, v: 0, alpha: 1 },
  ]);
  const lowering = new Timeline(D1, [
    { t: 0, x: 0.45, y: 0.3, v: 0 },
    { t: 0.7, x: 0.45, y: 0.68, v: 1 },
    { t: 0.82, x: 0.45, y: 0.68, v: 1 },
    { t: 0.9, x: 0.45, y: 0.68, v: 1, alpha: 0 },
    { t: 0.9001, x: 0.45, y: 0.3, v: 0, alpha: 0 },
    { t: 1, x: 0.45, y: 0.3, v: 0, alpha: 1 },
  ]);

  const makeVertical = (tl: Timeline, up: boolean, caption: string) => {
    let setBadge: (t: string) => void = () => {};
    const cell = new GuideCell({
      duration: D1,
      staticTime: at(0.5, D1),
      caption,
      render: (g, w, h, t) => {
        const s = tl.sample(t);
        drawGuideHand(g, w, h, s, orange, 0.48);
        const shown = up ? 4 + 5 * s.v : 9 - 5 * s.v;
        chip(g, w, Math.round(shown));
        arrow(g, w * 0.82, h * 0.52, h * 0.34, up, smooth(s.v * 5) * s.alpha);
        setBadge('open hand');
      },
    });
    setBadge = badge(cell, 'open hand');
    return cell;
  };
  const raise = makeVertical(rising, true, 'Raise your open hand to add more');
  const lower = makeVertical(lowering, false, 'Lower it to remove');

  // 3: a fist grabs and carries the mesh; it follows with a soft spring.
  const D3 = 4;
  const carry = new Timeline(D3, [
    { t: 0, x: 0.5, y: 0.3, blend: 0 },
    { t: 0.17, x: 0.5, y: 0.3, blend: 1 },
    { t: 0.4, x: 0.5, y: 0.3, blend: 1 },
    { t: 0.55, x: 0.75, y: 0.3, blend: 1 },
    { t: 0.8, x: 0.25, y: 0.3, blend: 1 },
    { t: 0.93, x: 0.5, y: 0.3, blend: 1 },
    { t: 1, x: 0.5, y: 0.3, blend: 0 },
  ]);
  let setBadge3: (t: string) => void = () => {};
  const grab = new GuideCell({
    duration: D3,
    staticTime: at(0.55, D3),
    caption: 'Make a fist to grab and carry the mesh',
    render: (g, w, h, t) => {
      const s = carry.sample(t);
      const ix = follow((u) => carry.sample(u).x, t);
      const lag = ix - s.x;
      miniMesh(g, ix * w, h * 0.46, h * 0.52, -lag * 2.2, orange);
      drawGuideHand(g, w, h, s, orange, 0.4);
      setBadge3(s.blend > 0.5 ? 'fist' : 'open hand');
    },
  });
  setBadge3 = badge(grab, 'open hand');

  // 4: a sideways swipe; the mesh swings like a pendulum and wind lines flow past.
  const D4 = 3.2;
  const swipe = new Timeline(D4, [
    { t: 0, x: 0.15, y: 0.74 },
    { t: 0.1, x: 0.15, y: 0.74 },
    { t: 0.246, x: 0.85, y: 0.74, v: 1 },
    { t: 0.36, x: 0.85, y: 0.74, v: 0 },
    { t: 0.45, x: 0.85, y: 0.74, v: 0, alpha: 0 },
    { t: 0.4501, x: 0.15, y: 0.74, v: 0, alpha: 0 },
    { t: 0.6, x: 0.15, y: 0.74, v: 0, alpha: 1 },
    { t: 1, x: 0.15, y: 0.74, v: 0 },
  ]);
  const tGust = at(0.17, D4);
  let setBadge4: (t: string) => void = () => {};
  const gust = new GuideCell({
    duration: D4,
    staticTime: at(0.2, D4),
    caption: 'Swipe sideways for a gust of wind',
    render: (g, w, h, t) => {
      const s = swipe.sample(t);
      // Pendulum: starts when the hand passes the middle, dies away well before the loop ends.
      const since = t - tGust;
      const swing = since > 0 ? 0.28 * Math.exp(-since / 0.75) * Math.sin(since * 4.6) * clamp01((D4 - t) / 0.5) : 0;
      miniMesh(g, w * 0.55, h * 0.1, h * 0.46, swing, orange);
      // Wind lines.
      g.save();
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.lineCap = 'round';
      const windAmt = clamp01((since + 0.1) / 0.35) * clamp01(1 - (since - 0.3) / 0.9);
      if (since > -0.1 && windAmt > 0) {
        for (let i = 0; i < 3; i++) {
          const y = h * (0.2 + i * 0.12);
          const x0 = w * (0.12 + 0.62 * clamp01((since + 0.1) / 1.1)) + i * 14;
          g.globalAlpha = 0.28 * windAmt;
          g.beginPath();
          g.moveTo(x0, y);
          g.lineTo(x0 + w * 0.18, y);
          g.stroke();
        }
      }
      // Motion streaks behind the hand while it sweeps.
      const vx = (s.x - swipe.sample(t - 0.03).x) / 0.03;
      if (vx > 0.5) {
        g.globalAlpha = Math.min(0.5, vx * 0.12) * s.alpha;
        for (let i = 0; i < 4; i++) {
          const y = (s.y - 0.12 + i * 0.07) * h;
          g.beginPath();
          g.moveTo(s.x * w - w * 0.1, y);
          g.lineTo(s.x * w - w * (0.1 + Math.min(0.3, vx * 0.05)), y);
          g.stroke();
        }
      }
      g.restore();
      drawGuideHand(g, w, h, s, orange, 0.42);
    },
  });
  setBadge4 = badge(gust, 'open hand');
  void setBadge4;

  return [raise, lower, grab, gust];
}
