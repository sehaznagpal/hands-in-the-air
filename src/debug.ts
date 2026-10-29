import type { HandSignals, HandState } from './hands';
import { HAND_CONNECTIONS } from './types';
import type { Rect } from './view';

export interface Stats {
  fps: number;
  detectMs: number;
  delegate: string;
}

export class DebugOverlay {
  visible = false;
  private panel: HTMLElement;
  private log: string[] = [];

  constructor(parent: HTMLElement) {
    this.panel = document.createElement('pre');
    this.panel.className = 'debug-panel';
    this.panel.hidden = true;
    parent.appendChild(this.panel);
  }

  /** Keeps the last few events for the panel. */
  note(text: string) {
    this.log.push(text);
    if (this.log.length > 6) this.log.shift();
  }

  toggle() {
    this.visible = !this.visible;
    this.panel.hidden = !this.visible;
  }

  draw(ctx: CanvasRenderingContext2D, rect: Rect, signals: HandSignals, stats: Stats) {
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
    const hands = signals.hands;
    hands.forEach((hand) => {
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
      hand.fingertips.forEach((tip) => {
        const p = { x: rect.x + tip.x * rect.w, y: rect.y + tip.y * rect.h };
        const id = tip.id;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(String(id), p.x, p.y + 1);
      });
    });
    ctx.restore();

    const lines = [
      `fps     ${stats.fps.toFixed(0)}`,
      `detect  ${stats.detectMs.toFixed(1)} ms (${stats.delegate})`,
      `hands   ${hands.length}`,
      ...hands.flatMap(describe),
      ...(this.log.length ? ['', 'events', ...this.log] : []),
    ];
    this.panel.textContent = lines.join('\n');
  }
}

const f2 = (n: number) => n.toFixed(2).padStart(5);

function describe(h: HandState): string[] {
  const ext = Object.entries(h.extended)
    .map(([k, v]) => (v ? k[0].toUpperCase() : '-'))
    .join('');
  return [
    '',
    `${h.label} hand  fingers ${h.fingerCount} [${ext}]`,
    `  open ${f2(h.openness)}  pinch ${f2(h.pinchDistance)} ${h.pinching ? 'ON' : 'off'}`,
    `  palm ${f2(h.palm.x)},${f2(h.palm.y)}  scale ${f2(h.scale)}`,
    `  vel  ${f2(h.velocity.x)},${f2(h.velocity.y)}`,
  ];
}
