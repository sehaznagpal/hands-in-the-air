import type { HandLabel, Landmark, RawHand } from './types';

/** Pose of a synthetic hand. Coordinates are normalised and already mirrored. */
export interface HandPose {
  label: HandLabel;
  x: number;
  y: number;
  /** Wrist to middle knuckle, in units of image height. */
  scale: number;
  /** Curl per finger (thumb, index, middle, ring, pinky): 0 straight, 1 folded. */
  curl: [number, number, number, number, number];
  /** 0 open, 1 thumb tip touching index tip. */
  pinch: number;
  /** Clockwise tilt in radians. */
  rotation: number;
}

type V = [number, number];

// Template in palm units, hand pointing up, thumb on the left (a right hand).
const THUMB_OPEN: V[] = [[-0.22, -0.18], [-0.5, -0.4], [-0.78, -0.55], [-1.0, -0.68]];
const THUMB_FOLD: V[] = [[-0.2, -0.18], [-0.38, -0.42], [-0.3, -0.62], [-0.15, -0.8]];
const MCP: V[] = [[-0.28, -0.93], [-0.02, -1], [0.22, -0.93], [0.44, -0.78]];
const DIR: V[] = [[-0.08, -1], [0, -1], [0.06, -1], [0.14, -1]];
const SEG = [
  [0.42, 0.26, 0.22],
  [0.47, 0.29, 0.24],
  [0.43, 0.27, 0.23],
  [0.34, 0.21, 0.19],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function buildLandmarks(pose: HandPose, aspect = 16 / 9): Landmark[] {
  const pts: V[] = [[0, 0]];
  const curl = pose.curl;

  const thumb = THUMB_OPEN.map((p, i) => [lerp(p[0], THUMB_FOLD[i][0], curl[0]), lerp(p[1], THUMB_FOLD[i][1], curl[0])] as V);

  const fingers: V[][] = MCP.map((mcp, f) => {
    const c = curl[f + 1];
    const d = DIR[f];
    const len = Math.hypot(d[0], d[1]);
    const dir: V = [d[0] / len, d[1] / len];
    const [l1, l2, l3] = SEG[f];
    const pip: V = [mcp[0] + dir[0] * l1 * (1 - 0.4 * c), mcp[1] + dir[1] * l1 * (1 - 0.4 * c)];
    const dip: V = [pip[0] + dir[0] * l2 * (1 - 1.6 * c), pip[1] + dir[1] * l2 * (1 - 1.6 * c)];
    const tip: V = [dip[0] + dir[0] * l3 * (1 - 1.8 * c), dip[1] + dir[1] * l3 * (1 - 1.8 * c)];
    return [mcp, pip, dip, tip];
  });

  // Pinch: pull the thumb tip (and a little of the joint before it) onto the index tip.
  const indexTip = fingers[0][3];
  thumb[3] = [lerp(thumb[3][0], indexTip[0], pose.pinch), lerp(thumb[3][1], indexTip[1], pose.pinch)];
  thumb[2] = [
    lerp(thumb[2][0], (thumb[2][0] + indexTip[0]) / 2, pose.pinch),
    lerp(thumb[2][1], (thumb[2][1] + indexTip[1]) / 2, pose.pinch),
  ];

  pts.push(...thumb, ...fingers.flat());

  const flip = pose.label === 'Right' ? 1 : -1;
  const cos = Math.cos(pose.rotation);
  const sin = Math.sin(pose.rotation);
  return pts.map(([lx, ly]) => {
    const ux = lx * flip;
    return {
      x: pose.x + ((ux * cos - ly * sin) * pose.scale) / aspect,
      y: pose.y + (ux * sin + ly * cos) * pose.scale,
      z: 0,
    };
  });
}

export function mockHand(pose: HandPose, aspect = 16 / 9): RawHand {
  return { label: pose.label, score: 0.95, landmarks: buildLandmarks(pose, aspect) };
}
