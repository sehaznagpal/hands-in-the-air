/**
 * Mesh bag physics: Verlet particles, distance constraints, circle balls.
 * Pure TypeScript, no DOM, so it can be tested headless. Units: ball radius = 1.
 */

export const LEVELS = 14;
export const MAX_BALLS = 25;
export const BALL_R = 1;

/** Rest length of one body segment when the bag is lightly loaded. */
export const SEG = 1.15;
/** The gathered neck: this many short segments under the tie. */
export const NECK_SEGS = 3;
export const NECK_SEG = 0.6;
const BODY_SEGS = 10;

/** Body segment length that makes the bag as long as its pile of balls needs. */
export function bodySeg(n: number, boost = 0) {
  const perBall = 0.95 - 0.3 * Math.min(1, Math.max(0, (n - 10) / 15));
  const need = perBall * (n + 1) + 3.6;
  return Math.min(SEG * 2.4, Math.max(SEG * 0.85, need / BODY_SEGS) + boost);
}
/** Pinned top pair hangs this far under the hook (the hanger triangle sits in between). */
export const HANGER_H = 3;
const NECK_HALF = 0.45;

/** Width of the bag at each level, relative to the full width. */
export const PROFILE = [0.12, 0.16, 0.42, 0.74, 0.92, 1, 1, 1, 1, 1, 0.97, 0.9, 0.78, 0.55];

export const TUNING = {
  /** Fixed substep, 4 per 60 fps frame. */
  step: 1 / 240,
  iterations: 6,
  gravity: 150,
  /** Full width at rest, about 2.2 ball diameters. */
  widthRest: 4.4,
  /** Hard cap on width, 3 ball diameters. */
  widthHard: 6,
  /** Width the empty, limp mesh settles toward. */
  widthLimp: 0.55,
  /**
   * Soft constraint stiffness per iteration. Effective spring constant is k * iterations / step^2,
   * so these must be small for a ball's weight to be able to move the mesh.
   */
  stretchK: 0.2,
  widthK: 0.004,
  limpK: 0.0004,
  /** Strength of the spring that opens the bag to match its ball count. */
  bulgeK: 0.004,
  /** Spring that pulls segments to the length the current ball count needs. */
  lengthK: 0.02,
  maxStretch: 1.6,
  wallDamp: 0.997,
  /** Largest wall particle move per substep (units). */
  wallMaxMove: 0.25,
  ballDamp: 0.9995,
  ballMass: 3,
  /** Extra velocity damping per substep for balls in contact (rolling resistance). */
  contactDamp: 0.985,
  hookOmega: 16,
  hookMaxSpeed: 40,
  hookMaxAccel: 140,
  hookMaxDownAccel: 50,
  /** Speed below which (units/s) the bag may sleep. */
  sleepSpeed: 0.4,
  sleepAfter: 0.6,
};

export interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  inv: number;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Radius factor, grows from 0.6 to 1 after spawning. */
  scale: number;
  angle: number;
  touched: boolean;
}

const particle = (x: number, y: number, inv = 1): Particle => ({ x, y, px: x, py: y, inv });

export class BagWorld {
  readonly left: Particle[] = [];
  readonly right: Particle[] = [];
  balls: Ball[] = [];
  hook = { x: 0, y: 0 };
  hookTarget = { x: 0, y: 0 };
  private hookVel = { x: 0, y: 0 };
  sleeping = false;
  private nextId = 0;
  private acc = 0;
  private calm = 0;
  private walls: Particle[];
  /** Extra segment length added while the mouth stays blocked, so the bag always makes room. */
  private boost = 0;
  private occupancy = new Array<number>(LEVELS).fill(0);

