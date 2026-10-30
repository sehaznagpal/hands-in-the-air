import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Image files dropped into public/backgrounds become extra Car Window backgrounds. */
function backgroundFiles() {
  try {
    return readdirSync('public/backgrounds').filter((f) => /\.(jpe?g|webp)$/i.test(f)).sort();
  } catch {
    return [];
  }
}

export default defineConfig({
  build: { target: 'es2022' },
  define: { __BACKGROUNDS__: JSON.stringify(backgroundFiles()) },
});
