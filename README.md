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

The app opens on a **welcome page**: **Turn on camera to start** asks for the camera and opens **Warm Up: Canvas** (if the camera is blocked it opens in mouse mode instead). The round **i** button opens **About** (`#about`): what the app is, and a card for each game (**Warm Up: Canvas**, **Foggy Window**, **Sorting Game**, **My Eyes Follow You**, **Mesh Bag Marbles**; **Blooming Flowers**). Routes: `#welcome` (default), `#about`, `#canvas`, `#window`, `#sort`, `#bloom`, `#eyes` and `#mesh` (the old `#netbag` redirects to `#mesh`). A game link without camera access or mouse mode goes to the welcome page first. The camera is shared, so switching games never restarts it. Bottom left, in a game: **?** (help), **i** (About) and **stop camera**, which also returns to the welcome page. The preview (bottom right, always 16:9, `--preview-w` in `src/style.css`) can be minimised to a round button. No camera? Open `/?mock=1` for two simulated hands (`?mock=idle` shows the simulated camera with no hands, handy for layout checks).

Live: https://hands-in-the-air.vercel.app · Repo: https://github.com/sehaznagpal/hands-in-the-air

| Key | Action |
| --- | --- |
| `D` | Debug overlay: skeleton, fingertip ids 1-10, FPS, detection time, live signals |
| `1`-`6` | Switch game (also the tabs at the top centre; arrow keys work inside them) |
| `` ` `` | Hidden dev menu (scene picker). `?scene=<id>` also works |

## Theme

The favicon set (`public/favicon.*`, `apple-touch-icon.png`, `icon-*.png`, `site.webmanifest`) is generated from the brand colours in `src/style.css` with `npm run icons`; the files are committed.

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

2. Register it in `src/scenes/index.ts`; its tab and its About card follow the order there.
3. Use `ctx.toScreen(x, y)` to turn hand coordinates into canvas pixels. Put DOM UI in
   `ctx.overlay`. Give the scene a `help` string for the help card. The camera is
   owned by the app; read `ctx.host.tracking` and `ctx.previewRect()` to lay out around the preview.

## Mock mode

`?mock=1` replaces the camera with two scripted hands (open/close cycles, pinch,
a slow vertical slide and an occasional swipe) running through the same signal
pipeline. Use it for testing and as a fallback demo.

## Mesh Bag Marbles (`#mesh`)

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

## Foggy Window (`#window`)

A fogged window over a photo. An open palm wipes wide, one extended finger draws a thin line (both hands at once); the mouse drags to wipe and Shift draws thin. Wiped glass fogs over again in about 20 seconds, with condensation beads, edge beads and now and then a drip. `F` or **Fog it up** re-fogs everything; `B` / `Shift+B` or the options on the left switch the photo (Neon city, Nature, Calm city), shown cover-fit and centred. The photos are `public/backgrounds/neon-city.webp`, `nature.webp` and `calm-city.webp`; any other `.jpg`, `.jpeg` or `.webp` you drop in that folder becomes an extra option after restarting `npm run dev` (or rebuilding). The fog lightening is tuned per photo (`fog` in `src/scenes/window/backgrounds.ts`). The code is in `src/scenes/window/`: the mask, fog layer, beads and drips are in `fog.ts`.

## Sorting Game (`#sort`)

A gentle endless game: one marble at a time floats down from a chute, and you put it on the shelf that has the same marble. Each shelf shows one design as a label marble below it, centred; only designs that are on a shelf drop, and the three shelf designs always look clearly different (they come from different groups in `DESIGN_GROUPS`). Pinch thumb and index near the marble to grab it; once held it stays held until the fingers are clearly open for 200 ms, and a lost hand is waited out for 600 ms. Release anywhere in a shelf's tall drop zone and the right marble slides into the next free slot (5 per shelf); a different design bounces off and costs a life. With the mouse, click a marble to pick it up and click again to place it. A marble that reaches the floor also costs a life; you have 5, and the game runs until they are gone. A full shelf pays +5, clears and takes a new design. The next marble comes 1.5 s after the last one is placed or lost, and the first game's first marble falls extra slowly with hints. The best score is kept in `localStorage`. Every tuning number is in the `TUNING` block at the top of `src/scenes/sort/game.ts`; the game logic has no DOM and is played by a bot in `game.test.ts`. The marble drawing is shared with Mesh Bag in `src/shared/marbles.ts`.

## My Eyes Follow You (`#eyes`)

A girl whose eyes follow your hands (`src/scenes/eyes/`). Her pupils follow the palm of the nearest hand, smoothed. With two hands each eye follows a different one, crossed over, so she goes cross-eyed. She blinks every 3 to 6 seconds with a lid in her skin colour, looks slowly around when no hand is in view, and gives a small jump when a hand comes very close. With no camera the eyes follow the mouse and a click startles her. The whole girl (`public/characters/body.svg`) is the only view; her head tilts slightly toward the hand. The picture is exported from the Figma file; the animated layers are the SVG ids `pupil-left` and `pupil-right`. The tuning numbers are the `TUNING` block in `src/scenes/eyes/look.ts`.

## Blooming Flowers (`#bloom`)

Five vases on a ledge, each holding a different plant, all drawn in code (`src/scenes/bloom/vases.ts`): a tall cylinder with berry branches, a round belly with wavy lines and a big cup flower, a ribbed vase with tulips, a checkerboard pot with pom flowers, and a small bowl with a trumpet flower. Colours are mainly the app's orange, blue and cream, with pink, lilac, olive and lime accents; shapes are flat with wobbly edges, some fills are printed slightly off-register, and a speckle grain covers everything. Each plant has a bloom value from 0 (closed buds, folded leaves) to 1 (flowers open, leaves spread, berries popped out). Only the horizontal position of a palm matters: the nearest vase blooms fully and its neighbours to about 0.3; a vase you move away from closes again over 1.5 s. Both hands work at once. Pinching over a vase keeps it open (with a small wiggle) and pinching again releases it. When all 5 are kept open the plants sway together and a **Reset** button appears. With no camera, hovering blooms and a click keeps a vase. The rules and numbers are in `src/scenes/bloom/logic.ts` (the `TUNING` block, unit-tested). The vases stand close together, and the whole row scales to fit a phone.
