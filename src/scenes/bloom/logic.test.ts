import { describe, expect, it } from 'vitest';
import { pinchTarget, stepBloom, targetBloom, TUNING } from './logic';

describe('bloom logic', () => {
  it('opens within 0.6 cells, closed beyond 1.5 cells', () => {
    expect(targetBloom(0, 100)).toBe(1);
    expect(targetBloom(60, 100)).toBe(1);
    expect(targetBloom(150, 100)).toBe(0);
    expect(targetBloom(105, 100)).toBeGreaterThan(0);
    expect(targetBloom(105, 100)).toBeLessThan(1);
  });

  it('closes from fully open in about 1.5 seconds', () => {
    let b = 1;
    let t = 0;
    while (b > 0 && t < 5) {
      b = stepBloom(b, 0, false, 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(TUNING.CLOSE_TIME - 0.1);
    expect(t).toBeLessThan(TUNING.CLOSE_TIME + 0.1);
  });

  it('opens fast and never closes while kept', () => {
    let b = 0;
    for (let i = 0; i < 30; i++) b = stepBloom(b, 1, false, 1 / 60);
    expect(b).toBeGreaterThan(0.9);
    for (let i = 0; i < 600; i++) b = stepBloom(b, 0, true, 1 / 60);
    expect(b).toBeGreaterThan(0.99);
  });

  it('a pinch picks the nearest open flower, or a kept one, and ignores buds', () => {
    const heads = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(pinchTarget(heads, [0.1, 0.9], [false, false], 20, 0, 100)).toBe(1);
    expect(pinchTarget(heads, [0.1, 0.1], [false, false], 20, 0, 100)).toBe(-1);
    expect(pinchTarget(heads, [0, 0], [true, false], 20, 0, 100)).toBe(0);
    expect(pinchTarget(heads, [1, 1], [false, false], 500, 500, 100)).toBe(-1);
  });
});
