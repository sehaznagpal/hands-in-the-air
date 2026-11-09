// Generates every icon from one source: the brand colours in src/style.css.
//   npm run icons
// Writes public/favicon.svg (the source), favicon.ico (16, 32, 48), favicon-16.png, favicon-32.png,
// apple-touch-icon.png (180, opaque, full bleed), icon-192.png, icon-512.png and site.webmanifest.
// The PNGs are drawn from the same two shapes as the SVG (a rounded square and a centred dot) with 8x8 supersampling,
// so no image library is needed.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (name) => join(root, 'public', name);

// ---- brand colours, read from the CSS variables
const css = readFileSync(join(root, 'src', 'style.css'), 'utf8');
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`--${name} not found in src/style.css`);
  return m[1].toLowerCase();
};
const BLUE = token('blue');
const ORANGE = token('orange');
const BG = token('bg');
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// ---- the shapes, as fractions of the icon size
const RADIUS = 0.2; // corner radius of the rounded square
const DOT = 0.38; // diameter of the dot

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${(64 * RADIUS).toFixed(2)}" fill="${BLUE}"/>
  <circle cx="32" cy="32" r="${((64 * DOT) / 2).toFixed(2)}" fill="${ORANGE}"/>
</svg>
`;
writeFileSync(pub('favicon.svg'), svg);

// ---- rasteriser
const SS = 8;
/** RGBA pixels of the icon at `size`; `rounded` false gives the full-bleed, fully opaque square. */
function raster(size, rounded) {
  const blue = rgb(BLUE);
  const orange = rgb(ORANGE);
  const r = rounded ? size * RADIUS : 0;
  const dotR = (size * DOT) / 2;
  const c = size / 2;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0;
      let cr = 0;
      let cg = 0;
      let cb = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          // inside the rounded square?
          const qx = Math.max(r - px, 0, px - (size - r));
          const qy = Math.max(r - py, 0, py - (size - r));
          if (qx * qx + qy * qy > r * r) continue;
          const col = Math.hypot(px - c, py - c) <= dotR ? orange : blue;
          a += 1;
          cr += col[0];
          cg += col[1];
          cb += col[2];
        }
      }
      const i = (y * size + x) * 4;
      if (a) {
        out[i] = Math.round(cr / a);
        out[i + 1] = Math.round(cg / a);
        out[i + 2] = Math.round(cb / a);
      }
      out[i + 3] = Math.round((255 * a) / (SS * SS));
    }
  }
  return out;
}

// ---- PNG and ICO writers
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let v = n;
  for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
  return v >>> 0;
});
const crc32 = (buf) => {
  let v = 0xffffffff;
  for (const b of buf) v = crcTable[(v ^ b) & 255] ^ (v >>> 8);
  return (v ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, rounded) {
  const px = raster(size, rounded);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(sizes) {
  const images = sizes.map((s) => png(s, true));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s === 256 ? 0 : s;
    head[e + 1] = s === 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(images[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([head, ...images]);
}

writeFileSync(pub('favicon.ico'), ico([16, 32, 48]));
writeFileSync(pub('favicon-16.png'), png(16, true));
writeFileSync(pub('favicon-32.png'), png(32, true));
writeFileSync(pub('apple-touch-icon.png'), png(180, false));
writeFileSync(pub('icon-192.png'), png(192, true));
writeFileSync(pub('icon-512.png'), png(512, true));
writeFileSync(
  pub('site.webmanifest'),
  JSON.stringify(
    {
      name: 'Throw Your Hands in the Air',
      short_name: 'Hands in the Air',
      start_url: '/',
      display: 'standalone',
      theme_color: BLUE,
      background_color: BG,
      icons: [
        { src: '/icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png?v=2', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(`icons: blue ${BLUE}, orange ${ORANGE}, background ${BG}`);
