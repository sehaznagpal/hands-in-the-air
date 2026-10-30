import type { HandSignals } from '../../hands';
import type { Scene, SceneContext } from '../../scene';
import { MarbleRenderer } from '../../shared/marbles';
import { PinchHold, SortGame, TUNING, isPinched, type Marble } from './game';

const BEST_KEY = 'sort-best';
/** Confetti colours for a full shelf. */
const CONFETTI = ['#c84a12', '#0a3699', '#f2b63a', '#e0549a'];

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

interface Hand {
  /** Whether the fingers were pinched last frame, to spot a fresh pinch. */
  down: boolean;
  point: { x: number; y: number } | null;
}

/** Sort: pinch marbles out of the air and put each on the shelf of its colour family. */
export class SortScene implements Scene {
  readonly help = 'Put each marble on the shelf with the same marble. Pinch to grab it, open your fingers to drop it. A wrong shelf or a dropped marble costs a life (5 lives).';

  private ctx!: SceneContext;
  private game = new SortGame();
  private marbles = new MarbleRenderer();
  private hands: Record<'L' | 'R', Hand> = { L: { down: false, point: null }, R: { down: false, point: null } };
  private holds = { L: new PinchHold(), R: new PinchHold() };
  private holder: 'L' | 'R' | 'mouse' | null = null;
  private layoutKey = '';
  private shownLevel = 1;
  private levelPulse = 0;
  private cleanup: (() => void)[] = [];
  private orange = '#c84a12';
  private blue = '#0a3699';

  init(ctx: SceneContext) {
    this.ctx = ctx;
    this.orange = css('--orange', this.orange);
    this.blue = css('--blue', this.blue);
    this.game.best = this.loadBest();
    this.game.onOver = (score) => this.saveBest(score);
    this.layout();
    this.bindInput();
  }

  private loadBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private saveBest(score: number) {
    try {
      localStorage.setItem(BEST_KEY, String(Math.max(score, this.loadBest())));
    } catch {
      // Storage can be blocked; the best score then lasts only for this visit.
    }
  }

