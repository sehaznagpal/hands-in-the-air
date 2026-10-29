/** A tiny keyframe animation: ease-in-out between keyframes, a hold at both ends, seamless loop. */
export interface Keyframe {
  /** 0 to 1 through the moving part of the loop. */
  t: number;
  /** Position as a share of the cell width and height. */
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  /** 0 open palm, 1 fist. */
  blend?: number;
  /** A free 0-1 channel for overlays (counter, arrows, wind). */
  v?: number;
  /** Hand opacity, 1 by default. */
  alpha?: number;
}

export interface State {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  blend: number;
  v: number;
  alpha: number;
}

const ease = (x: number) => x * x * (3 - 2 * x);
const full = (k: Keyframe): State => ({ x: k.x, y: k.y, rotation: k.rotation ?? 0, scale: k.scale ?? 1, blend: k.blend ?? 0, v: k.v ?? 0, alpha: k.alpha ?? 1 });

export class Timeline {
  constructor(
    /** Loop length in seconds, including the holds. */
    readonly duration: number,
    readonly frames: Keyframe[],
    /** Seconds the first and last frame are held at each end of the loop. */
    readonly hold = 0.4,
  ) {}

  /** The pose at a time in seconds; wraps around. */
  sample(time: number): State {
    const D = this.duration;
    const t = ((time % D) + D) % D;
    const u = Math.min(1, Math.max(0, (t - this.hold) / (D - 2 * this.hold)));
    const f = this.frames;
    let i = 0;
    while (i < f.length - 2 && u > f[i + 1].t) i++;
    const a = full(f[i]);
    const b = full(f[i + 1]);
    const k = ease(Math.min(1, Math.max(0, (u - f[i].t) / Math.max(1e-6, f[i + 1].t - f[i].t))));
    const out = {} as State;
    for (const key of Object.keys(a) as (keyof State)[]) out[key] = a[key] + (b[key] - a[key]) * k;
    return out;
  }

  /** True when the last frame equals the first, so the loop has no jump. */
  isSeamless() {
    const a = full(this.frames[0]);
    const b = full(this.frames[this.frames.length - 1]);
    return (Object.keys(a) as (keyof State)[]).every((k) => Math.abs(a[k] - b[k]) < 1e-9);
  }
}
