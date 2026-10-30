/**
 * Sort: marbles drop from a chute; catch each one and put it on the shelf of its colour family.
 * Pure game logic with no DOM, so a bot can play it in the tests. Units are CSS pixels.
 */

/** Everything you might want to tune, in one place. */
export const TUNING = {
  /** How far from a marble (px) a pinch or click still grabs it. Generous on purpose. */
  GRAB_RADIUS: 95,
  /** A pinch must stay open this long (s) before the marble is let go: ignores one-frame flicker. */
  PINCH_RELEASE_GRACE: 0.12,
  /** How far outside a shelf (px) a release still counts as "over the shelf". */
  SNAP_DISTANCE: 60,
  /** Time constant (s) of the light smoothing on a carried marble. */
  GRAB_SMOOTH: 0.05,
  /** Seconds between drops at the start, the fastest it gets, and how much it shortens per second played. */
  START_INTERVAL: 4,
  MIN_INTERVAL: 1.4,
  SPEEDUP_PER_SEC: 0.03,
  /** Fall speed (px/s) at the start, its growth per second played, and its cap. */
  START_FALL: 190,
  FALL_SPEEDUP: 2.2,
  MAX_FALL: 400,
  /** Downward acceleration (px/s^2) until the fall speed is reached. */
  GRAVITY: 240,
  LIVES: 3,
  /** Marbles a shelf holds, and the bonus for filling one. */
  SLOTS: 4,
  SHELF_BONUS: 5,
  /** Seconds for a marble to hop into its slot. */
  SNAP_TIME: 0.28,
  /** Seconds the start and game over screens ignore input after appearing. */
  SCREEN_DELAY: 0.8,
};

/** Three colour families built from the existing marble styles, each with a pattern mark for colour-blind players. */
export const FAMILIES = [
  { name: 'blue', pattern: 'dots', styles: [4, 8, 2] },
  { name: 'pink', pattern: 'stripes', styles: [3, 9, 11] },
  { name: 'green', pattern: 'swirl', styles: [10, 0] },
] as const;

export type Mode = 'fall' | 'held' | 'snap' | 'placed' | 'leave' | 'splash';

export interface Marble {
  id: number;
  style: number;
  family: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  mode: Mode;
  t: number;
  /** Snap tween start. */
  sx: number;
  sy: number;
  shelf: number;
  slot: number;
  scale: number;
}

export interface Shelf {
  x: number;
  y: number;
  w: number;
  family: number;
  slots: (Marble | null)[];
  /** Seconds of celebration left. */
  cheer: number;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  family: number;
}

export type GameState = 'start' | 'play' | 'over';

export class SortGame {
  state: GameState = 'start';
  /** Seconds since the current screen appeared. */
  screenTime = 0;
  score = 0;
  best = 0;
  lives = TUNING.LIVES;
  elapsed = 0;
  marbles: Marble[] = [];
  shelves: Shelf[] = [];
  sparks: Spark[] = [];
  held: Marble | null = null;
  /** Set when a wrong-shelf release bounced, for the scene to flash. */
  bounceFlash = 0;
  /** Set when a life was lost this frame. */
  lostLife = false;
  W = 1;
  H = 1;
  r = 24;
  chuteY = 110;
  floorY = 1;
  onOver: ((score: number) => void) | null = null;
  private nextDrop = 1.5;
  private nextId = 0;
  private lastFamily = -1;
  private target = { x: 0, y: 0 };

  constructor(private rand: () => number = Math.random) {}

  /** Place the shelves, chute and floor. `shelfY` is the shelf line, `topY` the chute opening. */
  layout(W: number, H: number, shelfY: number, topY: number) {
    this.W = W;
    this.H = H;
    this.r = Math.max(15, Math.min(30, W * 0.026));
    this.chuteY = topY;
    this.floorY = H - 20;
    const old = this.shelves;
    const w = Math.min(W * 0.26, TUNING.SLOTS * (2 * this.r + 10) + 24);
    this.shelves = [0, 1, 2].map((k) => ({
      x: W * (0.2 + 0.3 * k),
      y: shelfY,
      w,
      family: k,
      slots: old[k]?.slots ?? new Array(TUNING.SLOTS).fill(null),
      cheer: old[k]?.cheer ?? 0,
    }));
    // Keep placed marbles on their (possibly moved) shelf.
    for (const m of this.marbles) if (m.mode === 'placed' || m.mode === 'snap') this.slotPos(m);
  }

