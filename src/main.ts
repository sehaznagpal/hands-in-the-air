import { CameraError, startCamera, type Camera } from './camera';
import { DebugOverlay } from './debug';
import { createTracker, ModelError, type HandTracker } from './tracker';
import type { RawHand } from './types';
import { coverRect } from './view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const video = $<HTMLVideoElement>('video');
const intro = $('intro');
const startBtn = $<HTMLButtonElement>('start');
const stopBtn = $<HTMLButtonElement>('stop');
const toolbar = $('toolbar');
const message = $('message');
const app = $('app');
const ctx = canvas.getContext('2d')!;
const debug = new DebugOverlay(app);

let width = 1;
let height = 1;
let dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, window.innerWidth);
  height = Math.max(1, window.innerHeight);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
}
new ResizeObserver(resize).observe(app);
resize();

let camera: Camera | null = null;
let tracker: HandTracker | null = null;
let running = false;
let rafId = 0;
let lastVideoTime = -1;
let hands: RawHand[] = [];
let detectMs = 0;
let fps = 60;
let lastFrame = 0;

function say(text: string) {
  message.textContent = text;
}

async function start() {
  startBtn.disabled = true;
  say('Starting camera…');
  try {
    camera = await startCamera(video);
    say('Loading hand model…');
    tracker = await createTracker();
  } catch (err) {
    camera?.stop();
    camera = null;
    say(
      err instanceof CameraError || err instanceof ModelError
        ? err.message
        : 'Something went wrong starting up. Reload and try again.',
    );
    startBtn.disabled = false;
    return;
  }
  say('');
  intro.hidden = true;
  toolbar.hidden = false;
  startBtn.disabled = false;
  lastVideoTime = -1;
  running = true;
  lastFrame = performance.now();
  rafId = requestAnimationFrame(frame);
}

function stop() {
  running = false;
  cancelAnimationFrame(rafId);
  camera?.stop();
  camera = null;
  tracker?.close();
  tracker = null;
  hands = [];
  intro.hidden = false;
  toolbar.hidden = true;
}

function frame(now: number) {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  fps += (1000 / Math.max(1, now - lastFrame) - fps) * 0.1;
  lastFrame = now;

  // Detect once per new video frame.
  if (tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const t0 = performance.now();
    hands = tracker.detect(video, t0);
    detectMs += (performance.now() - t0 - detectMs) * 0.1;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper');
  ctx.fillRect(0, 0, width, height);

  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  const rect = coverRect(width, height, aspect);
  if (video.readyState >= 2) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate(rect.x + rect.w, rect.y);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, rect.w, rect.h);
    ctx.restore();
  }
  debug.draw(ctx, rect, hands, { fps, detectMs, delegate: tracker?.delegate ?? '-' });
}

// Pause when the tab is hidden; resume without a dt spike.
document.addEventListener('visibilitychange', () => {
  if (!running) return;
  if (document.hidden) {
    cancelAnimationFrame(rafId);
  } else {
    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') debug.toggle();
});

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
