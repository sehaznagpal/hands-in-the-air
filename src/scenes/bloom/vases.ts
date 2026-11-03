/**
 * Blooming Flowers: the artwork, drawn in code. Five vases on a ledge, each holding a different plant. A plant's
 * bloom value goes from 0 (closed buds, folded leaves) to 1 (flowers open, leaves spread, berries popped out).
 * Everything is drawn in "vase units" (u = the width of the widest vase), flat and slightly wobbly, then a speckle
 * grain goes over the whole picture. Shared by the game and the About card preview.
 */

export const VASES = 5;

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export interface Palette {
  bg: string;
  ledge: string;
  cream: string;
  orange: string;
  blue: string;
  pink: string;
  lilac: string;
  violet: string;
  olive: string;
  lime: string;
}

/** Mainly orange, blue and cream (the app's own colours), with accents of pink, lilac, olive and lime. */
export function vasePalette(): Palette {
  return {
    bg: css('--bg', '#dad1ca'),
    ledge: '#c8bba6',
    cream: '#f3e9d4',
    orange: css('--orange', '#c54812'),
    blue: css('--blue', '#0a3699'),
    pink: '#ee80b0',
    lilac: '#a99edf',
    violet: '#5a4fc2',
    olive: '#69702a',
    lime: '#c3d53f',
  };
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

// ---------------------------------------------------------------- layout

export interface Row {
  /** Nominal vase width in px (1 unit). */
  u: number;
  /** Distance between vase centres. */
  pitch: number;
  /** Centre x of each vase. */
  xs: number[];
  /** Where the vases stand. */
  baseY: number;
  ledgeTop: number;
}

/**
 * Five vases in a row, centred, standing close together like a still life. The ledge fills the lower
 * third of the picture. `top` keeps the tallest plant clear of the tabs.
 */
export function layoutRow(W: number, H: number, top: number): Row {
  const phone = W < 640;
  const edge = phone ? 10 : 48;
  const pitchU = 1.2;
  const ledgeTop = H * (phone ? 0.62 : 0.72);
  const baseY = ledgeTop + 0.1 * Math.min(W / 9, H / 6);
  const u = Math.max(14, Math.min((W - 2 * edge) / (4 * pitchU + 1), (baseY - top) / 3.25));
  const pitch = u * pitchU;
  return { u, pitch, xs: Array.from({ length: VASES }, (_, k) => W / 2 + (k - 2) * pitch), baseY: ledgeTop + 0.1 * u, ledgeTop };
}

// ---------------------------------------------------------------- grain

let grainTile: HTMLCanvasElement | null = null;

/** A tile of fine light and dark specks. */
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d')!;
  const img = g.createImageData(192, 192);
  let s = 987654;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() > 0.45 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = rnd() * rnd() * 80;
  }
  g.putImageData(img, 0, 0);
  return (grainTile = c);
}

/** The speckle over everything in the rectangle (call last). */
export function drawGrain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pat = g.createPattern(grain(), 'repeat');
  if (!pat) return;
  g.save();
  g.fillStyle = pat;
  g.fillRect(x, y, w, h);
  g.restore();
}

export function drawLedge(g: CanvasRenderingContext2D, pal: Palette, x: number, y: number, w: number, h: number) {
  g.fillStyle = pal.ledge;
  g.fillRect(x, y, w, h);
}

// ----------------------------------------------------------- shape helpers

/** Paint a shape twice, the first time a little off to one side in a darker tone, like a slightly misregistered print. */
function inked(g: CanvasRenderingContext2D, fill: string, path: () => void, off = 0.016, back = shade(fill, 0.3)) {
  g.save();
  g.translate(off, off * 0.7);
  g.fillStyle = back;
  path();
  g.fill();
  g.restore();
  g.fillStyle = fill;
  path();
  g.fill();
}

/** Like `inked`, for a vase made of several overlapping pieces: all the back copies first, then all the fronts, so no stray edges show inside. */
function inkedAll(g: CanvasRenderingContext2D, fill: string, paths: (() => void)[], off = 0.016) {
  g.save();
  g.translate(off, off * 0.7);
  g.fillStyle = shade(fill, 0.3);
  for (const p of paths) {
    p();
    g.fill();
  }
  g.restore();
  g.fillStyle = fill;
  for (const p of paths) {
    p();
    g.fill();
  }
}

