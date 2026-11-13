import { CameraError, startCamera, type Camera } from './camera';
import { Chrome } from './chrome';
import { DebugOverlay } from './debug';
import { HandSignals } from './hands';
import { MockHands } from './mock';
import type { Host, Scene, SceneContext } from './scene';
import { About } from './about/about';
import { ROUTES, routeByHash, routeByPath, type RouteInfo } from './routes';
import { scenes } from './scenes';
import type { HandTracker } from './tracker';
import { coverRect } from './view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const video = $<HTMLVideoElement>('video');
const welcome = $('welcome');
const startBtn = $<HTMLButtonElement>('start');
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
let modelError: (typeof import('./tracker'))['ModelError'] | null = null;
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
  mock: params.get('mock') === '1' || params.get('mock') === 'idle',
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
      // The hand model and its WASM load only now, after the camera is on, not with the first page.
      const mod = await import('./tracker');
      modelError = mod.ModelError;
      tracker = await mod.createTracker();
    } catch (err) {
      camera?.stop();
      camera = null;
      return err instanceof CameraError || (modelError && err instanceof modelError)
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
type Page = 'welcome' | 'about' | 'scene';
let page: Page = 'welcome';
/** True once the camera was allowed this visit, or mouse mode was chosen (camera denied); scenes open only then. */
let unlocked = false;
/** A game page opened by its link before the camera was on: the start button opens that game. */
let intended = -1;

const about = new About(scenes);

function setScene(index: number) {
  const entry = scenes[index];
  if (!entry?.create || index === sceneIndex) return;
  scene?.dispose();
  overlay.replaceChildren();
  sceneIndex = index;
  scene = entry.create();
  scene.init(sceneCtx);
  menu.value = entry.id;
  chrome.sceneShown(entry.id, scene.help);
  syncToggle();
  syncChrome();
}

function leaveScene() {
  scene?.dispose();
  scene = null;
  sceneIndex = -1;
  overlay.replaceChildren();
}

function showPage(next: Page) {
  if (next !== 'scene') leaveScene();
  page = next;
  welcome.hidden = next !== 'welcome';
  if (next === 'about') about.show();
  else about.hide();
  syncChrome();
}

function syncChrome() {
  const inScene = page === 'scene';
  chrome.setVisible(inScene, unlocked);
  badge.hidden = !host.mock || !inScene;
  toggle.hidden = !inScene;
  startBtn.textContent = tracking ? 'Continue' : 'Turn on camera to start';
  syncToggle();
}

/** Open a game: with the camera on it opens at once; otherwise ask for the camera first, and fall back to the mouse. */
async function openGame(index: number) {
  if (!scenes[index]?.create) return;
  if (!tracking && !unlocked) {
    // Camera denied or missing: the game opens anyway, in mouse mode.
    await host.startTracking();
  }
  unlocked = true;
  intended = -1;
  go(index);
}

// ------------------------------------------------- scene tabs and routing

const toggle = $('scene-toggle');
/** The tabs: every playable game, in card order. */
const tabs = scenes.map((s, i) => ({ s, i })).filter((t) => !t.s.soon);
const toggleButtons = tabs.map(({ s, i }) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pill tab';
  b.textContent = s.name;
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => {
    if (unlocked) go(i);
  });
  toggle.appendChild(b);
  return b;
});

