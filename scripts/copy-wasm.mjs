// Copies MediaPipe's WASM runtime from node_modules into public/wasm so the
// app never loads it from a CDN. Runs on postinstall and before every build.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'wasm');

if (!existsSync(src)) {
  console.error('copy-wasm: ' + src + ' not found. Run npm install first.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('copy-wasm: copied MediaPipe WASM to public/wasm');
