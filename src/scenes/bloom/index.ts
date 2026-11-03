import type { HandSignals } from '../../hands';
import type { Scene, SceneContext } from '../../scene';
import { COLS, ROWS, drawBed, drawFlower, drawGrain, gardenPalette, headPos, layoutGarden, type Layout, type Palette } from './flowers';
import { pinchTarget, stepBloom, targetBloom, TUNING } from './logic';

const N = COLS * ROWS;

/** Blooming Flowers: a garden bed where flowers open near your hands and close again behind them. */
export class BloomScene implements Scene {
  readonly help = 'Move your hand over the garden to bloom flowers. Move away and they close back into buds. Pinch a flower to keep it open. No camera? Hover to bloom, click to keep.';

  private ctx!: SceneContext;
  private pal!: Palette;
  private layout!: Layout;
  private layoutKey = '';
  private bloom = new Array<number>(N).fill(0);
  private kept = new Array<boolean>(N).fill(false);
  private wiggle = new Array<number>(N).fill(0);
  private pinchWas: Record<'Left' | 'Right', boolean> = { Left: false, Right: false };
  private mouse: { x: number; y: number } | null = null;
  private time = 0;
  /** Seconds since every flower was kept open, or -1. */
  private celebrate = -1;
  private resetBtn = document.createElement('button');
  private cleanup: (() => void)[] = [];

  init(ctx: SceneContext) {
    this.ctx = ctx;
    this.pal = gardenPalette();
    this.resetBtn.type = 'button';
    this.resetBtn.className = 'pill blue bloom-reset';
    this.resetBtn.textContent = 'Reset garden';
    this.resetBtn.hidden = true;
    this.resetBtn.addEventListener('click', () => this.reset());
    ctx.overlay.append(this.resetBtn);
    this.measure();
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn);
      this.cleanup.push(() => window.removeEventListener(type, fn));
    };
    on('pointermove', (e) => (this.mouse = { x: e.clientX, y: e.clientY }));
    on('pointerdown', (e) => {
      if (e.target !== ctx.canvas || ctx.host.tracking) return;
      this.mouse = { x: e.clientX, y: e.clientY };
      this.toggleAt(e.clientX, e.clientY);
    });
  }

  /** The bed fills the space between the tabs and the bottom buttons, and steers clear of the camera preview. */
  private measure() {
    const { width: W, height: H } = this.ctx.size;
    const pv = this.ctx.previewRect();
    const key = `${W}|${H}|${pv ? [pv.left, pv.top].map(Math.round).join(',') : ''}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const edge = W < 640 ? 16 : 48;
    const top = W < 640 ? 64 : 92;
    let box = { x: edge, y: top, w: W - 2 * edge, h: H - top - 100 };
    let l = layoutGarden(box);
    if (pv && pv.width > 80 && l.x + l.w > pv.left && l.y + l.h > pv.top) {
      box = { ...box, h: Math.max(120, pv.top - 16 - top) };
      l = layoutGarden(box);
    }
    this.layout = l;
    this.resetBtn.style.left = `${l.x + l.w / 2}px`;
    this.resetBtn.style.top = `${l.y + l.h + 14}px`;
  }

  private heads() {
    return Array.from({ length: N }, (_, i) => headPos(this.layout, i));
  }

  private toggleAt(x: number, y: number) {
    const i = pinchTarget(this.heads(), this.bloom, this.kept, x, y, this.layout.cell);
    if (i < 0) return;
    this.kept[i] = !this.kept[i];
    this.wiggle[i] = TUNING.WIGGLE_TIME;
  }

  private reset() {
    this.kept.fill(false);
    this.celebrate = -1;
    this.resetBtn.hidden = true;
  }

  update(hands: HandSignals, dt: number) {
    this.time += dt;
    this.measure();
    const l = this.layout;
    const live = this.ctx.host.tracking;
    // Points that open flowers: the palm and the index tip of each hand, or the mouse.
    const pts: { x: number; y: number }[] = [];
    if (live) {
      for (const st of [hands.left.state, hands.right.state]) {
        if (!st.present || st.landmarks.length < 9) continue;
        pts.push(this.ctx.toScreen(st.palm.x, st.palm.y), this.ctx.toScreen(st.landmarks[8].x, st.landmarks[8].y));
        const was = this.pinchWas[st.label];
        if (st.pinching && !was) {
          const a = st.landmarks[4];
          const b = st.landmarks[8];
          const p = this.ctx.toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
          this.toggleAt(p.x, p.y);
        }
        this.pinchWas[st.label] = st.pinching;
      }
      for (const lab of ['Left', 'Right'] as const) if (!(lab === 'Left' ? hands.left : hands.right).state.present) this.pinchWas[lab] = false;
    } else if (this.mouse) {
      pts.push(this.mouse);
    }

    for (let i = 0; i < N; i++) {
      const h = headPos(l, i);
      let target = 0;
      for (const p of pts) target = Math.max(target, targetBloom(Math.hypot(p.x - h.x, p.y - h.y), l.cell));
      this.bloom[i] = stepBloom(this.bloom[i], target, this.kept[i], dt);
      this.wiggle[i] = Math.max(0, this.wiggle[i] - dt);
    }

    if (this.celebrate < 0 && this.kept.every(Boolean)) this.celebrate = 0;
    if (this.celebrate >= 0) {
      if (!this.kept.every(Boolean)) {
        this.celebrate = -1;
        this.resetBtn.hidden = true;
      } else {
        this.celebrate += dt;
        this.resetBtn.hidden = this.celebrate < TUNING.CELEBRATE_TIME;
      }
    }
  }

  draw(g: CanvasRenderingContext2D) {
    const l = this.layout;
    drawBed(g, l, this.pal);
    const t = this.time;
    const party = this.celebrate >= 0 && this.celebrate < TUNING.CELEBRATE_TIME + 1.2 ? 1 : this.celebrate >= 0 ? 0.35 : 0;
    for (let i = 0; i < N; i++) {
      const calm = Math.sin(t * 1.1 + i * 1.7) * 0.012;
      const w = (this.wiggle[i] / TUNING.WIGGLE_TIME) * Math.sin(t * 22 + i) * 0.035;
      // Everyone sways together (a wave across the bed) while celebrating.
      const sway = party * Math.sin(t * 3.2 - (i % COLS) * 0.5) * 0.09;
      drawFlower(g, l, this.pal, i, { bloom: this.bloom[i], lean: calm + w + sway });
    }
    drawGrain(g, l);
  }

  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.resetBtn.remove();
  }
}
