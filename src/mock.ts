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

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));

/**
 * Two scripted hands for testing without a camera (?mock=1).
 * Right hand: stays open and slides up and down (the dial), with an occasional swipe.
 * Left hand: rests with a pinch, then makes a fist, wanders around, and opens again.
 */
export class MockHands {
  private t0 = -1;
  private readonly scale = 0.22;
  /** Wrist sits this far below the palm centre. */
  private readonly palmDrop = 0.73 * this.scale;

  sample(nowSeconds: number, aspect = 16 / 9): RawHand[] {
    if (this.t0 < 0) this.t0 = nowSeconds;
    const t = nowSeconds - this.t0;
    return [this.right(t, aspect), this.left(t, aspect)];
  }

  private right(t: number, aspect: number): RawHand {
    const palmY = 0.5 + 0.37 * Math.cos((2 * Math.PI * t) / 30);
    const tau = t % 20;
    const swipe = -0.4 * ramp(tau, 18, 18.18) + 0.4 * ramp(tau, 18.4, 19.9);
    return mockHand(
      {
        label: 'Right',
        x: 0.72 + 0.04 * Math.sin(0.5 * t) + swipe,
        y: palmY + this.palmDrop,
        scale: this.scale,
        curl: [0, 0, 0, 0, 0],
        pinch: 0,
        rotation: 0.06 * Math.sin(0.7 * t),
      },
      aspect,
    );
  }

  private left(t: number, aspect: number): RawHand {
    const c = t % 14;
    const fist = ramp(c, 4, 4.6) * (1 - ramp(c, 10, 10.6));
    const wander = ramp(c, 4.6, 5.5) * (1 - ramp(c, 9.4, 10));
    const pinch = ramp(c, 1.2, 1.7) * (1 - ramp(c, 2.6, 3.1));
    const palmX = 0.28 + wander * (0.14 + 0.14 * Math.sin(1.1 * (c - 4.6)));
    const palmY = 0.62 - wander * (0.28 + 0.1 * Math.sin(0.9 * (c - 4.6)));
    return mockHand(
      {
        label: 'Left',
        x: palmX,
        y: palmY + this.palmDrop,
        scale: this.scale,
        curl: [fist, fist, fist, fist, fist],
        pinch,
        rotation: -0.05 * Math.sin(0.6 * t),
      },
      aspect,
    );
  }
}
