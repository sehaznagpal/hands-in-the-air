import { describe, expect, it } from 'vitest';
import { HandSignals } from '../../hands';
import { MockHands, mockHand, type HandPose } from '../../mock';
import { HandController, dialRaw, dialY, stepDial, DIAL_BOTTOM, DIAL_TOP } from './handcontrol';

describe('dial maths', () => {
  it('maps the zone to 0..25 and back', () => {
    expect(dialRaw(DIAL_TOP)).toBe(25);
    expect(dialRaw(DIAL_BOTTOM)).toBe(0);
    expect(dialRaw(0)).toBe(25);
    expect(dialRaw(1)).toBe(0);
    expect(dialY(25)).toBeCloseTo(DIAL_TOP);
    expect(dialY(0)).toBeCloseTo(DIAL_BOTTOM);
  });

  it('snaps with hysteresis so a boundary does not flicker', () => {
    let n = 10;
    for (const raw of [10.4, 10.7, 10.79, 10.6, 10.81]) {
      const next = stepDial(n, raw);
      if (raw < 10.8) expect(next).toBe(10);
      n = next;
    }
    expect(n).toBe(11);
    expect(stepDial(11, 10.3)).toBe(11);
    expect(stepDial(11, 10.19)).toBe(10);
    expect(stepDial(0, -3)).toBe(0);
    expect(stepDial(25, 99)).toBe(25);
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
    const raw = ctl.dial.raw;
    drive(sig, ctl, t, 20, () => []);
    expect(ctl.dial.active).toBe(false);
    expect(ctl.dial.raw).toBe(raw);
  });

  it('mock hands exercise the whole range and a grab without flicker', () => {
    const sig = new HandSignals();
    const ctl = new HandController();
    const mock = new MockHands();
    let n = 0;
    let min = 25;
    let max = 0;
    let changes = 0;
    let grabFrames = 0;
    const perSecond = new Map<number, number>();
    for (let i = 0; i < 30 * 70; i++) {
      const t = i / 30;
      sig.update(mock.sample(t), t);
      ctl.update(sig, 1 / 30);
      if (ctl.dial.active) {
        const next = stepDial(n, ctl.dial.raw);
        if (next !== n) {
          changes++;
          perSecond.set(Math.floor(t), (perSecond.get(Math.floor(t)) ?? 0) + 1);
        }
        n = next;
      }
      min = Math.min(min, n);
      max = Math.max(max, n);
      if (ctl.grab) grabFrames++;
    }
    expect(min).toBe(0);
    expect(max).toBe(25);
    expect(grabFrames).toBeGreaterThan(30 * 20);
    // 25 steps up and down per 30 s sweep: smooth, never a burst of flicker.
    expect(changes).toBeLessThan(160);
    expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(4);
  });
});
