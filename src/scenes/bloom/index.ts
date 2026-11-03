import type { HandSignals } from '../../hands';
import type { Scene, SceneContext } from '../../scene';
import { pinchVase, stepBloom, TUNING, vaseTargets } from './logic';
import { drawGrain, drawLedge, drawVase, layoutRow, vasePalette, VASES, type Palette, type Row } from './vases';

/** Blooming Flowers: five vases on a ledge; the plant nearest your hand blooms and closes again when you move on. */
export class BloomScene implements Scene {
  readonly help = 'Move your hand left and right to bloom a vase. Move away and it closes back. Pinch to keep it blooming. No camera? Hover to bloom, click to keep.';

  private ctx!: SceneContext;
  private pal!: Palette;
  private row!: Row;
  private rowKey = '';
  private bloom = new Array<number>(VASES).fill(0);
  private kept = new Array<boolean>(VASES).fill(false);
  private wiggle = new Array<number>(VASES).fill(0);
  private pinchWas: Record<'Left' | 'Right', boolean> = { Left: false, Right: false };
  private mouseX: number | null = null;
  private time = 0;
  /** Seconds since every plant was kept open, or -1. */
  private celebrate = -1;
  private resetBtn = document.createElement('button');
  private cleanup: (() => void)[] = [];

  init(ctx: SceneContext) {
    this.ctx = ctx;
    this.pal = vasePalette();
    this.resetBtn.type = 'button';
    this.resetBtn.className = 'pill blue bloom-reset';
    this.resetBtn.textContent = 'Reset';
    this.resetBtn.hidden = true;
    this.resetBtn.addEventListener('click', () => this.reset());
    ctx.overlay.append(this.resetBtn);
    this.measure();
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn);
      this.cleanup.push(() => window.removeEventListener(type, fn));
    };
    on('pointermove', (e) => (this.mouseX = e.clientX));
    on('pointerdown', (e) => {
      if (e.target !== ctx.canvas || ctx.host.tracking) return;
      this.mouseX = e.clientX;
      this.toggleAt(e.clientX);
    });
  }

  private measure() {
    const { width: W, height: H } = this.ctx.size;
    const key = `${W}|${H}`;
    if (key === this.rowKey) return;
    this.rowKey = key;
    this.row = layoutRow(W, H, W < 640 ? 64 : 96);
    this.resetBtn.style.left = `${W / 2}px`;
    this.resetBtn.style.top = `${this.row.baseY + this.row.u * 0.45}px`;
  }

  private toggleAt(x: number) {
    const i = pinchVase(this.row.xs, x, this.row.pitch);
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
    const live = this.ctx.host.tracking;
    // Only the horizontal position of each palm matters (or of the mouse).
    const xs: number[] = [];
    if (live) {
      for (const st of [hands.left.state, hands.right.state]) {
        if (!st.present || st.landmarks.length < 9) continue;
        xs.push(this.ctx.toScreen(st.palm.x, st.palm.y).x);
        const was = this.pinchWas[st.label];
        if (st.pinching && !was) {
          const a = st.landmarks[4];
          const b = st.landmarks[8];
          this.toggleAt(this.ctx.toScreen((a.x + b.x) / 2, (a.y + b.y) / 2).x);
        }
        this.pinchWas[st.label] = st.pinching;
      }
      for (const lab of ['Left', 'Right'] as const) if (!(lab === 'Left' ? hands.left : hands.right).state.present) this.pinchWas[lab] = false;
    } else if (this.mouseX !== null) {
      xs.push(this.mouseX);
    }

    const target = vaseTargets(this.row.xs, xs);
    for (let i = 0; i < VASES; i++) {
      this.bloom[i] = stepBloom(this.bloom[i], target[i], this.kept[i], dt);
      this.wiggle[i] = Math.max(0, this.wiggle[i] - dt);
    }

    const all = this.kept.every(Boolean);
    if (this.celebrate < 0 && all) this.celebrate = 0;
    if (this.celebrate >= 0) {
      if (!all) {
        this.celebrate = -1;
        this.resetBtn.hidden = true;
      } else {
        this.celebrate += dt;
        this.resetBtn.hidden = this.celebrate < TUNING.CELEBRATE_TIME;
      }
    }
  }

  draw(g: CanvasRenderingContext2D) {
    const { width: W, height: H } = this.ctx.size;
    const r = this.row;
    drawLedge(g, this.pal, 0, r.ledgeTop, W, H - r.ledgeTop);
    const t = this.time;
    const party = this.celebrate >= 0 && this.celebrate < TUNING.CELEBRATE_TIME + 1.2 ? 1 : this.celebrate >= 0 ? 0.3 : 0;
    for (let i = 0; i < VASES; i++) {
      const calm = Math.sin(t * 1.1 + i * 1.7) * 0.015;
      const w = (this.wiggle[i] / TUNING.WIGGLE_TIME) * Math.sin(t * 22 + i) * 0.05;
      // Everyone sways together while celebrating.
      const sway = party * Math.sin(t * 3.2 - i * 0.6) * 0.09;
      drawVase(g, this.pal, i, r.xs[i], r.baseY, r.u, this.bloom[i], calm + w + sway);
    }
    drawGrain(g, 0, 0, W, H);
  }

  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.resetBtn.remove();
  }
}
