/**
 * The fogged window: a sharp background, a blurred milky fog layer drawn through the inverse of a
 * wipe mask, condensation beads, and drips. The mask lives at half resolution and fades back over
 * about 20 seconds; its soft, streaky edges make a wipe re-fog from the edges inward.
 */

const MASK_SCALE = 0.5;
/** Mask alpha removed per decay tick; 255 / 2 ticks at 0.157 s is about 20 s. */
const DECAY_STEP = 2;
const DECAY_EVERY = 0.157;
const MAX_BEADS = 700;

interface Bead {
  x: number;
  y: number;
  r: number;
  born: number;
  life: number;
}
interface Drip {
  x: number;
  y: number;
  vy: number;
  left: number;
  phase: number;
}
interface Candidate {
  x: number;
  y: number;
  t: number;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
}

const canBlur = () => typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

let beadSprite: HTMLCanvasElement | null = null;
/** A water bead: dark rim, soft refracted light inside, bright highlight. */
function bead() {
  if (beadSprite) return beadSprite;
  const [c, g] = canvas(48, 48);
  g.translate(24, 24);
  const body = g.createRadialGradient(-5, -6, 1, 0, 0, 20);
  body.addColorStop(0, 'rgba(255,255,255,0.28)');
  body.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  body.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, 20, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(8,10,16,0.65)';
  g.lineWidth = 3;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 14, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.arc(-7, -8, 4.5, 0, Math.PI * 2);
  g.fill();
  beadSprite = c;
  return c;
}

