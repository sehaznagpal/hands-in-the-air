import type { SceneEntry } from '../scene';
import { DotsScene } from './dots';

/** Add a scene here. Keys 1, 2, 3 pick the first three; the dev menu (`) lists all. */
export const scenes: SceneEntry[] = [
  { id: 'dots', name: 'Ten dots', create: () => new DotsScene() },
];
