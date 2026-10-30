/**
 * Sort: one marble at a time floats down from a chute; hold it over the shelf with the same marble and let go.
 * Pure game logic with no DOM, so a bot can play it in the tests. Units are CSS pixels.
 */

/** Everything you might want to tune, in one place. */
export const TUNING = {
  // ---- grabbing
  /** Grab reach as a multiple of the marble's diameter (about 2x the marble size). */
  GRAB_RADIUS_FACTOR: 2,
  /** Thumb-to-index distance (in hand scales) below which a pinch grabs. */
  PINCH_CLOSE: 0.35,
  /** Distance above which the fingers count as clearly open; wide on purpose so a loose pinch keeps holding. */
  PINCH_OPEN: 0.75,
  /** The fingers must stay clearly open this long (s) before the marble is let go. */
  OPEN_HOLD: 0.2,
  /** If the hand is lost while holding, keep holding this long (s), the marble staying where it was. */
  LOSS_HOLD: 0.6,
  /** Time constant (s) of the light smoothing on a carried marble. */
  GRAB_SMOOTH: 0.06,

  // ---- placing
  /** How far past the shelf's ends (px) the drop zone reaches. */
  ZONE_MARGIN: 40,
  /** Height of the drop zone above the shelf, as a share of the screen height. */
  ZONE_HEIGHT: 0.36,
  /** Seconds for a marble to slide into its slot. */
  SNAP_TIME: 0.3,

  // ---- rules and pace
  LIVES: 5,
  /** Marbles a shelf holds, and the bonus for filling one. */
  SLOTS: 5,
  SHELF_BONUS: 5,
  /** Seconds before the first marble, and between a marble being placed or lost and the next one. */
  FIRST_DROP: 1,
  DROP_DELAY: 1.5,
  /** Fall speed (px/s): the very first marble of the first game, then the normal start speed. */
  FIRST_FALL: 45,
  START_FALL: 80,
  /** Progressive speed: the first FLAT_POINTS points stay at the start pace, then every STEP_POINTS points is a new level. */
  FLAT_POINTS: 10,
  STEP_POINTS: 5,
  /** Each level multiplies the fall speed by this and the gap before the next drop by DELAY_FACTOR. */
  SPEED_FACTOR: 1.1,
  DELAY_FACTOR: 0.9,
  /** The fall speed never exceeds this multiple of START_FALL. */
  MAX_SPEED_MULT: 2.5,
  /** The gap before the next drop never shrinks below this (s). */
  MIN_DELAY: 0.4,
  /** Marbles on screen at once: 1, then 2 from SECOND_AT points, then 3 from THIRD_AT points. */
  SECOND_AT: 30,
  THIRD_AT: 60,
  /** Gentle downward acceleration (px/s^2) until the fall speed is reached. */
  GRAVITY: 70,
  /** Seconds a rejected marble bounces away for. */
  REJECT_TIME: 0.6,
  /** Seconds the start and game over screens ignore input after appearing. */
  SCREEN_DELAY: 0.8,
};

/**
 * Marble designs that look alike share a group (the 12 styles of the shared marble drawing). Two shelves never
 * show designs from the same group, so the three active designs differ clearly in colour and texture.
 */
export const DESIGN_GROUPS: number[][] = [
  [0, 4, 8], // blues: aqua bubble, blue iridescent, sky pearl
  [3, 9, 6, 11, 5], // pinks and lilacs
  [10], // teal metal
  [1], // rainbow bubble
  [7], // frosted clear
  [2], // smoky crystal
];

export const groupOf = (style: number) => DESIGN_GROUPS.findIndex((g) => g.includes(style));

export type Mode = 'fall' | 'held' | 'snap' | 'placed' | 'leave' | 'splash' | 'reject';

