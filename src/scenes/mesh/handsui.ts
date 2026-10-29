import type { HandSignals } from '../../hands';
import type { SceneContext } from '../../scene';
import { FINGERTIP_INDEX, HAND_CONNECTIONS } from '../../types';
import { containRect } from '../../view';
import type { HandController } from './handcontrol';

const HELP = [
  ['Open hand', 'raise or lower to set the number.'],
  ['Fist', 'grab and move the bag.'],
  ['Swipe', 'gust of wind.'],
  ['Mouse', 'drag the bag, arrow keys for the number.'],
] as const;

const HELP_AUTO_MS = 6000;
let helpShown = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** The Hands toggle, privacy line, camera preview and the "?" help card. */
export class HandsUI {
  private toggle: HTMLButtonElement;
  private status: HTMLElement;
  private privacy: HTMLElement;
  private preview: HTMLElement;
  private previewCanvas: HTMLCanvasElement;
  private previewG: CanvasRenderingContext2D;
  private previewBtn: HTMLButtonElement;
  private card: HTMLElement;
  private helpBtn: HTMLButtonElement;

  private on = false;
  private busy = false;
  private previewHidden = false;
  private pinned = false;
  private hover = false;
  private auto = false;
  private suppressed = false;
  private autoTimer = 0;
  private cleanup: (() => void)[] = [];

