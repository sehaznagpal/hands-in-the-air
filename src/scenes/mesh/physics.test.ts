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

function inPolygon(poly: { x: number; y: number }[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const outline = (w: BagWorld) => [...w.left, ...[...w.right].reverse()];

describe('stress', () => {
  it('keeps balls inside during brisk dragging', () => {
    const w = new BagWorld(() => 0.5);
    fill(w, 25);
    settle(w, 3);
    let escaped = 0;
    for (let f = 0; f < 60 * 8; f++) {
      const t = f / 60;
      w.setHookTarget(10 * Math.sin(t * 2.5), 3 * Math.sin(t * 4));
      w.advance(1 / 60);
      const poly = outline(w);
      escaped += w.balls.filter((b) => !inPolygon(poly, b.x, b.y)).length;
    }
    expect(escaped).toBe(0);
  });

  it('recovers after being whipped violently', () => {
    const w = new BagWorld(() => 0.5);
    fill(w, 25);
    settle(w, 3);
    for (let f = 0; f < 60 * 6; f++) {
      const t = f / 60;
      w.setHookTarget(25 * Math.sin(t * 3), 6 * Math.sin(t * 5));
      w.advance(1 / 60);
    }
    w.setHookTarget(0, 0);
    settle(w, 15);
    const poly = outline(w);
    expect(w.balls.filter((b) => !inPolygon(poly, b.x, b.y))).toHaveLength(0);
    expect(w.sleeping).toBe(true);
  });

  it('survives a long drop of the hook with a full bag', () => {
    for (const [tx, ty] of [[0, 20], [-9, 20], [0, -6], [12, 12]]) {
      const w = new BagWorld(() => 0.5);
      fill(w, 25);
      settle(w, 5);
      w.setHookTarget(tx, ty);
      settle(w, 12);
      const poly = outline(w);
      expect(w.balls.filter((b) => !inPolygon(poly, b.x, b.y)), `target ${tx},${ty}`).toHaveLength(0);
      expect(w.sleeping).toBe(true);
    }
  });

  it('swings like a pendulum: the bottom lags the hook, then comes back', () => {
    const w = new BagWorld(() => 0.5);
    fill(w, 10);
    settle(w, 4);
    w.setHookTarget(15, 0);
    let maxLag = 0;
    for (let f = 0; f < 60; f++) {
      w.advance(1 / 60);
      const bottom = w.left[13];
      maxLag = Math.max(maxLag, w.hook.x - bottom.x);
    }
    expect(maxLag).toBeGreaterThan(2);
    settle(w, 10);
    expect(Math.abs(w.left[13].x - w.hook.x)).toBeLessThan(2.5);
    expect(w.sleeping).toBe(true);
  });

  it('sleeps for every count and stays asleep (no jitter at rest)', () => {
    for (const n of [0, 1, 5, 12, 20, 25]) {
      const w = new BagWorld(() => 0.5);
      fill(w, n);
      settle(w, 10);
      expect(w.sleeping, `n=${n}`).toBe(true);
      const snap = w.balls.map((b) => [b.x, b.y]);
      settle(w, 2);
      w.balls.forEach((b, i) => {
        expect(b.x).toBe(snap[i][0]);
        expect(b.y).toBe(snap[i][1]);
      });
    }
  });

  it('simulates 25 balls fast enough for 60 fps', () => {
    const w = new BagWorld(() => 0.5);
    fill(w, 25);
    const t0 = performance.now();
    for (let f = 0; f < 300; f++) {
      w.setHookTarget(8 * Math.sin(f / 20), 0);
      w.advance(1 / 60);
    }
    const perFrame = (performance.now() - t0) / 300;
    expect(perFrame).toBeLessThan(6);
  });
});
