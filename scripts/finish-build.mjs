// Copies dist/index.html to ./index.html and stamps it with a hash of the sources, so CI can
// tell whether the committed build is up to date (`--check`) without a byte-for-byte compare.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../..');
const files = [];
const walk = d => readdirSync(d).sort().forEach(f => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk(join(root, 'src'));
files.push(join(root, 'package-lock.json'), join(root, 'vite.config.js'));
const h = createHash('sha256');
for (const f of files) { if (/\.test\.js$/.test(f)) continue; h.update(relative(root, f)); h.update(readFileSync(f)); }
const stamp = h.digest('hex').slice(0, 16);
const tag = `<meta name="source-hash" content="${stamp}">`;

if (process.argv.includes('--check')) {
  const built = readFileSync(join(root, 'index.html'), 'utf8');
  if (!built.includes(tag)) { console.error(`index.html is out of date (sources hash ${stamp}). Run npm run build and commit it.`); process.exit(1); }
  console.log(`index.html matches the sources (${stamp})`);
} else {
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8').replace('<head>', `<head>\n${tag}`);
  writeFileSync(join(root, 'index.html'), html);
  console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB, sources ${stamp})`);
}
