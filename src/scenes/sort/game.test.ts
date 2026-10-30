import { describe, expect, it } from 'vitest';
import { SortGame, TUNING } from './game';

function rng(seed = 3) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function make(seed = 3) {
  const g = new SortGame(rng(seed));
  g.layout(1440, 900, 480, 110);
  g.start();
  return g;
}

/**
 * A first-timer: notices a marble `react` seconds after it appears, grabs it, carries it to the shelf over
 * `carry` seconds, and lets go. Returns the game after `seconds`.
 */
function play(seconds: number, react: number, carry: number, seed = 3) {
  const g = make(seed);
  const dt = 1 / 60;
  let bot: { m: (typeof g.marbles)[number]; phase: 'wait' | 'carry'; t: number; from: { x: number; y: number } } | null = null;
  const seen = new Map<number, number>();
  for (let t = 0; t < seconds && g.state === 'play'; t += dt) {
    for (const m of g.marbles) if (m.mode === 'fall' && !seen.has(m.id)) seen.set(m.id, t);
    if (!bot && !g.held) {
      const m = g.marbles.find((c) => c.mode === 'fall' && t - (seen.get(c.id) ?? t) >= react);
      if (m && g.grabAt(m.x, m.y)) bot = { m, phase: 'carry', t: 0, from: { x: m.x, y: m.y } };
    }
    if (bot) {
      bot.t += dt;
      const s = g.shelves[bot.m.family];
      const k = Math.min(1, bot.t / carry);
      g.moveHeld(bot.from.x + (s.x - bot.from.x) * k, bot.from.y + (s.y - 1.5 * g.r - bot.from.y) * k);
      if (k >= 1 && bot.t > carry + 0.15) {
        g.release();
        bot = null;
      }
    }
    g.update(dt);
  }
  return g;
}

describe('sort game', () => {
  it('the first marble drops after about a second', () => {
    const g = make();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    expect(g.marbles.length).toBe(1);
    expect(TUNING.START_INTERVAL).toBe(4);
  });

  it('a slow first-timer survives well past 30 seconds at the starting speed', () => {
    const g = play(45, 1.6, 1.3);
    expect(g.state).toBe('play');
    expect(g.lives).toBe(TUNING.LIVES);
    expect(g.score).toBeGreaterThanOrEqual(8);
  });

  it('missing every marble ends the game after three', () => {
    const g = make();
    for (let t = 0; t < 30 && g.state === 'play'; t += 1 / 60) g.update(1 / 60);
    expect(g.state).toBe('over');
    expect(g.lives).toBe(0);
  });

  it('the wrong shelf bounces the marble and it keeps falling', () => {
    const g = make();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    const m = g.marbles[0];
    expect(g.grabAt(m.x, m.y)).toBe(m);
    const wrong = g.shelves[(m.family + 1) % 3];
    g.moveHeld(wrong.x, wrong.y - g.r);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.release();
    expect(m.mode).toBe('fall');
    expect(m.vy).toBeLessThan(0);
    expect(g.score).toBe(0);
  });

  it('a full shelf pays the bonus and empties', () => {
    const g = make();
    const s = g.shelves[0];
    for (let n = 0; n < TUNING.SLOTS; n++) {
      g.marbles.push({ id: 100 + n, style: 4, family: 0, x: s.x, y: s.y - 1.4 * g.r, vx: 0, vy: 0, angle: 0, mode: 'fall', t: 0, sx: 0, sy: 0, shelf: -1, slot: -1, scale: 1 });
      const m = g.marbles[g.marbles.length - 1];
      g.grabAt(m.x, m.y);
      g.moveHeld(s.x, s.y - 1.4 * g.r);
      for (let i = 0; i < 30; i++) g.update(1 / 60);
      g.release();
      for (let i = 0; i < 30; i++) g.update(1 / 60);
    }
    expect(g.score).toBeGreaterThanOrEqual(TUNING.SLOTS + TUNING.SHELF_BONUS);
    expect(s.slots.every((x) => x === null)).toBe(true);
  });

  it('the drop interval shortens gradually', () => {
    const g = make();
    const a = g.interval();
    g.elapsed = 60;
    expect(g.interval()).toBeLessThan(a);
    expect(g.interval()).toBeGreaterThanOrEqual(TUNING.MIN_INTERVAL);
  });
});
