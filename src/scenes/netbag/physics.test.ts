import { describe, expect, it } from 'vitest';
import { BagWorld, LEVELS, MAX_BALLS } from './physics';

/** Adds balls the way the scene does: one attempt every 10 frames until the count is reached. */
function fill(world: BagWorld, n: number) {
  for (let frame = 0; world.balls.length < n && frame < 6000; frame++) {
    if (frame % 10 === 0) world.addBall();
    world.advance(1 / 60);
  }
}
function settle(world: BagWorld, seconds: number) {
  for (let f = 0; f < seconds * 60; f++) world.advance(1 / 60);
}

/** True if every ball is on the inner side of every wall segment. */
function allInside(world: BagWorld) {
  const loop = [
    ...world.left,
    ...[...world.right].reverse(),
  ];
  return world.balls.every((b) => {
    const ys = loop.map((p) => p.y);
    return b.y > Math.min(...ys) - 1 && b.y < Math.max(...ys) + 1;
  });
}

describe('BagWorld', () => {
  it('hangs narrow with no balls and sleeps', () => {
    const w = new BagWorld();
    settle(w, 4);
    expect(w.width()).toBeLessThan(2);
    expect(w.sleeping).toBe(true);
  });

  it('keeps 25 balls inside, finite and sleeping', () => {
    const w = new BagWorld();
    fill(w, MAX_BALLS);
    settle(w, 8);
    expect(w.balls).toHaveLength(MAX_BALLS);
    for (const p of [...w.left, ...w.right]) expect(Number.isFinite(p.x + p.y)).toBe(true);
    expect(allInside(w)).toBe(true);
    // No ball sinks below the lowest wall particle or escapes sideways.
    const maxX = Math.max(...w.right.map((p) => p.x)) + 1;
    const minX = Math.min(...w.left.map((p) => p.x)) - 1;
    for (const b of w.balls) {
      expect(b.x).toBeLessThan(maxX);
      expect(b.x).toBeGreaterThan(minX);
    }
    expect(w.sleeping).toBe(true);
  });

  it('lengthens and bulges as the count rises', () => {
    const measure = (n: number) => {
      const w = new BagWorld();
      fill(w, n);
      settle(w, 6);
      return { bottom: w.bottom(), width: w.width() };
    };
    const a = measure(0);
    const b = measure(10);
    const c = measure(25);
    expect(b.bottom).toBeGreaterThan(a.bottom);
    expect(c.bottom).toBeGreaterThan(b.bottom);
    expect(c.width).toBeGreaterThan(a.width + 1.5);
    expect(c.width).toBeLessThan(6.2);
    expect(LEVELS).toBe(14);
  });

  it('swings when the hook moves and wakes from sleep', () => {
    const w = new BagWorld();
    fill(w, 8);
    settle(w, 5);
    expect(w.sleeping).toBe(true);
    w.setHookTarget(12, 0);
    settle(w, 0.5);
    expect(w.sleeping).toBe(false);
    expect(w.hook.x).toBeGreaterThan(5);
  });

  it('removes the top-most ball', () => {
    const w = new BagWorld();
    fill(w, 5);
    settle(w, 3);
    const topY = Math.min(...w.balls.map((b) => b.y));
    const gone = w.removeTop();
    expect(gone?.y).toBe(topY);
    expect(w.balls).toHaveLength(4);
  });
});
