import type { HandSignals, HandState } from '../../hands';
import type { HandLabel } from '../../types';
import { MAX_BALLS } from './physics';

/** The palm height range that maps to the dial: top = full bag, bottom = empty. */
export const DIAL_TOP = 0.15;
export const DIAL_BOTTOM = 0.85;

const FIST_BELOW = 0.25;
const FIST_FOR = 0.12;
const OPEN_ABOVE = 0.5;
const DIAL_HYSTERESIS = 0.3;

export type HandMode = 'idle' | 'open' | 'fist';

export interface DialState {
  active: boolean;
  hand: HandLabel | null;
  /** Palm height of the dialling hand, 0-1 of the viewport. */
  y: number;
  /** Unsnapped value, 0 to MAX_BALLS. */
  raw: number;
}

export interface GrabState {
  hand: HandLabel;
  /** Palm position, 0-1 of the viewport. */
  x: number;
  y: number;
}

/** Palm height to a raw dial value. */
export function dialRaw(y: number): number {
  const t = (DIAL_BOTTOM - y) / (DIAL_BOTTOM - DIAL_TOP);
  return Math.min(1, Math.max(0, t)) * MAX_BALLS;
}

/** Height on screen (0-1) where a count sits on the ruler. */
export function dialY(count: number): number {
  return DIAL_BOTTOM - (count / MAX_BALLS) * (DIAL_BOTTOM - DIAL_TOP);
}

/**
 * Snap to integers; the value only moves once the raw value is 0.3 past the halfway point
 * to the next integer, so it does not flicker at a boundary.
 */
export function stepDial(n: number, raw: number): number {
  const edge = 0.5 + DIAL_HYSTERESIS;
  while (raw > n + edge && n < MAX_BALLS) n++;
  while (raw < n - edge && n > 0) n--;
  return n;
}

/** Turns hand signals into the two controls: an open hand is the dial, a fist is the grabber. */
export class HandController {
  readonly mode: Record<HandLabel, HandMode> = { Left: 'idle', Right: 'idle' };
  dial: DialState = { active: false, hand: null, y: 0.5, raw: 0 };
  grab: GrabState | null = null;
  private fistTime: Record<HandLabel, number> = { Left: 0, Right: 0 };
  private grabHand: HandLabel | null = null;

  reset() {
    this.mode.Left = this.mode.Right = 'idle';
    this.fistTime.Left = this.fistTime.Right = 0;
    this.dial = { active: false, hand: null, y: 0.5, raw: 0 };
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
      this.dial = { active: true, hand: pick[0], y, raw: dialRaw(y) };
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
      if (o > OPEN_ABOVE) this.mode[label] = 'open';
      return;
    }
    if (o < FIST_BELOW) {
      this.fistTime[label] += dt;
      if (this.fistTime[label] >= FIST_FOR) {
        this.mode[label] = 'fist';
        this.fistTime[label] = 0;
      }
      return;
    }
    this.fistTime[label] = 0;
    if (o > OPEN_ABOVE) this.mode[label] = 'open';
  }
}
