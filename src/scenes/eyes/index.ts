import type { HandSignals } from '../../hands';
import type { Scene, SceneContext } from '../../scene';
import './eyes.css';
import { Blinker, gaze, StartleDetector, TUNING } from './look';

type View = 'in' | 'out';
const SVG_NS = 'http://www.w3.org/2000/svg';
const URLS: Record<View, string> = { in: '/characters/face.svg', out: '/characters/body.svg' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K) => document.createElementNS(SVG_NS, tag);

/** One animated eye: the pupil group that moves, plus the lid and the startle transform targets. */
interface Eye {
  /** Wrapper of the pupil that moves (translated by the gaze). */
  inner: SVGGElement;
  /** Rest offset that puts the pupil in the middle of the eye. */
  rest: { x: number; y: number };
  rangeX: number;
  rangeY: number;
  /** Eye centre and size in SVG units. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** The element whose screen position is the eye's position. */
  anchor: SVGGraphicsElement;
  /** Sets the lid closure, 0 to 1. */
  setLid(k: number): void;
  /** Elements that scale around the eye centre when she is startled (face only). */
  startle: SVGElement[];
  /** Current smoothed gaze, -1 to 1. */
  gx: number;
  gy: number;
}

interface Rig {
  view: View;
  host: HTMLElement;
  eyes: { left: Eye; right: Eye };
  brows: SVGElement[];
  /** Elements of the head that tilt (ZOOM OUT). */
  head: SVGElement[];
  /** Applies the tilt to the head and the pupils. */
  tilt: boolean;
  /** Close-up only: parts of the face that drift toward the gaze, the nearer ones (deeper) more than the hair. */
  drift: { el: SVGElement; depth: number }[];
}

/** How far (SVG units) the nearest features of the close-up face drift toward where she looks. */
const DRIFT = { x: 14, y: 9 };

const bbox = (e: SVGGraphicsElement) => e.getBBox();

/** Builds the rig of the close-up face: pupils clipped to the white of each eye, and a skin-coloured lid. */
function rigFace(host: HTMLElement): Rig {
  const svg = host.querySelector('svg')!;
  const skin = svg.querySelector('#face')?.getAttribute('fill') ?? '#fda2d0';
  const defs = svgEl('defs');
  svg.prepend(defs);
  const make = (side: 'left' | 'right'): Eye => {
    const eyeEl = svg.querySelector<SVGGraphicsElement>(`#eye-${side}`)!;
    const pupil = svg.querySelector<SVGGraphicsElement>(`#pupil-${side}`)!;
    const eb = bbox(eyeEl);
    const pb = bbox(pupil);
    const cx = eb.x + eb.width / 2;
    const cy = eb.y + eb.height / 2;

    // The pupil is clipped to the eye shape, so it can never leave the eye.
    const clip = svgEl('clipPath');
    clip.id = `eye-clip-${side}`;
    const shape = eyeEl.cloneNode() as SVGElement;
    for (const a of ['id', 'fill', 'stroke', 'transform']) shape.removeAttribute(a);
    clip.append(shape);
    defs.append(clip);
    const clipG = svgEl('g');
    clipG.setAttribute('clip-path', `url(#${clip.id})`);
    const inner = svgEl('g');
    pupil.before(clipG);
    clipG.append(inner);
    inner.append(pupil);

    // The lid: the eye shape in skin colour, revealed from the top down by a growing rectangle.
    const lidClip = svgEl('clipPath');
    lidClip.id = `lid-clip-${side}`;
    const rect = svgEl('rect');
    rect.setAttribute('x', String(eb.x - 4));
    rect.setAttribute('y', String(eb.y - 4));
    rect.setAttribute('width', String(eb.width + 8));
    rect.setAttribute('height', '0');
    lidClip.append(rect);
    defs.append(lidClip);
    const lid = eyeEl.cloneNode() as SVGElement;
    lid.removeAttribute('id');
    lid.setAttribute('fill', skin);
    lid.setAttribute('stroke', skin);
    lid.setAttribute('stroke-width', '1');
    lid.setAttribute('clip-path', `url(#${lidClip.id})`);
    const lidG = svgEl('g');
    lidG.append(lid);
    clipG.after(lidG);

    return {
      inner,
      rest: { x: cx - (pb.x + pb.width / 2), y: cy - (pb.y + pb.height / 2) },
      rangeX: (eb.width - pb.width) / 2 + 4,
      rangeY: eb.height * 0.12,
      cx,
      cy,
      w: eb.width,
      h: eb.height,
      anchor: eyeEl,
      setLid: (k) => rect.setAttribute('height', String((eb.height + 8) * 1.02 * k)),
      startle: [eyeEl, clipG, lidG],
      gx: 0,
      gy: 0,
    };
  };
  const brows = [...svg.querySelectorAll<SVGElement>('[id^="eyebrows"]')];
  const eyes = { left: make('left'), right: make('right') };
  // Depth: hair and ears sit behind the face, the face and cheeks in the middle, the features in front.
  const drift: Rig['drift'] = [];
  const add = (el: Element | null, depth: number) => el && drift.push({ el: el as SVGElement, depth });
  svg.querySelectorAll('[id^="hair"], [id^="ears"], [id^="earrings"]').forEach((e) => add(e, 0.35));
  add(svg.querySelector('#face'), 1);
  svg.querySelectorAll('[id^="blush"]').forEach((e) => add(e, 1));
  for (const id of ['nose', 'mouth']) add(svg.querySelector('#' + id), 1.5);
  brows.forEach((b) => add(b, 1.5));
  for (const side of ['left', 'right'] as const) eyes[side].startle.forEach((n) => add(n, 1.5));
  return { view: 'in', host, eyes, brows, head: [], tilt: false, drift };
}

