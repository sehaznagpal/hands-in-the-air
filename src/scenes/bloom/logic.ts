/** Pure rules of Blooming Flowers: how fast flowers open and close, and which ones a hand reaches. */

export const TUNING = {
  /** A hand opens flowers within this many cells; they are fully open within OPEN_CELLS. */
  REACH_CELLS: 1.5,
  OPEN_CELLS: 0.6,
  /** Time constant (s) of opening, and seconds a fully open flower takes to close again. */
  OPEN_TAU: 0.12,
  CLOSE_TIME: 1.5,
  /** A pinch keeps the nearest open flower if its head is within this many cells and it is at least this open. */
  PINCH_CELLS: 0.9,
  PINCH_MIN_BLOOM: 0.35,
  /** Seconds a flower wiggles after being kept or released. */
  WIGGLE_TIME: 0.8,
  /** Seconds the petals sway together before the Reset button shows. */
  CELEBRATE_TIME: 2.5,
};

/** How open a flower wants to be, 0 to 1, for a point `dist` px away on a grid of `cell` px. */
export function targetBloom(dist: number, cell: number) {
  const reach = TUNING.REACH_CELLS * cell;
  const full = TUNING.OPEN_CELLS * cell;
  return Math.min(1, Math.max(0, (reach - dist) / (reach - full)));
}

/** One step of a flower's bloom: opens quickly toward the target, closes slowly, never closes while kept. */
export function stepBloom(bloom: number, target: number, kept: boolean, dt: number) {
  if (kept) return Math.max(bloom, 1 - Math.exp(-dt / TUNING.OPEN_TAU) * (1 - bloom));
  if (target > bloom) return bloom + (target - bloom) * (1 - Math.exp(-dt / TUNING.OPEN_TAU));
  return Math.max(target, bloom - dt / TUNING.CLOSE_TIME);
}

/** Index of the flower to keep or release for a pinch at (x, y), or -1. */
export function pinchTarget(heads: { x: number; y: number }[], blooms: number[], kept: boolean[], x: number, y: number, cell: number) {
  let best = -1;
  let bd = TUNING.PINCH_CELLS * cell;
  heads.forEach((h, i) => {
    if (!kept[i] && blooms[i] < TUNING.PINCH_MIN_BLOOM) return;
    const d = Math.hypot(h.x - x, h.y - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}
