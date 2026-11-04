/** Pure helpers for My Eyes Follow You: where the eyes look, when they blink, and the startle. */

export const TUNING = {
  /** Time constant (s) of the eye smoothing. */
  SMOOTH: 0.09,
  /** Seconds between blinks: a random value in this range. */
  BLINK_MIN: 3,
  BLINK_MAX: 6,
  /** Seconds a blink takes. */
  BLINK_TIME: 0.18,
  /** Hand scale (wrist to middle knuckle, in image heights) above which a hand is "very close". */
  CLOSE_SCALE: 0.22,
  /** The hand must drop below this before it can startle her again. */
  CLOSE_RESET: 0.17,
  /** Seconds a startle takes to settle, and the least time between two. */
  STARTLE_TIME: 0.5,
  STARTLE_GAP: 1.2,
  /** Head tilt toward the hand, in degrees, toward the hand. */
  TILT_DEG: 5,
};

/**
 * Gaze direction from an eye to a target, both in screen pixels. The length is 0 when the target is on the eye
 * and eases toward 1 as it moves away (reaching 1 at `reach` pixels), so the pupil never leaves its range.
 */
export function gaze(ex: number, ey: number, tx: number, ty: number, reach: number) {
  const dx = tx - ex;
  const dy = ty - ey;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const m = Math.min(1, (d / reach) * 1.25);
  const k = Math.sin((m * Math.PI) / 2); // ease out: small moves are already visible
  return { x: (dx / d) * k, y: (dy / d) * k };
}

/** Schedules random blinks; `lid()` is 0 (open) to 1 (shut). */
export class Blinker {
  private next: number;
  private phase = -1;

  constructor(private rand: () => number = Math.random) {
    this.next = this.interval();
  }

  private interval() {
    return TUNING.BLINK_MIN + this.rand() * (TUNING.BLINK_MAX - TUNING.BLINK_MIN);
  }

  update(dt: number) {
    if (this.phase >= 0) {
      this.phase += dt;
      if (this.phase >= TUNING.BLINK_TIME) {
        this.phase = -1;
        this.next = this.interval();
      }
    } else {
      this.next -= dt;
      if (this.next <= 0) this.phase = 0;
    }
  }

  /** Force a blink now (used after a startle). */
  blinkNow() {
    if (this.phase < 0) this.phase = 0;
  }

  lid() {
    return this.phase < 0 ? 0 : Math.sin((Math.PI * this.phase) / TUNING.BLINK_TIME);
  }
}

/** Decides when a hand is close enough to startle her, with hysteresis and a cooldown. */
export class StartleDetector {
  private armed = true;
  private cooldown = 0;

  /** `scale` is the largest hand scale in view (0 with no hand). Returns true on the frame a startle begins. */
  update(scale: number, dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (scale < TUNING.CLOSE_RESET) this.armed = true;
    if (this.armed && scale >= TUNING.CLOSE_SCALE && this.cooldown <= 0) {
      this.armed = false;
      this.cooldown = TUNING.STARTLE_GAP;
      return true;
    }
    return false;
  }
}
