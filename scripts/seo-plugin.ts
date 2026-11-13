/**
 * Vite plugin: search metadata in the HTML itself, not injected by JavaScript.
 *  - dev and build: every request for the app gets the <head> (title, description, canonical, Open Graph, Twitter,
 *    JSON-LD), the right visible page and the right <h1> for its route;
 *  - build: one prerendered HTML file per route (about.html, canvas.html, ...), which Vercel serves at /about etc.
 *    with cleanUrls; plus public/sitemap.xml with today's date.
 * The routes and texts live in src/routes.ts.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { AUTHOR, GAMES, GITHUB, LINKEDIN, OG_IMAGE, OG_IMAGE_ALT, PORTFOLIO, ROUTES, routeByPath, SITE, SITE_NAME, type RouteInfo } from '../src/routes';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const canonical = (r: RouteInfo) => (r.path === '/' ? `${SITE}/` : `${SITE}${r.path}`);

/** The same Person on every page, as the author of the app. */
const PERSON = {
  '@type': 'Person',
  name: AUTHOR,
  jobTitle: 'Product Designer',
  url: PORTFOLIO,
  sameAs: [LINKEDIN, GITHUB, PORTFOLIO],
};

function jsonLd(r: RouteInfo) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: SITE,
    description: r.description,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any (web browser)',
    browserRequirements: 'Requires a webcam and JavaScript',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    image: OG_IMAGE,
    author: PERSON,
  };
  // "</" must not appear inside a script element.
  return JSON.stringify(data, null, 2).replace(/<\//g, '<\\/');
}

/** Everything in the head that depends on the page. */
export function headBlock(r: RouteInfo) {
  const t = esc(r.title);
  const d = esc(r.description);
  const url = canonical(r);
  return `<!--seo:start-->
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <meta name="author" content="${AUTHOR}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(OG_IMAGE_ALT)}" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <meta name="twitter:image:alt" content="${esc(OG_IMAGE_ALT)}" />
    <!-- google-site-verification goes here -->
    <script type="application/ld+json">
${jsonLd(r)}
    </script>
    <!--seo:end-->`;
}

/** The cards of the About page, as real links with real text. */
const TITLE_LINES: Record<string, [string, string]> = {
  canvas: ['Warm Up:', 'Canvas'],
  window: ['Foggy', 'Window'],
  sort: ['Sorting', 'Game'],
  bloom: ['Blooming', 'Flowers'],
  eyes: ['My Eyes', 'Follow You'],
  mesh: ['Mesh Bag', 'Marbles'],
};
export function cardsHtml() {
  return GAMES.map((g) => {
    const [a, b] = TITLE_LINES[g.id] ?? [g.name, ''];
    return `<li><a class="about-card" href="${g.path}" aria-label="${esc(g.name)}"><h2>${a}<br />${b}</h2></a></li>`;
  }).join('\n            ');
}

/** Make a page's HTML the page for route `r`. Safe to run on its own output. */
export function applyRoute(html: string, r: RouteInfo) {
  const isGame = !!r.name;
  let out = html.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, () => headBlock(r));
  out = out.replace(/<!--page-h1-->[\s\S]*?<!--\/page-h1-->/, () => `<!--page-h1-->${isGame ? `<h1 id="game-title" class="sr-only">${esc(r.name)}</h1>` : ''}<!--/page-h1-->`);
  out = out.replace(/<!--cards-->[\s\S]*?<!--\/cards-->/, () => `<!--cards-->${cardsHtml()}<!--/cards-->`);
  // Exactly one <h1> in the file: the title of the page that is shown; the other title is a plain paragraph.
  const heading = (id: string, active: boolean) => {
    out = out.replace(new RegExp(`<(h1|p)( id="${id}"[^>]*)>([\\s\\S]*?)</\\1>`), (_m, _t, attrs, inner) => `<${active ? 'h1' : 'p'}${attrs}>${inner}</${active ? 'h1' : 'p'}>`);
  };
  heading('welcome-title', r.id === 'welcome');
  heading('about-title', r.id === 'about');
  out = out.replace(/<section id="(welcome|about)"([^>]*?)(\s+hidden)?>/g, (_m, id, attrs) => `<section id="${id}"${attrs}${r.id === id ? '' : ' hidden'}>`);
  return out;
}

export function seoPlugin(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'seo',
    configResolved(c) {
      root = c.root;
      outDir = c.build.outDir;
    },
    buildStart() {
      const date = new Date().toISOString().slice(0, 10);
      const urls = ROUTES.map((r) => `  <url>\n    <loc>${canonical(r)}</loc>\n    <lastmod>${date}</lastmod>\n  </url>`).join('\n');
      writeFileSync(join(root, 'public', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const path = (ctx.originalUrl || ctx.path || '/').split('?')[0];
        return applyRoute(html, routeByPath(path) ?? ROUTES[0]);
      },
    },
    closeBundle: {
      order: 'post',
      handler() {
        const dir = join(root, outDir);
        const base = join(dir, 'index.html');
        if (!existsSync(base)) return;
        const html = readFileSync(base, 'utf8');
        for (const r of ROUTES.slice(1)) writeFileSync(join(dir, `${r.path.slice(1)}.html`), applyRoute(html, r));
        writeFileSync(base, applyRoute(html, ROUTES[0]));
      },
    },
  };
}