/** Builds the rig of the full-body figure: dot eyes that move over the face, a lid, and a head that tilts. */
function rigBody(host: HTMLElement): Rig {
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
      rest: { x: 0, y: 0 },
      rangeX: 14,
      rangeY: 8,
      cx,
      cy,
      w: pb.width,
      h: pb.height,
      anchor: pupil,
      setLid: (k) => lid.setAttribute('transform', `translate(0 ${top}) scale(1 ${k}) translate(0 ${-top})`),
      startle: [],
      gx: 0,
      gy: 0,
    };
  };
  return { view: 'out', host, eyes: { left: make(pupils[0]), right: make(pupils[1]) }, brows: [], head, tilt: true, drift: [] };
}

/**
 * My Eyes Follow You: a girl whose eyes follow your hands (or the mouse), blink now and then, look around when
 * nobody is there and jump when a hand comes very close. ZOOM IN is a close-up of her face, ZOOM OUT the whole girl.
 */
export class EyesScene implements Scene {
  readonly help = 'Move your hand and she watches it. Show two hands and each eye picks one. Get close and she\'ll notice. No camera? Move your mouse.';

  private ctx!: SceneContext;
  private stage = el('div', 'eyes-stage');
  private rigs: Partial<Record<View, Rig>> = {};
  private hosts: Record<View, HTMLElement> = { in: el('div', 'eyes-view'), out: el('div', 'eyes-view') };
  private chips: Partial<Record<View, HTMLButtonElement>> = {};
  private view: View = 'out';
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
    this.stage.append(this.hosts.in, this.hosts.out);
    this.hosts.out.classList.add('on');
    ctx.overlay.append(this.stage, this.buildUI());
    for (const v of ['in', 'out'] as const) void this.load(v);
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

  private buildUI() {
    const root = el('div', 'win-ui');
    const row = el('div', 'win-chips');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'View');
    for (const [v, label] of [['in', 'ZOOM IN'], ['out', 'ZOOM OUT']] as const) {
      const b = el('button', 'pill small', label);
      b.type = 'button';
      b.addEventListener('click', () => this.setView(v));
      row.append(b);
      this.chips[v] = b;
    }
    root.append(row);
    this.syncChips();
    return root;
  }

  private syncChips() {
    for (const v of ['in', 'out'] as const) this.chips[v]?.setAttribute('aria-pressed', String(v === this.view));
  }

  private setView(v: View) {
    this.view = v;
    this.hosts.in.classList.toggle('on', v === 'in');
    this.hosts.out.classList.toggle('on', v === 'out');
    this.syncChips();
  }

  private async load(v: View) {
    try {
      const text = await (await fetch(URLS[v])).text();
      if (this.disposed) return;
      this.hosts[v].innerHTML = text;
      const svg = this.hosts[v].querySelector('svg')!;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      // The close-up sits in the lower part of its frame; crop the empty top so she fills the stage.
      if (v === 'in') svg.setAttribute('viewBox', '24 290 688 446');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'A girl whose eyes follow your hand');
      this.rigs[v] = v === 'in' ? rigFace(this.hosts[v]) : rigBody(this.hosts[v]);
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
    for (const rig of Object.values(this.rigs)) {
      if (!rig) continue;
      const hostOn = rig.view === this.view;
      const sides = [['left', tg[0]], ['right', tg[1]]] as const;
      for (const [side, t] of sides) {
        const eye = rig.eyes[side];
        const r = eye.anchor.getBoundingClientRect();
        const g = gaze(r.x + r.width / 2, r.y + r.height / 2, t.x, t.y, reach);
        eye.gx += (g.x - eye.gx) * k;
        eye.gy += (g.y - eye.gy) * k;
        if (hostOn && rig.tilt) tiltTarget = Math.max(-1, Math.min(1, ((tg[0].x + tg[1].x) / 2 - (r.x + r.width / 2)) / reach));
      }
    }
    this.tilt += (tiltTarget - this.tilt) * k;

    for (const rig of Object.values(this.rigs)) {
      if (!rig) continue;
      const deg = rig.tilt ? this.tilt * TUNING.TILT_DEG : 0;
      const rot = `rotate(${deg.toFixed(2)} 350 300)`;
      if (rig.tilt) for (const h of rig.head) h.setAttribute('transform', rot);
      for (const side of ['left', 'right'] as const) {
        const e = rig.eyes[side];
        const x = e.rest.x + e.gx * e.rangeX;
        const y = e.rest.y + e.gy * e.rangeY;
        e.inner.setAttribute('transform', `${rig.tilt ? rot + ' ' : ''}translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        e.setLid(lid);
        // Face: the eyes widen a little. The pupil group scales with its clip.
        const s = 1 + 0.16 * pop;
        for (const n of e.startle) n.setAttribute('transform', `translate(${e.cx} ${e.cy}) scale(${s.toFixed(3)}) translate(${-e.cx} ${-e.cy})`);
      }
      if (rig.drift.length) {
        const gx = (rig.eyes.left.gx + rig.eyes.right.gx) / 2;
        const gy = (rig.eyes.left.gy + rig.eyes.right.gy) / 2;
        for (const { el, depth } of rig.drift) el.style.translate = `${(gx * DRIFT.x * depth).toFixed(2)}px ${(gy * DRIFT.y * depth).toFixed(2)}px`;
      }
      for (const b of rig.brows) b.setAttribute('transform', `translate(0 ${(-9 * pop).toFixed(2)})`);
    }
    // Zoomed out she gives a small jump instead.
    this.hosts.out.style.transform = `translateY(${(-16 * pop).toFixed(1)}px)`;
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