/** A polygon whose corners wobble a little, for hand-cut edges. */
function jag(g: CanvasRenderingContext2D, pts: [number, number][], seed: number, amt = 0.01) {
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const px = x + hash(seed, i * 2) * amt;
    const py = y + hash(seed, i * 2 + 1) * amt;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  });
  g.closePath();
}

const ellipsePts = (cx: number, cy: number, rx: number, ry: number, n = 30, seed = 1): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + hash(seed, i) * 0.015;
    return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r];
  });

/** A teardrop petal from the origin up to (0, -len). */
function petalPath(g: CanvasRenderingContext2D, len: number, wid: number, seed: number, round = 0.3) {
  const j = (k: number) => hash(seed, k) * 0.08;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * (1 + j(1)), -len * (0.2 + j(2)), wid * (0.9 + round * 0.4 + j(3)), -len * (0.85 + round * 0.2), 0, -len * (1 + j(4) * 0.4));
  g.bezierCurveTo(-wid * (0.9 + round * 0.4 + j(5)), -len * (0.85 + round * 0.2), -wid * (1 + j(6)), -len * (0.2 + j(7)), 0, 0);
  g.closePath();
}

/** A pointed leaf from the origin up to (0, -len), turned by `ang` (0 = up), with a darker half. */
function leaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, seed: number, fill: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const path = () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(wid * 1.15, -len * (0.28 + hash(seed, 1) * 0.04), wid * 0.85, -len * 0.78, 0, -len);
    g.bezierCurveTo(-wid * 0.9, -len * 0.72, -wid * (1 + hash(seed, 2) * 0.1), -len * 0.28, 0, 0);
  };
  inked(g, fill, path);
  // The darker half of the leaf, like a second print colour.
  g.fillStyle = shade(fill, 0.22);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * 1.15, -len * 0.28, wid * 0.85, -len * 0.78, 0, -len);
  g.bezierCurveTo(wid * 0.25, -len * 0.7, wid * 0.2, -len * 0.3, 0, 0);
  g.fill();
  g.restore();
}

function stem(g: CanvasRenderingContext2D, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, color: string, w = 0.032) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(cx, cy, x1, y1);
  g.stroke();
}

const quad = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number) => {
  const u = 1 - t;
  return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 };
};

