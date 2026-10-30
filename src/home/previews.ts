import { GuideCell, drawGuideHand, handPoints } from '../guide/cell';
import { at, miniMesh } from '../guide/meshcells';
import { renderMarble, type MarbleLayers } from '../shared/marbles';
import { coverImage, DEFAULT_PHOTO_URL, loadPhoto } from '../scenes/window/backgrounds';
import { Timeline, type State } from '../guide/timeline';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => clamp01(x) * clamp01(x) * (3 - 2 * clamp01(x));

/** The skeleton is white like in the help cards; a soft shadow keeps it readable on the light card. */
function lightHand(g: CanvasRenderingContext2D, w: number, h: number, s: State, tip: string, size = 0.55) {
  g.save();
  g.shadowColor = 'rgba(18,18,18,0.7)';
  g.shadowBlur = 2.5;
  drawGuideHand(g, w, h, s, tip, size);
  g.restore();
}

const still = (x: number, y: number, extra: Partial<State> = {}): State => ({ x, y, rotation: 0, scale: 1, blend: 0, v: 0, alpha: 1, ...extra });

const marbleCache = new Map<number, MarbleLayers>();
function marble(g: CanvasRenderingContext2D, style: number, x: number, y: number, r: number, alpha = 1) {
  let l = marbleCache.get(style);
  if (!l) marbleCache.set(style, (l = renderMarble(style, 96)));
  const d = (2 * r * l.size) / (l.size - 3);
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(l.pattern, x - d / 2, y - d / 2, d, d);
  g.drawImage(l.gloss, x - d / 2, y - d / 2, d, d);
  g.restore();
}

// ------------------------------------------------------------------ canvas

function canvasPreview() {
  const orange = css('--orange', '#c84a12');
  const blue = css('--blue', '#0a3699');
  const D = 5;
  const pose = (t: number): State => {
    const a = (t / D) * Math.PI * 2;
    return still(0.5 + 0.2 * Math.sin(a), 0.5 + 0.14 * Math.sin(2 * a), { rotation: 0.2 * Math.sin(a) });
  };
  return new GuideCell({
    duration: D,
    staticTime: 1.2,
    caption: '',
    render: (g, w, h, t) => {
      g.lineCap = 'round';
      const steps = 16;
      [4, 8, 12, 16, 20].forEach((tip, k) => {
        g.strokeStyle = k < 2 ? blue : orange;
        for (let i = steps; i >= 1; i--) {
          const a = handPoints(w, h, pose(t - (i * 0.5) / steps), 0.5)[tip];
          const b = handPoints(w, h, pose(t - ((i - 1) * 0.5) / steps), 0.5)[tip];
          const life = 1 - i / steps;
          g.globalAlpha = life * 0.9;
          g.lineWidth = 1 + 3.5 * life;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
        }
      });
      g.globalAlpha = 1;
      lightHand(g, w, h, pose(t), orange, 0.5);
    },
  });
}

// --------------------------------------------------------------------- mesh

function meshPreview() {
  const orange = css('--orange', '#c84a12');
  const D = 6;
  const tl = new Timeline(D, [
    { t: 0, x: 0.27, y: 0.7, v: 0 },
    { t: 0.4, x: 0.27, y: 0.4, v: 1 },
    { t: 0.55, x: 0.27, y: 0.4, v: 1 },
    { t: 0.95, x: 0.27, y: 0.7, v: 0 },
    { t: 1, x: 0.27, y: 0.7, v: 0 },
  ]);
  // Marble spots inside the bag, in units of the bag length: bottom row first.
  const spots = [[-0.14, 0.9], [0, 0.9], [0.14, 0.9], [-0.07, 0.77], [0.07, 0.77], [0, 0.64]];
  const styles = [0, 6, 2, 9, 4, 10];
  return new GuideCell({
    duration: D,
    staticTime: at(0.45, D),
    caption: '',
    render: (g, w, h, t) => {
      const s = tl.sample(t);
      const len = h * 0.92;
      const bx = w * 0.7;
      const by = h * 0.06;
      const count = Math.round(s.v * spots.length);
      for (let i = 0; i < count; i++) marble(g, styles[i], bx + spots[i][0] * len, by + spots[i][1] * len, 0.07 * len);
      miniMesh(g, bx, by, len, 0, orange);
      lightHand(g, w, h, s, orange, 0.5);
    },
  });
}

// --------------------------------------------------------------------- sort

