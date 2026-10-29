import type { HandSignals } from './hands';

/** What a scene can ask of the app about the camera. */
export interface Host {
  /** True when ?mock=1 replaced the camera with simulated hands. */
  readonly mock: boolean;
  readonly tracking: boolean;
  /** Camera width over height. */
  readonly aspect: number;
  /** True when a live camera image is available to draw. */
  readonly hasVideo: boolean;
  /** Resolves to null on success, or a message to show the user. */
  startTracking(): Promise<string | null>;
  stopTracking(): void;
  onTrackingChange(fn: (on: boolean) => void): () => void;
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  /** Empty element over the canvas for DOM UI. Cleared between scenes. */
  overlay: HTMLElement;
  video: HTMLVideoElement;
  /** Updated in place on resize. width and height are CSS pixels. */
  size: { width: number; height: number; dpr: number };
  hands: HandSignals;
  host: Host;
  /** Normalised mirrored hand coordinates to canvas CSS pixels (camera "cover" fit). */
  toScreen(x: number, y: number): { x: number; y: number };
}

export interface Scene {
  /** Set when the scene has its own camera switch, so the Start button stays hidden. */
  readonly ownsCameraUI?: boolean;
  init(ctx: SceneContext): void;
  update(hands: HandSignals, dt: number): void;
  /** The canvas is already cleared to the paper colour and scaled to CSS pixels. */
  draw(ctx: CanvasRenderingContext2D): void;
  dispose(): void;
}

export interface SceneEntry {
  id: string;
  name: string;
  create(): Scene;
}