  constructor(
    private ctx: SceneContext,
    private onToggle: (on: boolean) => Promise<string | null>,
  ) {
    const root = ctx.overlay;

    this.toggle = el('button', 'mesh-hands', 'Hands');
    this.toggle.type = 'button';
    this.toggle.setAttribute('aria-pressed', 'false');
    this.toggle.addEventListener('click', () => void this.click());
    this.privacy = el('p', 'mesh-privacy', 'Your camera stays on your device');
    this.privacy.hidden = true;
    this.status = el('p', 'mesh-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    const top = el('div', 'mesh-topright');
    top.append(this.toggle, this.privacy, this.status);

    this.preview = el('div', 'mesh-preview');
    this.preview.hidden = true;
    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.setAttribute('aria-label', 'Camera preview with hand skeleton');
    this.previewG = this.previewCanvas.getContext('2d')!;
    this.previewBtn = el('button', 'mesh-preview-btn', 'Hide');
    this.previewBtn.type = 'button';
    this.previewBtn.addEventListener('click', () => this.setPreviewHidden(!this.previewHidden));
    this.preview.append(this.previewCanvas, this.previewBtn);

    this.helpBtn = el('button', 'mesh-help-btn', '?');
    this.helpBtn.type = 'button';
    this.helpBtn.setAttribute('aria-label', 'How to play');
    this.helpBtn.setAttribute('aria-expanded', 'false');
    this.card = el('div', 'mesh-card');
    this.card.id = 'mesh-card';
    this.card.setAttribute('role', 'dialog');
    this.card.hidden = true;
    this.helpBtn.setAttribute('aria-controls', 'mesh-card');
    for (const [k, v] of HELP) {
      const p = el('p', 'mesh-card-line');
      p.append(el('strong', '', `${k}: `), document.createTextNode(v));
      this.card.append(p);
    }
    const bottomLeft = el('div', 'mesh-bottomleft');
    bottomLeft.append(this.card, this.helpBtn);

    root.append(top, this.preview, bottomLeft);

    const listen = <T extends EventTarget>(t: T, type: string, fn: (e: never) => void) => {
      t.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener));
    };
    listen(this.helpBtn, 'click', () => {
      this.pinned = !this.pinned;
      this.suppressed = false;
      this.syncHelp();
    });
    listen(this.helpBtn, 'pointerenter', () => {
      this.hover = true;
      this.suppressed = false;
      this.syncHelp();
    });
    listen(bottomLeft, 'pointerleave', () => {
      this.hover = false;
      this.syncHelp();
    });
    listen(document, 'pointerdown', (e: PointerEvent) => {
      if (!(e.target instanceof Node) || bottomLeft.contains(e.target)) return;
      this.pinned = this.auto = false;
      this.syncHelp();
    });
    listen(window, 'keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      this.pinned = this.auto = false;
      this.suppressed = true;
      this.syncHelp();
    });
  }

  /** Reflect the camera state (also called when the camera stops by itself). */
  setOn(on: boolean) {
    this.on = on;
    this.toggle.setAttribute('aria-pressed', String(on));
    this.toggle.classList.toggle('on', on);
    this.privacy.hidden = !(on || this.busy);
    this.preview.hidden = !on || this.previewHidden;
    this.syncPreviewButton();
    if (on && !helpShown) {
      helpShown = true;
      this.auto = true;
      this.syncHelp();
      this.autoTimer = window.setTimeout(() => {
        this.auto = false;
        this.syncHelp();
      }, HELP_AUTO_MS);
    }
  }

  get enabled() {
    return this.on;
  }

  private async click() {
    if (this.busy) return;
    this.status.textContent = '';
    if (this.on) {
      await this.onToggle(false);
      return;
    }
    this.busy = true;
    this.toggle.disabled = true;
    this.privacy.hidden = false;
    this.status.textContent = 'Starting camera and loading the hand model…';
    const error = await this.onToggle(true);
    this.busy = false;
    this.toggle.disabled = false;
    this.status.textContent = error ?? '';
    if (error) this.privacy.hidden = true;
  }

  private setPreviewHidden(hidden: boolean) {
    this.previewHidden = hidden;
    this.preview.hidden = !this.on;
    this.syncPreviewButton();
  }

  private syncPreviewButton() {
    this.preview.classList.toggle('collapsed', this.previewHidden);
    this.previewBtn.textContent = this.previewHidden ? 'Show camera' : 'Hide';
    this.previewBtn.setAttribute('aria-label', this.previewHidden ? 'Show camera preview' : 'Hide camera preview');
  }

  private syncHelp() {
    const open = this.pinned || this.auto || (this.hover && !this.suppressed);
    this.card.hidden = !open;
    this.helpBtn.setAttribute('aria-expanded', String(open));
  }

  /** Mirrored camera image with the skeleton and fingertip dots, once per frame. */
  drawPreview(signals: HandSignals, controller: HandController) {
    if (!this.on || this.previewHidden) return;
    const c = this.previewCanvas;
    const dpr = this.ctx.size.dpr;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = this.previewG;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--mesh-ink').trim() || '#1D1D1B';
    const mesh = css.getPropertyValue('--mesh-line').trim() || '#F26A1B';
    g.fillStyle = ink;
    g.fillRect(0, 0, w, h);

    const host = this.ctx.host;
    const r = containRect(w, h, host.aspect);
    if (host.hasVideo) {
      g.save();
      g.globalAlpha = 0.85;
      g.translate(r.x + r.w, r.y);
      g.scale(-1, 1);
      g.drawImage(this.ctx.video, 0, 0, r.w, r.h);
      g.restore();
    } else {
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.font = '11px ui-monospace, Menlo, monospace';
      g.fillText('simulated hands', 10, h - 10);
    }

    g.lineCap = 'round';
    for (const hand of signals.hands) {
      const p = hand.landmarks.map((l) => ({ x: r.x + l.x * r.w, y: r.y + l.y * r.h }));
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        g.moveTo(p[a].x, p[a].y);
        g.lineTo(p[b].x, p[b].y);
      }
      g.stroke();
      g.fillStyle = '#fff';
      for (const pt of p) {
        g.beginPath();
        g.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = mesh;
      for (const li of FINGERTIP_INDEX) {
        g.beginPath();
        g.arc(p[li].x, p[li].y, 5, 0, Math.PI * 2);
        g.fill();
      }
      const mode = controller.mode[hand.label];
      if (mode !== 'idle') {
        g.fillStyle = mode === 'fist' ? mesh : '#fff';
        g.font = '600 11px ui-monospace, Menlo, monospace';
        g.fillText(mode === 'fist' ? 'grab' : 'dial', p[0].x - 12, p[0].y + 16);
      }
    }
  }

  dispose() {
    window.clearTimeout(this.autoTimer);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
  }
}
