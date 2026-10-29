import type { HandSignals } from './hands';
import type { Host } from './scene';
import { guideLoop } from './guide/cell';
import { buildHelpCard, type HelpCard } from './guide/card';
import { drawSkeleton } from './skeleton';
import { coverRect } from './view';

/** The help card opens by itself the first time a scene is shown, and closes after this long. */
const HELP_AUTO_MS = 15000;
const PREVIEW_IN_MS = 500;
const PREVIEW_MIN_MS = 280;

const CAMERA_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h8A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 15.5z"/><path d="m16 10.5 5-2.5v8l-5-2.5"/></svg>';
const MINIMISE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 10v8h-8"/></svg>';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * App-level UI shared by every scene: the camera preview (and its minimise button),
 * the bottom-left "?" and stop/start camera buttons, and the help card.
 */
export class Chrome {
  private preview = $('preview');
  private canvas = $<HTMLCanvasElement>('preview-canvas');
  private g = this.canvas.getContext('2d')!;
  private minBtn = $<HTMLButtonElement>('preview-min');
  private fab = $<HTMLButtonElement>('preview-fab');
  private dock = $('dock');
  private helpBtn = $<HTMLButtonElement>('help-btn');
  private card = $('help-card');
  private body = $('help-body');
  private closeBtn = $<HTMLButtonElement>('help-close');
  private cards = new Map<string, HelpCard>();
  private current: HelpCard | null = null;
  private playing = false;
  private camBtn = $<HTMLButtonElement>('cam-btn');
  private status = $('dock-status');

  private minimised = false;
  private visible = false;
  private canUnlock = false;
  private busy = false;
  private pinned = false;
  private hover = false;
  private auto = false;
  private suppressed = false;
  private autoTimer = 0;
  private reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(
    private host: Host,
    private video: HTMLVideoElement,
    private size: { dpr: number },
  ) {
    this.minBtn.innerHTML = MINIMISE_ICON;
    this.fab.innerHTML = CAMERA_ICON;
    this.minBtn.addEventListener('click', () => this.setMinimised(true));
    this.fab.addEventListener('click', () => this.setMinimised(false));
    this.camBtn.addEventListener('click', () => void this.toggleCamera());

    this.helpBtn.addEventListener('click', () => {
      this.pinned = !this.pinned;
      this.suppressed = false;
      this.syncHelp();
    });
    this.helpBtn.addEventListener('pointerenter', () => {
      this.hover = true;
      this.suppressed = false;
      this.syncHelp();
    });
    this.dock.addEventListener('pointerleave', () => {
      this.hover = false;
      this.syncHelp();
    });
    document.addEventListener('pointerdown', (e) => {
      if (e.target instanceof Node && this.dock.contains(e.target)) return;
      this.pinned = this.auto = false;
      this.syncHelp();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      this.closeHelp();
    });

    this.closeBtn.addEventListener('click', () => this.closeHelp());
    host.onTrackingChange(() => this.sync());
    this.sync();
  }

  /** Show or hide the whole shared UI (hidden on the welcome screen). */
  setVisible(visible: boolean, canUnlock: boolean) {
    this.visible = visible;
    this.canUnlock = canUnlock;
    this.sync();
    this.syncHelp();
  }

  /** Called whenever a scene is shown; opens the help card by itself the first time per scene. */
  sceneShown(id: string, help: string) {
    let card = this.cards.get(id);
    if (!card) this.cards.set(id, (card = buildHelpCard(id, help)));
    this.current = card;
    this.body.replaceChildren(card.el);
    window.clearTimeout(this.autoTimer);
    this.auto = false;
    this.playing = false;
    if (!this.seenBefore(id)) {
      this.auto = true;
      this.autoTimer = window.setTimeout(() => {
        this.auto = false;
        this.syncHelp();
      }, HELP_AUTO_MS);
    }
    this.syncHelp();
  }

  /** True if this scene's card already opened by itself in this visit; marks it as seen. */
  private seenBefore(id: string) {
    const key = `help-seen:${id}`;
    try {
      if (sessionStorage.getItem(key)) return true;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage can be blocked; then the card just opens each time.
    }
    return false;
  }

