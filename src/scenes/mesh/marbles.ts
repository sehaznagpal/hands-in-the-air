/**
 * Procedural marbles: 6 soap bubbles and 6 glitter-gel drops, painted once per style into two
 * offscreen layers (a pattern that rolls with the ball and a gloss that never turns).
 * Everything is original canvas 2D drawing with seeded randomness; nothing is loaded from files.
 */

export interface MarbleStyle {
  name: string;
  /** Opacity of the body fill: about 0.4 for bubbles, 1 for gel. */
  bodyAlpha: number;
  /** Body gradient: centre and edge colours. */
  base: [string, string];
  /** Colour of the darker band just inside the edge. */
  rim: string;
  /** Thin-film rainbow rim. `width` is a share of the radius. */
  film?: { colors: string[]; width: number; alpha: number };
  /** Marbled swirl: spiral arcs, concentric ripples or a thumbprint. */
  swirl?: { kind: 'spiral' | 'ripple' | 'thumb'; colors: string[]; turns: number; alpha: number; width: number };
  /** Fine glitter: count, colours, size range (share of the radius) and opacity. */
  glitter?: { n: number; colors: string[]; size: [number, number]; alpha: number };
  /** Flaky shards inside frosted gel. */
  shards?: number;
  /** Tiny inner bubbles, each with its own rim and highlight. */
  inner?: number;
  /** Star sparkles painted into the pattern. */
  stars?: number;
  /** A bright light flare near the top. */
  flare?: boolean;
  /** Opacity of the curved window highlight. */
  window: number;
  /** Opacity of the small specular dot. */
  dot: number;
  /** Opacity of the soft satin sheen band. */
  sheen?: number;
  /** Draw animated star twinkles over it. */
  twinkle?: boolean;
}

const RAINBOW = ['#7fe3f2', '#ff9ad5', '#d6f56a', '#8fd0ff', '#c79bff', '#7fe3f2'];