function syncToggle() {
  tabs.forEach(({ i }, k) => {
    const b = toggleButtons[k];
    const on = page === 'scene' && i === sceneIndex;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

const sceneIndexOf = (r: RouteInfo) => scenes.findIndex((sc) => sc.id === r.id && !!sc.create);
const pathOf = (index: number) => ROUTES.find((r) => r.id === scenes[index].id)!.path;
const currentRoute = () => routeByPath(location.pathname) ?? ROUTES[0];

/** Old links such as /#about or /#netbag become real paths. */
function fixLegacyHash() {
  if (!location.hash) return;
  const r = routeByHash(location.hash);
  if (r) history.replaceState(null, '', r.path + location.search);
}

/** Keep the title, description and canonical in step with the page shown (the HTML already has them on load). */
function setMeta(r: RouteInfo) {
  document.title = r.title;
  const url = r.path === '/' ? location.origin + '/' : location.origin + r.path;
  const set = (sel: string, attr: string, value: string) => document.head.querySelector(sel)?.setAttribute(attr, value);
  set('meta[name="description"]', 'content', r.description);
  set('link[rel="canonical"]', 'href', url);
  set('meta[property="og:title"]', 'content', r.title);
  set('meta[property="og:description"]', 'content', r.description);
  set('meta[property="og:url"]', 'content', url);
  set('meta[name="twitter:title"]', 'content', r.title);
  set('meta[name="twitter:description"]', 'content', r.description);
  // One <h1> per page: the visible title carries it; the game title is a hidden heading.
  for (const [id, on] of [['welcome-title', r.id === 'welcome'], ['about-title', r.id === 'about']] as const) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (on) {
      el.setAttribute('role', 'heading');
      el.setAttribute('aria-level', '1');
    } else if (el.tagName !== 'H1') {
      el.removeAttribute('role');
      el.removeAttribute('aria-level');
    }
  }
  let h1 = document.getElementById('game-title');
  if (r.name) {
    if (!h1) {
      h1 = document.createElement('h1');
      h1.id = 'game-title';
      h1.className = 'sr-only';
      app.appendChild(h1);
    }
    h1.textContent = r.name;
  } else h1?.remove();
}

/** Go to a path: a new history entry, so back and forward just work. */
function navigate(path: string) {
  if (location.pathname !== path || location.hash) history.pushState(null, '', path);
  route();
}

/** Open a game by its index (a tab, a key). */
function go(index: number) {
  navigate(pathOf(index));
}

/** Show what the URL says; games need the camera or mouse mode, otherwise the welcome page shows first (the URL stays). */
function route() {
  const r = currentRoute();
  if (r.id === 'about') {
    setMeta(r);
    showPage('about');
    return;
  }
  const i = r.id === 'welcome' ? -1 : sceneIndexOf(r);
  if (i < 0 || !unlocked) {
    if (i >= 0) intended = i;
    setMeta(r);
    showPage('welcome');
    return;
  }
  setMeta(r);
  setScene(i);
  if (page !== 'scene') showPage('scene');
}

window.addEventListener('popstate', route);
window.addEventListener('hashchange', () => {
  fixLegacyHash();
  route();
});
// Links to our own pages are handled here, without a page load.
app.addEventListener('click', (e) => {
  const a = (e.target as Element).closest('a');
  if (!a || a.target || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const url = new URL(a.href, location.href);
  const r = url.origin === location.origin ? routeByPath(url.pathname) : undefined;
  if (!r) return;
  e.preventDefault();
  const i = r.name ? sceneIndexOf(r) : -1;
  if (i >= 0) void openGame(i);
  else navigate(r.path);
});

toggle.addEventListener('keydown', (e) => {
  if (!unlocked) return;
  const at = Math.max(0, tabs.findIndex((t) => t.i === sceneIndex));
  const n = tabs.length;
  let next = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % n;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (at - 1 + n) % n;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = n - 1;
  if (next < 0) return;
  e.preventDefault();
  e.stopPropagation(); // scenes use the arrow keys too
  go(tabs[next].i);
  toggleButtons[next].focus();
});

// Hidden dev menu: press ` to show.
const menu = document.createElement('select');
menu.className = 'dev-menu';
menu.hidden = true;
menu.setAttribute('aria-label', 'Scene');
for (const { s } of tabs) menu.add(new Option(s.name, s.id));
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
    // ?mock=idle shows the simulated camera with no hands in it, for layout checks.
    detected = params.get('mock') === 'idle' ? [] : mockHands.sample(now / 1000);
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
  else if (unlocked && page === 'scene' && e.key >= '1' && Number(e.key) <= tabs.length) go(tabs[Number(e.key) - 1].i);
});

startBtn.addEventListener('click', async () => {
  if (starting) return;
  startBtn.classList.add('starting');
  message.textContent = '';
  await openGame(intended >= 0 ? intended : 0);
  startBtn.classList.remove('starting');
});
$('welcome-about').addEventListener('click', () => navigate('/about'));
$('about-btn').addEventListener('click', () => navigate('/about'));
chrome.onStopCamera = () => {
  unlocked = false;
  navigate('/');
};

window.addEventListener('pagehide', () => host.stopTracking());

syncChrome();
fixLegacyHash();
route();
lastFrame = performance.now();
rafId = requestAnimationFrame(frame);