export interface Marble {
  id: number;
  /** The marble's design (one of the 12 shared marble styles); it matches the shelf with the same design. */
  style: number;
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
  /** The design this shelf takes, shown by the label marble below it. */
  style: number;
  slots: (Marble | null)[];
  /** Seconds of celebration left. */
  cheer: number;
  /** Seconds of "wrong shelf" shake left. */
  shake: number;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  /** Index into the confetti palette. */
  hue: number;
}

export type GameState = 'start' | 'play' | 'over';

/** One hand's pinch sample: the distance between thumb and index in hand scales, and the tracker's own pinch flag. */
export interface PinchSample {
  dist: number;
  pinching: boolean;
}

/**
 * Decides when a held marble is let go. The hand must be clearly open for OPEN_HOLD seconds, and a lost hand
 * is waited out for LOSS_HOLD seconds, so flicker and tracking blips never drop a marble.
 */
export class PinchHold {
  private open = 0;
  private lost = 0;

  reset() {
    this.open = this.lost = 0;
  }

  /** `sample` is null when the hand is not tracked. Returns true when the marble should be released. */
  update(sample: PinchSample | null, dt: number): boolean {
    if (!sample) {
      this.open = 0;
      this.lost += dt;
      return this.lost >= TUNING.LOSS_HOLD;
    }
    this.lost = 0;
    if (!sample.pinching && sample.dist >= TUNING.PINCH_OPEN) {
      this.open += dt;
      return this.open >= TUNING.OPEN_HOLD;
    }
    this.open = 0;
    return false;
  }
}

