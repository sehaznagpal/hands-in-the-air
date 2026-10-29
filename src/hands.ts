/**
 * Hand signals: smoothing, finger state, pinch, openness, presence and events.
 * Framework-free: no DOM, no MediaPipe. Feed it mirrored RawHand[] and a clock.
 */
import {
  FINGERS,
  FINGERTIP_INDEX,
  type FingerName,
  type HandLabel,
  type Landmark,
  type RawHand,
} from './types';

// ---------------------------------------------------------------- smoothing

/** One Euro filter: low jitter when slow, low lag when fast. */
export class OneEuro {
  private x = 0;
  private dx = 0;
  private t = 0;
  private ready = false;

  constructor(
    private minCutoff = 1.4,
    private beta = 8,
    private dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, t: number): number {
    if (!this.ready) {
      this.ready = true;
      this.x = value;
      this.dx = 0;
      this.t = t;
      return value;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.ready = false;
  }
}

// -------------------------------------------------------------------- types

export type HandSide = 'left' | 'right';

export interface Fingertip {
  /** Stable id: left hand 1-5, right hand 6-10 (thumb to pinky). */
  id: number;
  hand: HandSide;
  finger: FingerName;
  x: number;
  y: number;
}

export interface HandState {
  label: HandLabel;
  /** False once the hand has been missing for longer than the grace period. */
  present: boolean;
  score: number;
  /** 21 smoothed landmarks, normalised 0-1, mirrored. */
  landmarks: Landmark[];
  fingertips: Fingertip[];
  extended: Record<FingerName, boolean>;
  fingerCount: number;
  pinching: boolean;
  /** Thumb tip to index tip, divided by hand scale. */
  pinchDistance: number;
  /** 0 closed fist to 1 open palm. */
  openness: number;
  palm: { x: number; y: number };
  /** Wrist to middle knuckle, in units of image height. */
  scale: number;
  /** Palm velocity in normalised units per second. */
  velocity: { x: number; y: number };
}

export interface HandEvents {
  pinchStart: { hand: HandLabel; x: number; y: number };
  pinchEnd: { hand: HandLabel; x: number; y: number };
  fingerCount: { hand: HandLabel; count: number; previous: number };
  swipe: { hand: HandLabel; direction: 'left' | 'right'; speed: number; openness: number };
}

export interface HandSignalsOptions {
  graceSeconds: number;
  pinchStart: number;
  pinchEnd: number;
  /** Palm speed (normalised units per second) that counts as a swipe. */
  swipeSpeed: number;
  swipeCooldown: number;
}

const DEFAULTS: HandSignalsOptions = {
  graceSeconds: 0.15,
  pinchStart: 0.3,
  pinchEnd: 0.5,
  swipeSpeed: 1.6,
  swipeCooldown: 0.6,
};

// Extension ratio thresholds (tip distance over knuckle distance from the wrist).
const EXT_ON = 1.6;
const EXT_OFF = 1.4;
// Thumb: tip distance from the index knuckle, in hand scales.
const THUMB_ON = 0.65;
const THUMB_OFF = 0.5;
const OPEN_LO = 1.0;
const OPEN_HI = 1.7;
const PALM_POINTS = [0, 5, 9, 13, 17];

// ------------------------------------------------------------------ emitter

type Listener<T> = (payload: T) => void;

class Emitter<E> {
  private listeners: { [K in keyof E]?: Set<Listener<E[K]>> } = {};

  on<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    (this.listeners[type] ??= new Set()).add(fn);
    return () => this.listeners[type]?.delete(fn);
  }

  protected emit<K extends keyof E>(type: K, payload: E[K]) {
    this.listeners[type]?.forEach((fn) => fn(payload));
  }
}

