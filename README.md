# Throw Your Hands in the Air

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

The app opens on a homepage: **Turn on camera to start** asks for the camera, or **No camera? Try it with your mouse** unlocks the cards without one. Pick a card (Canvas, Mesh Bag, Sort, Car Window) to open that scene. Routes: `#home` (default), `#canvas` and `#mesh` (the old `#netbag` redirects to `#mesh`). A scene link without camera access or mouse mode goes home first. The camera is shared, so switching scenes never restarts it, and **stop camera** / **start camera** sit bottom left next to the **?** help button. The preview (bottom right) can be minimised to a round button. No camera? Open `/?mock=1` for two simulated hands (`?mock=idle` shows the simulated camera with no hands, handy for layout checks).

Live: https://hands-in-the-air.vercel.app · Repo: https://github.com/sehaznagpal/hands-in-the-air

| Key | Action |
| --- | --- |
| `D` | Debug overlay: skeleton, fingertip ids 1-10, FPS, detection time, live signals |
| `1` `2` `3` | Switch scene (also the toggle at the top centre; arrow keys work inside it) |
| `` ` `` | Hidden dev menu (scene picker). `?scene=<id>` also works |

## Theme

Colours and fonts are CSS variables at the top of `src/style.css`
(`--bg`, `--ink`, `--orange`, `--blue`). Fonts (Clash Grotesk, Atelier) are in `public/fonts`.

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
   `ctx.overlay`. Give the scene a `help` string for the help card. The camera is
   owned by the app; read `ctx.host.tracking` and `ctx.previewRect()` to lay out around the preview.

## Mock mode

`?mock=1` replaces the camera with two scripted hands (open/close cycles, pinch,
a slow vertical slide and an occasional swipe) running through the same signal
pipeline. Use it for testing and as a fallback demo.

## Scene: mesh bag

A hanging orange mesh bag that holds 0 to 25 balls. The bag lengthens and bulges to
match the count, swings from its hook like a pendulum, and the balls slosh inside.
Open it with key `2`, the dev menu, or `/?scene=mesh` (add `&mock=1` to drive it
with simulated hands).

**Mouse, touch and keyboard (always on)**

| Input | Action |
| --- | --- |
| Drag the hanger or the top of the bag | Move the hook; the bag swings |
| `ArrowUp` / `+` / mouse wheel up / **+** button | Add a ball |
| `ArrowDown` / `-` / mouse wheel down / **−** button | Remove a ball |
| `M` or the marbles / fruit toggle | Switch ball set |
| `?` button (hover or click) | Animated help card (looping hand-skeleton guides in `src/guide/`); it opens by itself the first time each scene is shown (15 s), `Esc`, the x or a click outside closes it. `?guide=1` shows the guides and the pose sheet |

**Hands** (whenever the camera is on)

| Gesture | Action |
| --- | --- |
| Open hand, raise or lower | Dial: after the hand has been open and steady for 300 ms, raising or lowering the palm changes the count from where it is (palm travel of a full frame height spans 0 to 25), smoothed, at most 3 balls per second. If both hands are open the right one wins. Closing the hand locks the value; losing the hand holds it |
| Fist (openness below 0.25 for 120 ms), either hand | Grab: the hook follows the fist. Opening the hand (above 0.5) releases; the hook stays where it is |
| Fast open-hand swipe left or right | Gust of wind |

The shared camera preview (bottom right) shows the skeleton and fingertips.

**Tuning.** Colours are the CSS variables in `src/style.css`. Every physics and control number
lives in the one `TUNING` block in `src/scenes/mesh/tuning.ts`;
`RELEASE_MODE` in `src/scenes/mesh/index.ts` switches between the hook staying put
and springing back to the top centre. The physics is plain Verlet (no library) and is
unit-tested headless: `npm test`.

## Notes

- Detection runs once per new video frame inside `requestAnimationFrame`, pauses
  when the tab is hidden, and `devicePixelRatio` is capped at 2.
- `public/models/hand_landmarker.task` is the official float16 model. The WASM files
  are copied from `node_modules` into `public/wasm` on `npm install` and before each build.

## Car Window (`#window`)

A fogged car window on a rainy night. An open palm wipes wide, one extended finger draws a thin line (both hands at once); the mouse drags to wipe and Shift draws thin. Wiped glass fogs over again in about 20 seconds, with condensation beads, edge beads and now and then a drip. `F` or **Fog it up** re-fogs everything; `B` / `Shift+B` or the chips switch the background (night street, sunset coast, neon city). Drop `.jpg`, `.jpeg` or `.webp` files into `public/backgrounds/` and restart `npm run dev` (or rebuild) to add your own. The code is in `src/scenes/window/`: the mask, fog layer, beads and drips are in `fog.ts`, the procedural backgrounds in `backgrounds.ts`.

## Sort (`#sort`)

A small game: marbles drop from a chute and you put each on the shelf of its colour family (blue with dots, pink with stripes, green with swirls). Pinch thumb and index near a marble to grab it, let go over a shelf to place it; the mouse drags marbles too. Wrong shelf bounces, a marble that reaches the floor costs one of 3 lives, a full shelf pays a bonus. The best score is kept in `localStorage`. Every feel constant (grab radius, snap distance, drop interval, speed-up) is in the `TUNING` block at the top of `src/scenes/sort/game.ts`; the game logic has no DOM and is played by a bot in `game.test.ts`. The marble drawing is shared with Mesh Bag in `src/shared/marbles.ts`.
