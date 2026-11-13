// Receives the PNG posted by scripts/og-image.html and writes public/og.png (then exits).
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og.png');
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.end();
  const parts = [];
  req.on('data', (c) => parts.push(c));
  req.on('end', () => {
    writeFileSync(out, Buffer.concat(parts));
    res.end('ok');
    console.log('wrote', out);
    server.close();
  });
});
server.listen(8799, () => console.log('waiting for og.png on :8799'));