  slotX(shelf: Shelf, i: number) {
    const pitch = (shelf.w - 24) / TUNING.SLOTS;
    return shelf.x - shelf.w / 2 + 12 + pitch * (i + 0.5);
  }

  private slotPos(m: Marble) {
    const s = this.shelves[m.shelf];
    m.x = this.slotX(s, m.slot);
    m.y = s.y - this.r;
  }

  start() {
    this.state = 'play';
    this.screenTime = 0;
    this.score = 0;
    this.lives = TUNING.LIVES;
    this.elapsed = 0;
    this.marbles = [];
    this.sparks = [];
    this.held = null;
    this.nextDrop = 1.2;
    for (const s of this.shelves) {
      s.slots.fill(null);
      s.cheer = 0;
    }
  }

  /** Current seconds between drops. */
  interval() {
    return Math.max(TUNING.MIN_INTERVAL, TUNING.START_INTERVAL - TUNING.SPEEDUP_PER_SEC * this.elapsed);
  }

  fallSpeed() {
    return Math.min(TUNING.MAX_FALL, TUNING.START_FALL + TUNING.FALL_SPEEDUP * this.elapsed);
  }

  /** True once the start or game over screen accepts input. */
  get ready() {
    return this.state === 'play' || this.screenTime >= TUNING.SCREEN_DELAY;
  }

  private spawn() {
    let family = Math.floor(this.rand() * 3);
    // Avoid long runs of one colour.
    if (family === this.lastFamily && this.rand() < 0.5) family = (family + 1 + Math.floor(this.rand() * 2)) % 3;
    this.lastFamily = family;
    const styles = FAMILIES[family].styles;
    this.marbles.push({
      id: this.nextId++,
      style: styles[Math.floor(this.rand() * styles.length)],
      family,
      x: this.W / 2 + (this.rand() - 0.5) * this.W * 0.12,
      y: this.chuteY + this.r,
      vx: (this.rand() - 0.5) * 50,
      vy: 40,
      angle: this.rand() * 6.28,
      mode: 'fall',
      t: 0,
      sx: 0,
      sy: 0,
      shelf: -1,
      slot: -1,
      scale: 1,
    });
  }

  // --------------------------------------------------------------- input

  /** Grab the nearest falling marble within reach. Returns it, or null. */
  grabAt(x: number, y: number): Marble | null {
    if (this.state !== 'play' || this.held) return null;
    let best: Marble | null = null;
    let bd = TUNING.GRAB_RADIUS + this.r;
    for (const m of this.marbles) {
      if (m.mode !== 'fall') continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) {
      best.mode = 'held';
      this.held = best;
      this.target = { x, y };
    }
    return best;
  }

  moveHeld(x: number, y: number) {
    this.target = { x, y };
  }

  /** Let go of the carried marble: onto its shelf, off a wrong shelf, or just down. */
  release() {
    const m = this.held;
    if (!m) return;
    this.held = null;
    const snap = TUNING.SNAP_DISTANCE;
    let hit: Shelf | null = null;
    let bd = 1e9;
    for (const s of this.shelves) {
      const dx = Math.abs(m.x - s.x);
      if (dx > s.w / 2 + snap) continue;
      if (m.y < s.y - 3.4 * this.r - snap || m.y > s.y + snap * 0.6) continue;
      if (dx < bd) {
        bd = dx;
        hit = s;
      }
    }
    if (hit && hit.family === m.family) {
      const slot = hit.slots.indexOf(null);
      if (slot >= 0) {
        hit.slots[slot] = m;
        m.mode = 'snap';
        m.t = 0;
        m.sx = m.x;
        m.sy = m.y;
        m.shelf = this.shelves.indexOf(hit);
        m.slot = slot;
        m.vx = m.vy = 0;
        return;
      }
    }
    m.mode = 'fall';
    if (hit) {
      // Wrong shelf (or a full one): bounce off and fall.
      m.vx = (this.rand() < 0.5 ? -1 : 1) * (130 + this.rand() * 80);
      m.vy = -280;
      this.bounceFlash = 0.35;
    } else {
      m.vx = 0;
      m.vy = Math.min(m.vy, 60);
    }
  }