// -------------------------------------------------------------- per-hand state

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function emptyState(label: HandLabel): HandState {
  return {
    label,
    present: false,
    score: 0,
    landmarks: [],
    fingertips: [],
    extended: { thumb: false, index: false, middle: false, ring: false, pinky: false },
    fingerCount: 0,
    pinching: false,
    pinchDistance: 1,
    openness: 0,
    palm: { x: 0.5, y: 0.5 },
    scale: 0,
    velocity: { x: 0, y: 0 },
  };
}

class HandTrack {
  state: HandState;
  private filters: OneEuro[] = [];
  private lastSeen = -Infinity;
  private lastT = 0;
  private hasPalm = false;
  private lastSwipe = -Infinity;
  private pendingCount = 0;
  private pendingFrames = 0;
  private reportedCount = 0;

  constructor(
    private label: HandLabel,
    private opts: HandSignalsOptions,
    private emit: <K extends keyof HandEvents>(type: K, payload: HandEvents[K]) => void,
  ) {
    this.state = emptyState(label);
    for (let i = 0; i < 63; i++) this.filters.push(new OneEuro());
  }

  /** New detection for this hand. */
  observe(raw: RawHand, t: number, aspect: number) {
    const s = this.state;
    const wasPresent = s.present;
    this.lastSeen = t;
    s.present = true;
    s.score = raw.score;
    s.landmarks = raw.landmarks.map((p, i) => ({
      x: this.filters[i * 3].filter(p.x, t),
      y: this.filters[i * 3 + 1].filter(p.y, t),
      z: this.filters[i * 3 + 2].filter(p.z, t),
    }));
    const lm = s.landmarks;
    const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

    s.scale = dist(lm[0], lm[9]);
    const scale = Math.max(1e-4, s.scale);

    // Palm centre and velocity.
    let px = 0;
    let py = 0;
    for (const i of PALM_POINTS) {
      px += lm[i].x;
      py += lm[i].y;
    }
    px /= PALM_POINTS.length;
    py /= PALM_POINTS.length;
    const dt = Math.max(1e-3, t - this.lastT);
    if (this.hasPalm && wasPresent) {
      const k = 0.6;
      s.velocity.x += ((px - s.palm.x) / dt - s.velocity.x) * k;
      s.velocity.y += ((py - s.palm.y) / dt - s.velocity.y) * k;
    } else {
      s.velocity.x = 0;
      s.velocity.y = 0;
    }
    s.palm = { x: px, y: py };
    this.hasPalm = true;
    this.lastT = t;

    // Finger extension with hysteresis, and openness from the four long fingers.
    let rSum = 0;
    for (let f = 1; f < 5; f++) {
      const tip = lm[FINGERTIP_INDEX[f]];
      const mcp = lm[f * 4 + 1];
      const r = dist(tip, lm[0]) / Math.max(1e-4, dist(mcp, lm[0]));
      rSum += r;
      const name = FINGERS[f];
      s.extended[name] = s.extended[name] ? r > EXT_OFF : r > EXT_ON;
    }
    const thumbD = dist(lm[4], lm[5]) / scale;
    s.extended.thumb = s.extended.thumb ? thumbD > THUMB_OFF : thumbD > THUMB_ON;
    s.openness = clamp01((rSum / 4 - OPEN_LO) / (OPEN_HI - OPEN_LO));

    const side: HandSide = this.label === 'Left' ? 'left' : 'right';
    s.fingertips = FINGERS.map((finger, f) => {
      const p = lm[FINGERTIP_INDEX[f]];
      return { id: (side === 'left' ? 0 : 5) + f + 1, hand: side, finger, x: p.x, y: p.y };
    });

    // Finger count, committed after three agreeing frames.
    const count = FINGERS.reduce((n, f) => n + (s.extended[f] ? 1 : 0), 0);
    if (count === this.pendingCount) this.pendingFrames++;
    else {
      this.pendingCount = count;
      this.pendingFrames = 1;
    }
    if (this.pendingFrames >= 3 && count !== this.reportedCount) {
      const previous = this.reportedCount;
      this.reportedCount = count;
      s.fingerCount = count;
      this.emit('fingerCount', { hand: this.label, count, previous });
    }

    // Pinch with hysteresis.
    s.pinchDistance = dist(lm[4], lm[8]) / scale;
    const tipX = (lm[4].x + lm[8].x) / 2;
    const tipY = (lm[4].y + lm[8].y) / 2;
    if (!s.pinching && s.pinchDistance < this.opts.pinchStart) {
      s.pinching = true;
      this.emit('pinchStart', { hand: this.label, x: tipX, y: tipY });
    } else if (s.pinching && s.pinchDistance > this.opts.pinchEnd) {
      s.pinching = false;
      this.emit('pinchEnd', { hand: this.label, x: tipX, y: tipY });
    }

    // Swipe: fast, mostly horizontal, with a cooldown.
    const { x: vx, y: vy } = s.velocity;
    if (
      Math.abs(vx) > this.opts.swipeSpeed &&
      Math.abs(vx) > 2 * Math.abs(vy) &&
      t - this.lastSwipe > this.opts.swipeCooldown
    ) {
      this.lastSwipe = t;
      this.emit('swipe', {
        hand: this.label,
        direction: vx > 0 ? 'right' : 'left',
        speed: Math.abs(vx),
        openness: s.openness,
      });
    }
  }

