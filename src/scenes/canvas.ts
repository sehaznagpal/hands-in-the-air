import type { HandSignals } from '../hands';
import type { Scene, SceneContext } from '../scene';

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

const TRAIL_SECONDS = 0.45;

/** Ten dots, one per fingertip, with fading trails. Handy to verify tracking. */
export class CanvasScene implements Scene {
  readonly help = 'Move your hands in front of the camera. Every fingertip draws a trail.';
  private ctx!: SceneContext;
  private trails = new Map<number, TrailPoint[]>();
  private tips: { id: number; x: number; y: number; hand: string }[] = [];
  private time = 0;

  init(ctx: SceneContext) {
    this.ctx = ctx;
  }

  update(hands: HandSignals, dt: number) {
    this.time += dt;
    this.tips = hands.tenFingers().map((f) => ({ id: f.id, hand: f.hand, ...this.ctx.toScreen(f.x, f.y) }));
    for (const tip of this.tips) {
      let trail = this.trails.get(tip.id);
      if (!trail) this.trails.set(tip.id, (trail = []));
      trail.push({ x: tip.x, y: tip.y, t: this.time });
    }
    for (const [id, trail] of this.trails) {
      while (trail.length && this.time - trail[0].t > TRAIL_SECONDS) trail.shift();
      if (!trail.length) this.trails.delete(id);
    }
  }

  draw(g: CanvasRenderingContext2D) {
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim();
    const accent = css.getPropertyValue('--orange').trim();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [id, trail] of this.trails) {
      g.strokeStyle = id <= 5 ? ink : accent;
      for (let i = 1; i < trail.length; i++) {
        const life = 1 - (this.time - trail[i].t) / TRAIL_SECONDS;
        g.globalAlpha = Math.max(0, life) * 0.7;
        g.lineWidth = 2 + 8 * life;
        g.beginPath();
        g.moveTo(trail[i - 1].x, trail[i - 1].y);
        g.lineTo(trail[i].x, trail[i].y);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    for (const tip of this.tips) {
      g.fillStyle = tip.id <= 5 ? ink : accent;
      g.beginPath();
      g.arc(tip.x, tip.y, 11, 0, Math.PI * 2);
      g.fill();
    }
  }

  dispose() {
    this.trails.clear();
    this.tips = [];
  }
}
