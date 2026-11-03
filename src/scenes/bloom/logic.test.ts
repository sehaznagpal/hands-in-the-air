import { describe, expect, it } from 'vitest';
import { nearestVase, pinchVase, stepBloom, TUNING, vaseTargets } from './logic';

const xs = [100, 300, 500, 700, 900];

describe('bloom logic', () => {
  it('the nearest vase opens fully and its neighbours a little', () => {
    expect(nearestVase(xs, 330)).toBe(1);
    expect(vaseTargets(xs, [330])).toEqual([TUNING.NEIGHBOUR, 1, TUNING.NEIGHBOUR, 0, 0]);
    expect(vaseTargets(xs, [100])).toEqual([1, TUNING.NEIGHBOUR, 0, 0, 0]);
  });

  it('two hands open two vases at once, and no hand opens none', () => {
    expect(vaseTargets(xs, [100, 900])).toEqual([1, TUNING.NEIGHBOUR, 0, TUNING.NEIGHBOUR, 1]);
    expect(vaseTargets(xs, [])).toEqual([0, 0, 0, 0, 0]);
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

  it('a pinch picks the vase it is over, and nothing far from any vase', () => {
    expect(pinchVase(xs, 320, 200)).toBe(1);
    expect(pinchVase(xs, 1500, 200)).toBe(-1);
  });
});
