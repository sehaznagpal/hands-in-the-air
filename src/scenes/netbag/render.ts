import type { BagWorld, Ball, Particle } from './physics';
import { HANGER_H, LEVELS } from './physics';
import { SPRITE_PAD, spriteFor, type BallSprite } from './sprites';

/** Catmull-Rom point on a chain at fractional index u. */
function chainAt(pts: Particle[], u: number, out: { x: number; y: number }) {
  const n = pts.length;
  const i = Math.max(0, Math.min(n - 2, Math.floor(u)));
  const t = Math.max(0, Math.min(1, u - i));
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  out.x = 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3);
  out.y = 0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3);
}

const a = { x: 0, y: 0 };
const b = { x: 0, y: 0 };

/** Point inside the bag at s across (0 left edge, 1 right edge) and u along the chains. */
function lattice(world: BagWorld, s: number, u: number, out: { x: number; y: number }) {
  chainAt(world.left, u, a);
  chainAt(world.right, u, b);
  out.x = a.x + (b.x - a.x) * s;
  out.y = a.y + (b.y - a.y) * s;
}

export function drawBall(g: CanvasRenderingContext2D, ball: Ball, sprites: BallSprite[], radius: number, alpha = 1) {
  const sprite = spriteFor(sprites, ball.id);
  const half = radius / SPRITE_PAD;
  g.save();
  g.globalAlpha = alpha;
  g.translate(ball.x, ball.y);
  g.save();
  g.rotate(ball.angle);
  g.drawImage(sprite.body, -half, -half, half * 2, half * 2);
  g.restore();
  g.drawImage(sprite.shine, -half, -half, half * 2, half * 2);
  g.restore();
}

const DIAMONDS_ACROSS = 3;
const NET_TOP = 1.35;

/** The orange net: diamond lattice between the edge chains, outline, tie and hanger. */
export function drawNet(g: CanvasRenderingContext2D, world: BagWorld, color: string, lineWidth: number) {
  const last = LEVELS - 1;
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = lineWidth;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Lattice lines: u = c + s * W (one family) and u = c + (1 - s) * W (the other).
  // W is the bag's resting width measured in segments, so the diamonds look square at rest.
  const wU = 4;
  const du = wU / DIAMONDS_ACROSS;
  const p = { x: 0, y: 0 };
  g.beginPath();
  for (let family = 0; family < 2; family++) {
    for (let c = NET_TOP - wU; c < last; c += du) {
      const sMin = Math.max(0, (NET_TOP - c) / wU);
      const sMax = Math.min(1, (last - c) / wU);
      if (sMax - sMin < 0.02) continue;
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const s = sMin + ((sMax - sMin) * k) / steps;
        const u = c + s * wU;
        lattice(world, family ? 1 - s : s, u, p);
        if (k === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
    }
  }
  g.stroke();

  // Outline: left edge down, across the bottom, right edge up.
  g.beginPath();
  for (let u = 0; u <= last; u += 0.25) {
    chainAt(world.left, u, p);
    if (u === 0) g.moveTo(p.x, p.y);
    else g.lineTo(p.x, p.y);
  }
  for (let u = last; u >= 0; u -= 0.25) {
    chainAt(world.right, u, p);
    g.lineTo(p.x, p.y);
  }
  g.stroke();

  // Gathered tie.
  chainAt(world.left, 1.2, a);
  chainAt(world.right, 1.2, b);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const half = Math.hypot(b.x - a.x, b.y - a.y) / 2 + 0.3;
  g.beginPath();
  g.ellipse(cx, cy, half, 0.42, ang, 0, Math.PI * 2);
  g.fill();

  // Hanger: an outline triangle with the net's neck running up into its base.
  const hook = world.hook;
  const baseY = hook.y + HANGER_H - 0.9;
  const tl = world.left[0];
  const tr = world.right[0];
  g.beginPath();
  g.moveTo(hook.x, hook.y);
  g.lineTo(hook.x + 1.05, baseY);
  g.lineTo(hook.x - 1.05, baseY);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.moveTo(tl.x, tl.y);
  g.lineTo(hook.x - 0.2, baseY);
  g.moveTo(tr.x, tr.y);
  g.lineTo(hook.x + 0.2, baseY);
  g.stroke();
  g.restore();
}
