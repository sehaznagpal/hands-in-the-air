import { describe, expect, it } from 'vitest';
import { PinchHold, SortGame, TUNING } from './game';

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
 * A first-timer: notices the marble `react` seconds after it appears, grabs it, carries it to the right shelf
 * over `carry` seconds and lets go anywhere over the shelf's zone.
 */
function play(seconds: number, react: number, carry: number, seed = 3) {
  const g = make(seed);
  const dt = 1 / 60;
  let seen = -1;
  let bot: { m: (typeof g.marbles)[number]; t: number; from: { x: number; y: number } } | null = null;
  for (let t = 0; t < seconds && g.state === 'play'; t += dt) {
    const m = g.active;
    if (m && m.mode === 'fall' && seen !== m.id) seen = m.id;
    if (!bot && m && m.mode === 'fall') {
      if (seen === m.id && m.y > g.chuteY + g.r + 20 + react * 40 && g.grabAt(m.x, m.y)) bot = { m, t: 0, from: { x: m.x, y: m.y } };
    }
    if (bot) {
      bot.t += dt;
      const s = g.shelves[bot.m.family];
      const k = Math.min(1, bot.t / carry);
      g.moveHeld(bot.from.x + (s.x - bot.from.x) * k, bot.from.y + (s.y - 3 * g.r - bot.from.y) * k);
      if (bot.t > carry + 0.4) {
        g.release();
        bot = null;
      }
    }
    g.update(dt);
  }
  return g;
}

describe('sort game', () => {
  it('the first marble drops about a second after the start, and only one is in play', () => {
    const g = make();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    expect(g.marbles.length).toBe(1);
    for (let i = 0; i < 600; i++) g.update(1 / 60);
    expect(g.marbles.filter((m) => m.mode === 'fall' || m.mode === 'held').length).toBeLessThanOrEqual(1);
  });

  it('a first-timer places 5 or more marbles without losing a life', () => {
    const g = play(75, 1.5, 1.6);
    expect(g.state).toBe('play');
    expect(g.lives).toBe(TUNING.LIVES);
    expect(g.score).toBeGreaterThanOrEqual(5);
  });

  it('missing every marble ends the game after five', () => {
    const g = make();
    for (let t = 0; t < 400 && g.state === 'play'; t += 1 / 60) g.update(1 / 60);
    expect(g.state).toBe('over');
    expect(g.lives).toBe(0);
  });

  it('the next marble comes 1.5 seconds after the last one is placed', () => {
    const g = make();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    const m = g.active!;
    g.grabAt(m.x, m.y);
    const s = g.shelves[m.family];
    g.moveHeld(s.x, s.y - 3 * g.r);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    g.release();
    expect(g.active).toBeNull();
    for (let i = 0; i < 80; i++) g.update(1 / 60);
    expect(g.active).toBeNull();
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    expect(g.active).not.toBeNull();
  });

  it('a release anywhere in the tall zone slides the right marble in, high above the shelf too', () => {
    const g = make();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    const m = g.active!;
    g.grabAt(m.x, m.y);
    const s = g.shelves[m.family];
    g.moveHeld(s.x + s.w / 2 + 20, s.y - 0.3 * g.H);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    expect(g.hover).toBe(m.family);
    g.release();
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    expect(m.mode).toBe('placed');
    expect(g.score).toBe(1);
  });

  it('the wrong shelf costs exactly one life and the marble does not cost a second at the floor', () => {
    const g = make();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    const m = g.active!;
    g.grabAt(m.x, m.y);
    const wrong = g.shelves[(m.family + 1) % 3];
    g.moveHeld(wrong.x, wrong.y - 2 * g.r);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.release();
    expect(g.lives).toBe(TUNING.LIVES - 1);
    expect(m.mode).toBe('reject');
    for (let i = 0; i < 400; i++) g.update(1 / 60);
    expect(g.lives).toBe(TUNING.LIVES - 1);
    expect(g.score).toBe(0);
  });

  it('a full shelf pays the bonus and empties', () => {
    const g = make();
    const s = g.shelves[0];
    for (let n = 0; n < TUNING.SLOTS; n++) {
      const m = { id: 100 + n, style: 4, family: 0, x: s.x, y: s.y - 2 * g.r, vx: 0, vy: 0, angle: 0, mode: 'fall' as const, t: 0, sx: 0, sy: 0, shelf: -1, slot: -1, scale: 1 };
      g.marbles.push(m);
      g.grabAt(m.x, m.y);
      g.moveHeld(s.x, s.y - 2 * g.r);
      for (let i = 0; i < 30; i++) g.update(1 / 60);
      g.release();
      for (let i = 0; i < 30; i++) g.update(1 / 60);
    }
    expect(g.score).toBeGreaterThanOrEqual(TUNING.SLOTS + TUNING.SHELF_BONUS);
    expect(s.slots.every((x) => x === null)).toBe(true);
  });

  it('falls slowly and speeds up only gently after every 10 points', () => {
    const g = make();
    const a = g.fallSpeed();
    g.score = 10;
    const b = g.fallSpeed();
    g.score = 100;
    expect(b - a).toBe(TUNING.SPEEDUP_PER_10);
    expect(g.fallSpeed()).toBeLessThanOrEqual(TUNING.MAX_FALL);
    expect(TUNING.FIRST_FALL).toBeLessThan(TUNING.START_FALL);
  });
});

describe('sticky pinch', () => {
  const closed = { dist: 0.2, pinching: true };
  const open = { dist: 1.1, pinching: false };

  it('flicker and a loose pinch never release', () => {
    const h = new PinchHold();
    let released = false;
    for (let i = 0; i < 6; i++) released ||= h.update({ dist: 0.6, pinching: false }, 1 / 30);
    for (let i = 0; i < 4; i++) released ||= h.update(open, 1 / 30);
    released ||= h.update(closed, 1 / 30);
    for (let i = 0; i < 4; i++) released ||= h.update(open, 1 / 30);
    expect(released).toBe(false);
  });

  it('releases only after the fingers stay clearly open for 200 ms', () => {
    const h = new PinchHold();
    let frames = 0;
    while (!h.update(open, 1 / 60)) frames++;
    expect(frames / 60).toBeGreaterThanOrEqual(0.19);
    expect(frames / 60).toBeLessThanOrEqual(0.25);
  });

  it('keeps holding through a lost hand for 600 ms, then releases', () => {
    const h = new PinchHold();
    let released = false;
    for (let i = 0; i < 17; i++) released ||= h.update(null, 1 / 30);
    expect(released).toBe(false);
    for (let i = 0; i < 4; i++) released ||= h.update(null, 1 / 30);
    expect(released).toBe(true);
  });
});
