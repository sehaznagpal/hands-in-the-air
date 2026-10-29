import { describe, expect, it } from 'vitest';
import { HandSignals, OneEuro } from './hands';
import { mockHand, type HandPose } from './mock';
import type { HandLabel } from './types';

const FPS = 30;
const base = (label: HandLabel, over: Partial<HandPose> = {}): HandPose => ({
  label,
  x: label === 'Right' ? 0.7 : 0.3,
  y: 0.5,
  scale: 0.22,
  curl: [0, 0, 0, 0, 0],
  pinch: 0,
  rotation: 0,
  ...over,
});

/** Runs frames of poses; returns the final clock. */
function run(sig: HandSignals, t0: number, frames: number, poses: (i: number) => HandPose[]) {
  let t = t0;
  for (let i = 0; i < frames; i++) {
    t += 1 / FPS;
    sig.update(poses(i).map((p) => mockHand(p)), t);
  }
  return t;
}

describe('OneEuro', () => {
  it('suppresses jitter at rest and follows a step', () => {
    const f = new OneEuro();
    let t = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 60; i++) {
      t += 1 / FPS;
      const y = f.filter(0.5 + (i % 2 ? 0.003 : -0.003), t);
      if (i > 20) {
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    }
    expect(hi - lo).toBeLessThan(0.003);
    let y = 0;
    for (let i = 0; i < 15; i++) {
      t += 1 / FPS;
      y = f.filter(0.9, t);
    }
    expect(y).toBeGreaterThan(0.85);
  });
});

describe('finger state and openness', () => {
  it('reads an open palm and a fist', () => {
    const sig = new HandSignals();
    let t = run(sig, 0, 15, () => [base('Right')]);
    expect(sig.right.state.openness).toBeGreaterThan(0.9);
    expect(sig.right.state.fingerCount).toBe(5);
    t = run(sig, t, 15, () => [base('Right', { curl: [1, 1, 1, 1, 1] })]);
    expect(sig.right.state.openness).toBeLessThan(0.1);
    expect(sig.right.state.fingerCount).toBe(0);
  });

  it('counts two raised fingers and emits fingerCount', () => {
    const sig = new HandSignals();
    const counts: number[] = [];
    sig.on('fingerCount', (e) => counts.push(e.count));
    run(sig, 0, 15, () => [base('Right', { curl: [1, 0, 0, 1, 1] })]);
    expect(sig.right.state.fingerCount).toBe(2);
    expect(counts.at(-1)).toBe(2);
  });
});

describe('pinch', () => {
  it('fires start and end once each, with hysteresis', () => {
    const sig = new HandSignals();
    const events: string[] = [];
    sig.on('pinchStart', () => events.push('start'));
    sig.on('pinchEnd', () => events.push('end'));
    let t = run(sig, 0, 10, () => [base('Left')]);
    t = run(sig, t, 12, () => [base('Left', { pinch: 1 })]);
    expect(sig.left.state.pinching).toBe(true);
    // Hovering between the start and end thresholds must not flicker.
    t = run(sig, t, 20, (i) => [base('Left', { pinch: 0.85 + (i % 2) * 0.05 })]);
    expect(events).toEqual(['start']);
    run(sig, t, 12, () => [base('Left', { pinch: 0 })]);
    expect(events).toEqual(['start', 'end']);
  });
});

describe('presence', () => {
  it('keeps a hand through the 150ms grace period, then drops it', () => {
    const sig = new HandSignals();
    let t = run(sig, 0, 10, () => [base('Right')]);
    sig.update([], t + 0.1);
    expect(sig.right.state.present).toBe(true);
    sig.update([], t + 0.16);
    expect(sig.right.state.present).toBe(false);
    t += 1;
    run(sig, t, 3, () => [base('Right')]);
    expect(sig.right.state.present).toBe(true);
  });

  it('ends a pinch when the hand is lost', () => {
    const sig = new HandSignals();
    const events: string[] = [];
    sig.on('pinchEnd', () => events.push('end'));
    const t = run(sig, 0, 15, () => [base('Left', { pinch: 1 })]);
    sig.update([], t + 0.3);
    expect(events).toEqual(['end']);
  });
});

describe('ten fingers', () => {
  it('lists both hands with ids 1 to 10', () => {
    const sig = new HandSignals();
    run(sig, 0, 5, () => [base('Left'), base('Right')]);
    const tips = sig.tenFingers();
    expect(tips.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(tips[0].hand).toBe('left');
    expect(tips[5].finger).toBe('thumb');
  });

  it('puts a duplicate label in the free slot', () => {
    const sig = new HandSignals();
    run(sig, 0, 3, () => [base('Right', { x: 0.7 }), base('Right', { x: 0.3 })]);
    expect(sig.left.state.present && sig.right.state.present).toBe(true);
  });
});

describe('swipe', () => {
  it('fires for a fast horizontal move, with the mirrored direction', () => {
    const sig = new HandSignals();
    const dirs: string[] = [];
    sig.on('swipe', (e) => dirs.push(e.direction));
    const t = run(sig, 0, 10, () => [base('Right', { x: 0.7 })]);
    run(sig, t, 8, (i) => [base('Right', { x: 0.7 - i * 0.07 })]);
    expect(dirs).toEqual(['left']);
  });

  it('ignores slow movement', () => {
    const sig = new HandSignals();
    const dirs: string[] = [];
    sig.on('swipe', (e) => dirs.push(e.direction));
    run(sig, 0, 60, (i) => [base('Right', { x: 0.4 + i * 0.003 })]);
    expect(dirs).toEqual([]);
  });
});
