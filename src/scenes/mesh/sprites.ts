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
    // Marbles are drawn by marbles.ts; this table only holds the fruit.
    const shine = flatShine();
    sprites = FRUITS.map(fruitBody).map((body) => ({ body, shine }));
    cache.set(set, sprites);
  }
  return sprites;
}

/** Sprite for a ball id; ids are shuffled so neighbours rarely match. */
export function spriteFor(sprites: BallSprite[], id: number): BallSprite {
  const step = sprites.length % 5 === 0 ? 3 : 5; // coprime with the sprite count
  return sprites[(id * step + 1) % sprites.length];
}

export const SPRITE_PAD = R / C;