  /** Close the card (Esc, the x button) and give focus back to the "?" button. */
  private closeHelp() {
    const wasOpen = !this.card.hidden;
    this.pinned = this.auto = false;
    this.suppressed = true;
    window.clearTimeout(this.autoTimer);
    this.syncHelp();
    if (wasOpen) this.helpBtn.focus({ preventScroll: true });
  }

  /** Screen rectangle of the preview, or of its small button when minimised; null with the camera off. */
  rect(): DOMRect | null {
    if (!this.visible || !this.host.tracking) return null;
    return (this.minimised ? this.fab : this.preview).getBoundingClientRect();
  }

  setStatus(text: string) {
    this.status.textContent = text;
  }

  private sync() {
    const on = this.visible && this.host.tracking;
    this.dock.hidden = !this.visible;
    this.camBtn.hidden = !this.canUnlock && !this.host.tracking;
    this.camBtn.textContent = this.host.tracking ? 'stop camera' : 'start camera';
    this.camBtn.disabled = this.busy;
    if (this.host.tracking) this.status.textContent = '';
    const state = on ? (this.minimised ? 'min' : 'on') : 'off';
    if (this.preview.dataset.state === 'off' && state === 'on') this.setDuration(PREVIEW_IN_MS);
    this.preview.dataset.state = state;
    this.minBtn.tabIndex = state === 'on' ? 0 : -1;
    this.fab.tabIndex = state === 'min' ? 0 : -1;
    if (state === 'off') this.minimised = false;
  }

  private setDuration(ms: number) {
    this.preview.style.setProperty('--dur', `${this.reduced ? 0 : ms}ms`);
  }

  private setMinimised(min: boolean) {
    if (this.minimised === min) return;
    this.minimised = min;
    this.setDuration(PREVIEW_MIN_MS);
    this.sync();
    (min ? this.fab : this.minBtn).focus({ preventScroll: true });
  }

  private async toggleCamera() {
    if (this.busy) return;
    if (this.host.tracking) {
      this.host.stopTracking();
      return;
    }
    this.busy = true;
    this.camBtn.disabled = true;
    this.status.textContent = 'Starting camera…';
    const error = await this.host.startTracking();
    this.busy = false;
    this.camBtn.disabled = false;
    this.status.textContent = error ?? '';
    this.sync();
  }

  private syncHelp() {
    const open = this.visible && (this.pinned || this.auto || (this.hover && !this.suppressed));
    this.card.hidden = !open;
    this.helpBtn.setAttribute('aria-expanded', String(open));
    // The guide animations run only while the card is open.
    if (open && !this.playing && this.current) {
      this.playing = true;
      guideLoop.activate(this.current.cells);
    } else if (!open && this.playing) {
      this.playing = false;
      guideLoop.deactivate();
    }
  }

  /** Mirrored camera image with the hand skeleton, once per frame. */
  draw(signals: HandSignals) {
    if (this.preview.dataset.state === 'off') return;
    const c = this.canvas;
    const dpr = this.size.dpr;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#121212';
    const orange = css.getPropertyValue('--orange').trim() || '#c54812';
    g.fillStyle = ink;
    g.fillRect(0, 0, w, h);

    // Same "cover" fit as the video element would use, so landmarks line up.
    const r = coverRect(w, h, this.host.aspect);
    if (this.host.hasVideo) {
      g.save();
      g.translate(r.x + r.w, r.y);
      g.scale(-1, 1);
      g.drawImage(this.video, 0, 0, r.w, r.h);
      g.restore();
    } else {
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.font = '12px ui-monospace, Menlo, monospace';
      g.fillText('simulated hands', 14, h - 14);
    }

    for (const hand of signals.hands) {
      drawSkeleton(
        g,
        hand.landmarks.map((l) => ({ x: r.x + l.x * r.w, y: r.y + l.y * r.h })),
        orange,
      );
    }
  }
}
