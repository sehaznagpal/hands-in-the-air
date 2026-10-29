import { CameraError, startCamera, type Camera } from './camera';
import { Chrome } from './chrome';
import { DebugOverlay } from './debug';
import { HandSignals } from './hands';
import { MockHands } from './mock';
import type { Host, Scene, SceneContext } from './scene';
import { DEFAULT_SCENE, HASH_ALIASES, scenes } from './scenes';
import { createTracker, ModelError, type HandTracker } from './tracker';
import { coverRect } from './view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const video = $<HTMLVideoElement>('video');
const intro = $('intro');
const startBtn = $<HTMLButtonElement>('start');
const useMouseBtn = $<HTMLButtonElement>('use-mouse');
const message = $('message');
const overlay = $('overlay');
const app = $('app');
const badge = $('mock-badge');
const g = canvas.getContext('2d')!;
const debug = new DebugOverlay(app);

const params = new URLSearchParams(location.search);
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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
      chrome.setStatus('The camera was disconnected.');
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

const chrome = new Chrome(host, video, size);

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
  previewRect: () => chrome.rect(),
  toScreen(x, y) {
    const r = coverRect(size.width, size.height, aspect());
    return { x: r.x + x * r.w, y: r.y + y * r.h };
  },
};

let scene: Scene | null = null;
let sceneIndex = -1;
/** The welcome screen shows until the camera starts (or "use your mouse" is chosen). */
let welcome = true;
/** True once the camera was allowed this visit; unlocks the scene toggle for good. */
let unlocked = false;

function setScene(index: number) {
  if (index < 0 || index >= scenes.length || index === sceneIndex) return;
  scene?.dispose();
  overlay.replaceChildren();
  sceneIndex = index;
  scene = scenes[index].create();
  scene.init(sceneCtx);
  menu.value = scenes[index].id;
  chrome.sceneShown(scenes[index].id, scene.help);
  syncToggle();
  syncChrome();
}

function showWelcome() {
  scene?.dispose();
  scene = null;
  sceneIndex = -1;
  overlay.replaceChildren();
  welcome = true;
  intro.hidden = false;
  intro.classList.remove('leaving');
  syncChrome();
}

/** Fade the welcome screen out (500 ms) and hand over to the scene. */
function leaveWelcome() {
  welcome = false;
  intro.classList.add('leaving');
  window.setTimeout(() => {
    if (!welcome) intro.hidden = true;
  }, reduced ? 0 : 500);
  syncChrome();
}

function syncChrome() {
  chrome.setVisible(!welcome, unlocked);
  badge.hidden = !host.mock || welcome;
  syncToggle();
}

// ------------------------------------------------- scene toggle and routing

const toggle = $('scene-toggle');
const toggleButtons = scenes.map((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pill';
  b.textContent = s.name;
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => {
    if (unlocked) go(i);
  });
  toggle.appendChild(b);
  return b;
});

function syncToggle() {
  toggleButtons.forEach((b, i) => {
    const on = !welcome && i === sceneIndex;
    b.setAttribute('aria-checked', String(on));
    b.setAttribute('aria-disabled', String(!unlocked));
    if (unlocked) b.removeAttribute('title');
    else b.title = 'Start the camera first';
    b.tabIndex = unlocked && (on || (welcome && i === 0)) ? 0 : -1;
  });
}

/** Scene named by the URL hash, or -1. Old hashes are mapped through HASH_ALIASES. */
function sceneFromUrl() {
  const raw = location.hash.replace(/^#\/?/, '').toLowerCase();
  const hash = HASH_ALIASES[raw] ?? raw;
  return scenes.findIndex((s) => s.hash === hash);
}

function defaultScene() {
  return scenes.findIndex((s) => s.id === DEFAULT_SCENE);
}

/** Changing the hash adds a history entry, so back and forward just work. */
function go(index: number) {
  const target = '#' + scenes[index].hash;
  if (location.hash === target) setScene(index);
  else location.hash = target;
}

function replaceHash(index: number) {
  history.replaceState(null, '', '#' + scenes[index].hash);
}

/** Leave the welcome screen for the scene in the URL (or the default one). */
function enterScenes() {
  const i = sceneFromUrl() >= 0 ? sceneFromUrl() : defaultScene();
  replaceHash(i);
  setScene(i);
  leaveWelcome();
}

window.addEventListener('hashchange', () => {
  const i = sceneFromUrl();
  if (welcome || i < 0) return;
  // Without the camera only Mesh Bag works; the other scenes send the visitor back to the start.
  if (!unlocked && scenes[i].id !== 'mesh') showWelcome();
  else setScene(i);
});

toggle.addEventListener('keydown', (e) => {
  if (!unlocked) return;
  const n = scenes.length;
  let next = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (sceneIndex + 1) % n;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (sceneIndex - 1 + n) % n;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = n - 1;
  if (next < 0) return;
  e.preventDefault();
  e.stopPropagation(); // scenes use the arrow keys too
  go(next);
  toggleButtons[next].focus();
});

// Hidden dev menu: press ` to show.
const menu = document.createElement('select');
menu.className = 'dev-menu';
menu.hidden = true;
menu.setAttribute('aria-label', 'Scene');
for (const s of scenes) menu.add(new Option(s.name, s.id));
menu.addEventListener('change', () => {
  go(scenes.findIndex((s) => s.id === menu.value));
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
        chrome.setStatus('Hand tracking stopped working.');
      }
    }
    detectMs += (performance.now() - t0 - detectMs) * 0.1;
  } else if (host.mock && tracking && now / 1000 - lastMockT >= MOCK_FRAME) {
    lastMockT = now / 1000;
    detected = mockHands.sample(now / 1000);
  }
  signals.update(detected, now / 1000, aspect());

  g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg');
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
  chrome.draw(signals);
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
  else if (unlocked && !welcome && e.key >= '1' && Number(e.key) <= scenes.length) go(Number(e.key) - 1);
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';
  message.textContent = '';
  const error = await host.startTracking();
  startBtn.disabled = false;
  if (error) {
    startBtn.textContent = 'Try again';
    message.textContent = error;
    return;
  }
  startBtn.textContent = 'Start your camera to begin';
  unlocked = true;
  enterScenes();
});

/** Mouse and keyboard only: Mesh Bag without a camera, toggle stays disabled. */
useMouseBtn.addEventListener('click', () => {
  const i = scenes.findIndex((s) => s.id === 'mesh');
  replaceHash(i);
  setScene(i);
  leaveWelcome();
});
window.addEventListener('pagehide', () => host.stopTracking());

syncChrome();
lastFrame = performance.now();
rafId = requestAnimationFrame(frame);
