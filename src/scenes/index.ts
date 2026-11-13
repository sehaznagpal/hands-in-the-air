import type { SceneEntry } from '../scene';
import { BloomScene } from './bloom';
import { CanvasScene } from './canvas';
import { EyesScene } from './eyes';
import { MeshScene } from './mesh';
import { SortScene } from './sort';
import { WindowScene } from './window';

/**
 * Every game, in the order of the cards on the About page. The tabs list the playable ones in this order;
 * entries marked `soon` would only show as a muted card.
 */
export const scenes: SceneEntry[] = [
  { id: 'canvas', name: 'Warm Up: Canvas', hash: 'canvas', create: () => new CanvasScene() },
  { id: 'window', name: 'Foggy Window', hash: 'window', create: () => new WindowScene() },
  { id: 'sort', name: 'Sorting Game', hash: 'sort', create: () => new SortScene() },
  { id: 'bloom', name: 'Blooming Flowers', hash: 'bloom', create: () => new BloomScene() },
  { id: 'eyes', name: 'My Eyes Follow You', hash: 'eyes', create: () => new EyesScene() },
  { id: 'mesh', name: 'Mesh Bag Marbles', hash: 'mesh', create: () => new MeshScene() },
];
