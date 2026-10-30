import type { SceneEntry } from '../scene';
import { CanvasScene } from './canvas';
import { MeshScene } from './mesh';
import { SortScene } from './sort';
import { WindowScene } from './window';

/** Add a scene here. The toggle and the homepage cards list them all, in this order. */
export const scenes: SceneEntry[] = [
  { id: 'canvas', name: 'Canvas', hash: 'canvas', create: () => new CanvasScene() },
  { id: 'mesh', name: 'Mesh Bag', hash: 'mesh', create: () => new MeshScene() },
  { id: 'sort', name: 'Sort', hash: 'sort', create: () => new SortScene() },
  { id: 'window', name: 'Car Window', hash: 'window', create: () => new WindowScene() },
];

/** Old hashes that still work. */
export const HASH_ALIASES: Record<string, string> = { netbag: 'mesh' };
