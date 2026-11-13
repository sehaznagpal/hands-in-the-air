import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import { seoPlugin } from './scripts/seo-plugin';

/** Image files dropped into public/backgrounds become extra Car Window backgrounds. */
function backgroundFiles() {
  try {
    return readdirSync('public/backgrounds').filter((f) => /\.(jpe?g|webp)$/i.test(f)).sort();
  } catch {
    return [];
  }
}

export default defineConfig({
  plugins: [seoPlugin()],
  build: { target: 'es2022' },
  define: { __BACKGROUNDS__: JSON.stringify(backgroundFiles()) },
});
