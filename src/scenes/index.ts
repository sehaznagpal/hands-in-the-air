import type { SceneEntry } from '../scene';
import { DotsScene } from './dots';
import { NetBagScene } from './netbag';

/** Add a scene here. The toggle lists them all; keys 1, 2, 3 pick the first three. */
export const scenes: SceneEntry[] = [
  { id: 'dots', name: 'Hand Canvas', hash: 'canvas', create: () => new DotsScene() },
  { id: 'net-bag', name: 'Net Bag', hash: 'netbag', create: () => new NetBagScene() },
];

/** Opens with no hash, so visitors land on the scene that works without a camera. */
export const DEFAULT_SCENE = 'net-bag';
