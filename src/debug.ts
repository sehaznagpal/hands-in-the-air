import { FINGERTIP_INDEX, HAND_CONNECTIONS, type RawHand } from './types';
import type { Rect } from './view';

export interface Stats {
  fps: number;
  detectMs: number;
  delegate: string;
}

export class DebugOverlay {
  visible = false;
  private panel: HTMLElement;

  constructor(parent: HTMLElement) {
    this.panel = document.createElement('pre');
    this.panel.className = 'debug-panel';
    this.panel.hidden = true;
    parent.appendChild(this.panel);
  }

  toggle() {
    this.visible = !this.visible;
    this.panel.hidden = !this.visible;
  }

  draw(ctx: CanvasRenderingContext2D, rect: Rect, hands: RawHand[], stats: Stats) {
    if (!this.visible) return;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#d2452b';
    const ink = css.getPropertyValue('--ink').trim() || '#000';

    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    hands.forEach((hand, hi) => {
      const pts = hand.landmarks.map((p) => ({ x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h }));
      ctx.strokeStyle = ink;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
      }
      ctx.stroke();
      ctx.fillStyle = ink;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      FINGERTIP_INDEX.forEach((li, fi) => {
        const p = pts[li];
        const id = (hand.label === 'Left' ? 0 : 5) + fi + 1;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(String(id), p.x, p.y + 1);
      });
      void hi;
    });
    ctx.restore();

    const lines = [
      `fps        ${stats.fps.toFixed(0)}`,
      `detect     ${stats.detectMs.toFixed(1)} ms (${stats.delegate})`,
      `hands      ${hands.length}`,
      ...hands.map((h) => `${h.label.padEnd(5)} score ${h.score.toFixed(2)}`),
    ];
    this.panel.textContent = lines.join('\n');
  }
}
