import { describe, expect, it } from 'vitest';
import { HandSignals } from '../../hands';
import { MockHands, mockHand, type HandPose } from '../../mock';
import { DialDriver, HandController, stepDial } from './handcontrol';

describe('dial maths', () => {
  it('snaps with hysteresis so a boundary does not flicker', () => {
    let n = 10;
    for (const raw of [10.4, 10.9, 11.09, 10.8, 11.11]) {
      const next = stepDial(n, raw);
      if (raw < 11.1) expect(next).toBe(10);
      n = next;
    }
    expect(n).toBe(11);
    expect(stepDial(11, 10.0)).toBe(11);
    expect(stepDial(11, 9.89)).toBe(10);
    expect(stepDial(0, -3)).toBe(0);
    expect(stepDial(25, 99)).toBe(25);
  });
});

describe('DialDriver', () => {
  const run = (d: DialDriver, from: number, seconds: number, y: (t: number) => number, active = true) => {
    let n = from;
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) n = d.update(active, y(t), dt, n);
    return n;
  };

  it('does not change the count while the hand moves in or before it has been steady', () => {
    const d = new DialDriver();
    expect(run(d, 10, 1, (t) => 0.9 - 0.5 * t)).toBe(10);
    const e = new DialDriver();
    expect(run(e, 10, 0.25, () => 0.5)).toBe(10);
  });

  it('is relative to the count when it engages and limited to 3 balls a second', () => {
    const d = new DialDriver();
    let n = run(d, 10, 0.6, () => 0.5);
    expect(n).toBe(10);
    const dt = 1 / 30;
    const log: number[] = [];
    for (let t = 0; t < 2; t += dt) {
      n = d.update(true, 0.5 - 0.5 * Math.min(1, t / 0.3), dt, n);
      log.push(n);
    }
    for (let i = 30; i < log.length; i++) expect(log[i] - log[i - 30]).toBeLessThanOrEqual(3);
    expect(n).toBeGreaterThan(10);
  });

  it('holds when the hand is lost', () => {
    const d = new DialDriver();
    let n = run(d, 10, 0.6, () => 0.5);
    n = run(d, n, 1, () => 0.2, false);
    expect(n).toBe(10);
  });
});

const pose = (label: 'Left' | 'Right', over: Partial<HandPose> = {}): HandPose => ({
  label,
  x: 0.5,
  y: 0.6,
  scale: 0.22,
  curl: [0, 0, 0, 0, 0],
  pinch: 0,
  rotation: 0,
  ...over,
});
const FIST: HandPose['curl'] = [1, 1, 1, 1, 1];

function drive(sig: HandSignals, ctl: HandController, t0: number, frames: number, poses: (i: number) => HandPose[]) {
  let t = t0;
  for (let i = 0; i < frames; i++) {
    t += 1 / 30;
    sig.update(poses(i).map((p) => mockHand(p)), t);
    ctl.update(sig, 1 / 30);
  }
  return t;
}

describe('HandController', () => {
  it('open hand dials, right hand wins, a fist locks the value', () => {
    const sig = new HandSignals();
    const ctl = new HandController();
    let t = drive(sig, ctl, 0, 12, () => [pose('Right', { y: 0.4 }), pose('Left', { y: 0.7 })]);
    expect(ctl.dial.active).toBe(true);
    expect(ctl.dial.hand).toBe('Right');
    t = drive(sig, ctl, t, 12, () => [pose('Right', { curl: FIST }), pose('Left', { y: 0.7 })]);
    expect(ctl.mode.Right).toBe('fist');
    expect(ctl.dial.hand).toBe('Left');
    drive(sig, ctl, t, 12, () => [pose('Right', { curl: FIST })]);
    expect(ctl.dial.active).toBe(false);
  });

  it('a fist needs 120 ms and is released by opening past 0.5', () => {
    const sig = new HandSignals();
    const ctl = new HandController();
    let t = drive(sig, ctl, 0, 10, () => [pose('Left')]);
    expect(ctl.mode.Left).toBe('open');
    t = drive(sig, ctl, t, 12, () => [pose('Left', { curl: FIST, x: 0.3, y: 0.3 })]);
    expect(ctl.grab?.hand).toBe('Left');
    expect(ctl.grab?.x).toBeCloseTo(0.3, 1);
    drive(sig, ctl, t, 12, () => [pose('Left')]);
    expect(ctl.grab).toBeNull();
    expect(ctl.mode.Left).toBe('open');
  });

  it('holds the dial value when the hand is lost', () => {
    const sig = new HandSignals();
    const ctl = new HandController();
    const t = drive(sig, ctl, 0, 10, () => [pose('Right', { y: 0.3 })]);
    const y = ctl.dial.y;
    drive(sig, ctl, t, 20, () => []);
    expect(ctl.dial.active).toBe(false);
    expect(ctl.dial.y).toBe(y);
  });

  it('mock hands engage the dial and grab without flicker', () => {
    const sig = new HandSignals();
    const ctl = new HandController();
    const mock = new MockHands();
    const driver = new DialDriver();
    let n = 0;
    let min = 25;
    let max = 0;
    let grabFrames = 0;
    const perSecond = new Map<number, number>();
    for (let i = 0; i < 30 * 70; i++) {
      const t = i / 30;
      sig.update(mock.sample(t), t);
      ctl.update(sig, 1 / 30);
      const next = driver.update(ctl.dial.active, ctl.dial.y, 1 / 30, n);
      if (next !== n) perSecond.set(Math.floor(t), (perSecond.get(Math.floor(t)) ?? 0) + 1);
      n = next;
      min = Math.min(min, n);
      max = Math.max(max, n);
      if (ctl.grab) grabFrames++;
    }
    expect(max - min).toBeGreaterThan(3);
    expect(grabFrames).toBeGreaterThan(30 * 20);
    expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(3);
  });
});
