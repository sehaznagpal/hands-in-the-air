/** Procedural ball sprites, drawn once to small canvases. No images. */

export type BallSet = 'marbles' | 'fruit';

export interface BallSprite {
  /** Rotates with the ball as it rolls. */
  body: HTMLCanvasElement;
  /** Light and shade; stays fixed so the light always comes from the upper left. */
  shine: HTMLCanvasElement;
}

const S = 160;
const C = S / 2;
const R = C - 3;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return [c, c.getContext('2d')!];
}

interface Marble {
  base: string;
  a: string;
  b: string;
  /** angle, offset, width, amplitude, frequency, phase for three ribbons */
  ribbons: [number, number, number, number, number, number][];
}

const MARBLES: Marble[] = [
  { base: '#F3EEDF', a: '#2E5BD8', b: '#9DB6F2', ribbons: [[0.5, 0.05, 0.3, 0.18, 2.4, 0.3], [0.62, 0.45, 0.14, 0.14, 2.8, 1.4], [0.4, -0.5, 0.18, 0.12, 2.2, 2.6]] },
  { base: '#F6EEDD', a: '#F0553A', b: '#F2B63A', ribbons: [[-0.5, 0, 0.34, 0.2, 2.0, 0.9], [-0.35, 0.5, 0.16, 0.16, 2.6, 2.1], [-0.65, -0.45, 0.14, 0.12, 2.4, 0.2]] },
  { base: '#EEF3E6', a: '#1FA37A', b: '#8AD9B8', ribbons: [[1.1, -0.1, 0.3, 0.2, 1.8, 0.5], [0.9, 0.4, 0.16, 0.14, 2.6, 1.9], [1.25, -0.55, 0.12, 0.12, 2.2, 3.1]] },
  { base: '#F5ECE6', a: '#7B4BD1', b: '#F4A27E', ribbons: [[0.1, 0.1, 0.32, 0.22, 2.2, 1.7], [0.25, -0.45, 0.15, 0.13, 2.9, 0.4], [-0.05, 0.55, 0.13, 0.12, 2.3, 2.8]] },
  { base: '#F7EAEA', a: '#D6336C', b: '#F59AB5', ribbons: [[-1.0, 0, 0.3, 0.18, 2.1, 2.2], [-0.8, 0.45, 0.16, 0.15, 2.7, 0.7], [-1.15, -0.5, 0.14, 0.12, 2.4, 1.5]] },
  { base: '#EAF4F5', a: '#2AA9D9', b: '#B7D93A', ribbons: [[0.8, 0.05, 0.3, 0.2, 2.3, 0.1], [0.6, -0.45, 0.17, 0.14, 2.5, 2.4], [0.95, 0.5, 0.13, 0.12, 2.1, 1.2]] },
];

function ribbon(g: CanvasRenderingContext2D, [ang, off, width, amp, freq, phase]: Marble['ribbons'][number], color: string) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const path = () => {
    g.beginPath();
    for (let u = -1.4; u <= 1.4; u += 0.08) {
      const v = (off + amp * Math.sin(u * freq + phase)) * R;
      const x = C + ca * u * R - sa * v;
      const y = C + sa * u * R + ca * v;
      if (u === -1.4) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  };
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // A wide faint pass first softens the edge.
  g.globalAlpha = 0.28;
  g.lineWidth = width * R * 1.5;
  path();
  g.stroke();
  g.globalAlpha = 0.95;
  g.lineWidth = width * R;
  path();
  g.stroke();
  g.globalAlpha = 1;
}

function marbleBody(m: Marble) {
  const [c, g] = canvas();
  g.beginPath();
  g.arc(C, C, R, 0, Math.PI * 2);
  g.clip();
  const base = g.createRadialGradient(C * 0.8, C * 0.75, R * 0.1, C, C, R);
  base.addColorStop(0, '#ffffff');
  base.addColorStop(0.55, m.base);
  base.addColorStop(1, m.base);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  ribbon(g, m.ribbons[0], m.a);
  ribbon(g, m.ribbons[1], m.b);
  ribbon(g, m.ribbons[2], m.a);
  return c;
}

