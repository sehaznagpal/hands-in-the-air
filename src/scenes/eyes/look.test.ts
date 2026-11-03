import { describe, expect, it } from 'vitest';
import { Blinker, gaze, StartleDetector, TUNING } from './look';

describe('gaze', () => {
  it('is zero on the eye and never longer than 1', () => {
    expect(gaze(10, 10, 10, 10, 100)).toEqual({ x: 0, y: 0 });
    for (const d of [5, 50, 100, 400, 5000]) {
      const v = gaze(0, 0, d, -d, 120);
      expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('points toward the target', () => {
    const v = gaze(0, 0, 80, 0, 200);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeCloseTo(0);
  });
});

describe('Blinker', () => {
  it('blinks every 3 to 6 seconds and each blink closes then opens', () => {
    let r = 0;
    const b = new Blinker(() => (r = (r + 0.37) % 1));
    let blinks = 0;
    let last = 0;
    let t = 0;
    let wasOpen = true;
    let peak = 0;
    for (; t < 60; t += 1 / 60) {
      b.update(1 / 60);
      const l = b.lid();
      peak = Math.max(peak, l);
      if (l > 0 && wasOpen) {
        blinks++;
        if (last) {
          expect(t - last).toBeGreaterThanOrEqual(TUNING.BLINK_MIN - 0.05);
          expect(t - last).toBeLessThanOrEqual(TUNING.BLINK_MAX + TUNING.BLINK_TIME + 0.05);
        }
        last = t;
      }
      wasOpen = l === 0;
    }
    expect(blinks).toBeGreaterThanOrEqual(8);
    expect(peak).toBeGreaterThan(0.95);
  });
});

describe('StartleDetector', () => {
  it('fires once per close approach and rearms when the hand backs off', () => {
    const s = new StartleDetector();
    expect(s.update(0.1, 0.016)).toBe(false);
    expect(s.update(0.3, 0.016)).toBe(true);
    expect(s.update(0.3, 0.016)).toBe(false);
    s.update(0.1, 2);
    expect(s.update(0.3, 0.016)).toBe(true);
  });
});
