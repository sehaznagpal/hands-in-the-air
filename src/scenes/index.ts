import type { SceneEntry } from '../scene';
import { CanvasScene } from './canvas';
import { MeshScene } from './mesh';

/** Add a scene here. The toggle lists them all, in this order. */
export const scenes: SceneEntry[] = [
  { id: 'canvas', name: 'Canvas', hash: 'canvas', create: () => new CanvasScene() },
  { id: 'mesh', name: 'Mesh Bag', hash: 'mesh', create: () => new MeshScene() },
];

/** The scene opened after the camera starts when the URL names none. */
export const DEFAULT_SCENE = 'canvas';

/** Old hashes that still work. */
export const HASH_ALIASES: Record<string, string> = { netbag: 'mesh' };
