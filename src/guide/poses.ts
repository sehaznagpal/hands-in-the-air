/**
 * Two hand poses in a local space, following the MediaPipe 21-landmark topology:
 * 0 wrist, 1-4 thumb, 5-8 index, 9-12 middle, 13-16 ring, 17-20 pinky (base to tip).
 * Units are about one hand length; the wrist is at the origin and fingers point up (negative y).
 */
export interface Pt {
  x: number;
  y: number;
}
export type Pose = Pt[];

/** Sideways spread so the palm and fingers read as a hand rather than a comb. */
const WIDEN = 1.3;
const P = (pairs: number[][]): Pose => pairs.map(([x, y]) => ({ x: x * WIDEN, y }));

export const OPEN_PALM: Pose = P([
  [0, 0],
  [-0.17, -0.1], [-0.3, -0.25], [-0.4, -0.4], [-0.47, -0.53],
  [-0.16, -0.43], [-0.18, -0.66], [-0.19, -0.82], [-0.2, -0.95],
  [-0.03, -0.46], [-0.03, -0.73], [-0.03, -0.91], [-0.03, -1.05],
  [0.1, -0.44], [0.12, -0.69], [0.13, -0.85], [0.14, -0.98],
  [0.22, -0.38], [0.26, -0.57], [0.28, -0.7], [0.3, -0.8],
]);

export const FIST: Pose = P([
  [0, 0],
  [-0.17, -0.1], [-0.27, -0.2], [-0.2, -0.3], [-0.09, -0.33],
  [-0.16, -0.43], [-0.18, -0.58], [-0.14, -0.5], [-0.12, -0.36],
  [-0.03, -0.46], [-0.03, -0.62], [-0.02, -0.53], [-0.02, -0.38],
  [0.1, -0.44], [0.11, -0.59], [0.11, -0.5], [0.1, -0.36],
  [0.22, -0.38], [0.24, -0.5], [0.23, -0.42], [0.21, -0.3],
]);

/** Every landmark moves linearly from a to b. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  return a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t }));
}

/** Local point that sits at the middle of the hand, used as the pivot. */
export const HAND_CENTER: Pt = { x: 0, y: -0.5 };
