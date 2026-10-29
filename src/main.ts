import { CameraError, startCamera, type Camera } from './camera';
import { DebugOverlay } from './debug';
import { HandSignals } from './hands';
import { MockHands } from './mock';
import type { Host, Scene, SceneContext } from './scene';
import { scenes } from './scenes';
import { createTracker, ModelError, type HandTracker } from './tracker';
import { coverRect } from './view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const video = $<HTMLVideoElement>('video');
const intro = $('intro');
const startBtn = $<HTMLButtonElement>('start');
const stopBtn = $<HTMLButtonElement>('stop');
const toolbar = $('toolbar');
const message = $('message');
const overlay = $('overlay');
const app = $('app');
const badge = $('mock-badge');
const g = canvas.getContext('2d')!;
const debug = new DebugOverlay(app);
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------- sizing

const size = { width: 1, height: 1, dpr: 1 };

function resize() {
  size.dpr = Math.min(window.devicePixelRatio || 1, 2);
  size.width = Math.max(1, window.innerWidth);
  size.height = Math.max(1, window.innerHeight);
  canvas.width = Math.round(size.width * size.dpr);
  canvas.height = Math.round(size.height * size.dpr);
}
new ResizeObserver(resize).observe(app);
resize();

// ----------------------------------------------------------------- tracking

const signals = new HandSignals();
signals.on('pinchStart', (e) => debug.note(`${e.hand} pinchStart`));
signals.on('pinchEnd', (e) => debug.note(`${e.hand} pinchEnd`));
signals.on('fingerCount', (e) => debug.note(`${e.hand} fingers ${e.count}`));
signals.on('swipe', (e) => debug.note(`${e.hand} swipe ${e.direction} ${e.speed.toFixed(1)}`));

let camera: Camera | null = null;
let tracker: HandTracker | null = null;
let tracking = false;
let starting = false;
let lastVideoTime = -1;
let detectMs = 0;
let detectErrors = 0;
const mockHands = new MockHands();
const MOCK_FRAME = 1 / 30;
let lastMockT = -1;
const trackingListeners = new Set<(on: boolean) => void>();

const aspect = () => (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9);

const host: Host = {
  mock: params.get('mock') === '1',
  get tracking() {
    return tracking;
  },
  get aspect() {
    return aspect();
  },
  get hasVideo() {
    return tracking && !host.mock && video.readyState >= 2;
  },
  async startTracking() {
    if (tracking || starting) return null;
    if (host.mock) {
      lastMockT = -1;
      setTracking(true);
      return null;
    }
    starting = true;
    try {
      camera = await startCamera(video);
      tracker = await createTracker();
    } catch (err) {
      camera?.stop();
      camera = null;
      return err instanceof CameraError || err instanceof ModelError
        ? err.message
        : 'Something went wrong starting up. Reload and try again.';
    } finally {
      starting = false;
    }
    lastVideoTime = -1;
    detectErrors = 0;
    camera.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      host.stopTracking();
      message.textContent = 'The camera was disconnected. Press Start camera to try again.';
    });
    setTracking(true);
    return null;
  },
  stopTracking() {
    camera?.stop();
    camera = null;
    tracker?.close();
    tracker = null;
    signals.update([], performance.now() / 1000 + 1);
    setTracking(false);
  },
  onTrackingChange(fn) {
    trackingListeners.add(fn);
    return () => trackingListeners.delete(fn);
  },
};

function setTracking(on: boolean) {
  tracking = on;
  syncChrome();
  trackingListeners.forEach((fn) => fn(on));
}

// ------------------------------------------------------------------- scenes

const sceneCtx: SceneContext = {
  canvas,
  overlay,
  video,
  size,
  hands: signals,
  host,
  toScreen(x, y) {
    const r = coverRect(size.width, size.height, aspect());
    return { x: r.x + x * r.w, y: r.y + y * r.h };
  },
};

let scene: Scene | null = null;
let sceneIndex = -1;

function setScene(index: number) {
  if (index < 0 || index >= scenes.length || index === sceneIndex) return;
  scene?.dispose();
  overlay.replaceChildren();
  sceneIndex = index;
  scene = scenes[index].create();
  // A scene with its own camera switch starts with tracking off.
  if (scene.ownsCameraUI && tracking) host.stopTracking();
  scene.init(sceneCtx);
  menu.value = scenes[index].id;
  syncChrome();
  if (host.mock && !scene.ownsCameraUI && !tracking) void host.startTracking();
}

/** Start button and toolbar show only for scenes without their own camera switch. */
function syncChrome() {
  const own = scene?.ownsCameraUI ?? false;
  intro.hidden = tracking || own || host.mock;
  toolbar.hidden = !tracking || own || host.mock;
  badge.hidden = !host.mock;
}

// Hidden dev menu: press ` to show.
const menu = document.createElement('select');
menu.className = 'dev-menu';
menu.hidden = true;
menu.setAttribute('aria-label', 'Scene');
for (const s of scenes) menu.add(new Option(s.name, s.id));
menu.addEventListener('change', () => {
  setScene(scenes.findIndex((s) => s.id === menu.value));
  menu.blur();
});
app.appendChild(menu);

// --------------------------------------------------------------------- loop

let rafId = 0;
let lastFrame = 0;
let fps = 60;

function frame(now: number) {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  fps += (1000 / Math.max(1, now - lastFrame) - fps) * 0.1;
  lastFrame = now;

  // Detect once per new video frame; other frames just age the presence timers.
  let detected: ReturnType<HandTracker['detect']> | null = null;
  if (tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const t0 = performance.now();
    try {
      detected = tracker.detect(video, t0);
      detectErrors = 0;
    } catch (err) {
      console.warn('hand detection failed', err);
      if (++detectErrors > 30) {
        host.stopTracking();
        message.textContent = 'Hand tracking stopped working. Press Start camera to try again.';
      }
    }
    detectMs += (performance.now() - t0 - detectMs) * 0.1;
  } else if (host.mock && tracking && now / 1000 - lastMockT >= MOCK_FRAME) {
    lastMockT = now / 1000;
    detected = mockHands.sample(now / 1000);
  }
  signals.update(detected, now / 1000, aspect());

  g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper');
  g.fillRect(0, 0, size.width, size.height);

  const rect = coverRect(size.width, size.height, aspect());
  if (debug.visible && host.hasVideo) {
    g.save();
    g.globalAlpha = 0.3;
    g.translate(rect.x + rect.w, rect.y);
    g.scale(-1, 1);
    g.drawImage(video, 0, 0, rect.w, rect.h);
    g.restore();
  }

  if (scene) {
    scene.update(signals, dt);
    g.save();
    scene.draw(g);
    g.restore();
  }
  debug.draw(g, rect, signals, { fps, detectMs, delegate: tracker?.delegate ?? '-' });
}

// Pause when the tab is hidden; resume without a dt spike.
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(rafId);
  if (!document.hidden) {
    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'd' || e.key === 'D') debug.toggle();
  else if (e.key === '`') menu.hidden = !menu.hidden;
  else if (e.key >= '1' && e.key <= '3') setScene(Number(e.key) - 1);
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  message.textContent = 'Starting camera and loading the hand model…';
  const error = await host.startTracking();
  message.textContent = error ?? '';
  startBtn.disabled = false;
});
stopBtn.addEventListener('click', () => host.stopTracking());
window.addEventListener('pagehide', () => host.stopTracking());

const wanted = scenes.findIndex((s) => s.id === params.get('scene'));
setScene(wanted >= 0 ? wanted : 0);
lastFrame = performance.now();
rafId = requestAnimationFrame(frame);
