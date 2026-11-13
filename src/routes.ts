/**
 * Every page of the site, in one place: its path, its search metadata and the old hash links that still work.
 * Used by the app (path routing) and by the build (scripts/seo-plugin.ts prerenders one HTML file per route).
 */

export const SITE = 'https://hands-in-the-air.vercel.app';
export const SITE_NAME = 'Throw Your Hands in the Air';
export const AUTHOR = 'Sehaz Nagpal';
export const PORTFOLIO = 'https://sehaznagpal.vercel.app';
export const LINKEDIN = 'https://www.linkedin.com/in/sehaznagpal/';
export const GITHUB = 'https://github.com/sehaznagpal';
export const OG_IMAGE = `${SITE}/og.png`;
export const OG_IMAGE_ALT = 'Throw Your Hands in the Air by Sehaz Nagpal: the headline in orange above two white hand-tracking skeletons.';

const BY = 'Designed and built by Sehaz Nagpal, product designer.';

export interface RouteInfo {
  /** "welcome", "about" or the scene id. */
  id: string;
  path: string;
  /** The game's name (also the card title); empty for welcome and about. */
  name: string;
  title: string;
  description: string;
  /** Old hash links (#about, #window, ...) that redirect to this route. */
  legacy: string[];
}

const game = (id: string, path: string, name: string, line: string, legacy: string[]): RouteInfo => ({
  id,
  path,
  name,
  title: `${name} — ${SITE_NAME} by ${AUTHOR}`,
  description: `${line} ${BY}`,
  legacy,
});

export const ROUTES: RouteInfo[] = [
  {
    id: 'welcome',
    path: '/',
    name: '',
    title: `${SITE_NAME} — by ${AUTHOR}`,
    description: `Play with your hands through your webcam: wipe, pinch, grab and wave. ${BY}`,
    legacy: ['', 'welcome', 'home'],
  },
  {
    id: 'about',
    path: '/about',
    name: '',
    title: `About — ${SITE_NAME} by ${AUTHOR}`,
    description: `How this hand-tracking web app works and why it's safe. ${BY}`,
    legacy: ['about'],
  },
  game('canvas', '/canvas', 'Warm Up: Canvas', 'Warm up by waving your hands: every fingertip paints a glowing trail on the screen.', ['canvas']),
  game('window', '/foggy-window', 'Foggy Window', 'Wipe a fogged-up window clear with your palm, or draw on it with one finger.', ['window']),
  game('sort', '/sorting-game', 'Sorting Game', 'Pinch each falling marble and drop it on the shelf with the matching marble.', ['sort']),
  game('bloom', '/blooming-flowers', 'Blooming Flowers', 'Move your hand over five vases and watch each plant bloom, then close again.', ['bloom', 'flowers']),
  game('eyes', '/my-eyes-follow-you', 'My Eyes Follow You', 'A girl whose eyes follow your hands. Show two hands and she goes cross-eyed.', ['eyes']),
  game('mesh', '/mesh-bag-marbles', 'Mesh Bag Marbles', 'Raise or lower your hand to fill a swinging mesh bag with marbles, then grab it.', ['mesh', 'netbag']),
];

export const GAMES = ROUTES.filter((r) => r.name);

/** The route for a pathname ("/about", "/about/", "/about.html"), or undefined. */
export function routeByPath(pathname: string) {
  const p = pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  return ROUTES.find((r) => r.path === p);
}

/** The route for an old hash such as "#window" or "#/netbag", or undefined. */
export function routeByHash(hash: string) {
  const h = hash.replace(/^#\/?/, '').toLowerCase();
  return ROUTES.find((r) => r.legacy.includes(h));
}