export const STYLES: MarbleStyle[] = [
  { name: 'aqua bubble', bodyAlpha: 0.3, base: ['rgba(235,252,255,0.55)', 'rgba(120,200,235,0.85)'], rim: 'rgba(60,120,150,0.5)',
    film: { colors: ['#59e1f0', '#ff8fd0', '#c9f35a', '#6fc4ff', '#59e1f0'], width: 0.38, alpha: 1 }, window: 1, dot: 0.9 },
  { name: 'rainbow bubble', bodyAlpha: 0.3, base: ['rgba(250,255,250,0.5)', 'rgba(170,215,240,0.85)'], rim: 'rgba(90,110,150,0.45)',
    film: { colors: RAINBOW, width: 0.4, alpha: 1 }, inner: 3, window: 1, dot: 0.7 },
  { name: 'crystal bubble', bodyAlpha: 0.5, base: ['rgba(215,225,240,0.75)', 'rgba(85,100,135,0.9)'], rim: 'rgba(30,40,70,0.6)',
    film: { colors: ['#6f86b8', '#d0a07a', '#8aa4d8', '#a58ac8', '#6f86b8'], width: 0.25, alpha: 0.7 }, stars: 5, glitter: { n: 140, colors: ['#ffffff', '#cfe0ff', '#ffd9b0'], size: [0.006, 0.02], alpha: 0.9 }, twinkle: true, window: 0.8, dot: 0.7 },
  { name: 'pink iridescent', bodyAlpha: 0.5, base: ['rgba(255,190,230,0.7)', 'rgba(150,70,150,0.85)'], rim: 'rgba(110,40,100,0.5)',
    swirl: { kind: 'spiral', colors: ['#ff4fb8', '#ff9ad8', '#b46cff', '#ffe0f4', '#ff7a9a'], turns: 3.2, alpha: 0.55, width: 0.2 },
    film: { colors: ['#ff6fc8', '#9a7bff', '#ffd0ec', '#ff6fc8'], width: 0.28, alpha: 0.9 }, flare: true, window: 0.75, dot: 0.7 },
  { name: 'blue iridescent', bodyAlpha: 0.5, base: ['rgba(170,235,245,0.7)', 'rgba(50,100,170,0.85)'], rim: 'rgba(30,70,120,0.5)',
    swirl: { kind: 'spiral', colors: ['#28d6c8', '#5aa0ff', '#b79cff', '#d8fbff', '#3ee0ff'], turns: 3.6, alpha: 0.55, width: 0.2 },
    film: { colors: ['#3ee0d0', '#6a8dff', '#c8a4ff', '#3ee0d0'], width: 0.28, alpha: 0.9 }, flare: true, window: 0.75, dot: 0.7 },
  { name: 'pearl bubble', bodyAlpha: 0.92, base: ['rgba(255,244,246,1)', 'rgba(205,190,235,1)'], rim: 'rgba(160,130,190,0.4)',
    film: { colors: ['#ffd9c8', '#d8c8ff', '#c8ecff', '#ffd9c8'], width: 0.2, alpha: 0.5 }, sheen: 0.3, window: 0.85, dot: 0.5 },
  { name: 'peach glitter', bodyAlpha: 1, base: ['rgba(255,226,214,1)', 'rgba(240,160,150,1)'], rim: 'rgba(180,90,90,0.45)',
    swirl: { kind: 'spiral', colors: ['#ffc2a0', '#ffe3cf', '#f59a8a'], turns: 2.2, alpha: 0.75, width: 0.3 },
    glitter: { n: 420, colors: ['#ffffff', '#fff1c8', '#ffd2dc'], size: [0.008, 0.03], alpha: 0.9 }, twinkle: true, window: 0.85, dot: 0.6 },
  { name: 'frosted glitter', bodyAlpha: 1, base: ['rgba(240,248,252,1)', 'rgba(170,200,215,1)'], rim: 'rgba(90,120,140,0.45)',
    shards: 16, glitter: { n: 260, colors: ['#ffffff', '#dff3ff', '#f4e6ff'], size: [0.008, 0.026], alpha: 0.85 }, twinkle: true, window: 0.8, dot: 0.6 },
  { name: 'sky pearl', bodyAlpha: 1, base: ['rgba(200,232,250,1)', 'rgba(90,170,225,1)'], rim: 'rgba(40,100,160,0.5)',
    swirl: { kind: 'ripple', colors: ['#eaf7ff', '#5aa8e0', '#b8e0f8'], turns: 14, alpha: 0.5, width: 0.05 }, sheen: 0.25, window: 0.85, dot: 0.6 },
  { name: 'rose glitter', bodyAlpha: 1, base: ['rgba(255,214,226,1)', 'rgba(240,140,175,1)'], rim: 'rgba(170,70,110,0.4)',
    glitter: { n: 1500, colors: ['#ffffff', '#ffe8ee', '#ffc4d6', '#fff2c0'], size: [0.008, 0.03], alpha: 0.9 }, twinkle: true, window: 0.85, dot: 0.6 },
  { name: 'teal metal', bodyAlpha: 1, base: ['rgba(80,200,185,1)', 'rgba(10,95,100,1)'], rim: 'rgba(0,50,60,0.55)',
    swirl: { kind: 'spiral', colors: ['#8ff0dc', '#1a8f90', '#e8d890', '#37c4b4'], turns: 3, alpha: 0.6, width: 0.22 },
    glitter: { n: 260, colors: ['#e6fff8', '#f2d98a', '#7fe0d0'], size: [0.014, 0.06], alpha: 0.95 }, twinkle: true, window: 0.65, dot: 0.5 },
  { name: 'lilac satin', bodyAlpha: 1, base: ['rgba(228,214,246,1)', 'rgba(160,135,205,1)'], rim: 'rgba(100,75,150,0.45)',
    swirl: { kind: 'thumb', colors: ['#f4ecff', '#8a6cc0', '#c9b4ea'], turns: 9, alpha: 0.8, width: 0.06 }, sheen: 0.3, window: 0.8, dot: 0.6 },
];

// ---------------------------------------------------------------- helpers

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layer(d: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = d;
  return [c, c.getContext('2d')!];
}

const pick = <T>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length];
const hasFilter = () => typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

