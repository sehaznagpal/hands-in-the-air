import { describe, expect, it } from 'vitest';
import { DialDriver, smoothToward } from './handcontrol';
import { BagWorld } from './physics';
import { TUNING } from './tuning';

/** Deterministic random numbers so runs are comparable. */
function rng(seed = 7) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Palm moves 10% of the frame height in 0.3 s; returns the change in ball count one second later. */
export function dialChange() {
  const d = new DialDriver();
  const dt = 1 / 30;
  let n = 12;
  for (let t = 0; t < 0.6; t += dt) n = d.update(true, 0.5, dt, n);
  const start = n;
  for (let t = 0; t < 1.3; t += dt) n = d.update(true, 0.5 - 0.1 * Math.min(1, t / 0.3), dt, n);
  return n - start;
}

/** A fist jumps 30% of a 1440 px screen to the right; hook overshoot and time until everything is under 2 px/s. */
export function fistStep(balls = 15) {
  const SCALE = 40; // px per world unit at 25 balls on a 1440 px screen
  const travel = (0.3 * 1440) / SCALE;
  const world = new BagWorld(rng());
  for (let i = 0; i < balls; i++) {
    for (let k = 0; k < 120 && !world.addBall(); k++) world.advance(1 / 60);
    for (let k = 0; k < 30; k++) world.advance(1 / 60);
  }
  for (let k = 0; k < 600 && !world.sleeping; k++) world.advance(1 / 60);
  const x0 = world.hook.x;
  const target = x0 + travel;
  let maxX = x0;
  let settled = 0;
  let fist = x0;
  const dt = 1 / 60;
  for (let k = 1; k <= 480; k++) {
    // The fist position is smoothed before it drives the hook, as in the scene.
    fist = smoothToward(fist, target, dt, TUNING.fistSmoothSeconds);
    world.setHookTarget(fist, world.hook.y);
    world.advance(dt);
    maxX = Math.max(maxX, world.hook.x);
    if (world.maxSpeed() * SCALE >= 2) settled = k * dt;
  }
  return { overshootPct: (Math.max(0, maxX - target) / travel) * 100, settleSeconds: settled };
}

describe('calm mesh', () => {
  it('a small palm move changes only a few balls', () => {
    expect(dialChange()).toBeLessThanOrEqual(2);
  });

  it('a fist step does not overshoot and settles quickly', () => {
    const r = fistStep();
    expect(r.overshootPct).toBeLessThanOrEqual(4);
    expect(r.settleSeconds).toBeLessThanOrEqual(1.5);
  });
});
