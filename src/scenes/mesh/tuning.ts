/**
 * Every tuning constant of the mesh bag, physics and controls, in one place.
 * Calm by design: slower dial, softer hook, damped swing, balls that settle.
 */
export const TUNING = {
  // ---- physics: stepping
  /** Fixed substep in seconds, 4 per 60 fps frame. */
  step: 1 / 240,
  /** Constraint solver passes per substep. */
  iterations: 6,
  /** Downward acceleration, world units per second squared. */
  gravity: 150,

  // ---- physics: mesh shape
  /** Full bag width at rest, about 2.2 ball diameters. */
  widthRest: 4.4,
  /** Hard cap on bag width, 3 ball diameters. */
  widthHard: 6,
  /** Width the empty, limp mesh settles toward. */
  widthLimp: 0.55,
  /** Soft stretch stiffness per iteration (effective spring is k * iterations / step^2, so keep it small). */
  stretchK: 0.2,
  /** Soft spring toward the resting width. */
  widthK: 0.004,
  /** Soft spring that keeps an empty mesh narrow. */
  limpK: 0.0004,
  /** Spring that opens the bag where balls are (the soft bulge). */
  bulgeK: 0.004,
  /** Spring toward the segment length the current ball count needs. */
  lengthK: 0.02,
  /** Segments never stretch past this multiple of their length. */
  maxStretch: 1.6,

  // ---- physics: calm
  /** Velocity kept per substep by mesh particles; lower = the swing dies sooner (was 0.997, now about 5x the damping). */
  wallDamp: 0.985,
  /** Gentle pull of the lower mesh toward hanging straight under the hook (1/s^2): a stiffer, shorter swing. */
  swingPull: 140,
  /** Dashpot on the mesh links per solver pass: removes wobble along each link. */
  wallConstraintDamp: 0.012,
  /** Largest mesh particle move per substep, in units. */
  wallMaxMove: 0.25,
  /** Velocity kept per substep by balls in free flight. */
  ballDamp: 0.9995,
  /** Ball mass relative to a mesh particle. */
  ballMass: 3,
  /** Extra velocity kept per substep for balls in contact (rolling resistance). */
  contactDamp: 0.985,
  /** Bounciness of ball contacts: share of the approach speed kept. */
  ballRestitution: 0.1,
  /** Tangential speed lost per substep in ball-ball contact. */
  ballFriction: 0.06,
  /** Tangential speed lost per substep in ball-mesh contact. */
  wallFriction: 0.08,
  /** Once the hook has stopped and the mesh is slower than this (units/s), a gentle extra damping glides it to rest. */
  settleBelow: 16,
  /** Velocity kept per substep while gliding to rest. */
  settleDamp: 0.96,
  /** Mesh speed (units/s) below which the sim may sleep. */
  sleepSpeed: 2.5,
  /** Seconds below that speed before it sleeps (was 0.6). */
  sleepAfter: 0.12,

  // ---- hook (the point the bag hangs from)
  /** Critically damped spring: reaches 95% of a step in about this long (seconds). */
  hookFollowSeconds: 0.3,
  /** Fastest the hook may move, units per second (was 40, now 40% lower). */
  hookMaxSpeed: 24,
  /** Largest hook acceleration, units per second squared. */
  hookMaxAccel: 140,
  /** Largest downward hook acceleration; below gravity so the mesh stays taut. */
  hookMaxDownAccel: 50,
  /** Low-pass time on the fist position before it drives the hook (seconds). */
  fistSmoothSeconds: 0.1,
  /** Wind impulse scale for a swipe (was 1, now half). */
  gustScale: 0.5,

  // ---- hand controls
  /** Openness below which a hand is a fist. */
  fistBelow: 0.25,
  /** Seconds a fist must hold to count. */
  fistFor: 0.12,
  /** Openness above which a fist counts as open again. */
  openAbove: 0.5,
  /** Balls the world adds or removes per second to follow the counter. */
  worldChangesPerSec: 6,
  /** Palm travel (fraction of frame height) that spans 0 to 25 balls. Was 0.70, now 1.0 (+43%). */
  DIAL_RANGE: 1.0,
  /** Most balls the dial may add or remove per second. */
  DIAL_MAX_RATE: 3,
  /** Extra distance (in balls) the raw value must pass the halfway point before the count steps. */
  DIAL_HYSTERESIS: 0.6,
  /** Milliseconds the hand must be open and steady before the dial engages. */
  DIAL_ENGAGE_MS: 300,
  /** Time constant of the palm-height smoothing, seconds. */
  DIAL_SMOOTHING: 0.25,
  /** A palm moving faster than this (frame heights per second) is not steady. */
  DIAL_STEADY_SPEED: 0.25,
};