/** True when the fingers are pinched enough to grab. */
export function isPinched(sample: PinchSample) {
  return sample.pinching || sample.dist < TUNING.PINCH_CLOSE;
}

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
  /** The shelf under the held marble, or -1. */
  hover = -1;
  /** True until the first game's first marble has been resolved: it falls extra slowly and the scene shows hints. */
  firstMarble = true;
  /** Set when a life was lost this frame. */
  lostLife = false;
  W = 1;
  H = 1;
  r = 24;
  chuteY = 110;
  floorY = 1;
  onOver: ((score: number) => void) | null = null;
  /** Marbles still in play: falling or held. */
  get inPlay() {
    return this.marbles.filter((m) => m.mode === 'fall' || m.mode === 'held');
  }

  /** The oldest marble in play, or null. */
  get active(): Marble | null {
    return this.inPlay[0] ?? null;
  }

  /** The speed level: 1 up to FLAT_POINTS points, then one more for every STEP_POINTS points. */
  get level() {
    return this.score < TUNING.FLAT_POINTS ? 1 : 2 + Math.floor((this.score - TUNING.FLAT_POINTS) / TUNING.STEP_POINTS);
  }

  /** How many marbles may be in play at once. */
  get maxActive() {
    return this.score >= TUNING.THIRD_AT ? 3 : this.score >= TUNING.SECOND_AT ? 2 : 1;
  }

  /** Seconds between a marble being resolved (or dropped) and the next drop. */
  get dropGap() {
    return Math.max(TUNING.MIN_DELAY, TUNING.DROP_DELAY * TUNING.DELAY_FACTOR ** (this.level - 1));
  }

  private nextDrop: number = TUNING.FIRST_DROP;
  private nextId = 0;
  private target = { x: 0, y: 0 };
  private firstGame = true;

  constructor(private rand: () => number = Math.random) {}

  /** A design from a group that none of `avoid` belongs to. */
  private freshStyle(avoid: number[]) {
    const taken = new Set(avoid.map(groupOf));
    const pool = DESIGN_GROUPS.map((_, i) => i).filter((i) => !taken.has(i));
    const group = DESIGN_GROUPS[pool[Math.floor(this.rand() * pool.length)]];
    return group[Math.floor(this.rand() * group.length)];
  }

  /** Give the three shelves three clearly different designs. */
  private dealDesigns() {
    const chosen: number[] = [];
    for (const s of this.shelves) {
      s.style = this.freshStyle(chosen);
      chosen.push(s.style);
    }
  }

  /** Place the shelves, chute and floor. `shelfY` is the shelf line, `topY` the chute opening. */
  layout(W: number, H: number, shelfY: number, topY: number) {
    this.W = W;
    this.H = H;
    this.r = Math.max(12, Math.min(30, W * 0.026));
    this.chuteY = topY;
    this.floorY = H - 20;
    const old = this.shelves;
    const w = Math.min(W * 0.26, TUNING.SLOTS * (2 * this.r + 8) + 24);
    this.shelves = [0, 1, 2].map((k) => ({
      x: W * (0.2 + 0.3 * k),
      y: shelfY,
      w,
      style: old[k]?.style ?? 0,
      slots: old[k]?.slots ?? new Array(TUNING.SLOTS).fill(null),
      cheer: old[k]?.cheer ?? 0,
      shake: old[k]?.shake ?? 0,
    }));
    if (!old.length) this.dealDesigns();
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

  /** The tall drop zone of a shelf: the shelf plus the area above it. */
  zone(s: Shelf) {
    return {
      left: s.x - s.w / 2 - TUNING.ZONE_MARGIN,
      right: s.x + s.w / 2 + TUNING.ZONE_MARGIN,
      top: s.y - TUNING.ZONE_HEIGHT * this.H,
      bottom: s.y + this.r * 1.2,
    };
  }

  /** Index of the shelf whose zone contains the point, or -1. */
  zoneAt(x: number, y: number) {
    return this.shelves.findIndex((s) => {
      const z = this.zone(s);
      return x >= z.left && x <= z.right && y >= z.top && y <= z.bottom;
    });
  }

  start() {
    this.firstGame = this.firstGame && this.state === 'start';
    this.state = 'play';
    this.screenTime = 0;
    this.score = 0;
    this.lives = TUNING.LIVES;
    this.elapsed = 0;
    this.marbles = [];
    this.sparks = [];
    this.held = null;
    this.hover = -1;
    this.firstMarble = this.firstGame;
    this.nextDrop = TUNING.FIRST_DROP;
    for (const s of this.shelves) {
      s.slots.fill(null);
      s.cheer = 0;
      s.shake = 0;
    }
    this.dealDesigns();
  }

  /** Fall speed now: slow for the very first marble, then faster with every level, up to the cap. */
  fallSpeed(m?: Marble) {
    if (this.firstMarble && m && m === this.active) return TUNING.FIRST_FALL;
    return TUNING.START_FALL * Math.min(TUNING.MAX_SPEED_MULT, TUNING.SPEED_FACTOR ** (this.level - 1));
  }

  /** True once the start or game over screen accepts input. */
  get ready() {
    return this.state === 'play' || this.screenTime >= TUNING.SCREEN_DELAY;
  }

  private spawn() {
    // Only designs that are on a shelf right now drop, in random order.
    const style = this.shelves[Math.floor(this.rand() * 3)].style;
    const m: Marble = {
      id: this.nextId++,
      style,
      x: this.W / 2 + (this.rand() - 0.5) * this.W * 0.1,
      y: this.chuteY + this.r,
      vx: (this.rand() - 0.5) * 20,
      vy: 20,
      angle: this.rand() * 6.28,
      mode: 'fall',
      t: 0,
      sx: 0,
      sy: 0,
      shelf: -1,
      slot: -1,
      scale: 1,
    };
    this.marbles.push(m);
    this.nextDrop = this.dropGap;
  }

  /** The marble in play is done (placed, lost or rejected): the next one comes after a short pause. */
  private resolve() {
    this.firstMarble = false;
    this.nextDrop = this.dropGap;
  }

  // --------------------------------------------------------------- input

  /** Reach for grabbing, in px. */
  get grabRadius() {
    return TUNING.GRAB_RADIUS_FACTOR * 2 * this.r;
  }

  /** Grab the nearest falling marble within reach. Returns it, or null. */
  grabAt(x: number, y: number): Marble | null {
    if (this.state !== 'play' || this.held) return null;
    let best: Marble | null = null;
    let bd = this.grabRadius;
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

  /**
   * Let go of the carried marble. Anywhere in a shelf's zone: the same design slides into the next free slot,
   * the wrong one is rejected and costs a life. Outside every zone it simply falls.
   */
  release(at?: { x: number; y: number }) {
    const m = this.held;
    if (!m) return;
    this.held = null;
    // A click places the marble exactly where the cursor is.
    if (at) {
      m.x = at.x;
      m.y = at.y;
    }
    const k = this.zoneAt(m.x, m.y);
    if (k < 0) {
      m.mode = 'fall';
      m.vx = 0;
      m.vy = 0;
      return;
    }
    const shelf = this.shelves[k];
    const slot = shelf.slots.indexOf(null);
    if (shelf.style === m.style && slot >= 0) {
      shelf.slots[slot] = m;
      m.mode = 'snap';
      m.t = 0;
      m.sx = m.x;
      m.sy = m.y;
      m.shelf = k;
      m.slot = slot;
      m.vx = m.vy = 0;
      this.resolve();
      return;
    }
    // A different design: a small shake, the marble bounces away, and it costs a life.
    m.mode = 'reject';
    m.t = 0;
    m.vx = (this.rand() < 0.5 ? -1 : 1) * 150;
    m.vy = -240;
    shelf.shake = 0.45;
    this.resolve();
    this.loseLife();
  }

  // -------------------------------------------------------------- update

  update(dt: number) {
    this.screenTime += dt;
    this.lostLife = false;
    this.updateSparks(dt);
    for (const s of this.shelves) {
      s.cheer = Math.max(0, s.cheer - dt);
      s.shake = Math.max(0, s.shake - dt);
    }
    if (this.state === 'play') {
      this.elapsed += dt;
      if (this.inPlay.length < this.maxActive) {
        this.nextDrop -= dt;
        if (this.nextDrop <= 0) this.spawn();
      }
    }
    for (const m of this.marbles) this.step(m, dt);
    this.hover = this.held ? this.zoneAt(this.held.x, this.held.y) : -1;
    this.marbles = this.marbles.filter((m) => !((m.mode === 'splash' || m.mode === 'leave' || m.mode === 'reject') && m.t >= 1));
    if (this.state === 'play') this.checkShelves();
  }

  private step(m: Marble, dt: number) {
    const r = this.r;
    switch (m.mode) {
      case 'fall': {
        const vmax = this.fallSpeed(m);
        m.vy = Math.min(m.vy + TUNING.GRAVITY * dt, vmax);
        m.vx *= Math.exp(-dt * 2);
        m.x = Math.min(this.W - r, Math.max(r, m.x + m.vx * dt));
        m.y += m.vy * dt;
        m.angle += (m.vx * dt) / r;
        if (m.y + r >= this.floorY) {
          m.y = this.floorY - r;
          m.mode = 'splash';
          m.t = 0;
          this.resolve();
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
      case 'reject':
        m.t = Math.min(1, m.t + dt / TUNING.REJECT_TIME);
        m.vy += 700 * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.angle += m.vx * dt * 0.05;
        m.scale = 1 - m.t * 0.6;
        break;
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
      this.firstGame = false;
      this.onOver?.(this.score);
    }
  }

  /** A full shelf cheers, pays a bonus, empties and takes a new design. */
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
        // The cleared shelf takes a new design, different from the other two shelves and from its old one.
        s.style = this.freshStyle([...this.shelves.map((o) => o.style)]);
        for (let i = 0; i < 26; i++) {
          this.sparks.push({ x: s.x + (this.rand() - 0.5) * s.w, y: s.y - this.r, vx: (this.rand() - 0.5) * 360, vy: -120 - this.rand() * 260, life: 0.8 + this.rand() * 0.6, hue: i % 4 });
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
}