function glassShine() {
  const [c, g] = canvas();
  // Milky depth: lighter in the middle, darker toward the rim.
  const rim = g.createRadialGradient(C, C, R * 0.55, C, C, R);
  rim.addColorStop(0, 'rgba(255,255,255,0.10)');
  rim.addColorStop(0.8, 'rgba(40,30,20,0.06)');
  rim.addColorStop(1, 'rgba(40,30,20,0.28)');
  g.fillStyle = rim;
  g.beginPath();
  g.arc(C, C, R, 0, Math.PI * 2);
  g.fill();
  // Soft highlight.
  g.save();
  g.translate(C * 0.68, C * 0.6);
  g.rotate(-0.7);
  const hl = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
  hl.addColorStop(0, 'rgba(255,255,255,0.85)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.scale(1, 0.62);
  g.fillStyle = hl;
  g.beginPath();
  g.arc(0, 0, R * 0.42, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Faint bounce light low on the right.
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.ellipse(C * 1.35, C * 1.5, R * 0.18, R * 0.07, -0.6, 0, Math.PI * 2);
  g.fill();
  return c;
}

// -------------------------------------------------------------------- fruit

type Paint = (g: CanvasRenderingContext2D) => void;

function disc(g: CanvasRenderingContext2D, fill: string, edge: string, rx = R, ry = R, rot = 0) {
  g.beginPath();
  g.ellipse(C, C, rx, ry, rot, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = edge;
  g.stroke();
}

function dots(g: CanvasRenderingContext2D, color: string, n: number, seed: number) {
  g.fillStyle = color;
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const a = (s / 233280) * Math.PI * 2;
    s = (s * 9301 + 49297) % 233280;
    const d = Math.sqrt(s / 233280) * R * 0.85;
    g.beginPath();
    g.arc(C + Math.cos(a) * d, C + Math.sin(a) * d, 2.2, 0, Math.PI * 2);
    g.fill();
  }
}

const leaf = (g: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string) => {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(R * 0.25, -R * 0.3, R * 0.6, -R * 0.05);
  g.quadraticCurveTo(R * 0.3, R * 0.25, 0, 0);
  g.fill();
  g.restore();
};

const FRUITS: Paint[] = [
  // orange
  (g) => {
    disc(g, '#F58A1F', '#D96E0E');
    dots(g, 'rgba(255,200,120,0.55)', 46, 3);
    g.fillStyle = '#B85A0A';
    g.beginPath();
    g.arc(C + R * 0.1, C - R * 0.62, 5, 0, Math.PI * 2);
    g.fill();
    leaf(g, C + R * 0.1, C - R * 0.62, -0.4, '#5E9A3A');
  },
  // lemon
  (g) => {
    g.fillStyle = '#E5BE1E';
    for (const side of [-1, 1]) {
      g.save();
      g.translate(C, C);
      g.rotate(0.35);
      g.beginPath();
      g.moveTo(side * R * 0.86, -R * 0.2);
      g.lineTo(side * R * 1.0, 0);
      g.lineTo(side * R * 0.86, R * 0.2);
      g.fill();
      g.restore();
    }
    disc(g, '#F6D63A', '#D9B424', R * 0.92, R * 0.8, 0.35);
    dots(g, 'rgba(255,240,150,0.6)', 38, 11);
  },
  // lime
  (g) => {
    disc(g, '#8DC63F', '#6AA02A');
    dots(g, 'rgba(210,240,140,0.55)', 40, 7);
    g.fillStyle = '#6AA02A';
    g.beginPath();
    g.arc(C - R * 0.05, C - R * 0.8, 4, 0, Math.PI * 2);
    g.fill();
  },
  // plum
  (g) => {
    disc(g, '#6B3FA0', '#4A2674');
    g.strokeStyle = 'rgba(40,15,70,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(C + R * 0.05, C - R * 0.85);
    g.quadraticCurveTo(C + R * 0.35, C, C + R * 0.05, C + R * 0.85);
    g.stroke();
    g.fillStyle = 'rgba(200,180,240,0.22)';
    g.beginPath();
    g.ellipse(C - R * 0.3, C + R * 0.2, R * 0.4, R * 0.55, 0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#5B3A1E';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(C + R * 0.05, C - R * 0.85);
    g.lineTo(C + R * 0.12, C - R * 1.0);
    g.stroke();
  },
  // apple
  (g) => {
    g.beginPath();
    g.moveTo(C, C - R * 0.62);
    g.bezierCurveTo(C + R * 0.35, C - R * 0.98, C + R * 1.0, C - R * 0.6, C + R * 0.92, C + R * 0.1);
    g.bezierCurveTo(C + R * 0.85, C + R * 0.85, C + R * 0.35, C + R * 1.0, C, C + R * 0.88);
    g.bezierCurveTo(C - R * 0.35, C + R * 1.0, C - R * 0.85, C + R * 0.85, C - R * 0.92, C + R * 0.1);
    g.bezierCurveTo(C - R * 1.0, C - R * 0.6, C - R * 0.35, C - R * 0.98, C, C - R * 0.62);
    g.fillStyle = '#D93B2B';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#B02A1F';
    g.stroke();
    g.strokeStyle = '#5B3A1E';
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(C, C - R * 0.6);
    g.quadraticCurveTo(C + R * 0.04, C - R * 0.85, C + R * 0.14, C - R * 0.98);
    g.stroke();
    leaf(g, C + R * 0.06, C - R * 0.78, -0.55, '#4F9A3A');
  },
];

function fruitBody(paint: Paint) {
  const [c, g] = canvas();
  paint(g);
  return c;
}

function flatShine() {
  const [c, g] = canvas();
  const rim = g.createRadialGradient(C, C, R * 0.6, C, C, R);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(40,20,0,0.16)');
  g.fillStyle = rim;
  g.beginPath();
  g.arc(C, C, R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.38)';
  g.beginPath();
  g.ellipse(C * 0.66, C * 0.58, R * 0.2, R * 0.11, -0.75, 0, Math.PI * 2);
  g.fill();
  return c;
}

const cache = new Map<BallSet, BallSprite[]>();

export function getSprites(set: BallSet): BallSprite[] {
  let sprites = cache.get(set);
  if (!sprites) {
    const shine = set === 'marbles' ? glassShine() : flatShine();
    sprites = (set === 'marbles' ? MARBLES.map(marbleBody) : FRUITS.map(fruitBody)).map((body) => ({ body, shine }));
    cache.set(set, sprites);
  }
  return sprites;
}

/** Sprite for a ball id; ids are shuffled so neighbours rarely match. */
export function spriteFor(sprites: BallSprite[], id: number): BallSprite {
  return sprites[(id * 5 + 1) % sprites.length];
}

export const SPRITE_PAD = R / C;