/** A cup of three petals (tulip style): closed at e = 0, spread open at e = 1. */
function cup(g: CanvasRenderingContext2D, R: number, e: number, col: string, seed: number) {
  const spread = lerp(0.04, 0.75, e);
  const len = R * lerp(0.75, 1.25, e);
  g.save();
  for (const s of [-1, 1]) {
    g.save();
    g.rotate(s * spread);
    inked(g, shade(col, 0.12), () => petalPath(g, len, R * 0.62, seed * 3 + s, 0.5), 0.012);
    g.restore();
  }
  g.restore();
  inked(g, col, () => petalPath(g, len * 1.08, R * 0.6, seed * 3 + 5, 0.25), 0.012);
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// ------------------------------------------------------------------ plants

/** Berry branches: thin violet twigs that stretch out and pop orange berries. */
function berries(g: CanvasRenderingContext2D, e: number, pal: Palette) {
  const angs = [-0.6, -0.3, 0, 0.3, 0.6];
  const lens = [1.0, 1.3, 1.55, 1.25, 0.95];
  angs.forEach((a, i) => {
    const L = lens[i] * lerp(0.55, 1, e);
    const x1 = Math.sin(a) * L;
    const y1 = -Math.cos(a) * L;
    const cx = Math.sin(a) * L * 0.25;
    const cy = -L * 0.55;
    stem(g, 0, 0.05, cx, cy, x1, y1, pal.violet, 0.026);
    dot(g, x1, y1, 0.035 * (1 - e * 0.5), pal.orange);
    for (let j = 0; j < 6; j++) {
      const t = 0.38 + j * 0.1;
      const p = quad(0, 0.05, cx, cy, x1, y1, t);
      const side = j % 2 ? 1 : -1;
      const pop = smooth((e - j * 0.08) / 0.55);
      if (pop <= 0) continue;
      const bx = p.x + side * 0.09 * pop;
      const by = p.y - 0.02 + hash(i, j) * 0.03;
      g.strokeStyle = pal.violet;
      g.lineWidth = 0.014;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(bx, by);
      g.stroke();
      inked(g, pal.orange, () => {
        g.beginPath();
        g.arc(bx, by, 0.062 * pop, 0, Math.PI * 2);
      }, 0.012);
    }
  });
}

/** Big lilac leaves up a central stem, and a blue cup flower on top. */
function cupFlower(g: CanvasRenderingContext2D, e: number, pal: Palette) {
  const top = 1.35 * lerp(0.8, 1, e);
  stem(g, 0, 0.05, 0.05, -top * 0.5, 0, -top, pal.olive, 0.04);
  for (let k = 0; k < 6; k++) {
    const t = 0.18 + k * 0.12;
    const side = k % 2 ? 1 : -1;
    const ang = side * lerp(0.1, 0.95, e) * (1 - k * 0.05);
    leaf(g, 0, -top * t, ang, (0.95 - k * 0.07) * lerp(0.55, 1, e), 0.2, 40 + k, k % 3 === 0 ? pal.violet : pal.lilac);
  }
  g.save();
  g.translate(0, -top);
  cup(g, 0.34, e, pal.blue, 7);
  // Orange stamen dots show as it opens.
  const a = smooth((e - 0.3) / 0.5);
  for (const [x, y] of [[-0.06, -0.3], [0.05, -0.34], [0, -0.22]]) dot(g, x, y * (0.6 + 0.4 * e), 0.032 * a, pal.orange);
  g.restore();
}

/** Three tulip-style blooms and long olive blades. */
function tulips(g: CanvasRenderingContext2D, e: number, pal: Palette) {
  [-0.9, -0.38, 0.38, 0.9].forEach((a, i) => leaf(g, 0, 0.05, a * lerp(0.4, 1, e), (1.05 - Math.abs(a) * 0.15) * lerp(0.55, 1, e), 0.13, 60 + i, i % 2 ? pal.lime : pal.olive));
  const heads: [number, number, string][] = [[-0.45, -1.2, pal.cream], [0.08, -1.55, pal.pink], [0.5, -1.0, pal.cream]];
  heads.forEach(([x, y, col], i) => {
    const k = lerp(0.82, 1, e);
    stem(g, 0, 0.05, x * 0.3, y * 0.5, x, y * k, pal.olive, 0.03);
    g.save();
    g.translate(x, y * k);
    g.rotate(x * 0.15);
    cup(g, 0.3, smooth(e * 1.25 - i * 0.12), col, 80 + i);
    g.restore();
  });
}

/** Round pom flowers on stems, with broad lime leaves. */
function poms(g: CanvasRenderingContext2D, e: number, pal: Palette) {
  [-1.15, -0.55, 0.5, 1.1].forEach((a, i) => leaf(g, 0, 0.05, a * lerp(0.45, 1, e), 0.8 * lerp(0.6, 1, e), 0.3, 90 + i, i % 2 ? pal.olive : pal.lime));
  const heads: [number, number][] = [[-0.55, -1.15], [0.15, -1.5], [0.6, -1.0]];
  heads.forEach(([x, y], i) => {
    const k = lerp(0.85, 1, e);
    stem(g, 0, 0.05, x * 0.3, y * 0.5, x, y * k, pal.olive, 0.03);
    const ek = smooth(e * 1.3 - i * 0.12);
    const r = 0.36 * lerp(0.48, 1, ek);
    g.save();
    g.translate(x, y * k);
    if (ek < 1) {
      g.globalAlpha = 1 - ek;
      inked(g, pal.pink, () => {
        g.beginPath();
        g.ellipse(0, -0.07, 0.15, 0.25, 0, 0, Math.PI * 2);
      }, 0.012);
      g.globalAlpha = 1;
    }
    inked(g, pal.pink, () => {
      g.beginPath();
      g.arc(0, 0, r * 0.82, 0, Math.PI * 2);
      for (let b = 0; b < 9; b++) {
        const an = (b / 9) * Math.PI * 2 + hash(i, b) * 0.1;
        g.moveTo(Math.cos(an) * r * 0.64 + r * 0.38, Math.sin(an) * r * 0.64);
        g.arc(Math.cos(an) * r * 0.64, Math.sin(an) * r * 0.64, r * 0.38, 0, Math.PI * 2);
      }
    }, 0.012);
    const a = smooth((ek - 0.3) / 0.5);
    for (const [dx, dy] of [[-0.3, -0.1], [0.25, -0.2], [0, 0.22]]) dot(g, dx * r, dy * r, r * 0.09 * a, pal.orange);
    g.restore();
  });
}

/** A pink trumpet flower with blue stamens on one curved stem, and two lime leaves. */
function trumpet(g: CanvasRenderingContext2D, e: number, pal: Palette) {
  for (const s of [-1, 1]) leaf(g, 0, 0.05, s * lerp(0.4, 1.15, e), 0.62 * lerp(0.6, 1, e), 0.2, 110 + s, s < 0 ? pal.lime : pal.olive);
  const hx = 0.14;
  const hy = -1.0 * lerp(0.85, 1, e);
  stem(g, 0, 0.05, -0.08, hy * 0.5, hx, hy, pal.olive, 0.034);
  g.save();
  g.translate(hx, hy);
  g.rotate(0.12);
  const W = 0.34 * lerp(0.28, 1, e);
  const Lt = 0.5 * lerp(0.85, 1, e);
  const path = () => {
    g.beginPath();
    g.moveTo(-0.045, 0);
    g.bezierCurveTo(-0.06, -Lt * 0.35, -W * 0.8, -Lt * 0.55, -W, -Lt);
    for (let k = 0; k < 3; k++) {
      const x0 = lerp(-W, W, k / 3);
      const x1 = lerp(-W, W, (k + 1) / 3);
      g.quadraticCurveTo((x0 + x1) / 2, -Lt - 0.08 * e * (1 + hash(7, k) * 0.2), x1, -Lt);
    }
    g.bezierCurveTo(W * 0.8, -Lt * 0.55, 0.06, -Lt * 0.35, 0.045, 0);
    g.closePath();
  };
  inked(g, pal.pink, path);
  const a = smooth((e - 0.35) / 0.5);
  if (a > 0) {
    g.fillStyle = shade(pal.pink, 0.28);
    g.globalAlpha = a;
    g.beginPath();
    g.ellipse(0, -Lt, W * 0.55, 0.05 + 0.04 * e, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    for (const x of [-0.1, 0, 0.1]) {
      const ex = x * 1.6 * a;
      const ey = -Lt - 0.34 * a;
      g.strokeStyle = pal.violet;
      g.lineWidth = 0.014;
      g.beginPath();
      g.moveTo(0, -Lt);
      g.lineTo(ex, ey);
      g.stroke();
      dot(g, ex, ey, 0.032, pal.blue);
    }
  }
  g.restore();
}

// ------------------------------------------------------------------- vases

interface VaseSpec {
  /** Height of the vase's mouth above its base, in units. */
  mouth: number;
  draw(g: CanvasRenderingContext2D, pal: Palette): void;
  plant(g: CanvasRenderingContext2D, e: number, pal: Palette): void;
}

/** Vertical stripes or dots etc. are clipped to the shape just drawn. */
const VASE: VaseSpec[] = [
  {
    // Tall blue cylinder with a cream band and dots
    mouth: 1.55,
    draw(g, pal) {
      const path = () => jag(g, [[-0.31, -1.55], [0.31, -1.55], [0.32, 0], [-0.32, 0]], 1);
      inked(g, pal.blue, path);
      g.save();
      path();
      g.clip();
      g.fillStyle = pal.cream;
      g.fillRect(-0.4, -0.78, 0.8, 0.1);
      g.fillRect(-0.4, -0.5, 0.8, 0.035);
      for (let i = 0; i < 3; i++) dot(g, -0.15 + i * 0.15, -1.15, 0.035, pal.cream);
      g.restore();
    },
    plant: berries,
  },
  {
    // Round pink belly with wavy orange lines and a cream lip
    mouth: 1.2,
    draw(g, pal) {
      const belly = () => jag(g, ellipsePts(0, -0.52, 0.5, 0.54, 64, 2), 2, 0.004);
      const neck = () => jag(g, [[-0.13, -1.1], [0.13, -1.1], [0.15, -0.95], [0.3, -0.85], [-0.3, -0.85], [-0.15, -0.95]], 3, 0.004);
      inkedAll(g, pal.pink, [belly, neck]);
      g.save();
      belly();
      g.clip();
      g.strokeStyle = pal.orange;
      g.lineWidth = 0.03;
      g.lineCap = 'round';
      for (let w = 0; w < 3; w++) {
        g.beginPath();
        for (let x = -0.6; x <= 0.6; x += 0.04) {
          const y = -0.78 + w * 0.26 + Math.sin(x * 7 + w * 1.7) * 0.07;
          if (x === -0.6) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.restore();
      inked(g, pal.cream, () => jag(g, [[-0.19, -1.2], [0.19, -1.2], [0.19, -1.09], [-0.19, -1.09]], 4), 0.01);
    },
    plant: cupFlower,
  },
  {
    // Orange ribbed vase with cream stripes
    mouth: 1.2,
    draw(g, pal) {
      const path = () => jag(g, [[-0.36, -1.2], [0.36, -1.2], [0.33, 0], [-0.33, 0]], 5);
      inked(g, pal.orange, path);
      g.save();
      path();
      g.clip();
      g.fillStyle = pal.cream;
      for (let i = -3; i <= 3; i++) g.fillRect(i * 0.1 - 0.012, -1.2, 0.024, 1.2);
      g.fillStyle = shade(pal.orange, 0.25);
      g.fillRect(-0.4, -1.2, 0.8, 0.06);
      g.restore();
    },
    plant: tulips,
  },
  {
    // Lilac and cream checkerboard pot
    mouth: 0.78,
    draw(g, pal) {
      const path = () => jag(g, [[-0.48, -0.78], [0.48, -0.78], [0.36, 0], [-0.36, 0]], 6);
      inked(g, pal.cream, path);
      g.save();
      path();
      g.clip();
      g.fillStyle = pal.lilac;
      const n = 6;
      for (let r = 0; r < 4; r++) for (let c = 0; c < n; c++) if ((r + c) % 2 === 0) g.fillRect(-0.5 + (c * 1.0) / n, -0.78 + r * 0.2, 1.0 / n, 0.2);
      g.restore();
    },
    plant: poms,
  },
  {
    // Small blue bowl with a cream rim and a foot
    mouth: 0.32,
    draw(g, pal) {
      inkedAll(g, pal.blue, [
        () => jag(g, [[-0.14, 0], [0.14, 0], [0.16, -0.06], [-0.16, -0.06]], 7, 0.004),
        () => jag(g, ellipsePts(0, -0.32, 0.38, 0.3, 40, 8).filter(([, y]) => y >= -0.32), 8, 0.004),
      ]);
      g.fillStyle = pal.cream;
      g.fillRect(-0.38, -0.34, 0.76, 0.05);
    },
    plant: trumpet,
  },
];

/** The tallest point of any vase and plant, in units (for layout). */
export const TALLEST = 3.1;

/** Draw vase `i` standing at (x, baseY) with its plant at `bloom`; `lean` is the sway in radians. */
export function drawVase(g: CanvasRenderingContext2D, pal: Palette, i: number, x: number, baseY: number, u: number, bloom: number, lean: number) {
  const spec = VASE[i];
  g.save();
  g.translate(x, baseY);
  g.scale(u, u);
  // A flat shadow on the ledge.
  g.fillStyle = shade(pal.ledge, 0.14);
  g.beginPath();
  g.ellipse(0.03, 0.01, 0.55, 0.06, 0, 0, Math.PI * 2);
  g.fill();
  // The plant first, so the vase hides the bottom of its stems.
  g.save();
  g.translate(0, -spec.mouth);
  g.rotate(lean);
  spec.plant(g, smooth(bloom), pal);
  g.restore();
  spec.draw(g, pal);
  g.restore();
}
