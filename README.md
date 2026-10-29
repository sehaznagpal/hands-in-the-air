# Hand Canvas

A starter for browser scenes you control with your hands through the webcam.
Static Vite + TypeScript, no framework, plain CSS. Tracking runs locally with
MediaPipe Hand Landmarker: no backend, no API keys, and the camera image never
leaves your device. The model and WASM are self-hosted, so nothing loads from a CDN.

<!-- Demo GIF: replace with docs/demo.gif -->
> _Demo GIF goes here._

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the hand signals
npm run build      # static output in dist/ (works on Vercel as-is)
```

The app is called Hand Lab. Routes: `#netbag` (the default, works without a camera) and `#canvas` (Hand Canvas, needs the camera; click **Start camera**). The camera is shared, so switching scenes never restarts it. No camera? Open `/?mock=1` for two simulated hands.

| Key | Action |
| --- | --- |
| `D` | Debug overlay: skeleton, fingertip ids 1-10, FPS, detection time, live signals |
| `1` `2` `3` | Switch scene (also the toggle at the top centre; arrow keys work inside it) |
| `` ` `` | Hidden dev menu (scene picker). `?scene=<id>` also works |

## Theme

Colours and fonts are CSS variables at the top of `src/style.css`
(`--paper`, `--ink`, `--accent`).

## Hand signals (`src/hands.ts`)

Framework-free and unit-tested. Feed it mirrored detections and a clock:

```ts
const signals = new HandSignals();
signals.update(detections /* RawHand[] or null */, nowSeconds, cameraAspect);
signals.left.state / signals.right.state   // HandState
signals.tenFingers()                       // fingertips with stable ids 1-10
signals.on('pinchStart' | 'pinchEnd' | 'fingerCount' | 'swipe', handler)
```

Each `HandState` has 21 One-Euro-smoothed landmarks, five fingertips, per-finger
`extended` (with hysteresis), `pinching` / `pinchDistance`, `openness` (0 fist to 1
palm), `palm`, `scale`, `velocity`, and `present` (a hand is kept for 150 ms after
the last detection before it counts as lost). All coordinates are normalised 0-1
and mirrored, so the display behaves like a mirror. Left and right labels are
swapped to match the mirroring. Fingertip ids: left hand 1-5, right hand 6-10,
thumb to pinky.

## Add a scene

1. Create `src/scenes/my-scene.ts` implementing `Scene` from `src/scene.ts`:

   ```ts
   export class MyScene implements Scene {
     init(ctx: SceneContext) {}                    // canvas, overlay div, hands, host
     update(hands: HandSignals, dt: number) {}     // dt in seconds
     draw(g: CanvasRenderingContext2D) {}          // canvas is cleared, in CSS pixels
     dispose() {}                                  // remove listeners and DOM
   }
   ```

2. Register it in `src/scenes/index.ts`. Keys `1`-`3` pick the first three.
3. Use `ctx.toScreen(x, y)` to turn hand coordinates into canvas pixels. Put DOM UI in
   `ctx.overlay`. Set `ownsCameraUI = true` if the scene has its own camera switch
   (the Start button is then hidden; call `ctx.host.startTracking()`).

## Mock mode

`?mock=1` replaces the camera with two scripted hands (open/close cycles, pinch,
a slow vertical slide and an occasional swipe) running through the same signal
pipeline. Use it for testing and as a fallback demo.

## Scene: net bag

A hanging orange mesh bag that holds 0 to 25 balls. The bag lengthens and bulges to
match the count, swings from its hook like a pendulum, and the balls slosh inside.
Open it with key `2`, the dev menu, or `/?scene=net-bag` (add `&mock=1` to drive it
with simulated hands).

**Mouse, touch and keyboard (always on)**

| Input | Action |
| --- | --- |
| Drag the hanger or the top of the bag | Move the hook; the bag swings |
| `ArrowUp` / `+` / mouse wheel up / **+** button | Add a ball |
| `ArrowDown` / `-` / mouse wheel down / **−** button | Remove a ball |
| `M` or the marbles / fruit toggle | Switch ball set |
| `?` button (hover or click) | Help card; `Esc` or a click outside closes it |

**Hands** (top right toggle, off by default; it asks for the camera and shows
"Your camera stays on your device")

| Gesture | Action |
| --- | --- |
| Open hand, raise or lower | Dial: palm height sets the count (top of the ruler 25, bottom 0). Snaps with hysteresis. If both hands are open the right one wins. Closing the hand locks the value; losing the hand holds it |
| Fist (openness below 0.25 for 120 ms), either hand | Grab: the hook follows the fist. Opening the hand (above 0.5) releases; the hook stays where it is |
| Fast open-hand swipe left or right | Gust of wind |

A ruler at the right edge shows the dial, and a mirrored camera preview (bottom
right, hide button included) shows the skeleton and fingertips.

**Tuning.** Colours are CSS variables (`--nb-paper`, `--nb-net`, `--nb-ink`) in
`src/style.css`. Physics numbers live in `TUNING` in `src/scenes/netbag/physics.ts`;
`RELEASE_MODE` in `src/scenes/netbag/index.ts` switches between the hook staying put
and springing back to the top centre. The physics is plain Verlet (no library) and is
unit-tested headless: `npm test`.

## Notes

- Detection runs once per new video frame inside `requestAnimationFrame`, pauses
  when the tab is hidden, and `devicePixelRatio` is capped at 2.
- `public/models/hand_landmarker.task` is the official float16 model. The WASM files
  are copied from `node_modules` into `public/wasm` on `npm install` and before each build.
