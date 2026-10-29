import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { RawHand } from './types';

export class ModelError extends Error {}

export interface HandTracker {
  readonly delegate: 'GPU' | 'CPU';
  /** Returns hands for the current video frame, mirrored, with labels corrected. */
  detect(video: HTMLVideoElement, nowMs: number): RawHand[];
  close(): void;
}

const base = import.meta.env.BASE_URL;

async function create(
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  delegate: 'GPU' | 'CPU',
) {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
  });
}

export async function createTracker(): Promise<HandTracker> {
  let landmarker: HandLandmarker;
  let delegate: 'GPU' | 'CPU' = 'GPU';
  try {
    const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`);
    try {
      landmarker = await create(fileset, 'GPU');
    } catch {
      delegate = 'CPU';
      landmarker = await create(fileset, 'CPU');
    }
  } catch (err) {
    throw new ModelError(
      `The hand model could not be loaded (${(err as Error).message}). Check your connection and reload.`,
    );
  }

  let lastTs = 0;
  const tracker: HandTracker = {
    get delegate() {
      return delegate;
    },
    detect(video, nowMs) {
      const ts = Math.max(nowMs, lastTs + 1);
      lastTs = ts;
      const result = landmarker.detectForVideo(video, ts);
      return result.landmarks.map((lm, i) => {
        const cat = result.handedness[i]?.[0];
        // The model assumes a mirrored (selfie) image. We feed the raw camera frame,
        // so its "Left" is the user's right hand and vice versa.
        const label = cat?.categoryName === 'Left' ? 'Right' : 'Left';
        return {
          label,
          score: cat?.score ?? 0,
          landmarks: lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
        };
      });
    },
    close() {
      landmarker.close();
    },
  };
  return tracker;
}