let brushSprite: HTMLCanvasElement | null = null;
/** A finger-wipe brush: soft ellipse with a few parallel streak lines along the direction of travel (+x). */
function brush() {
  if (brushSprite) return brushSprite;
  const [c, g] = canvas(96, 64);
  g.save();
  g.translate(48, 32);
  g.scale(1.5, 1);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 32, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.globalCompositeOperation = 'destination-out';
  let s = 5;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = `rgba(0,0,0,${0.18 + rnd() * 0.2})`;
    g.fillRect(0, 7 + k * 10 + rnd() * 2, 96, 3 + rnd() * 2);
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.5})`;
    g.fillRect(rnd() * 96, rnd() < 0.5 ? rnd() * 7 : 57 + rnd() * 7, 2 + rnd() * 6, 1);
  }
  brushSprite = c;
  return c;
}

let noiseTile: HTMLCanvasElement | null = null;
function noise() {
  if (noiseTile) return noiseTile;
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 6 + Math.random() * 20;
  }
  g.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

export class FogWindow {
  /** No drips with reduced motion; fogging and re-fogging stay. */
  reduced = false;
  private W = 0;
  private H = 0;
  private bg: HTMLCanvasElement | null = null;
  private fog!: HTMLCanvasElement;
  private comp!: HTMLCanvasElement;
  private compG!: CanvasRenderingContext2D;
  private mask!: HTMLCanvasElement;
  private maskG!: CanvasRenderingContext2D;
  private frameImg!: HTMLCanvasElement;
  private beads: Bead[] = [];
  private drips: Drip[] = [];
  private cands: Candidate[] = [];
  private data: Uint8ClampedArray | null = null;
  private maskW = 0;
  private acc = 0;
  private time = 0;
  private dirty = false;
  private refogUntil = 0;
  private dripTimer = 3;
  private beadTimer = 0;
  private tune = 1;

  /** Size in CSS pixels. The old wipe mask is carried over. */
  resize(W: number, H: number) {
    if (W === this.W && H === this.H) return;
    const old = this.mask;
    this.W = W;
    this.H = H;
    [this.comp, this.compG] = canvas(W, H);
    [this.mask, this.maskG] = [null as never, null as never];
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * MASK_SCALE);
    c.height = Math.ceil(H * MASK_SCALE);
    this.mask = c;
    this.maskW = c.width;
    this.maskG = c.getContext('2d', { willReadFrequently: true })!;
    if (old) this.maskG.drawImage(old, 0, 0, c.width, c.height);
    this.data = null;
    this.frameImg = this.makeFrame();
    this.beads = [];
    this.seedBeads(300);
    if (this.bg) this.buildFog();
  }

  /** Set the sharp background (already at the right size) and rebuild the fog layer once. `tune` scales the lightening. */
  setBackground(bg: HTMLCanvasElement, tune = 1) {
    this.bg = bg;
    this.tune = tune;
    this.buildFog();
  }

  /** Blur the background once into a milky, slightly desaturated fog layer with fine noise. */
  private buildFog() {
    if (!this.bg) return;
    const [small, sg] = canvas(this.W / 10, this.H / 10);
    if (canBlur()) sg.filter = 'blur(1.5px)';
    sg.drawImage(this.bg, 0, 0, small.width, small.height);
    // Bright backgrounds need less lightening, or the fog turns white and hides everything.
    const px = sg.getImageData(0, 0, small.width, small.height).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
    const lum = Math.min(1, sum / (px.length / 4) / 255);
    const lift = Math.max(0.1, (1 - lum * 2.2) * this.tune);
    const [fog, fg] = canvas(this.W, this.H);
    fg.imageSmoothingEnabled = true;
    fg.imageSmoothingQuality = 'high';
    if (canBlur()) fg.filter = 'blur(14px)';
    fg.drawImage(small, -20, -20, this.W + 40, this.H + 40);
    // Lights swell into big soft glows: add the blurred image onto itself.
    fg.globalCompositeOperation = 'lighter';
    fg.globalAlpha = 0.15 + 0.75 * lift;
    fg.drawImage(small, -20, -20, this.W + 40, this.H + 40);
    fg.globalAlpha = 1;
    fg.filter = 'none';
    fg.globalCompositeOperation = 'saturation';
    fg.fillStyle = 'rgba(128,128,128,0.55)';
    fg.fillRect(0, 0, this.W, this.H);
    fg.globalCompositeOperation = 'screen';
    fg.fillStyle = `rgb(${Math.round(74 * lift)},${Math.round(84 * lift)},${Math.round(100 * lift)})`;
    fg.fillRect(0, 0, this.W, this.H);
    fg.globalCompositeOperation = 'source-over';
    fg.fillStyle = `rgba(214,226,240,${0.05 + 0.1 * lift})`;
    fg.fillRect(0, 0, this.W, this.H);
    fg.fillStyle = fg.createPattern(noise(), 'repeat')!;
    fg.fillRect(0, 0, this.W, this.H);
    this.fog = fog;
  }

  /** Dark window frame with a soft vignette. */
  private makeFrame() {
    const [c, g] = canvas(this.W, this.H);
    const t = Math.min(this.W, this.H) * 0.022;
    const rad = Math.min(this.W, this.H) * 0.035;
    const vg = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.45, this.W / 2, this.H / 2, Math.hypot(this.W, this.H) * 0.55);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg;
    g.fillRect(0, 0, this.W, this.H);
    g.fillStyle = 'rgba(6,8,12,0.92)';
    g.beginPath();
    g.rect(0, 0, this.W, this.H);
    g.roundRect(t, t, this.W - 2 * t, this.H - 2 * t, rad);
    g.fill('evenodd');
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(t, t, this.W - 2 * t, this.H - 2 * t, rad);
    g.stroke();
    return c;
  }

  private seedBeads(n: number) {
    for (let i = 0; i < n; i++) {
      this.beads.push({ x: Math.random() * this.W, y: Math.random() * this.H, r: 1 + Math.pow(Math.random(), 2) * 2.6, born: -Math.random() * 30, life: 1e9 });
    }
  }

  // -------------------------------------------------------------- wiping

  /** Wipe from one point to the next. `thin` draws a fine line instead of a palm-sized wipe. */
  wipe(x0: number, y0: number, x1: number, y1: number, r: number, thin: boolean) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    if (dist < 0.3) return;
    const ms = MASK_SCALE;
    const g = this.maskG;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    if (thin) {
      g.save();
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = r * 2 * ms * 1.8;
      g.beginPath();
      g.moveTo(x0 * ms, y0 * ms);
      g.lineTo(x1 * ms, y1 * ms);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = r * 2 * ms;
      g.stroke();
      g.restore();
    } else {
      const b = brush();
      const step = Math.max(2, r * 0.3);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const y = y0 + ((y1 - y0) * i) / n;
        g.save();
        g.translate(x * ms, y * ms);
        g.rotate(ang);
        g.drawImage(b, -r * 0.7 * ms, -r * ms, r * 1.4 * ms, r * 2 * ms);
        g.restore();
      }
    }
    // Wiped-off condensation, then new water gathered along both edges.
    const reach = thin ? r * 2 : r * 0.85;
    this.beads = this.beads.filter((p) => {
      const t = Math.max(0, Math.min(1, ((p.x - x0) * (x1 - x0) + (p.y - y0) * (y1 - y0)) / (dist * dist)));
      return Math.hypot(p.x - (x0 + (x1 - x0) * t), p.y - (y0 + (y1 - y0) * t)) > reach;
    });
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    if (!thin) {
      const spawn = dist * 0.07;
      for (let i = 0; i < spawn + (Math.random() < spawn % 1 ? 1 : 0) && this.beads.length < MAX_BEADS; i++) {
        const t = Math.random();
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = r * 0.98 + Math.random() * 3;
        this.beads.push({
          x: x0 + (x1 - x0) * t + nx * off * side,
          y: y0 + (y1 - y0) * t + ny * off * side,
          r: 2 + Math.random() * 3.6,
          born: this.time,
          life: 28 + Math.random() * 22,
        });
      }
      if (Math.random() < 0.08 && this.cands.length < 40) this.cands.push({ x: x1, y: y1 + r * 0.9, t: this.time });
    }
    this.dirty = true;
  }

  /** Fog the whole window up at once. */
  refogAll() {
    this.refogUntil = this.time + 0.35;
    this.cands = [];
    this.drips = [];
    this.beads = [];
    this.seedBeads(300);
  }

  // -------------------------------------------------------------- update

  update(dt: number, now: number) {
    this.time = now;
    const g = this.maskG;
    if (this.refogUntil > now) {
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, 0, this.mask.width, this.mask.height);
      g.restore();
      this.dirty = true;
    } else if (this.refogUntil !== 0) {
      this.refogUntil = 0;
      g.clearRect(0, 0, this.mask.width, this.mask.height);
      this.data = null;
      this.dirty = false;
    }

    this.acc += dt;
    if (this.acc >= DECAY_EVERY && this.dirty) {
      this.acc = 0;
      const img = g.getImageData(0, 0, this.mask.width, this.mask.height);
      const d = img.data;
      let any = false;
      for (let i = 3; i < d.length; i += 4) {
        const a = d[i];
        if (a > 0) {
          d[i] = a > DECAY_STEP ? a - DECAY_STEP : 0;
          if (d[i]) any = true;
        }
      }
      g.putImageData(img, 0, 0);
      this.data = d;
      if (!any) this.dirty = false;
    }

    // Drips run down from wiped streaks and leave a thin clear trail in the mask.
    if (!this.reduced) {
      this.dripTimer -= dt;
      if (this.dripTimer <= 0) {
        this.dripTimer = 2.5 + Math.random() * 3.5;
        this.cands = this.cands.filter((c) => now - c.t < 18);
        const c = this.cands[Math.floor(Math.random() * this.cands.length)];
        if (c && this.drips.length < 4 && this.clearAt(c.x, c.y) > 100) {
          this.drips.push({ x: c.x, y: c.y, vy: 14, left: 90 + Math.random() * 190, phase: Math.random() * 6 });
        }
      }
      for (const d of this.drips) {
        const speed = 22 + 70 * (0.5 + 0.5 * Math.sin(now * 2.4 + d.phase)) ** 2;
        const px = d.x;
        const py = d.y;
        d.vy += (speed - d.vy) * Math.min(1, dt * 3);
        d.y += d.vy * dt;
        d.x += Math.sin(now * 5 + d.phase) * dt * 4;
        d.left -= d.vy * dt;
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(255,255,255,1)';
        g.lineWidth = 2.6 * MASK_SCALE;
        g.beginPath();
        g.moveTo(px * MASK_SCALE, py * MASK_SCALE);
        g.lineTo(d.x * MASK_SCALE, d.y * MASK_SCALE);
        g.stroke();
        g.restore();
        this.dirty = true;
      }
      this.drips = this.drips.filter((d) => d.left > 0 && d.y < this.H);
    }

    // Condensation slowly forms again on fogged glass; old gathered beads fade.
    this.beadTimer -= dt;
    if (this.beadTimer <= 0 && this.beads.length < MAX_BEADS) {
      this.beadTimer = 0.18;
      const x = Math.random() * this.W;
      const y = Math.random() * this.H;
      if (this.clearAt(x, y) < 30) this.beads.push({ x, y, r: 1 + Math.pow(Math.random(), 2) * 2.4, born: now, life: 1e9 });
    }
    if (this.beads.some((b) => now - b.born > b.life)) this.beads = this.beads.filter((b) => now - b.born <= b.life);
  }

  /** How clear the glass is at a point (0 fogged to 255 clear), from the latest decay pass. */
  private clearAt(x: number, y: number) {
    if (!this.data) return 0;
    const ix = Math.min(this.maskW - 1, Math.max(0, Math.floor(x * MASK_SCALE)));
    const iy = Math.max(0, Math.floor(y * MASK_SCALE));
    return this.data[(iy * this.maskW + ix) * 4 + 3] ?? 0;
  }

  // ---------------------------------------------------------------- draw

  draw(g: CanvasRenderingContext2D) {
    if (!this.bg) return;
    g.drawImage(this.bg, 0, 0, this.W, this.H);
    if (this.dirty || this.drips.length) {
      const c = this.compG;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, this.W, this.H);
      c.drawImage(this.fog, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.drawImage(this.mask, 0, 0, this.W, this.H);
      c.globalCompositeOperation = 'source-over';
      g.drawImage(this.comp, 0, 0);
    } else {
      g.drawImage(this.fog, 0, 0);
    }
    const sprite = bead();
    for (const b of this.beads) {
      const age = this.time - b.born;
      const fade = b.life < 1e8 ? Math.min(1, Math.max(0, (b.life - age) / 4)) : 1;
      g.globalAlpha = fade;
      g.drawImage(sprite, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    for (const d of this.drips) {
      g.globalAlpha = 1;
      g.drawImage(sprite, d.x - 3.4, d.y - 3.4, 6.8, 6.8);
    }
    g.globalAlpha = 1;
    g.drawImage(this.frameImg, 0, 0);
  }
}
