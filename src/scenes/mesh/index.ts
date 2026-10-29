import type { HandSignals } from '../../hands';
import type { Scene, SceneContext } from '../../scene';
import './mesh.css';
import { HandController, stepDial } from './handcontrol';
import { BagWorld, MAX_BALLS, BALL_R, type Ball } from './physics';
import { drawBall, drawMesh } from './render';
import { getSprites, type BallSet } from './sprites';

/** What happens to the hook when released. 'stay' keeps it; 'home' springs back to the top centre. */
const RELEASE_MODE: 'stay' | 'home' = 'stay';
/** Count changes per second at most. */
const MAX_CHANGES_PER_SEC = 6;
const FIT_HEIGHT = 0.8;
const FIT_WIDTH = 0.7;
// Time constant: about 600 ms to settle, or nearly instant with reduced motion.
const FIT_EASE_SECONDS = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.03 : 0.2;
const HOME = { x: 0.5, y: 0.1 };
const POP_SECONDS = 0.25;
/** Keep the hanger clear of the app header. */
const HEADER_PX = 56;

interface Ghost {
  ball: Ball;
  age: number;
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class MeshScene implements Scene {
  readonly help = 'Open hand: raise or lower to set the number. Fist: grab and move the mesh. Swipe: a gust of wind. Mouse: drag the mesh, arrow keys change the number.';

  private ctx!: SceneContext;
  private world = new BagWorld();
  private ghosts: Ghost[] = [];
  private set: BallSet = 'marbles';
  private sprites = getSprites('marbles');

  /** Wanted ball count, and the time until the next change is allowed. */
  private target = 0;
  private changeTimer = 0;

  /** World to screen: screen = offset + world * scale. */
  private scale = 20;
  private offset = { x: 0, y: 0 };
  /** Where the user wants the hook, as a fraction of the viewport. */
  private goal = { ...HOME };
  private lastSize = { w: 0, h: 0 };

  private drag: { pointerId: number; dx: number; dy: number } | null = null;
  private wheelAcc = 0;
  private cleanup: (() => void)[] = [];

  private controller = new HandController();
  private handsOn = false;

  private countEl!: HTMLElement;
  private labelEl!: HTMLElement;
  private setButtons: Record<BallSet, HTMLButtonElement> | null = null;

  init(ctx: SceneContext) {
    this.ctx = ctx;
    this.buildUI();
    this.bindInput();
    this.fitNow();

    // The camera belongs to the app: hands drive the mesh whenever it is on, otherwise mouse and keyboard.
    this.setHands(ctx.host.tracking);
    this.cleanup.push(ctx.host.onTrackingChange((tracking) => this.setHands(tracking)));
    // A fast open-hand swipe is a gust of wind.
    this.cleanup.push(
      ctx.hands.on('swipe', (e) => {
        if (!this.handsOn || e.openness < 0.5) return;
        const dir = e.direction === 'right' ? 1 : -1;
        this.world.gust(dir * Math.min(16, 6 + 3 * e.speed));
      }),
    );
  }

  private setHands(on: boolean) {
    this.handsOn = on;
    if (!on) this.controller.reset();
  }

  // ----------------------------------------------------------------- UI

  private buildUI() {
    const root = this.ctx.overlay;
    const counter = el('div', 'mesh-counter');
    this.countEl = el('div', 'mesh-count', '0');
    this.countEl.setAttribute('aria-live', 'polite');
    this.labelEl = el('div', 'mesh-label', 'balls');
    const minus = el('button', 'mesh-step', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Remove one');
    const plus = el('button', 'mesh-step', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Add one');
    minus.addEventListener('click', () => this.setTarget(this.target - 1));
    plus.addEventListener('click', () => this.setTarget(this.target + 1));
    const steps = el('div', 'mesh-steps');
    steps.append(minus, plus);

    const sets = el('div', 'mesh-sets');
    sets.setAttribute('role', 'group');
    sets.setAttribute('aria-label', 'Ball set (M)');
    const marbles = el('button', 'mesh-set', 'marbles');
    const fruit = el('button', 'mesh-set', 'fruit');
    marbles.type = fruit.type = 'button';
    marbles.addEventListener('click', () => this.chooseSet('marbles'));
    fruit.addEventListener('click', () => this.chooseSet('fruit'));
    sets.append(marbles, fruit);
    this.setButtons = { marbles, fruit };

    counter.append(this.countEl, this.labelEl, steps, sets);
    root.append(counter);
    this.refreshUI();
  }

  private refreshUI() {
    this.countEl.textContent = String(this.target);
    this.labelEl.textContent = this.set === 'marbles' ? 'balls' : 'fruit';
    if (this.setButtons) {
      for (const key of ['marbles', 'fruit'] as const) {
        this.setButtons[key].setAttribute('aria-pressed', String(this.set === key));
      }
    }
  }

  private setTarget(n: number) {
    const v = Math.max(0, Math.min(MAX_BALLS, Math.round(n)));
    if (v === this.target) return;
    this.target = v;
    this.refreshUI();
  }

  private chooseSet(set: BallSet) {
    this.set = set;
    this.sprites = getSprites(set);
    this.refreshUI();
  }

  // -------------------------------------------------------------- input

  private bindInput() {
    const canvas = this.ctx.canvas;
    const on = <T extends EventTarget>(t: T, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };

    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') this.setTarget(this.target + 1);
      else if (e.key === 'ArrowDown' || e.key === '-' || e.key === '_') this.setTarget(this.target - 1);
      else if (e.key === 'm' || e.key === 'M') this.chooseSet(this.set === 'marbles' ? 'fruit' : 'marbles');
      else return;
      e.preventDefault();
    });

    on(canvas, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.wheelAcc += e.deltaY;
      while (Math.abs(this.wheelAcc) >= 80) {
        this.setTarget(this.target + (this.wheelAcc < 0 ? 1 : -1));
        this.wheelAcc -= Math.sign(this.wheelAcc) * 80;
      }
    }, { passive: false });

    on(canvas, 'pointerdown', (e: PointerEvent) => {
      if (this.drag || !this.nearHanger(e.offsetX, e.offsetY)) return;
      const hook = this.hookScreen();
      this.drag = { pointerId: e.pointerId, dx: e.offsetX - hook.x, dy: e.offsetY - hook.y };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    on(canvas, 'pointermove', (e: PointerEvent) => {
      const { width, height } = this.ctx.size;
      if (this.drag?.pointerId === e.pointerId) {
        this.goal.x = (e.offsetX - this.drag.dx) / width;
        this.goal.y = (e.offsetY - this.drag.dy) / height;
      } else if (!this.drag) {
        canvas.style.cursor = this.nearHanger(e.offsetX, e.offsetY) ? 'grab' : '';
      }
    });
    const release = (e: PointerEvent) => {
      if (this.drag?.pointerId !== e.pointerId) return;
      this.drag = null;
      canvas.style.cursor = '';
      if (RELEASE_MODE === 'home') this.goal = { ...HOME };
    };
    on(canvas, 'pointerup', release);
    on(canvas, 'pointercancel', release);
    this.cleanup.push(() => (canvas.style.cursor = ''));
  }

  /** The hanger and the top of the bag count as the handle. */
  private nearHanger(x: number, y: number) {
    const w = this.world;
    const pts = [w.hook, w.left[0], w.left[1], w.right[1], w.left[2], w.right[2]];
    const reach = 46;
    return pts.some((p) => {
      const s = this.toScreen(p.x, p.y);
      return Math.hypot(s.x - x, s.y - y) < reach;
    });
  }

  // ------------------------------------------------------------ camera

  private toScreen(x: number, y: number) {
    return { x: this.offset.x + x * this.scale, y: this.offset.y + y * this.scale };
  }

  private hookScreen() {
    return this.toScreen(this.world.hook.x, this.world.hook.y);
  }

  /** Distance from the hook to the farthest part of the bag; swing does not change it. */
  private reach() {
    const w = this.world;
    let r = 0;
    for (const p of [...w.left, ...w.right]) r = Math.max(r, Math.hypot(p.x - w.hook.x, p.y - w.hook.y));
    return r + BALL_R * 1.2;
  }

  private fitScale() {
    const { width, height } = this.ctx.size;
    const bagW = this.world.width() + 2 * BALL_R;
    return Math.max(8, Math.min(58, (FIT_HEIGHT * height) / this.reach(), (FIT_WIDTH * width) / bagW));
  }

  /** Snap the view without easing. */
  private fitNow() {
    const { width, height } = this.ctx.size;
    this.scale = this.fitScale();
    this.offset.x = this.goal.x * width - this.world.hook.x * this.scale;
    this.offset.y = this.goal.y * height - this.world.hook.y * this.scale;
    this.lastSize = { w: width, h: height };
  }

  // ------------------------------------------------------------ update

  update(hands: HandSignals, dt: number) {
    const { width, height } = this.ctx.size;
    const world = this.world;

    if (this.handsOn) {
      this.controller.update(hands, dt);
      const { dial, grab } = this.controller;
      if (dial.active) this.setTarget(stepDial(this.target, dial.raw));
      if (grab && !this.drag) {
        this.goal.x = grab.x;
        this.goal.y = grab.y;
      }
    }

    // Count changes, rate limited. A blocked mouth just retries next frame.
    this.changeTimer = Math.max(0, this.changeTimer - dt);
    if (this.changeTimer === 0 && this.target !== world.balls.length) {
      if (this.target > world.balls.length) {
        if (world.addBall()) this.changeTimer = 1 / MAX_CHANGES_PER_SEC;
      } else {
        const ball = world.removeTop();
        if (ball) {
          this.ghosts.push({ ball, age: 0 });
          this.changeTimer = 1 / MAX_CHANGES_PER_SEC;
        }
      }
    }

    // Hook goal in screen space, kept where the whole bag stays on screen.
    const maxY = Math.max(HEADER_PX, 0.04 * height, 0.97 * height - this.reach() * this.scale);
    const gx = Math.min(0.88 * width, Math.max(0.12 * width, this.goal.x * width));
    const gy = Math.min(maxY, Math.max(Math.max(0.04 * height, HEADER_PX), this.goal.y * height));
    world.setHookTarget((gx - this.offset.x) / this.scale, (gy - this.offset.y) / this.scale);
    world.advance(dt);

    // Auto-fit: ease the zoom, keeping the hook where it is on screen.
    const hook = this.hookScreen();
    if (this.lastSize.w !== width || this.lastSize.h !== height) {
      this.lastSize = { w: width, h: height };
    }
    const next = this.scale + (this.fitScale() - this.scale) * (1 - Math.exp(-dt / FIT_EASE_SECONDS));
    this.offset.x = hook.x - world.hook.x * next;
    this.offset.y = hook.y - world.hook.y * next;
    this.scale = next;

    for (const g of this.ghosts) {
      g.age += dt;
      g.ball.y -= 24 * dt;
      g.ball.angle += 3 * dt;
    }
    this.ghosts = this.ghosts.filter((g) => g.age < POP_SECONDS);
  }

  // -------------------------------------------------------------- draw

  draw(g: CanvasRenderingContext2D) {
    const { width, height, dpr } = this.ctx.size;
    g.fillStyle = cssVar('--mesh-paper') || '#E9E2D3';
    g.fillRect(0, 0, width, height);

    g.save();
    g.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.offset.x, dpr * this.offset.y);
    for (const b of this.world.balls) drawBall(g, b, this.sprites, BALL_R * b.scale);
    drawMesh(g, this.world, cssVar('--mesh-line') || '#F26A1B', 3 / this.scale);
    for (const gh of this.ghosts) {
      const k = gh.age / POP_SECONDS;
      drawBall(g, gh.ball, this.sprites, BALL_R * (1 + 0.15 * k), 1 - k);
    }
    g.restore();
  }

  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.ghosts = [];
  }
}