  // -------------------------------------------------------------- update

  update(dt: number) {
    this.screenTime += dt;
    this.bounceFlash = Math.max(0, this.bounceFlash - dt);
    this.lostLife = false;
    this.updateSparks(dt);
    for (const s of this.shelves) s.cheer = Math.max(0, s.cheer - dt);
    if (this.state === 'play') {
      this.elapsed += dt;
      this.nextDrop -= dt;
      if (this.nextDrop <= 0) {
        this.spawn();
        this.nextDrop = this.interval();
      }
    }
    for (const m of this.marbles) this.step(m, dt);
    this.marbles = this.marbles.filter((m) => !(m.mode === 'splash' && m.t >= 1) && !(m.mode === 'leave' && m.t >= 1));
    if (this.state === 'play') this.checkShelves();
  }

  private step(m: Marble, dt: number) {
    const r = this.r;
    switch (m.mode) {
      case 'fall': {
        m.vy = Math.min(m.vy + TUNING.GRAVITY * dt, Math.max(this.fallSpeed(), m.vy < 0 ? 1e9 : 0));
        m.vx *= Math.exp(-dt * 1.5);
        m.x = Math.min(this.W - r, Math.max(r, m.x + m.vx * dt));
        m.y += m.vy * dt;
        m.angle += (m.vx * dt) / r;
        if (m.y + r >= this.floorY) {
          m.y = this.floorY - r;
          m.mode = 'splash';
          m.t = 0;
          if (this.state === 'play') this.loseLife();
        }
        break;
      }
      case 'held': {
        const k = 1 - Math.exp(-dt / TUNING.GRAB_SMOOTH);
        m.x += (this.target.x - m.x) * k;
        m.y += (this.target.y - m.y) * k;
        m.y = Math.min(m.y, this.floorY - r);
        m.vy = 0;
        break;
      }
      case 'snap': {
        m.t = Math.min(1, m.t + dt / TUNING.SNAP_TIME);
        const s = this.shelves[m.shelf];
        const tx = this.slotX(s, m.slot);
        const ty = s.y - r;
        const e = 1 - (1 - m.t) * (1 - m.t);
        m.x = m.sx + (tx - m.sx) * e;
        m.y = m.sy + (ty - m.sy) * e - Math.sin(Math.PI * m.t) * r * 0.9;
        if (m.t >= 1) {
          m.mode = 'placed';
          this.score += 1;
        }
        break;
      }
      case 'leave':
        m.t = Math.min(1, m.t + dt / 0.6);
        m.y -= 140 * dt;
        m.scale = 1 - m.t;
        break;
      case 'splash':
        m.t = Math.min(1, m.t + dt / 0.25);
        m.scale = 1 - m.t;
        break;
      default:
        break;
    }
  }

  private loseLife() {
    this.lives -= 1;
    this.lostLife = true;
    if (this.lives <= 0) {
      this.state = 'over';
      this.screenTime = 0;
      if (this.held) {
        this.held.mode = 'fall';
        this.held = null;
      }
      this.best = Math.max(this.best, this.score);
      this.onOver?.(this.score);
    }
  }

  /** A full shelf cheers, pays a bonus, and empties. */
  private checkShelves() {
    for (const s of this.shelves) {
      if (s.cheer > 0) continue;
      if (s.slots.every((m) => m && m.mode === 'placed')) {
        s.cheer = 1.1;
        this.score += TUNING.SHELF_BONUS;
        for (const m of s.slots) {
          if (!m) continue;
          m.mode = 'leave';
          m.t = 0;
        }
        s.slots.fill(null);
        for (let i = 0; i < 26; i++) {
          this.sparks.push({ x: s.x + (this.rand() - 0.5) * s.w, y: s.y - this.r, vx: (this.rand() - 0.5) * 360, vy: -120 - this.rand() * 260, life: 0.8 + this.rand() * 0.6, family: s.family });
        }
      }
    }
  }

  private updateSparks(dt: number) {
    for (const p of this.sparks) {
      p.life -= dt;
      p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
  }

  /** The shelf marble currently on `shelf` slot positions, for drawing. */
  placedOn(shelf: number) {
    return this.marbles.filter((m) => m.shelf === shelf && (m.mode === 'placed' || m.mode === 'snap'));
  }
}