function star(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x, y - s);
  g.quadraticCurveTo(x, y, x + s, y);
  g.quadraticCurveTo(x, y, x, y + s);
  g.quadraticCurveTo(x, y, x - s, y);
  g.quadraticCurveTo(x, y, x, y - s);
  g.fill();
}

/** Ring of thin-film colour: a conic gradient with the middle erased. */
function filmRing(d: number, colors: string[], width: number, spin: number) {
  const [c, g] = layer(d);
  const m = d / 2;
  const R = m - 1.5;
  if (typeof g.createConicGradient === 'function') {
    const cg = g.createConicGradient(spin, m, m);
    colors.forEach((col, i) => cg.addColorStop(i / (colors.length - 1), col));
    g.fillStyle = cg;
  } else {
    const rg = g.createRadialGradient(m, m, R * (1 - width), m, m, R);
    colors.forEach((col, i) => rg.addColorStop(i / (colors.length - 1), col));
    g.fillStyle = rg;
  }
  g.beginPath();
  g.arc(m, m, R, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  const hole = g.createRadialGradient(m, m, R * (1 - width * 1.7), m, m, R * (1 - width * 0.15));
  hole.addColorStop(0, 'rgba(0,0,0,1)');
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hole;
  g.fillRect(0, 0, d, d);
  return c;
}

function swirl(g: CanvasRenderingContext2D, st: NonNullable<MarbleStyle['swirl']>, m: number, R: number, rnd: () => number) {
  g.save();
  g.lineCap = 'round';
  if (hasFilter()) g.filter = `blur(${Math.max(0.5, R * 0.018)}px)`;
  if (st.kind === 'spiral') {
    const cx = m + R * 0.12;
    const cy = m + R * 0.08;
    const arcs = 170;
    for (let j = 0; j < arcs; j++) {
      const t = j / arcs;
      const a0 = t * st.turns * Math.PI * 2 + rnd() * 0.4;
      const rad = R * (0.08 + 0.92 * Math.pow(t, 0.85)) + (rnd() - 0.5) * R * 0.05;
      g.strokeStyle = pick(st.colors, rnd());
      g.globalAlpha = st.alpha * (0.25 + 0.75 * rnd());
      g.lineWidth = R * st.width * (0.3 + rnd());
      g.beginPath();
      g.arc(cx, cy, rad, a0, a0 + 0.5 + rnd() * 0.9);
      g.stroke();
    }
  } else if (st.kind === 'ripple') {
    for (let j = 0; j < st.turns; j++) {
      const rad = R * (0.08 + (0.9 * j) / st.turns);
      const ph = rnd() * 6;
      g.strokeStyle = st.colors[j % st.colors.length];
      g.globalAlpha = st.alpha * (0.5 + 0.5 * rnd());
      g.lineWidth = R * st.width * (0.7 + rnd() * 0.8);
      g.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.1) {
        const rr = rad * (1 + 0.05 * Math.sin(a * 3 + ph) + 0.03 * Math.sin(a * 5 + ph * 2));
        const x = m + R * 0.05 + Math.cos(a) * rr;
        const y = m + Math.sin(a) * rr;
        if (a === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  } else {
    for (let j = 0; j < st.turns; j++) {
      g.strokeStyle = st.colors[j % st.colors.length];
      g.globalAlpha = st.alpha * (0.5 + 0.5 * rnd());
      g.lineWidth = R * st.width * (0.8 + rnd());
      g.beginPath();
      g.ellipse(m, m - R * 0.04, R * (0.09 + 0.055 * j), R * (0.13 + 0.075 * j), 0.25, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
}

function glitter(g: CanvasRenderingContext2D, st: NonNullable<MarbleStyle['glitter']>, m: number, R: number, rnd: () => number) {
  for (let i = 0; i < st.n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R * 0.97;
    const x = m + Math.cos(a) * r;
    const y = m + Math.sin(a) * r;
    const s = R * (st.size[0] + (st.size[1] - st.size[0]) * Math.pow(rnd(), 3));
    g.globalAlpha = st.alpha * (0.35 + 0.65 * rnd());
    g.fillStyle = pick(st.colors, rnd());
    g.beginPath();
    if (rnd() < 0.5) g.arc(x, y, s, 0, Math.PI * 2);
    else {
      const rot = rnd() * Math.PI;
      g.moveTo(x + Math.cos(rot) * s * 1.6, y + Math.sin(rot) * s * 1.6);
      g.lineTo(x + Math.cos(rot + 1.6) * s, y + Math.sin(rot + 1.6) * s);
      g.lineTo(x + Math.cos(rot + Math.PI) * s * 1.6, y + Math.sin(rot + Math.PI) * s * 1.6);
      g.lineTo(x + Math.cos(rot + 4.7) * s, y + Math.sin(rot + 4.7) * s);
    }
    g.fill();
  }
  g.globalAlpha = 1;
}

function shards(g: CanvasRenderingContext2D, n: number, m: number, R: number, rnd: () => number) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R * 0.85;
    const cx = m + Math.cos(a) * r;
    const cy = m + Math.sin(a) * r;
    const s = R * (0.07 + rnd() * 0.15);
    const sides = 4 + Math.floor(rnd() * 3);
    const rot = rnd() * 6;
    g.beginPath();
    for (let k = 0; k < sides; k++) {
      const aa = rot + (k / sides) * Math.PI * 2;
      const rr = s * (0.55 + 0.6 * rnd());
      const x = cx + Math.cos(aa) * rr;
      const y = cy + Math.sin(aa) * rr * 0.7;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.22})`;
    g.fill();
    g.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.35})`;
    g.lineWidth = Math.max(1, R * 0.008);
    g.stroke();
  }
}

function innerBubble(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const rim = g.createLinearGradient(x - r, y - r, x + r, y + r);
  rim.addColorStop(0, '#9be8ff');
  rim.addColorStop(0.5, '#ff9ad8');
  rim.addColorStop(1, '#d8f77a');
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = rim;
  g.lineWidth = Math.max(1, r * 0.22);
  g.globalAlpha = 0.9;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(x - r * 0.35, y - r * 0.38, r * 0.22, 0, Math.PI * 2);
  g.fill();
}

// ------------------------------------------------------------ the two layers

export interface MarbleLayers {
  pattern: HTMLCanvasElement;
  gloss: HTMLCanvasElement;
  size: number;
}

/** Pattern layer: body, swirl, film, glitter and inner details, clipped to a circle. Turns with the ball. */
function paintPattern(st: MarbleStyle, index: number, d: number) {
  const [c, g] = layer(d);
  const m = d / 2;
  const R = m - 1.5;
  const rnd = rng(7919 * (index + 1));
  g.save();
  g.beginPath();
  g.arc(m, m, R, 0, Math.PI * 2);
  g.clip();

  const body = g.createRadialGradient(m - R * 0.25, m - R * 0.3, R * 0.05, m, m, R);
  body.addColorStop(0, st.base[0]);
  body.addColorStop(1, st.base[1]);
  g.globalAlpha = st.bodyAlpha;
  g.fillStyle = body;
  g.fillRect(0, 0, d, d);
  g.globalAlpha = 1;

  if (st.swirl) swirl(g, st.swirl, m, R, rnd);
  if (st.shards) shards(g, st.shards, m, R, rnd);
  if (st.glitter) glitter(g, st.glitter, m, R, rnd);
  if (st.film) {
    g.globalAlpha = st.film.alpha;
    g.drawImage(filmRing(d, st.film.colors, st.film.width, rnd() * 6), 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  for (let i = 0; i < (st.inner ?? 0); i++) {
    const a = 0.6 + i * 2.1 + rnd();
    const r = R * (0.3 + rnd() * 0.25);
    innerBubble(g, m + Math.cos(a) * r, m + Math.sin(a) * r, R * (0.09 + rnd() * 0.08));
  }
  for (let i = 0; i < (st.stars ?? 0); i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R * 0.65;
    if (hasFilter()) g.filter = `blur(${R * 0.01}px)`;
    star(g, m + Math.cos(a) * r, m + Math.sin(a) * r, R * (0.07 + rnd() * 0.12), 'rgba(255,255,255,0.9)');
    g.filter = 'none';
  }
  g.restore();
  return c;
}

/** Gloss layer: edge shading, rim light, window highlight, flare, sheen, specular dot, outer ring. Never turns. */
function paintGloss(st: MarbleStyle, d: number) {
  const [c, g] = layer(d);
  const m = d / 2;
  const R = m - 1.5;
  g.save();
  g.beginPath();
  g.arc(m, m, R, 0, Math.PI * 2);
  g.clip();

  // Darker band toward the edge, heaviest at the bottom right.
  const shade = g.createRadialGradient(m - R * 0.22, m - R * 0.26, R * 0.5, m, m, R);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.75, 'rgba(0,0,0,0)');
  shade.addColorStop(1, st.rim);
  g.fillStyle = shade;
  g.fillRect(0, 0, d, d);
  const inner = g.createRadialGradient(m - R * 0.3, m - R * 0.35, R * 0.4, m + R * 0.1, m + R * 0.12, R * 1.15);
  inner.addColorStop(0, 'rgba(20,10,30,0)');
  inner.addColorStop(1, st.bodyAlpha < 0.7 ? 'rgba(20,10,40,0.2)' : 'rgba(40,10,40,0.28)');
  g.fillStyle = inner;
  g.fillRect(0, 0, d, d);

  if (st.sheen) {
    const band = g.createLinearGradient(m - R, m - R, m + R, m + R);
    band.addColorStop(0.2, 'rgba(255,255,255,0)');
    band.addColorStop(0.42, `rgba(255,255,255,${st.sheen})`);
    band.addColorStop(0.62, 'rgba(255,255,255,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, d, d);
  }

  if (hasFilter()) g.filter = `blur(${Math.max(0.4, R * 0.012)}px)`;
  // Rim light along the upper left edge.
  const rimLight = g.createLinearGradient(m - R, m - R, m, m);
  rimLight.addColorStop(0, 'rgba(255,255,255,0.8)');
  rimLight.addColorStop(1, 'rgba(255,255,255,0)');
  g.strokeStyle = rimLight;
  g.lineWidth = R * 0.05;
  g.beginPath();
  g.arc(m, m, R * 0.95, Math.PI * 0.92, Math.PI * 1.72);
  g.stroke();

  // Curved window highlight, top left.
  const win = g.createLinearGradient(m - R * 0.7, m - R * 0.7, m - R * 0.1, m - R * 0.1);
  win.addColorStop(0, `rgba(255,255,255,${st.window})`);
  win.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = win;
  g.beginPath();
  g.arc(m, m, R * 0.82, Math.PI * 1.02, Math.PI * 1.58);
  g.arc(m, m, R * 0.66, Math.PI * 1.58, Math.PI * 1.02, true);
  g.closePath();
  g.fill();
  g.filter = 'none';

  if (st.flare) {
    const fl = g.createRadialGradient(m - R * 0.05, m - R * 0.55, 0, m - R * 0.05, m - R * 0.55, R * 0.4);
    fl.addColorStop(0, 'rgba(255,255,255,0.95)');
    fl.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    fl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fl;
    g.fillRect(0, 0, d, d);
    star(g, m - R * 0.05, m - R * 0.55, R * 0.2, 'rgba(255,255,255,0.9)');
  }

  // Specular dot, bottom right.
  g.fillStyle = `rgba(255,255,255,${st.dot})`;
  g.beginPath();
  g.ellipse(m + R * 0.46, m + R * 0.5, R * 0.08, R * 0.06, 0.8, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Faint darker outer ring so clear marbles never vanish against the background.
  g.strokeStyle = 'rgba(30,20,20,0.12)';
  g.lineWidth = Math.max(1, d * 0.012);
  g.beginPath();
  g.arc(m, m, R - g.lineWidth / 2 + 0.5, 0, Math.PI * 2);
  g.stroke();
  return c;
}

export function renderMarble(index: number, d: number): MarbleLayers {
  const st = STYLES[index];
  return { pattern: paintPattern(st, index, d), gloss: paintGloss(st, d), size: d };
}

// -------------------------------------------------------------- assignment

/** Seeded shuffled cycle of the 12 styles: no neighbour repeats until all 12 are used. */
const cycles: number[][] = [];
export function marbleStyleFor(id: number): number {
  const n = STYLES.length;
  const cycle = Math.floor(id / n);
  while (cycles.length <= cycle) {
    const k = cycles.length;
    const r = rng(1234 + k * 31);
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const prev = cycles[k - 1];
    if (prev && perm[0] === prev[n - 1]) [perm[0], perm[1]] = [perm[1], perm[0]];
    cycles.push(perm);
  }
  return cycles[cycle][id % n];
}

// ------------------------------------------------------------------ drawing

interface BallLike {
  id: number;
  x: number;
  y: number;
  angle: number;
}

/** Soft 4-point star used for the twinkles. */
function starSprite() {
  const [c, g] = layer(64);
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.25)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  star(g, 32, 32, 30, 'rgba(255,255,255,1)');
  return c;
}

const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Draws marbles from cached layers: the pattern turns with the ball, the gloss stays put.
 * Layers are re-rendered only when the on-screen size moves by more than 15% or dpr changes.
 */
export class MarbleRenderer {
  /** Twinkles switch themselves off if frames get slow, and never run with reduced motion. */
  twinkle = !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  private layers: (MarbleLayers | null)[] = STYLES.map(() => null);
  private dpr = 0;
  private star = starSprite();
  private winTime = 0;
  private winFrames = 0;

  /** Call once per frame with the frame time in seconds. */
  tick(dt: number) {
    this.winTime += dt;
    this.winFrames++;
    if (this.winTime >= 1) {
      if (this.winTime / this.winFrames > 0.02) this.twinkle = false;
      this.winTime = 0;
      this.winFrames = 0;
    }
  }

  /** Layer size in pixels for a marble of this on-screen radius (CSS px), capped at 384. */
  sizeFor(radiusCss: number, dpr: number) {
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.layers.fill(null);
    }
    return Math.max(24, Math.min(384, Math.round(2 * radiusCss * dpr)));
  }

  private get(style: number, d: number) {
    let l = this.layers[style];
    if (!l || d > l.size * 1.15 || d < l.size / 1.15) l = this.layers[style] = renderMarble(style, d);
    return l;
  }

  draw(g: CanvasRenderingContext2D, ball: BallLike, radius: number, alpha: number, d: number) {
    const l = this.get(marbleStyleFor(ball.id), d);
    const r = (radius * l.size) / (l.size - 3);
    g.save();
    g.globalAlpha = alpha;
    g.translate(ball.x, ball.y);
    g.rotate(ball.angle);
    g.drawImage(l.pattern, -r, -r, 2 * r, 2 * r);
    g.rotate(-ball.angle);
    g.drawImage(l.gloss, -r, -r, 2 * r, 2 * r);
    g.restore();
  }

  /** Additive star twinkles over the glitter styles, 4 per ball. */
  sparkles(g: CanvasRenderingContext2D, balls: (BallLike & { scale: number })[], radiusUnit: number, time: number) {
    if (!this.twinkle) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const b of balls) {
      if (!STYLES[marbleStyleFor(b.id)].twinkle) continue;
      const r = radiusUnit * b.scale;
      for (let k = 0; k < 4; k++) {
        const u = hash(b.id * 7 + k * 3.1);
        const a = hash(b.id * 5 + k * 1.7) * Math.PI * 2 + b.angle;
        const rr = Math.sqrt(u) * r * 0.72;
        const pulse = Math.sin(time * (2 + 2 * hash(b.id + k)) + hash(b.id * 3 + k) * 6.28);
        if (pulse <= 0) continue;
        g.globalAlpha = pulse * pulse * 0.9;
        const s = r * (0.28 + 0.2 * hash(b.id + k * 9));
        g.drawImage(this.star, b.x + Math.cos(a) * rr - s, b.y + Math.sin(a) * rr - s, 2 * s, 2 * s);
      }
    }
    g.restore();
  }

  /** Memory held by the cached layers, in bytes (RGBA). */
  bytes() {
    return this.layers.reduce((n, l) => n + (l ? 2 * l.size * l.size * 4 : 0), 0);
  }
}