  constructor(private rng: () => number = Math.random) {
    for (let i = 0; i < LEVELS; i++) {
      const y = HANGER_H + Math.min(i, NECK_SEGS) * NECK_SEG + Math.max(0, i - NECK_SEGS) * SEG * 0.85;
      const half = Math.min(TUNING.widthRest * PROFILE[i], TUNING.widthLimp * 1.6) / 2;
      this.left.push(particle(-half, y, i === 0 ? 0 : 1));
      this.right.push(particle(half, y, i === 0 ? 0 : 1));
    }
    this.walls = [...this.left, ...this.right];
    this.pin();
  }

  // ------------------------------------------------------------------ public

  wake() {
    this.sleeping = false;
    this.calm = 0;
  }

  /** Adds a ball just above the opening, small and growing. Returns it. */
  addBall(): Ball | null {
    if (this.balls.length >= MAX_BALLS) return null;
    const l = this.left[3];
    const r = this.right[3];
    const y = l.y - 0.2;
    const x = (l.x + r.x) / 2 + (this.rng() - 0.5) * 0.7;
    // The mouth must be clear; the caller retries on the next tick.
    for (const b of this.balls) {
      if (Math.hypot(b.x - x, b.y - y) < 2.1) {
        this.boost = Math.min(1, this.boost + 0.01);
        this.wake();
        return null;
      }
    }
    const ball: Ball = {
      id: this.nextId++,
      x,
      y,
      px: x,
      py: y,
      scale: 0.6,
      angle: this.rng() * Math.PI * 2,
      touched: false,
    };
    this.balls.push(ball);
    this.wake();
    return ball;
  }

  /** Takes out the top-most ball and returns its state for the pop-out animation. */
  removeTop(): Ball | null {
    if (!this.balls.length) return null;
    let top = 0;
    for (let i = 1; i < this.balls.length; i++) if (this.balls[i].y < this.balls[top].y) top = i;
    const [ball] = this.balls.splice(top, 1);
    this.boost = 0;
    this.wake();
    return ball;
  }

  /** Horizontal wind: adds velocity (units/s) to everything. */
  gust(vx: number) {
    const h = TUNING.step;
    for (const p of this.walls) if (p.inv) p.px -= vx * h;
    for (const b of this.balls) b.px -= vx * h * 0.5;
    this.wake();
  }

  setHookTarget(x: number, y: number) {
    this.hookTarget.x = x;
    this.hookTarget.y = y;
  }

  /** Advances by dt seconds using fixed substeps. */
  advance(dt: number) {
    if (this.sleeping) {
      const dx = this.hookTarget.x - this.hook.x;
      const dy = this.hookTarget.y - this.hook.y;
      if (dx * dx + dy * dy < 1e-6) return;
      this.wake();
    }
    this.acc += Math.min(dt, 1 / 20);
    let n = 0;
    while (this.acc >= TUNING.step && n < 12) {
      this.step();
      this.acc -= TUNING.step;
      n++;
    }
    if (n === 12) this.acc = 0;
    this.updateSleep(n * TUNING.step);
  }

  /** Largest speed of any particle or ball, in units per second. */
  maxSpeed(): number {
    let m = 0;
    for (const p of this.walls) if (p.inv) m = Math.max(m, Math.hypot(p.x - p.px, p.y - p.py));
    for (const b of this.balls) m = Math.max(m, Math.hypot(b.x - b.px, b.y - b.py));
    return m / TUNING.step;
  }

  /** Lowest point of the bag (mesh or ball), in world units. */
  bottom(): number {
    let y = 0;
    for (const p of this.walls) y = Math.max(y, p.y);
    return y + 0.2;
  }

  /** Widest current distance between the two edges. */
  width(): number {
    let w = 0;
    for (let i = 3; i < LEVELS; i++) w = Math.max(w, Math.hypot(this.left[i].x - this.right[i].x, this.left[i].y - this.right[i].y));
    return w;
  }

  // ----------------------------------------------------------------- stepping

  private pin() {
    const l = this.left[0];
    const r = this.right[0];
    l.x = l.px = this.hook.x - NECK_HALF;
    r.x = r.px = this.hook.x + NECK_HALF;
    l.y = l.py = r.y = r.py = this.hook.y + HANGER_H;
  }

