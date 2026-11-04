import type { HandSignals } from '../../hands';
import type { Scene, SceneContext } from '../../scene';
import './eyes.css';
import { Blinker, gaze, StartleDetector, TUNING } from './look';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BODY_URL = '/characters/body.svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K) => document.createElementNS(SVG_NS, tag);

/** One animated eye: the dot that moves, and the lid that blinks. */
interface Eye {
  /** Wrapper of the pupil that moves (translated by the gaze). */
  inner: SVGGElement;
  rangeX: number;
  rangeY: number;
  /** The element whose screen position is the eye's position. */
  anchor: SVGGraphicsElement;
  /** Sets the lid closure, 0 to 1. */
  setLid(k: number): void;
  /** Current smoothed gaze, -1 to 1. */
  gx: number;
  gy: number;
}

interface Rig {
  eyes: { left: Eye; right: Eye };
  /** Elements of the head that tilt toward the hand. */
  head: SVGElement[];
}

const bbox = (e: SVGGraphicsElement) => e.getBBox();

/** Builds the rig of the figure: dot eyes that move over the face, a lid, and a head that tilts. */
function buildRig(host: HTMLElement): Rig {
  const svg = host.querySelector('svg')!;
  const skin = '#FDA2D0';
  const pupils = ['left', 'right'].map((s) => svg.querySelector<SVGGraphicsElement>(`#pupil-${s}`)!);
  // Head parts: the hair and everything whose middle sits above the shoulders.
  const head: SVGElement[] = [];
  svg.querySelectorAll<SVGGraphicsElement>('path, ellipse').forEach((e) => {
    if (pupils.includes(e)) return;
    const b = bbox(e);
    if (e.id.startsWith('hair') || b.y + b.height / 2 < 300) head.push(e);
  });
  const make = (pupil: SVGGraphicsElement): Eye => {
    const pb = bbox(pupil);
    const cx = pb.x + pb.width / 2;
    const cy = pb.y + pb.height / 2;
    const inner = svgEl('g');
    pupil.before(inner);
    inner.append(pupil);
    const lid = svgEl('ellipse');
    lid.setAttribute('cx', String(cx));
    lid.setAttribute('cy', String(cy));
    lid.setAttribute('rx', String(pb.width * 0.95));
    lid.setAttribute('ry', String(pb.height * 0.62));
    lid.setAttribute('fill', skin);
    const top = pb.y - pb.height * 0.2;
    lid.setAttribute('transform', `translate(0 ${top}) scale(1 0) translate(0 ${-top})`);
    inner.append(lid);
    return {
      inner,
      rangeX: 14,
      rangeY: 8,
      anchor: pupil,
      setLid: (k) => lid.setAttribute('transform', `translate(0 ${top}) scale(1 ${k}) translate(0 ${-top})`),
      gx: 0,
      gy: 0,
    };
  };
  return { eyes: { left: make(pupils[0]), right: make(pupils[1]) }, head };
}

/**
 * My Eyes Follow You: a girl whose eyes follow your hands (or the mouse), blink now and then, look around when
 * nobody is there and jump when a hand comes very close.
 */
export class EyesScene implements Scene {
  readonly help = 'Move your hand and she watches it. Show two hands and each eye picks one. Get close and she\'ll notice. No camera? Move your mouse.';

  private ctx!: SceneContext;
  private stage = el('div', 'eyes-stage');
  private host = el('div', 'eyes-view');
  private rig: Rig | null = null;
  private disposed = false;
  private cleanup: (() => void)[] = [];
  private mouse: { x: number; y: number } | null = null;
  private blinker = new Blinker();
  private startleDet = new StartleDetector();
  private startle = 0;
  private time = 0;
  private tilt = 0;

