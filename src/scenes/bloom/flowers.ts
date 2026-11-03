/**
 * Blooming Flowers: the artwork, drawn in code. A garden bed of 3 x 5 flowers; each has a bloom value from
 * 0 (a closed bud) to 1 (open). Shared by the game and the About card preview.
 */

export const COLS = 5;
export const ROWS = 3;

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export interface Palette {
  petals: [string, string, string];
  bed: string;
  stem: string;
  leaf: string;
}

/** Petals are only cream, the app's orange and the app's blue. */
export function gardenPalette(): Palette {
  return {
    petals: ['#f3e9d4', css('--orange', '#c54812'), css('--blue', '#0a3699')],
    bed: '#5d8e36',
    stem: '#2b5826',
    leaf: '#356b2e',
  };
}

type Head = 'tulip' | 'daisy' | 'pom' | 'five' | 'bell' | 'cluster';
interface Spec {
  head: Head;
  /** Index into Palette.petals. */
  color: 0 | 1 | 2;
}

/** Row by row: six head shapes, mostly cream with some orange and blue. */
export const GARDEN: Spec[] = [
  { head: 'tulip', color: 0 }, { head: 'daisy', color: 1 }, { head: 'pom', color: 0 }, { head: 'five', color: 2 }, { head: 'bell', color: 0 },
  { head: 'cluster', color: 0 }, { head: 'tulip', color: 2 }, { head: 'daisy', color: 0 }, { head: 'pom', color: 1 }, { head: 'five', color: 0 },
  { head: 'bell', color: 1 }, { head: 'cluster', color: 2 }, { head: 'tulip', color: 0 }, { head: 'daisy', color: 2 }, { head: 'pom', color: 1 },
];

export interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Side of one grid cell in px. */
  cell: number;
  /** Top-left of the grid inside the bed. */
  ox: number;
  oy: number;
}

const PAD = 0.45;

/** The largest bed that fits the box, centred in it. */
export function layoutGarden(box: { x: number; y: number; w: number; h: number }): Layout {
  const cell = Math.max(10, Math.min(box.w / (COLS + 2 * PAD), box.h / (ROWS + 2 * PAD)));
  const w = cell * (COLS + 2 * PAD);
  const h = cell * (ROWS + 2 * PAD);
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  return { x, y, w, h, cell, ox: x + PAD * cell, oy: y + PAD * cell };
}

