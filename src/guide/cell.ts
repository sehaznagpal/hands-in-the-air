import { drawSkeleton } from '../skeleton';
import { blendPose, FIST, HAND_CENTER, OPEN_PALM } from './poses';
import type { State } from './timeline';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export interface CellOptions {
  /** Loop length in seconds. */
  duration: number;
  /** Draws one frame at a time in seconds (0 to duration). */
  render(g: CanvasRenderingContext2D, w: number, h: number, time: number): void;
  /** The time shown when motion is reduced: the key pose with its arrow. */
  staticTime: number;
  caption: string;
}

/** A dark rounded canvas that plays one looping guide. Drawing is driven by the shared GuideLoop. */
export class GuideCell {
  readonly el = document.createElement('figure');
  readonly duration: number;
  private canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private w = 0;
  private h = 0;
  private ro: ResizeObserver;

  constructor(private opts: CellOptions) {
    this.duration = opts.duration;
    this.el.className = 'guide-cell';
    const frame = document.createElement('div');
    frame.className = 'guide-frame';
    this.canvas.setAttribute('aria-hidden', 'true');
    frame.append(this.canvas);
    this.el.append(frame);
    if (opts.caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = opts.caption;
      this.el.append(cap);
    }
    this.ro = new ResizeObserver(() => {
      this.fit();
      this.draw(opts.staticTime);
    });
    this.ro.observe(frame);
  }

  /** Add overlay DOM (like a badge) inside the frame. */
  get frame() {
    return this.canvas.parentElement!;
  }

  private fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    const pw = Math.round(this.w * dpr);
    const ph = Math.round(this.h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(time: number) {
    if (!this.w || !this.h) return;
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    this.opts.render(g, this.w, this.h, time);
  }

  drawStatic() {
    this.draw(this.opts.staticTime);
  }

  dispose() {
    this.ro.disconnect();
  }
}

/** Landmark positions in cell pixels for a timeline state; (x, y) is the middle of the hand as a share of the cell. */
export function handPoints(w: number, h: number, s: State, size = 0.5) {
  const pose = blendPose(OPEN_PALM, FIST, s.blend);
  const S = h * size * s.scale;
  const c = Math.cos(s.rotation);
  const n = Math.sin(s.rotation);
  return pose.map((p) => {
    const lx = p.x - HAND_CENTER.x;
    const ly = p.y - HAND_CENTER.y;
    return { x: s.x * w + (lx * c - ly * n) * S, y: s.y * h + (lx * n + ly * c) * S };
  });
}

/** Draw a guide hand from a timeline state. */
export function drawGuideHand(g: CanvasRenderingContext2D, w: number, h: number, s: State, tip: string, size = 0.5) {
  g.save();
  g.globalAlpha = s.alpha;
  drawSkeleton(g, handPoints(w, h, s, size), tip);
  g.restore();
}

/** One shared requestAnimationFrame loop for every open cell. It runs only while cells are active and the tab is visible. */
class GuideLoop {
  private cells: GuideCell[] = [];
  private raf = 0;
  private t0 = 0;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.halt();
      else if (this.cells.length) this.begin();
    });
  }

  get running() {
    return this.raf !== 0;
  }

  /** Start playing these cells (call when the card opens). */
  activate(cells: GuideCell[]) {
    this.halt();
    this.cells = cells;
    if (reduced()) {
      for (const c of cells) c.drawStatic();
      return;
    }
    this.begin();
  }

  /** Stop everything (call when the card closes). */
  deactivate() {
    this.halt();
    this.cells = [];
  }

  private begin() {
    if (reduced() || this.raf) return;
    this.t0 = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private halt() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const t = (now - this.t0) / 1000;
    for (const c of this.cells) c.draw(t % c.duration);
  };
}

export const guideLoop = new GuideLoop();