  /** Called every frame; drops the hand once the grace period has passed. */
  checkLost(t: number) {
    const s = this.state;
    if (!s.present || t - this.lastSeen <= this.opts.graceSeconds) return;
    if (s.pinching) {
      s.pinching = false;
      this.emit('pinchEnd', { hand: this.label, x: s.palm.x, y: s.palm.y });
    }
    if (this.reportedCount !== 0) {
      const previous = this.reportedCount;
      this.reportedCount = 0;
      this.emit('fingerCount', { hand: this.label, count: 0, previous });
    }
    this.filters.forEach((f) => f.reset());
    this.pendingCount = 0;
    this.pendingFrames = 0;
    this.hasPalm = false;
    this.state = { ...emptyState(this.label), palm: s.palm, landmarks: s.landmarks };
  }
}

// -------------------------------------------------------------------- public

export class HandSignals extends Emitter<HandEvents> {
  readonly left: HandTrack;
  readonly right: HandTrack;
  private opts: HandSignalsOptions;

  constructor(options: Partial<HandSignalsOptions> = {}) {
    super();
    this.opts = { ...DEFAULTS, ...options };
    const emit = <K extends keyof HandEvents>(type: K, payload: HandEvents[K]) => this.emit(type, payload);
    this.left = new HandTrack('Left', this.opts, emit);
    this.right = new HandTrack('Right', this.opts, emit);
  }

  /**
   * Call every frame. Pass the detections when a new video frame was processed,
   * or null on frames without a new detection. `t` is in seconds; `aspect` is the
   * camera width over height so distances are isotropic.
   */
  update(raw: RawHand[] | null, t: number, aspect = 16 / 9) {
    if (raw) {
      const taken = new Set<HandLabel>();
      for (const hand of [...raw].sort((a, b) => b.score - a.score)) {
        let label = hand.label;
        // Two detections with the same label: put the second in the free slot.
        if (taken.has(label)) label = label === 'Left' ? 'Right' : 'Left';
        if (taken.has(label)) continue;
        taken.add(label);
        (label === 'Left' ? this.left : this.right).observe({ ...hand, label }, t, aspect);
      }
    }
    this.left.checkLost(t);
    this.right.checkLost(t);
  }

  /** Hands currently present. */
  get hands(): HandState[] {
    return [this.left.state, this.right.state].filter((h) => h.present);
  }

  /** All fingertips from both hands with stable ids 1 to 10. */
  tenFingers(): Fingertip[] {
    return this.hands.flatMap((h) => h.fingertips).sort((a, b) => a.id - b.id);
  }
}