  init(ctx: SceneContext) {
    this.ctx = ctx;
    this.stage.append(this.host);
    ctx.overlay.append(this.stage);
    void this.load();
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn);
      this.cleanup.push(() => window.removeEventListener(type, fn));
    };
    on('pointermove', (e) => (this.mouse = { x: e.clientX, y: e.clientY }));
    on('pointerdown', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      // With no camera a click is "getting close".
      if (!ctx.host.tracking && e.target === ctx.canvas) this.doStartle();
    });
  }

  private async load() {
    try {
      const text = await (await fetch(BODY_URL)).text();
      if (this.disposed) return;
      this.host.innerHTML = text;
      const svg = this.host.querySelector('svg')!;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'A girl whose eyes follow your hand');
      this.rig = buildRig(this.host);
    } catch {
      // Without the picture the scene stays empty rather than breaking the app.
    }
  }

  private doStartle() {
    this.startle = 1;
    this.blinker.blinkNow();
  }

  /** Screen positions the two eyes should look at, in order [left eye, right eye]. */
  private targets(hands: HandSignals): [{ x: number; y: number }, { x: number; y: number }] {
    const { ctx } = this;
    const live = [hands.left.state, hands.right.state].filter((s) => s.present);
    if (ctx.host.tracking && live.length) {
      const pts = live.map((s) => ctx.toScreen(s.palm.x, s.palm.y)).sort((a, b) => a.x - b.x);
      // Two hands: each eye picks a different one, crossed over, so she goes cross-eyed.
      if (pts.length === 2) return [pts[1], pts[0]];
      return [pts[0], pts[0]];
    }
    if (!ctx.host.tracking && this.mouse) return [this.mouse, this.mouse];
    // Nobody there: slowly look around.
    const { width: W, height: H } = ctx.size;
    const t = this.time;
    const p = { x: W / 2 + Math.sin(t * 0.55) * W * 0.32, y: H / 2 + Math.sin(t * 0.9 + 1) * H * 0.18 };
    return [p, p];
  }

  update(hands: HandSignals, dt: number) {
    this.time += dt;
    this.blinker.update(dt);
    const close = closestHand(this.ctx, hands);
    if (this.startleDet.update(close, dt)) this.doStartle();
    this.startle = Math.max(0, this.startle - dt / TUNING.STARTLE_TIME);

    const tg = this.targets(hands);
    const reach = Math.min(this.ctx.size.width, this.ctx.size.height) * 0.5;
    const k = 1 - Math.exp(-dt / TUNING.SMOOTH);
    const lid = this.blinker.lid();
    // The startle is a quick overshoot that settles.
    const pop = Math.sin(Math.min(1, this.startle) * Math.PI) * (this.startle > 0 ? 1 : 0);

    let tiltTarget = 0;
    const rig = this.rig;
    if (rig) {
      for (const [side, t] of [['left', tg[0]], ['right', tg[1]]] as const) {
        const eye = rig.eyes[side];
        const r = eye.anchor.getBoundingClientRect();
        const g = gaze(r.x + r.width / 2, r.y + r.height / 2, t.x, t.y, reach);
        eye.gx += (g.x - eye.gx) * k;
        eye.gy += (g.y - eye.gy) * k;
        tiltTarget = Math.max(-1, Math.min(1, ((tg[0].x + tg[1].x) / 2 - (r.x + r.width / 2)) / reach));
      }
    }
    this.tilt += (tiltTarget - this.tilt) * k;

    if (rig) {
      const rot = `rotate(${(this.tilt * TUNING.TILT_DEG).toFixed(2)} 350 300)`;
      for (const h of rig.head) h.setAttribute('transform', rot);
      for (const side of ['left', 'right'] as const) {
        const e = rig.eyes[side];
        e.inner.setAttribute('transform', `${rot} translate(${(e.gx * e.rangeX).toFixed(2)} ${(e.gy * e.rangeY).toFixed(2)})`);
        e.setLid(lid);
      }
    }
    // A startle is a small jump.
    this.host.style.transform = `translateY(${(-16 * pop).toFixed(1)}px)`;
  }

  draw() {}

  dispose() {
    this.disposed = true;
    this.cleanup.forEach((fn) => fn());
    this.stage.remove();
  }
}

/** The largest hand scale in view (0 with no hand). */
function closestHand(ctx: SceneContext, hands: HandSignals) {
  if (!ctx.host.tracking) return 0;
  return Math.max(hands.left.state.present ? hands.left.state.scale : 0, hands.right.state.present ? hands.right.state.scale : 0);
}