function sortPreview() {
  const orange = css('--orange', '#c84a12');
  const blue = css('--blue', '#0a3699');
  const D = 6;
  const hand = new Timeline(D, [
    { t: 0, x: 0.5, y: 0.5, blend: 0 },
    { t: 0.135, x: 0.5, y: 0.5, blend: 0.55 },
    { t: 0.25, x: 0.5, y: 0.5, blend: 0.55 },
    { t: 0.5, x: 0.78, y: 0.62, blend: 0.55 },
    { t: 0.56, x: 0.78, y: 0.62, blend: 0 },
    { t: 0.9, x: 0.5, y: 0.5, blend: 0 },
    { t: 1, x: 0.5, y: 0.5, blend: 0 },
  ]);
  const tCatch = 1.1;
  const tRelease = 3.3;
  return new GuideCell({
    duration: D,
    staticTime: 2.4,
    caption: '',
    render: (g, w, h, t) => {
      // Three little shelves.
      g.save();
      g.strokeStyle = blue;
      g.globalAlpha = 0.45;
      g.lineWidth = 3;
      g.lineCap = 'round';
      for (const x of [0.22, 0.5, 0.78]) {
        g.beginPath();
        g.moveTo((x - 0.09) * w, h * 0.9);
        g.lineTo((x + 0.09) * w, h * 0.9);
        g.stroke();
      }
      g.restore();
      const s = hand.sample(t);
      const r = h * 0.075;
      let my = 0;
      let mx = w * 0.5;
      let a = 1;
      if (t < tCatch) {
        const f = clamp01((t - 0.35) / (tCatch - 0.35));
        my = -r + (s.y * h - h * 0.1 + r) * f * f;
      } else if (t < tRelease) {
        mx = s.x * w;
        my = s.y * h - h * 0.1;
      } else {
        mx = 0.78 * w;
        const f = clamp01((t - tRelease) / 0.3);
        my = 0.62 * h - h * 0.1 + (h * 0.9 - r - (0.62 * h - h * 0.1)) * f * f;
        a = 1 - ease((t - 5) / 0.6);
      }
      if (t > 0.35) marble(g, 6, mx, my, r, a);
      lightHand(g, w, h, s, orange, 0.5);
    },
  });
}

// ------------------------------------------------------------ foggy window

function foggyWindowPreview() {
  const orange = css('--orange', '#c84a12');
  const D = 6;
  const T0 = 0.7;
  const SWEEP = 1.6;
  const FOG = 3;
  const path = (s: number) => ({ x: 0.2 + 0.6 * s, y: 0.5 + 0.17 * Math.sin(s * Math.PI * 2.4) });
  let fog: HTMLCanvasElement | null = null;
  // The window shows a tiny, blurred copy of the default photo: drawn small, then scaled up smoothly.
  let glass: HTMLCanvasElement | null = null;
  const cell: GuideCell = new GuideCell({
    duration: D,
    staticTime: 2.3,
    caption: '',
    render: (g, w, h, t) => {
      const wx = w * 0.08;
      const wy = h * 0.1;
      const ww = w * 0.84;
      const wh = h * 0.8;
      // Glass.
      g.save();
      g.beginPath();
      g.roundRect(wx, wy, ww, wh, 10);
      g.clip();
      if (glass) {
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(glass, wx, wy, ww, wh);
      } else {
        g.fillStyle = 'rgba(52,68,90,0.9)';
        g.fillRect(wx, wy, ww, wh);
      }
      g.restore();
      // Fog with a clear streak that slowly fogs over again.
      if (!fog || fog.width !== Math.round(ww) || fog.height !== Math.round(wh)) {
        fog = document.createElement('canvas');
        fog.width = Math.round(ww);
        fog.height = Math.round(wh);
      }
      const f = fog.getContext('2d')!;
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, fog.width, fog.height);
      f.fillStyle = 'rgba(232,238,244,0.66)';
      f.fillRect(0, 0, fog.width, fog.height);
      f.globalCompositeOperation = 'destination-out';
      f.lineCap = 'round';
      f.lineWidth = wh * 0.34;
      const segs = 36;
      for (let k = 1; k <= segs; k++) {
        const tau = T0 + (SWEEP * k) / segs;
        if (t < tau) break;
        const a = clamp01(1 - (t - tau) / FOG);
        if (a <= 0) continue;
        const p0 = path((k - 1) / segs);
        const p1 = path(k / segs);
        f.globalAlpha = a;
        f.beginPath();
        f.moveTo((p0.x * w - wx), (p0.y * h - wy));
        f.lineTo((p1.x * w - wx), (p1.y * h - wy));
        f.stroke();
      }
      g.save();
      g.beginPath();
      g.roundRect(wx, wy, ww, wh, 10);
      g.clip();
      g.drawImage(fog, wx, wy);
      g.restore();
      g.strokeStyle = 'rgba(18,18,18,0.3)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(wx, wy, ww, wh, 10);
      g.stroke();
      // The wiping hand.
      const s = path(clamp01((t - T0) / SWEEP));
      const alpha = clamp01((t - 0.15) / 0.4) * clamp01((2.9 - t) / 0.5);
      lightHand(g, w, h, still(s.x, s.y, { alpha, rotation: 0.15 }), orange, 0.5);
    },
  });
  void loadPhoto(DEFAULT_PHOTO_URL).then((img) => {
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = 56;
    c.height = 27;
    coverImage(c.getContext('2d')!, img, 56, 27);
    glass = c;
    cell.drawStatic();
  });
  return cell;
}

export function createPreviews(): Record<string, GuideCell> {
  return { canvas: canvasPreview(), mesh: meshPreview(), sort: sortPreview(), window: foggyWindowPreview() };
}
