import type { HandSignals } from '../../hands';
import type { Scene, SceneContext } from '../../scene';
import './window.css';
import { allBackgrounds, type Background } from './backgrounds';
import { FogWindow } from './fog';

const WIPE_RADIUS_MOUSE = 52;
const LINE_RADIUS = 3.5;
/** A stroke that jumps farther than this in one frame is a new stroke, not a wipe across the glass. */
const MAX_JUMP = 260;

type Mode = 'palm' | 'line';
interface Stroke {
  x: number;
  y: number;
  mode: Mode;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Foggy Window: a fogged window over a photo that you wipe clear with your hands or the mouse. */
export class WindowScene implements Scene {
  readonly help = 'Wipe the glass with your palm, draw with one finger, or leave it and it fogs up again.';

  private ctx!: SceneContext;
  private fog = new FogWindow();
  private backgrounds = allBackgrounds();
  private current = 0;
  private bgToken = 0;
  private size = { w: 0, h: 0, dpr: 0 };
  private rebuildAt = 0;
  private ready = false;
  private strokes = new Map<string, Stroke>();
  private mouse: (Stroke & { id: number }) | null = null;
  private chips: HTMLButtonElement[] = [];
  private cleanup: (() => void)[] = [];
  private time = 0;

  init(ctx: SceneContext) {
    this.ctx = ctx;
    this.fog.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.buildUI();
    this.bindInput();
    this.syncSize(true);
    void this.setBackground(0);
  }

  // ------------------------------------------------------------------ UI

  private buildUI() {
    const root = el('div', 'win-ui');
    const row = el('div', 'win-chips');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Background (B)');
    this.backgrounds.forEach((bg, i) => {
      const b = el('button', 'pill small', bg.name);
      b.type = 'button';
      b.addEventListener('click', () => void this.setBackground(i));
      row.append(b);
      this.chips.push(b);
    });
    const fogBtn = el('button', 'pill small win-fog', 'Fog it up');
    fogBtn.type = 'button';
    fogBtn.title = 'Fog the whole window up again (F)';
    fogBtn.addEventListener('click', () => this.fog.refogAll());
    root.append(row, fogBtn);
    this.ctx.overlay.append(root);
    this.syncChips();
  }

  private syncChips() {
    this.chips.forEach((c, i) => c.setAttribute('aria-pressed', String(i === this.current)));
  }

  /** Paint the sharp background once and rebuild the fog layer from it. */
  private async setBackground(i: number) {
    this.current = (i + this.backgrounds.length) % this.backgrounds.length;
    this.syncChips();
    const token = ++this.bgToken;
    const bg: Background = this.backgrounds[this.current];
    const { w, h } = this.size;
    const k = Math.min(this.ctx.size.dpr, 2);
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const g = c.getContext('2d')!;
    g.scale(k, k);
    g.fillStyle = '#05070d';
    g.fillRect(0, 0, w, h);
    await bg.paint(g, w, h);
    if (token !== this.bgToken) return;
    this.fog.setBackground(c, bg.fog);
    this.ready = true;
  }

  // --------------------------------------------------------------- input

  private bindInput() {
    const canvas = this.ctx.canvas;
    const on = <T extends EventTarget>(t: T, type: string, fn: (e: never) => void) => {
      t.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') this.fog.refogAll();
      else if (e.key === 'b' || e.key === 'B') void this.setBackground(this.current + (e.shiftKey ? -1 : 1));
    });
    on(canvas, 'pointerdown', (e: PointerEvent) => {
      this.mouse = { id: e.pointerId, x: e.offsetX, y: e.offsetY, mode: e.shiftKey ? 'line' : 'palm' };
      canvas.setPointerCapture(e.pointerId);
    });
    on(canvas, 'pointermove', (e: PointerEvent) => {
      const m = this.mouse;
      if (!m || m.id !== e.pointerId) return;
      const mode: Mode = e.shiftKey ? 'line' : 'palm';
      this.fog.wipe(m.x, m.y, e.offsetX, e.offsetY, mode === 'line' ? LINE_RADIUS : WIPE_RADIUS_MOUSE, mode === 'line');
      m.x = e.offsetX;
      m.y = e.offsetY;
    });
    const up = (e: PointerEvent) => {
      if (this.mouse?.id === e.pointerId) this.mouse = null;
    };
    on(canvas, 'pointerup', up);
    on(canvas, 'pointercancel', up);
  }

  /** Hands: an open palm wipes wide, one extended index finger draws a thin line; both hands work at once. */
  private wipeWithHands(hands: HandSignals) {
    const top = this.ctx.toScreen(0, 0);
    const bottom = this.ctx.toScreen(0, 1);
    const frameH = Math.abs(bottom.y - top.y);
    for (const [key, side] of [['L', hands.left], ['R', hands.right]] as const) {
      const st = side.state;
      let next: Stroke | null = null;
      let r = LINE_RADIUS;
      if (st.present) {
        const pointing = st.extended.index && !st.extended.middle && !st.extended.ring && !st.extended.pinky;
        if (pointing) {
          const tip = st.landmarks[8];
          next = { ...this.ctx.toScreen(tip.x, tip.y), mode: 'line' };
        } else if (st.openness > 0.5) {
          next = { ...this.ctx.toScreen(st.palm.x, st.palm.y), mode: 'palm' };
          r = Math.min(130, Math.max(42, st.scale * frameH * 0.8));
        }
      }
      const prev = this.strokes.get(key);
      if (!next) {
        this.strokes.delete(key);
        continue;
      }
      if (prev && prev.mode === next.mode && Math.hypot(next.x - prev.x, next.y - prev.y) < MAX_JUMP) {
        this.fog.wipe(prev.x, prev.y, next.x, next.y, r, next.mode === 'line');
      }
      this.strokes.set(key, next);
    }
  }

  // ------------------------------------------------------ update and draw

  /** Keep the window the size of the screen; rebuild the background shortly after a resize settles. */
  private syncSize(force = false) {
    const { width, height, dpr } = this.ctx.size;
    if (!force && width === this.size.w && height === this.size.h && dpr === this.size.dpr) return;
    this.size = { w: width, h: height, dpr };
    this.fog.resize(width, height);
    this.rebuildAt = force ? 0 : performance.now() + 250;
  }

  update(hands: HandSignals, dt: number) {
    this.time += dt;
    this.syncSize();
    if (this.rebuildAt && performance.now() > this.rebuildAt) {
      this.rebuildAt = 0;
      void this.setBackground(this.current);
    }
    this.wipeWithHands(hands);
    this.fog.update(dt, this.time);
  }

  draw(g: CanvasRenderingContext2D) {
    if (!this.ready) {
      g.fillStyle = '#05070d';
      g.fillRect(0, 0, this.size.w, this.size.h);
      return;
    }
    this.fog.draw(g);
  }

  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.bgToken++;
  }
}