  private updateSleep(elapsed: number) {
    const moving =
      Math.abs(this.hookTarget.x - this.hook.x) + Math.abs(this.hookTarget.y - this.hook.y) > 1e-3;
    if (!moving && this.maxSpeed() < TUNING.sleepSpeed) this.calm += elapsed;
    else this.calm = 0;
    if (this.calm > TUNING.sleepAfter) {
      this.sleeping = true;
      for (const p of this.walls) {
        p.px = p.x;
        p.py = p.y;
      }
      for (const b of this.balls) {
        b.px = b.x;
        b.py = b.y;
      }
    }
  }

  private moveHook(h: number) {
    const T = TUNING;
    // Velocity-limited, acceleration-limited follow: a hand can jerk, the bag only feels a firm tug.
    const dx = this.hookTarget.x - this.hook.x;
    const dy = this.hookTarget.y - this.hook.y;
    const dist = Math.hypot(dx, dy);
    // Fast enough to arrive, slow enough to brake in time, never above the speed limit.
    const want = Math.min(T.hookMaxSpeed, dist * T.hookOmega, Math.sqrt(1.2 * T.hookMaxAccel * dist));
    const wx = dist > 1e-9 ? (dx / dist) * want : 0;
    const wy = dist > 1e-9 ? (dy / dist) * want : 0;
    let ax = wx - this.hookVel.x;
    let ay = wy - this.hookVel.y;
    const al = Math.hypot(ax, ay);
    const maxA = T.hookMaxAccel * h;
    if (al > maxA) {
      ax *= maxA / al;
      ay *= maxA / al;
    }
    // Speeding up downward slower than gravity keeps the mesh taut, so the pile never crashes into the neck.
    ay = Math.min(ay, T.hookMaxDownAccel * h);
    this.hookVel.x += ax;
    this.hookVel.y += ay;
    this.hook.x += this.hookVel.x * h;
    this.hook.y += this.hookVel.y * h;
  }

  private step() {
    const h = TUNING.step;
    const g = TUNING.gravity * h * h;
    this.moveHook(h);

    for (const p of this.walls) {
      if (!p.inv) continue;
      let vx = (p.x - p.px) * TUNING.wallDamp;
      let vy = (p.y - p.py) * TUNING.wallDamp;
      // A whipped hook must not be able to fling the mesh into a tangle.
      const sp = Math.hypot(vx, vy);
      if (sp > TUNING.wallMaxMove) {
        vx *= TUNING.wallMaxMove / sp;
        vy *= TUNING.wallMaxMove / sp;
      }
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + g;
    }
    for (const b of this.balls) {
      const vx = (b.x - b.px) * TUNING.ballDamp;
      const vy = (b.y - b.py) * TUNING.ballDamp;
      // Rolling: spin follows horizontal travel.
      b.angle += vx / (BALL_R * b.scale);
      b.px = b.x;
      b.py = b.y;
      b.x += vx;
      b.y += vy + g;
      b.scale = Math.min(1, b.scale + h * ((1 - 0.6) / 0.15));
      b.touched = false;
    }
    this.pin();
    this.updateOccupancy();

    for (let it = 0; it < TUNING.iterations; it++) {
      this.solveBag();
      this.collideBalls();
      this.collideWalls();
      this.pin();
    }

    const cd = TUNING.contactDamp;
    const maxMove = 0.45;
    for (const b of this.balls) {
      // Safety: cap speed so a bad overlap can never fling a ball away.
      const mx = b.x - b.px;
      const my = b.y - b.py;
      const m = Math.hypot(mx, my);
      if (m > maxMove) {
        b.px = b.x - (mx * maxMove) / m;
        b.py = b.y - (my * maxMove) / m;
      }
      if (this.escaped(b)) this.respawn(b);
      if (!b.touched) continue;
      b.px = b.x - (b.x - b.px) * cd;
      b.py = b.y - (b.y - b.py) * cd;
    }
  }

