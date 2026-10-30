/** Three procedural backgrounds plus any images in public/backgrounds. All drawn in code, no photos bundled. */

export interface Background {
  id: string;
  name: string;
  /** Paint the sharp background at width x height (CSS px); the context is already scaled. */
  paint(g: CanvasRenderingContext2D, w: number, h: number): void | Promise<void>;
}

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

/** A round light: soft halo and a crisp bright core. */
function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1, core = 0.22) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(core, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function vertical(g: CanvasRenderingContext2D, h: number, stops: [number, string][]) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) grad.addColorStop(o, c);
  return grad;
}

// ------------------------------------------------------------ night street

function nightStreet(g: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(11);
  const hy = h * 0.6;
  g.fillStyle = vertical(g, hy, [[0, '#04060d'], [0.55, '#0b1528'], [1, '#1a2540']]);
  g.fillRect(0, 0, w, hy);
  // Far buildings with a few lit windows.
  for (const [shade, hi, step] of [['#0a1020', 0.34, 70], ['#060a14', 0.24, 54]] as const) {
    g.fillStyle = shade;
    for (let x = -20; x < w + 20; x += step * (0.7 + r() * 0.7)) {
      const bw = step * (0.6 + r() * 0.8);
      const bh = h * hi * (0.4 + r() * 0.9);
      g.fillRect(x, hy - bh, bw, bh);
      for (let k = 0; k < 6; k++) {
        if (r() < 0.45) {
          g.fillStyle = r() < 0.7 ? 'rgba(255,200,110,0.75)' : 'rgba(150,200,255,0.6)';
          g.fillRect(x + 6 + r() * (bw - 14), hy - bh + 8 + r() * (bh - 16), 3, 4);
        }
      }
      g.fillStyle = shade;
    }
  }
  const lights: { x: number; y: number }[] = [];
  // Street lamps and shop signs along the road edge.
  for (let i = 0; i < 11; i++) {
    const x = (w * (i + 0.3 + r() * 0.4)) / 11;
    const y = hy - h * (0.12 + r() * 0.16);
    g.fillStyle = '#05070d';
    g.fillRect(x - 1.5, y, 3, hy - y);
    const warm = r() < 0.75;
    glow(g, x, y, h * (0.05 + r() * 0.04), warm ? 'rgba(255,196,110,1)' : 'rgba(255,90,70,1)', 0.95);
    lights.push({ x, y });
  }
  // Distant rows of small lights along the far road, and lit windows higher up.
  for (let i = 0; i < 46; i++) {
    const x = r() * w;
    const y = hy - h * (0.01 + r() * 0.22);
    const c = r() < 0.6 ? 'rgba(255,205,130,1)' : r() < 0.5 ? 'rgba(255,110,90,1)' : 'rgba(140,210,255,1)';
    glow(g, x, y, h * (0.012 + r() * 0.02), c, 0.9, 0.35);
    lights.push({ x, y });
  }
  const signs = ['rgba(255,60,110,1)', 'rgba(60,220,255,1)', 'rgba(120,255,160,1)', 'rgba(255,170,60,1)'];
  for (let i = 0; i < 7; i++) {
    const x = r() * w;
    const y = hy - h * (0.03 + r() * 0.07);
    const c = signs[i % signs.length];
    glow(g, x, y, h * 0.06, c, 0.8, 0.12);
    g.fillStyle = c;
    g.fillRect(x - 14, y - 4, 28, 8);
    lights.push({ x, y });
  }
  // Tail lights in the lanes.
  for (let i = 0; i < 9; i++) {
    const x = w * (0.08 + r() * 0.84);
    const y = hy + h * (0.02 + r() * 0.1);
    const s = h * (0.015 + (y - hy) * 0.05 / h * 3);
    for (const dx of [-s * 2.2, s * 2.2]) {
      glow(g, x + dx, y, s * 3.5, 'rgba(255,40,40,1)', 0.95, 0.3);
      lights.push({ x: x + dx, y });
    }
  }
  // Wet road: dark asphalt with long reflections of every light.
  g.fillStyle = vertical(g, h - hy, [[0, '#0c1220'], [1, '#04060b']]);
  g.save();
  g.translate(0, hy);
  g.fillRect(0, 0, w, h - hy);
  g.restore();
  for (const l of lights) {
    const col = l.y < hy ? 'rgba(255,190,110,0.5)' : 'rgba(255,50,50,0.5)';
    const grad = g.createLinearGradient(0, hy, 0, h);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.5;
    g.fillStyle = grad;
    for (let k = 0; k < 3; k++) g.fillRect(l.x - 6 + k * 5 + r() * 3, hy, 2 + r() * 3, (h - hy) * (0.5 + r() * 0.5));
    g.globalAlpha = 1;
  }
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    const y = hy + r() * (h - hy);
    g.moveTo(r() * w, y);
    g.lineTo(r() * w + 40, y);
    g.stroke();
  }
}

