/** The photo backgrounds of the Foggy Window, shown cover-fit and centred (never stretched). */

export interface Background {
  id: string;
  name: string;
  /** Paint the sharp photo at width x height (CSS px); the context is already scaled. */
  paint(g: CanvasRenderingContext2D, w: number, h: number): Promise<void>;
  /** How strongly the fog lightens this photo: 1 is the automatic amount, lower for bright photos. */
  fog?: number;
}

/** Cache of loaded photos, so switching back is instant and the homepage preview can reuse them. */
const images = new Map<string, Promise<HTMLImageElement | null>>();
export function loadPhoto(url: string) {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

/** Draw an image so it covers the area, centred, keeping its proportions. */
export function coverImage(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  g.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
}

function photo(id: string, name: string, file: string, fog?: number): Background {
  return {
    id,
    name,
    fog,
    paint: async (g, w, h) => {
      const img = await loadPhoto(`/backgrounds/${encodeURIComponent(file)}`);
      if (img) coverImage(g, img, w, h);
    },
  };
}

/** The three photos in the order of the option stack; the first is the default. */
export const PHOTOS: Background[] = [
  photo('neon-city', 'Neon city', 'neon-city.webp'),
  photo('nature', 'Nature', 'nature.webp', 0.55),
  photo('calm-city', 'Calm city', 'calm-city.webp', 0.8),
];

/** The default photo's URL, for the homepage preview. */
export const DEFAULT_PHOTO_URL = '/backgrounds/neon-city.webp';

/** The three photos, then one option per extra image dropped into public/backgrounds. */
export function allBackgrounds(): Background[] {
  const known = new Set(['neon-city.webp', 'nature.webp', 'calm-city.webp']);
  const extras = (typeof __BACKGROUNDS__ !== 'undefined' ? __BACKGROUNDS__ : [])
    .filter((f) => !known.has(f))
    .map((file) => photo(`file:${file}`, file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), file));
  return [...PHOTOS, ...extras];
}
