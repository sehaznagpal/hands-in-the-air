import type { HandSignals, HandState } from '../../hands';
import type { HandLabel } from '../../types';
import { MAX_BALLS } from './physics';
import { TUNING } from './tuning';

export type HandMode = 'idle' | 'open' | 'fist';

export interface DialState {
  active: boolean;
  hand: HandLabel | null;
  /** Palm height of the dialling hand, 0-1 of the viewport. */
  y: number;
}

export interface GrabState {
  hand: HandLabel;
  /** Palm position, 0-1 of the viewport. */
  x: number;
  y: number;
}

/**
 * Snap to integers; the value only moves once the raw value is DIAL_HYSTERESIS past the halfway
 * point to the next integer, so it does not flicker at a boundary.
 */
export function stepDial(n: number, raw: number): number {
  const edge = 0.5 + TUNING.DIAL_HYSTERESIS;
  while (raw > n + edge && n < MAX_BALLS) n++;
  while (raw < n - edge && n > 0) n--;
  return n;
}

/**
 * Turns the open hand's palm height into a ball count, calmly. The dial engages once the hand
 * has been open and steady for DIAL_ENGAGE_MS, anchored at the current count (so entering the
 * frame changes nothing); then palm travel of DIAL_RANGE spans 0 to 25. The palm is smoothed
 * and the count moves at most DIAL_MAX_RATE balls per second.
 */
export class DialDriver {
  private openFor = 0;
  private engaged = false;
  private has = false;
  private y = 0;
  private anchorY = 0;
  private anchorCount = 0;
  private last = -1;
  private budget = 1;

  update(active: boolean, palmY: number, dt: number, current: number): number {
    const T = TUNING;
    this.budget = Math.min(1, this.budget + T.DIAL_MAX_RATE * dt);
    if (!active) {
      this.openFor = 0;
      this.engaged = false;
      this.has = false;
      return current;
    }
    let speed = 0;
    if (!this.has) {
      this.y = palmY;
      this.has = true;
    } else {
      const next = this.y + (palmY - this.y) * (1 - Math.exp(-dt / T.DIAL_SMOOTHING));
      speed = Math.abs(next - this.y) / Math.max(dt, 1e-6);
      this.y = next;
    }
    if (!this.engaged) {
      this.openFor = speed < T.DIAL_STEADY_SPEED ? this.openFor + dt * 1000 : 0;
      if (this.openFor >= T.DIAL_ENGAGE_MS) {
        this.engaged = true;
        this.anchorY = this.y;
        this.anchorCount = current;
      }
      return current;
    }
    // The count was changed elsewhere (keys, buttons): continue from there.
    if (current !== this.last) {
      this.anchorY = this.y;
      this.anchorCount = current;
    }
    let raw = this.anchorCount + ((this.anchorY - this.y) / T.DIAL_RANGE) * MAX_BALLS;
    // Past either end: slide the anchor so turning back responds at once.
    if (raw > MAX_BALLS || raw < 0) {
      raw = Math.min(MAX_BALLS, Math.max(0, raw));
      this.anchorCount = raw;
      this.anchorY = this.y;
    }
    let out = current;
    const want = stepDial(current, raw);
    if (want !== current && this.budget >= 1) {
      this.budget -= 1;
      out = current + Math.sign(want - current);
    }
    this.last = out;
    return out;
  }
}

/** Low-pass for the fist position: calm input for the hook. */
export function smoothToward(from: number, to: number, dt: number, seconds: number): number {
  return from + (to - from) * (1 - Math.exp(-dt / Math.max(seconds, 1e-6)));
}

/** Turns hand signals into the two controls: an open hand is the dial, a fist is the grabber. */
export class HandController {
  readonly mode: Record<HandLabel, HandMode> = { Left: 'idle', Right: 'idle' };
  dial: DialState = { active: false, hand: null, y: 0.5 };
  grab: GrabState | null = null;
  private fistTime: Record<HandLabel, number> = { Left: 0, Right: 0 };
  private grabHand: HandLabel | null = null;

  reset() {
    this.mode.Left = this.mode.Right = 'idle';
    this.fistTime.Left = this.fistTime.Right = 0;
    this.dial = { active: false, hand: null, y: 0.5 };
    this.grab = null;
    this.grabHand = null;
  }

  update(signals: HandSignals, dt: number) {
    const hands: [HandLabel, HandState][] = [
      ['Left', signals.left.state],
      ['Right', signals.right.state],
    ];
    for (const [label, hand] of hands) this.classify(label, hand, dt);

    // Dial: the right hand wins when both are open. A lost hand just stops; the count holds.
    const open = hands.filter(([label, h]) => h.present && this.mode[label] === 'open');
    const pick = open.find(([label]) => label === 'Right') ?? open[0];
    if (pick) {
      const y = pick[1].palm.y;
      this.dial = { active: true, hand: pick[0], y };
    } else {
      this.dial = { ...this.dial, active: false, hand: null };
    }

    // Grab: any fist; keep the same hand while it stays closed.
    const fists = hands.filter(([label, h]) => h.present && this.mode[label] === 'fist');
    const held = fists.find(([label]) => label === this.grabHand) ?? fists[0];
    if (held) {
      this.grabHand = held[0];
      this.grab = { hand: held[0], x: held[1].palm.x, y: held[1].palm.y };
    } else {
      this.grabHand = null;
      this.grab = null;
    }
  }

  private classify(label: HandLabel, hand: HandState, dt: number) {
    if (!hand.present) {
      this.mode[label] = 'idle';
      this.fistTime[label] = 0;
      return;
    }
    const o = hand.openness;
    const mode = this.mode[label];
    if (mode === 'fist') {
      if (o > TUNING.openAbove) this.mode[label] = 'open';
      return;
    }
    if (o < TUNING.fistBelow) {
      this.fistTime[label] += dt;
      if (this.fistTime[label] >= TUNING.fistFor) {
        this.mode[label] = 'fist';
        this.fistTime[label] = 0;
      }
      return;
    }
    this.fistTime[label] = 0;
    if (o > TUNING.openAbove) this.mode[label] = 'open';
  }
}