/** Where the head of flower `i` is, in px. */
export function headPos(l: Layout, i: number) {
  return { x: l.ox + ((i % COLS) + 0.5) * l.cell, y: l.oy + (Math.floor(i / COLS) + 0.5) * l.cell - 0.14 * l.cell };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => clamp01(x) * clamp01(x) * (3 - 2 * clamp01(x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A repeatable "random" number in -1..1, so the hand-drawn wobble is the same every frame. */
function hash(a: number, b: number) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** A hex colour mixed toward black. */
function shade(hex: string, k: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.round(v * (1 - k));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// ------------------------------------------------------------------- grain

let grainTile: HTMLCanvasElement | null = null;

/** A tile of fine light and dark specks, laid over the whole bed. */
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d')!;
  const img = g.createImageData(160, 160);
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() > 0.5 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = rnd() * rnd() * 70;
  }
  g.putImageData(img, 0, 0);
  return (grainTile = c);
}

const bedPath = (g: CanvasRenderingContext2D, l: Layout) => {
  g.beginPath();
  g.roundRect(l.x, l.y, l.w, l.h, l.cell * 0.4);
};

export function drawBed(g: CanvasRenderingContext2D, l: Layout, pal: Palette) {
  g.fillStyle = pal.bed;
  bedPath(g, l);
  g.fill();
}

/** The grain over everything in the bed (call after the flowers). */
export function drawGrain(g: CanvasRenderingContext2D, l: Layout) {
  g.save();
  bedPath(g, l);
  g.clip();
  const pat = g.createPattern(grain(), 'repeat');
  if (pat) {
    g.fillStyle = pat;
    g.fillRect(l.x, l.y, l.w, l.h);
  }
  g.restore();
}

// ----------------------------------------------------------------- flowers

/** A teardrop petal from the origin up to (0, -len), with a hand-drawn wobble. */
function petal(g: CanvasRenderingContext2D, len: number, wid: number, seed: number, round = 0.3) {
  const j = (k: number) => hash(seed, k) * 0.1;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * (1 + j(1)), -len * (0.2 + j(2)), wid * (0.9 + round * 0.4 + j(3)), -len * (0.85 + round * 0.2), 0, -len * (1 + j(4) * 0.4));
  g.bezierCurveTo(-wid * (0.9 + round * 0.4 + j(5)), -len * (0.85 + round * 0.2), -wid * (1 + j(6)), -len * (0.2 + j(7)), 0, 0);
  g.closePath();
  g.fill();
}

/** A petal turned by `ang` (0 = straight up) around the origin. */
function turned(g: CanvasRenderingContext2D, ang: number, len: number, wid: number, seed: number, round?: number) {
  g.save();
  g.rotate(ang);
  petal(g, len, wid, seed, round);
  g.restore();
}

function dots(g: CanvasRenderingContext2D, R: number, e: number, color: string, y = 0) {
  const a = clamp01((e - 0.25) / 0.5);
  if (a <= 0) return;
  g.fillStyle = color;
  g.globalAlpha *= a;
  for (const [x, dy] of [[-0.12, -0.04], [0.1, -0.08], [0.0, 0.1]]) {
    g.beginPath();
    g.arc(x * R, y + dy * R, R * 0.06 * lerp(0.5, 1, e), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha /= a;
}

/** A radial flower: `n` petals that fan out from a bundle pointing up (closed) to a full circle (open). */
function radial(g: CanvasRenderingContext2D, n: number, R: number, e: number, len: number, wid: number, seed: number, round: number, arc = 2 * Math.PI) {
  const scale = lerp(0.5, 1, e);
  for (let i = 0; i < n; i++) {
    const u = i / n - 0.5 + 0.5 / n; // -0.5..0.5 across the fan
    const open = u * arc;
    const shut = u * 0.5;
    turned(g, lerp(shut, open, e), R * len * scale, R * wid * lerp(0.8, 1, e), seed * 13 + i, round);
  }
}

/** A closed bud under the petals; it fades as the flower opens. */
function bud(g: CanvasRenderingContext2D, R: number, e: number, fill: string) {
  const a = 1 - e;
  if (a <= 0) return;
  g.save();
  g.globalAlpha *= a;
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(0, -R * 0.42, R * 0.38, R * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function leaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, seed: number, fill: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * 1.1, -len * (0.25 + hash(seed, 1) * 0.05), wid * 0.9, -len * 0.75, 0, -len);
  g.bezierCurveTo(-wid * 0.9, -len * 0.7, -wid * (1 + hash(seed, 2) * 0.1), -len * 0.25, 0, 0);
  g.fill();
  g.restore();
}

function headShape(g: CanvasRenderingContext2D, head: Head, R: number, e: number, petalCol: string, dotCol: string, seed: number) {
  g.fillStyle = petalCol;
  bud(g, R, e, petalCol);
  switch (head) {
    case 'tulip': {
      const spread = lerp(0.05, 0.62, e);
      turned(g, -spread, R * 1.15 * lerp(0.6, 1, e), R * 0.52, seed * 3 + 1, 0.5);
      turned(g, spread, R * 1.15 * lerp(0.6, 1, e), R * 0.52, seed * 3 + 2, 0.5);
      turned(g, 0, R * 1.3 * lerp(0.6, 1, e), R * 0.5, seed * 3 + 3, 0.2);
      break;
    }
    case 'daisy':
      radial(g, 11, R, e, 1.15, 0.2, seed, 0.2);
      g.beginPath();
      g.arc(0, 0, R * 0.22 * lerp(0.4, 1, e), 0, Math.PI * 2);
      g.fill();
      dots(g, R, e, dotCol);
      break;
    case 'pom': {
      const r = R * 0.95 * lerp(0.5, 1, e);
      g.beginPath();
      g.arc(0, -R * 0.1 * (1 - e), r * 0.8, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + hash(seed, i) * 0.12;
        g.beginPath();
        g.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * (0.36 + hash(seed, i + 9) * 0.05), 0, Math.PI * 2);
        g.fill();
      }
      dots(g, R, e, dotCol);
      break;
    }
    case 'five':
      radial(g, 5, R, e, 1.0, 0.62, seed, 1);
      dots(g, R, e, dotCol);
      break;
    case 'bell': {
      const wb = R * lerp(0.5, 1.15, e);
      const nb = Math.max(R * 0.16, wb * 0.34);
      const hb = R * 1.15;
      g.save();
      g.rotate(0.12);
      g.beginPath();
      g.moveTo(-nb, -hb * 0.6);
      g.bezierCurveTo(-nb * 1.4, -hb * 0.05, -wb * 0.8, hb * 0.15, -wb, hb * 0.5);
      for (let k = 0; k < 3; k++) {
        const x0 = lerp(-wb, wb, k / 3);
        const x1 = lerp(-wb, wb, (k + 1) / 3);
        g.quadraticCurveTo((x0 + x1) / 2, hb * (0.5 + 0.3 * e + hash(seed, k) * 0.04), x1, hb * 0.5);
      }
      g.bezierCurveTo(wb * 0.8, hb * 0.15, nb * 1.4, -hb * 0.05, nb, -hb * 0.6);
      g.quadraticCurveTo(0, -hb * 0.78, -nb, -hb * 0.6);
      g.closePath();
      g.fill();
      g.fillStyle = dotCol;
      g.globalAlpha *= clamp01((e - 0.3) / 0.5);
      g.beginPath();
      g.arc(0, hb * 0.5 + R * 0.14, R * 0.09, 0, Math.PI * 2);
      g.fill();
      g.restore();
      break;
    }
    case 'cluster': {
      const small = R * 0.5;
      for (const [k, x, y] of [[0, -0.75, 0.2], [1, 0, -0.55], [2, 0.75, 0.25]] as const) {
        const ek = smooth(e * 1.4 - k * 0.2);
        g.save();
        g.translate(x * R, y * R);
        g.fillStyle = shade(petalCol, 0.0);
        bud(g, small, ek, petalCol);
        g.fillStyle = petalCol;
        radial(g, 5, small, ek, 1.0, 0.62, seed * 7 + k, 1);
        dots(g, small, ek, dotCol);
        g.restore();
      }
      break;
    }
  }
}

export interface FlowerPose {
  /** 0 bud to 1 open. */
  bloom: number;
  /** Lean of the stem and head, in cells (about -0.15 to 0.15). */
  lean: number;
}

/** Draw flower `i`: its stem and leaves, then its head. */
export function drawFlower(g: CanvasRenderingContext2D, l: Layout, pal: Palette, i: number, pose: FlowerPose) {
  const spec = GARDEN[i];
  const c = l.cell;
  const cx = l.ox + ((i % COLS) + 0.5) * c;
  const cy = l.oy + (Math.floor(i / COLS) + 0.5) * c;
  const baseY = cy + 0.46 * c;
  const hx = cx + pose.lean * c;
  const hy = cy - 0.14 * c;
  const ctrlX = cx - pose.lean * c * 0.25;
  const ctrlY = (baseY + hy) / 2;
  const seed = i + 1;
  const at = (t: number) => {
    const u = 1 - t;
    return { x: u * u * cx + 2 * u * t * ctrlX + t * t * hx, y: u * u * baseY + 2 * u * t * ctrlY + t * t * hy };
  };

  // Stem
  g.lineCap = 'round';
  g.strokeStyle = pal.stem;
  g.lineWidth = c * 0.06;
  g.beginPath();
  g.moveTo(cx, baseY);
  g.quadraticCurveTo(ctrlX, ctrlY, hx, hy);
  g.stroke();

  // 2 to 4 leaves, alternating sides
  const n = 2 + ((i * 7) % 3);
  for (let k = 0; k < n; k++) {
    const t = 0.18 + (0.58 * k) / Math.max(1, n - 1) + hash(seed, k + 20) * 0.03;
    const p = at(t);
    const side = k % 2 ? 1 : -1;
    leaf(g, p.x, p.y, side * (0.95 + hash(seed, k + 30) * 0.2) + pose.lean * 0.6, c * (0.3 + hash(seed, k + 40) * 0.04), c * 0.1, seed * 10 + k, k % 2 ? pal.leaf : pal.stem);
  }

  // Head
  const e = smooth(pose.bloom);
  const R = c * 0.25;
  const col = pal.petals[spec.color];
  g.save();
  g.translate(hx, hy);
  g.rotate(pose.lean * 0.9);
  headShape(g, spec.head, R, e, col, shade(col, 0.28), seed);
  g.restore();
}