  /** Shelves sit in the lower half, clear of the camera preview. */
  private layout() {
    const { width: W, height: H } = this.ctx.size;
    const pv = this.ctx.previewRect();
    const r = Math.max(15, Math.min(30, W * 0.026));
    const toggle = document.getElementById('scene-toggle')?.getBoundingClientRect();
    const topY = (toggle ? toggle.bottom : 88) + 62;
    const shelfY = Math.max(H * 0.4, Math.min(H * 0.56, (pv && pv.width > 80 ? pv.top : H) - 3.6 * r - 14));
    const key = `${W}|${H}|${Math.round(shelfY)}|${Math.round(topY)}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.game.layout(W, H, shelfY, topY);
  }

  // --------------------------------------------------------------- input

  /** Start or restart the game from the start and game over screens. */
  private startIfReady() {
    if (this.game.state !== 'play' && this.game.ready) {
      this.game.start();
      this.holder = null;
    }
  }

  private bindInput() {
    const canvas = this.ctx.canvas;
    const on = <T extends EventTarget>(t: T, type: string, fn: (e: never) => void) => {
      t.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener));
    };
    // Mouse: click a marble to pick it up (it then follows the cursor), click again to place it.
    on(canvas, 'pointerdown', (e: PointerEvent) => {
      const game = this.game;
      if (game.state !== 'play') {
        this.startIfReady();
        return;
      }
      if (this.holder === 'mouse') {
        game.release({ x: e.offsetX, y: e.offsetY });
        this.holder = null;
        canvas.style.cursor = '';
      } else if (!game.held && game.grabAt(e.offsetX, e.offsetY)) {
        this.holder = 'mouse';
        canvas.style.cursor = 'grabbing';
      }
    });
    on(canvas, 'pointermove', (e: PointerEvent) => {
      if (this.holder === 'mouse') this.game.moveHeld(e.offsetX, e.offsetY);
    });
    this.cleanup.push(() => (canvas.style.cursor = ''));
  }

  /**
   * Pinch near the marble to grab it. Once held it stays held: it is let go only when the fingers are clearly
   * open for a moment, and a lost hand is waited out, the marble staying where it was.
   */
  private readHands(hands: HandSignals, dt: number) {
    const game = this.game;
    for (const [key, side] of [['L', hands.left], ['R', hands.right]] as const) {
      const st = side.state;
      const h = this.hands[key];
      const present = st.present && st.landmarks.length > 8;
      h.point = null;
      if (present) {
        const a = st.landmarks[4];
        const b = st.landmarks[8];
        h.point = this.ctx.toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      const sample = present ? { dist: st.pinchDistance, pinching: st.pinching } : null;
      const closed = !!sample && isPinched(sample);
      if (this.holder === key) {
        if (this.holds[key].update(sample, dt)) {
          game.release();
          this.holder = null;
        } else if (h.point) {
          game.moveHeld(h.point.x, h.point.y);
        }
      } else if (closed && h.point) {
        if (game.state !== 'play') {
          if (!h.down) this.startIfReady();
        } else if (!game.held && game.grabAt(h.point.x, h.point.y)) {
          this.holder = key;
          this.holds[key].reset();
        }
      }
      h.down = closed;
    }
  }

  // ------------------------------------------------------ update and draw

  update(hands: HandSignals, dt: number) {
    this.layout();
    this.readHands(hands, dt);
    this.marbles.tick(dt);
    this.game.update(dt);
    this.levelPulse = Math.max(0, this.levelPulse - dt / 0.9);
  }

  private drawMarble(g: CanvasRenderingContext2D, m: Marble, d: number) {
    const r = this.game.r * m.scale;
    if (r < 1) return;
    this.marbles.draw(g, m, r, 1, d, m.style);
    if (m.mode === 'held') {
      g.strokeStyle = this.orange;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(m.x, m.y, r + 4, 0, Math.PI * 2);
      g.stroke();
    }
  }

  draw(g: CanvasRenderingContext2D) {
    const game = this.game;
    const { width: W, height: H, dpr } = this.ctx.size;
    const r = game.r;
    const d = this.marbles.sizeFor(r, dpr);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Floor.
    g.strokeStyle = this.orange;
    g.globalAlpha = 0.4;
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(16, game.floorY);
    g.lineTo(W - 16, game.floorY);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;

    // Chute at the top centre.
    const cx = W / 2;
    const cy = game.chuteY;
    g.strokeStyle = this.orange;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 62, cy - 34);
    g.lineTo(cx - 24, cy - 2);
    g.moveTo(cx + 62, cy - 34);
    g.lineTo(cx + 24, cy - 2);
    g.moveTo(cx - 24, cy - 2);
    g.lineTo(cx - 24, cy + 6);
    g.moveTo(cx + 24, cy - 2);
    g.lineTo(cx + 24, cy + 6);
    g.stroke();

    // While a marble is held over a shelf's zone, highlight that shelf.
    if (game.held && game.hover >= 0) {
      const z = game.zone(game.shelves[game.hover]);
      g.fillStyle = 'rgba(200,74,18,0.10)';
      g.strokeStyle = this.orange;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(z.left, z.top, z.right - z.left, z.bottom - z.top, 18);
      g.fill();
      g.setLineDash([12, 8]);
      g.stroke();
      g.setLineDash([]);
    }

    // Shelves, with a label marble and a pattern mark each.
    game.shelves.forEach((s, k) => {
      const wobble = s.cheer > 0 ? Math.sin(s.cheer * 30) * 2 : s.shake > 0 ? Math.sin(s.shake * 60) * 5 * (s.shake / 0.45) : 0;
      g.strokeStyle = this.orange;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(s.x - s.w / 2, s.y + wobble);
      g.lineTo(s.x + s.w / 2, s.y + wobble);
      g.moveTo(s.x - s.w / 2 + 8, s.y);
      g.lineTo(s.x - s.w / 2 + 8, s.y + 14);
      g.moveTo(s.x + s.w / 2 - 8, s.y);
      g.lineTo(s.x + s.w / 2 - 8, s.y + 14);
      g.stroke();
      // Faint slot hints.
      g.lineWidth = 1.5;
      g.globalAlpha = 0.22;
      for (let i = 0; i < TUNING.SLOTS; i++) {
        if (s.slots[i]) continue;
        g.beginPath();
        g.arc(game.slotX(s, i), s.y - r, r * 0.85, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      // The label marble below the shelf, centred, shows which design belongs here.
      const label: Marble = { id: -1 - k, style: s.style, x: s.x, y: s.y + r * 2.1, vx: 0, vy: 0, angle: 0, mode: 'placed', t: 0, sx: 0, sy: 0, shelf: -1, slot: -1, scale: 1 };
      this.drawMarble(g, label, d);
      if (s.cheer > 0) {
        g.strokeStyle = this.orange;
        g.globalAlpha = Math.min(1, s.cheer);
        g.lineWidth = 3;
        g.beginPath();
        g.arc(s.x, s.y - r, s.w / 2 + 14 * (1.1 - s.cheer), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    });

    for (const m of game.marbles) if (m.mode !== 'held') this.drawMarble(g, m, d);
    if (game.held) this.drawMarble(g, game.held, d);

    for (const p of game.sparks) {
      g.globalAlpha = Math.min(1, p.life * 1.5);
      g.fillStyle = CONFETTI[p.hue % CONFETTI.length];
      g.beginPath();
      g.arc(p.x, p.y, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    this.drawHint(g);
    this.drawHud(g, d);
    this.drawHands(g);
    if (game.state !== 'play') this.drawScreen(g, W, H);
  }

  /** First game only: three short hints for the very first marble. */
  private drawHint(g: CanvasRenderingContext2D) {
    const game = this.game;
    const m = game.active;
    if (game.state !== 'play' || !game.firstMarble || !m) return;
    let text = 'Pinch to grab it';
    if (m.mode === 'held') text = game.hover >= 0 && game.shelves[game.hover].style === m.style ? 'Open your fingers to drop' : 'Match the marble';
    else if (m.mode !== 'fall') return;
    g.font = '500 20px "Clash Grotesk", sans-serif';
    const w = g.measureText(text).width + 28;
    const x = Math.min(game.W - w / 2 - 12, Math.max(w / 2 + 12, m.x));
    const y = Math.max(game.chuteY + 6, m.y - game.r * 2.2);
    g.fillStyle = this.blue;
    g.beginPath();
    g.roundRect(x - w / 2, y - 18, w, 36, 18);
    g.fill();
    g.fillStyle = '#dad1ca';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y + 1);
    g.textBaseline = 'alphabetic';
  }

  private drawHud(g: CanvasRenderingContext2D, d: number) {
    const game = this.game;
    const edge = parseFloat(css('--edge', '48')) || 48;
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#121212';
    g.textAlign = 'left';
    g.font = '400 44px Atelier, "Clash Grotesk", sans-serif';
    g.fillText(String(game.score), edge, game.chuteY + 38);
    const scoreW = g.measureText(String(game.score)).width;
    g.font = '14px "Clash Grotesk", sans-serif';
    g.globalAlpha = 0.65;
    g.fillText(`score · best ${game.best}`, edge, game.chuteY + 58);
    g.globalAlpha = 1;
    this.drawLevel(g, edge + scoreW + 14, game.chuteY + 38);
    // Lives as small marbles; a lost one is an empty ring.
    for (let i = 0; i < TUNING.LIVES; i++) {
      const x = edge + 12 + i * 30;
      const y = game.chuteY + 86;
      if (i < game.lives) {
        this.marbles.draw(g, { id: 900 + i, x, y, angle: 0 }, 12, 1, d, 0);
      } else {
        g.strokeStyle = this.orange;
        g.globalAlpha = 0.5;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 11, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  /** "Level N" beside the score; it pulses for a moment whenever the level goes up. */
  private drawLevel(g: CanvasRenderingContext2D, x: number, y: number) {
    const level = this.game.level;
    if (level !== this.shownLevel) {
      if (level > this.shownLevel && this.game.state === 'play') this.levelPulse = 1;
      this.shownLevel = level;
    }
    const k = this.levelPulse;
    g.save();
    g.translate(x, y);
    g.scale(1 + 0.25 * k, 1 + 0.25 * k);
    g.font = '500 16px "Clash Grotesk", sans-serif';
    g.textAlign = 'left';
    g.fillStyle = k > 0 ? this.orange : this.blue;
    g.globalAlpha = 0.75 + 0.25 * k;
    g.fillText(`Level ${level}`, 0, 0);
    g.restore();
  }

  /** Where each hand's pinch point is, so you can see what you are about to grab. */
  private drawHands(g: CanvasRenderingContext2D) {
    for (const h of Object.values(this.hands)) {
      if (!h.point) continue;
      g.strokeStyle = this.orange;
      g.fillStyle = this.orange;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(h.point.x, h.point.y, h.down ? 9 : 14, 0, Math.PI * 2);
      if (h.down) g.fill();
      else g.stroke();
    }
  }

  private drawScreen(g: CanvasRenderingContext2D, W: number, H: number) {
    const game = this.game;
    g.fillStyle = 'rgba(218,209,202,0.88)';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    const title = game.state === 'start' ? 'PINCH TO START' : 'GAME OVER';
    const size = Math.min(72, W * 0.11);
    g.font = `400 ${size}px Atelier, "Clash Grotesk", sans-serif`;
    g.fillStyle = this.blue;
    g.fillText(title, W / 2 - size * 0.05, H * 0.4 + size * 0.07);
    g.fillStyle = this.orange;
    g.fillText(title, W / 2, H * 0.4);
    g.fillStyle = '#121212';
    g.font = '400 22px "Clash Grotesk", sans-serif';
    if (game.state === 'start') {
      g.fillText('or click · put each marble on the shelf with the same marble', W / 2, H * 0.4 + 46);
    } else {
      g.fillText(`Score ${game.score} · Best ${game.best}`, W / 2, H * 0.4 + 46);
      g.fillText(game.ready ? 'Pinch to play again (or click)' : '', W / 2, H * 0.4 + 82);
    }
  }

  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    if (this.holder) this.game.release();
    this.holder = null;
  }
}