  /** How much each level holds a ball nearby, 0 to 1. Computed once per substep. */
  private updateOccupancy() {
    const occ = this.occupancy;
    occ.fill(0);
    const reach = 2.2 * SEG;
    for (const b of this.balls) {
      for (let i = 0; i < LEVELS; i++) {
        const my = (this.left[i].y + this.right[i].y) / 2;
        const o = 1 - Math.abs(b.y - my) / reach;
        if (o > occ[i]) occ[i] = o;
      }
    }
  }

  private escaped(b: Ball) {
    const mid = this.left[LEVELS - 1];
    return Math.abs(b.x - mid.x) > 40 || b.y > this.bottom() + 6 || b.y < this.hook.y - 6 || !Number.isFinite(b.x + b.y);
  }

  private respawn(b: Ball) {
    const l = this.left[3];
    const r = this.right[3];
    b.x = b.px = (l.x + r.x) / 2;
    b.y = b.py = l.y;
  }

  // -------------------------------------------------------------- constraints

  private pull(a: Particle, b: Particle, len: number, k: number) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d <= len || d < 1e-9) return;
    const w = a.inv + b.inv;
    if (!w) return;
    const c = (k * (d - len)) / d / w;
    a.x += dx * c * a.inv;
    a.y += dy * c * a.inv;
    b.x -= dx * c * b.inv;
    b.y -= dy * c * b.inv;
  }

  private push(a: Particle, b: Particle, len: number, k: number) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d >= len) return;
    const w = a.inv + b.inv;
    if (!w) return;
    if (d < 1e-9) {
      b.x += 1e-3;
      return;
    }
    const c = (k * (d - len)) / d / w;
    a.x += dx * c * a.inv;
    a.y += dy * c * a.inv;
    b.x -= dx * c * b.inv;
    b.y -= dy * c * b.inv;
  }

  private solveBag() {
    const T = TUNING;
    const { left, right } = this;
    const n = this.balls.length;
    const over = Math.min(1, Math.max(0, (n - 10) / 15));
    // The mesh lengthens with its load: a gentle spring on the segment length.
    const body = bodySeg(n, this.boost);
    for (let i = 0; i < LEVELS - 1; i++) {
      const seg = i < NECK_SEGS ? NECK_SEG : body;
      for (const chain of [left, right]) {
        const a = chain[i];
        const b = chain[i + 1];
        this.pull(a, b, seg, T.stretchK);
        this.push(a, b, seg, T.lengthK);
        this.pull(a, b, seg * T.maxStretch, 1);
        this.push(a, b, seg * 0.5, 1);
      }
      // Bending limit: the chain may curve but never fold back on itself.
      if (i < LEVELS - 2) {
        const seg2 = (i + 1 < NECK_SEGS ? NECK_SEG : body);
        for (const chain of [left, right]) this.push(chain[i], chain[i + 2], (seg + seg2) * 0.75, 0.6);
      }
      // Diagonals: a loose rope that keeps the lattice from shearing too far.
      const wAvg = (T.widthHard * (PROFILE[i] + PROFILE[i + 1])) / 2;
      const diag = Math.hypot(wAvg, seg * 1.3);
      this.pull(left[i], right[i + 1], diag, T.stretchK * 0.5);
      this.pull(right[i], left[i + 1], diag, T.stretchK * 0.5);
    }
    for (let i = 1; i < LEVELS; i++) {
      const a = left[i];
      const b = right[i];
      this.keepUntwisted(i);
      const rest = T.widthRest * PROFILE[i];
      const hard = T.widthHard * PROFILE[i];
      const limp = i === LEVELS - 1 ? 1.1 : T.widthLimp;
      this.pull(a, b, limp, T.limpK);
      // The mesh opens around what it holds: a spring toward the full width where balls are.
      const occ = this.occupancy[i];
      if (occ > 0.01) {
        const target = limp + (rest * (1 + 0.25 * over) - limp) * occ;
        this.pull(a, b, target, T.bulgeK * occ);
        this.push(a, b, target, T.bulgeK * occ);
      }
      this.pull(a, b, rest * (1 + 0.25 * over), T.widthK);
      this.pull(a, b, hard, 1);
      this.push(a, b, Math.min(0.5, rest * 0.5), 1);
    }
  }

  /** The right edge must stay on the right of travel: stops the bag twisting or turning inside out. */
  private keepUntwisted(i: number) {
    const { left, right } = this;
    const lo = Math.max(0, i - 1);
    const hi = Math.min(LEVELS - 1, i + 1);
    const tx = left[hi].x - left[lo].x + right[hi].x - right[lo].x;
    const ty = left[hi].y - left[lo].y + right[hi].y - right[lo].y;
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-6) return;
    const nx = ty / tl;
    const ny = -tx / tl;
    const a = left[i];
    const b = right[i];
    const s = (b.x - a.x) * nx + (b.y - a.y) * ny;
    const min = 0.35;
    if (s >= min) return;
    const c = (min - s) * 0.5;
    a.x -= nx * c * a.inv;
    a.y -= ny * c * a.inv;
    b.x += nx * c * b.inv;
    b.y += ny * c * b.inv;
  }

  private collideBalls() {
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      const ra = BALL_R * a.scale;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        const r = ra + BALL_R * b.scale;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        let nx = 0;
        let ny = -1;
        if (d > 1e-9) {
          nx = dx / d;
          ny = dy / d;
        }
        const half = (r - d) * 0.5;
        a.x -= nx * half;
        a.y -= ny * half;
        b.x += nx * half;
        b.y += ny * half;
        a.touched = b.touched = true;
      }
    }
  }

  /** Walls are one closed loop: down the left, across the bottom, up the right. */
  private collideWalls() {
    const { left, right } = this;
    const last = LEVELS - 1;
    for (let i = 0; i < last; i++) this.collideSegment(left[i], left[i + 1]);
    this.collideSegment(left[last], right[last]);
    for (let i = last; i > 0; i--) this.collideSegment(right[i], right[i - 1]);
  }

  private collideSegment(a: Particle, b: Particle) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 < 1e-12) return;
    const len = Math.sqrt(len2);
    // Inside is to the right of travel direction in screen space: n = (dy, -dx).
    const nx = aby / len;
    const ny = -abx / len;
    const invBall = 1 / TUNING.ballMass;

    for (const ball of this.balls) {
      const r = BALL_R * ball.scale;
      const cx = ball.x - a.x;
      const cy = ball.y - a.y;
      const t = (cx * abx + cy * aby) / len2;
      let dirx: number;
      let diry: number;
      let pen: number;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      if (t > 0 && t < 1) {
        const s = cx * nx + cy * ny;
        if (s >= r || s < -2 * r) continue;
        dirx = nx;
        diry = ny;
        pen = r - s;
      } else {
        const qx = cx - abx * tc;
        const qy = cy - aby * tc;
        const d = Math.hypot(qx, qy);
        if (d >= r) continue;
        if (d > 1e-9) {
          dirx = qx / d;
          diry = qy / d;
        } else {
          dirx = nx;
          diry = ny;
        }
        pen = r - d;
      }
      const wa = (1 - tc) * (1 - tc) * a.inv;
      const wb = tc * tc * b.inv;
      const w = invBall + wa + wb;
      const lambda = pen / w;
      ball.x += dirx * lambda * invBall;
      ball.y += diry * lambda * invBall;
      ball.touched = true;
      if (a.inv) {
        a.x -= dirx * lambda * (1 - tc) * a.inv;
        a.y -= diry * lambda * (1 - tc) * a.inv;
      }
      if (b.inv) {
        b.x -= dirx * lambda * tc * b.inv;
        b.y -= diry * lambda * tc * b.inv;
      }
    }
  }
}
