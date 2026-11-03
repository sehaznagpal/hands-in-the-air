/** Pure rules of Blooming Flowers: which vase a hand is over, and how fast plants open and close. */

export const TUNING = {
  /** How open the neighbours of the vase nearest a hand get (the nearest one opens fully). */
  NEIGHBOUR: 0.3,
  /** Time constant (s) of opening, and seconds a fully open plant takes to close again. */
  OPEN_TAU: 0.12,
  CLOSE_TIME: 1.5,
  /** A pinch or click keeps the nearest vase if it is within this many vase spacings. */
  PINCH_REACH: 0.6,
  /** Seconds a plant wiggles after being kept or released. */
  WIGGLE_TIME: 0.8,
  /** Seconds the plants sway together before the Reset button shows. */
  CELEBRATE_TIME: 2.5,
};

/** Index of the vase nearest to x (only the horizontal position matters). */
export function nearestVase(xs: number[], x: number) {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  return best;
}

/** How open each vase wants to be: 1 for the one nearest a hand, NEIGHBOUR for its neighbours, 0 for the rest. */
export function vaseTargets(xs: number[], handXs: number[]) {
  const t = new Array<number>(xs.length).fill(0);
  for (const x of handXs) {
    const k = nearestVase(xs, x);
    t[k] = 1;
    if (k > 0) t[k - 1] = Math.max(t[k - 1], TUNING.NEIGHBOUR);
    if (k < xs.length - 1) t[k + 1] = Math.max(t[k + 1], TUNING.NEIGHBOUR);
  }
  return t;
}

/** One step of a plant's bloom: opens quickly toward the target, closes slowly, never closes while kept. */
export function stepBloom(bloom: number, target: number, kept: boolean, dt: number) {
  if (kept) return Math.max(bloom, 1 - Math.exp(-dt / TUNING.OPEN_TAU) * (1 - bloom));
  if (target > bloom) return bloom + (target - bloom) * (1 - Math.exp(-dt / TUNING.OPEN_TAU));
  return Math.max(target, bloom - dt / TUNING.CLOSE_TIME);
}

/** The vase to keep or release for a pinch or click at x, or -1 when it is not near any vase. */
export function pinchVase(xs: number[], x: number, pitch: number) {
  const k = nearestVase(xs, x);
  return Math.abs(xs[k] - x) <= TUNING.PINCH_REACH * pitch ? k : -1;
}