// ------------------------------------------------------------ sunset coast

function sunsetCoast(g: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(23);
  const hy = h * 0.58;
  g.fillStyle = vertical(g, hy, [[0, '#24123f'], [0.3, '#6b2a70'], [0.62, '#e2557a'], [0.85, '#ff9a5c'], [1, '#ffd08a']]);
  g.fillRect(0, 0, w, hy);
  const sx = w * 0.66;
  glow(g, sx, hy - h * 0.05, h * 0.55, 'rgba(255,150,90,1)', 0.7, 0);
  glow(g, sx, hy - h * 0.05, h * 0.12, 'rgba(255,240,200,1)', 1, 0.7);
  // Streaky clouds.
  for (let i = 0; i < 16; i++) {
    const x = r() * w;
    const y = h * (0.08 + r() * 0.38);
    const rw = w * (0.08 + r() * 0.16);
    g.fillStyle = `rgba(${r() < 0.5 ? '255,130,140' : '255,180,120'},${0.12 + r() * 0.2})`;
    g.beginPath();
    g.ellipse(x, y, rw, h * 0.012 + r() * h * 0.015, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Distant coast with a few lights.
  g.fillStyle = '#2a1840';
  g.beginPath();
  g.moveTo(0, hy);
  for (let x = 0; x <= w * 0.45; x += 20) g.lineTo(x, hy - h * 0.05 * Math.exp(-((x - w * 0.18) ** 2) / (w * w * 0.02)) - 2);
  g.lineTo(w * 0.45, hy);
  g.fill();
  for (let i = 0; i < 14; i++) glow(g, r() * w * 0.4, hy - 3 - r() * h * 0.02, h * 0.012, 'rgba(255,220,140,1)', 0.9, 0.4);
  // A lit shoreline town on the right, so a wipe reveals something to look at.
  for (let x = w * 0.78; x < w + 10; x += 14 + r() * 22) {
    const bh = h * (0.015 + r() * 0.05);
    g.fillStyle = '#241236';
    g.fillRect(x, hy - bh, 12 + r() * 14, bh);
    for (let k = 0; k < 3; k++) glow(g, x + 4 + r() * 12, hy - bh * r(), h * 0.008, 'rgba(255,214,140,1)', 0.9, 0.5);
  }
  // Sea with the sun's glitter.
  g.fillStyle = vertical(g, h - hy, [[0, '#ff9a5c'], [0.25, '#c94a6a'], [1, '#1d1a45']]);
  g.save();
  g.translate(0, hy);
  g.fillRect(0, 0, w, h - hy);
  g.restore();
  for (let i = 0; i < 260; i++) {
    const y = hy + 4 + Math.pow(r(), 1.5) * (h - hy);
    const spread = (y - hy) * 0.35 + 20;
    g.fillStyle = `rgba(255,${200 + r() * 55},${130 + r() * 60},${0.2 + r() * 0.5})`;
    g.fillRect(sx + (r() - 0.5) * 2 * spread, y, 6 + r() * 26, 1.2);
  }
}

// -------------------------------------------------------------- neon city

function neonCity(g: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(37);
  const hy = h * 0.74;
  g.fillStyle = vertical(g, hy, [[0, '#07041a'], [0.55, '#1b0b3d'], [1, '#5a1580']]);
  g.fillRect(0, 0, w, hy);
  glow(g, w * 0.5, hy, h * 0.7, 'rgba(255,50,170,1)', 0.35, 0);
  glow(g, w * 0.2, h * 0.3, h * 0.35, 'rgba(60,120,255,1)', 0.18, 0);
  const neon = ['#ff3ea5', '#3ec8ff', '#a05cff', '#35ffd0'];
  const layers: [string, number, number, number][] = [['#10082b', 0.55, 90, 0.5], ['#0a0620', 0.4, 64, 0.8], ['#06031a', 0.28, 48, 1]];
  layers.forEach(([fill, maxH, step, edge], li) => {
    for (let x = -10; x < w + 10; ) {
      const bw = step * (0.7 + r() * 0.9);
      const bh = h * maxH * (0.35 + r() * 0.75);
      g.fillStyle = fill;
      g.fillRect(x, hy - bh, bw, bh);
      const c = neon[Math.floor(r() * neon.length)];
      g.save();
      g.strokeStyle = c;
      g.shadowColor = c;
      g.shadowBlur = 14;
      g.globalAlpha = edge;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, hy - bh);
      g.lineTo(x + bw, hy - bh);
      if (r() < 0.5) g.lineTo(x + bw, hy - bh + bh * 0.4);
      g.stroke();
      g.restore();
      for (let k = 0; k < 8; k++) {
        if (r() < 0.5) {
          g.fillStyle = neon[Math.floor(r() * 4)];
          g.globalAlpha = 0.5 + r() * 0.5;
          g.fillRect(x + 5 + r() * (bw - 12), hy - bh + 10 + r() * (bh - 20), 3, 3);
          g.globalAlpha = 1;
        }
      }
      if (li === 1 && r() < 0.4) {
        const c2 = neon[Math.floor(r() * 4)];
        glow(g, x + bw / 2, hy - bh * (0.3 + r() * 0.5), h * 0.05, c2, 0.8, 0.1);
        g.fillStyle = c2;
        g.fillRect(x + bw / 2 - 3, hy - bh * 0.5 - 28, 6, 56);
      }
      x += bw + 2;
    }
  });
  // Reflective street.
  g.fillStyle = vertical(g, h - hy, [[0, '#2a0f4a'], [1, '#07031a']]);
  g.save();
  g.translate(0, hy);
  g.fillRect(0, 0, w, h - hy);
  g.restore();
  for (let i = 0; i < 40; i++) {
    const c = neon[Math.floor(r() * 4)];
    const grad = g.createLinearGradient(0, hy, 0, h);
    grad.addColorStop(0, c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.3;
    g.fillStyle = grad;
    g.fillRect(r() * w, hy, 2 + r() * 4, (h - hy) * (0.4 + r() * 0.6));
  }
  g.globalAlpha = 1;
}

export const BUILT_IN: Background[] = [
  { id: 'night', name: 'Night street', paint: nightStreet },
  { id: 'sunset', name: 'Sunset coast', paint: sunsetCoast },
  { id: 'neon', name: 'Neon city', paint: neonCity },
];

/** Built-in backgrounds, then one option per image in public/backgrounds. */
export function allBackgrounds(): Background[] {
  const extras = (typeof __BACKGROUNDS__ !== 'undefined' ? __BACKGROUNDS__ : []).map<Background>((file) => ({
    id: `file:${file}`,
    name: file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
    paint: (g, w, h) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          // Cover fit.
          const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
          g.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = `/backgrounds/${encodeURIComponent(file)}`;
      }),
  }));
  return [...BUILT_IN, ...extras];
}
