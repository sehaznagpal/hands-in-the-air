export type CameraErrorKind = 'denied' | 'none' | 'unsupported' | 'other';

export class CameraError extends Error {
  constructor(
    public kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export const CAMERA_MESSAGES: Record<CameraErrorKind, string> = {
  denied: 'Camera blocked. Allow it in your browser, then try again.',
  none: 'No camera was found. Connect one, or add ?mock=1 to the address to try simulated hands.',
  unsupported: 'This browser cannot access a camera here. Use a current browser over https or localhost.',
  other: 'The camera could not be started. Close other apps that use it and try again.',
};

export interface Camera {
  stream: MediaStream;
  stop(): void;
}

export async function startCamera(video: HTMLVideoElement): Promise<Camera> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', CAMERA_MESSAGES.unsupported);
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (err) {
    const name = (err as DOMException).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError('denied', CAMERA_MESSAGES.denied);
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('none', CAMERA_MESSAGES.none);
    }
    throw new CameraError('other', CAMERA_MESSAGES.other);
  }

  const stop = () => {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  video.srcObject = stream;
  try {
    await video.play();
    if (!video.videoWidth) {
      await new Promise<void>((resolve) =>
        video.addEventListener('loadeddata', () => resolve(), { once: true }),
      );
    }
  } catch {
    stop();
    throw new CameraError('other', CAMERA_MESSAGES.other);
  }
  return { stream, stop };
}
