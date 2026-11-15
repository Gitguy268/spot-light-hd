// Makes the README pictures in docs/: screenshot.jpg (hero), places.jpg, closeup.jpg, title.jpg,
// retro.jpg and demo.webp. Uses the GPU; needs ImageMagick (magick) and img2webp.
// Run: npm run build && npm run capture
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const tmp = mkdtempSync(join(tmpdir(), 'spot-hd-capture-'));
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
await page.goto(pathToFileURL(join(root, 'index.html')).href);
await page.waitForFunction(() => window.__spot && document.querySelector('#loading.done'), null, { timeout: 90000 });
await page.evaluate(() => document.fonts.ready);
const H = (fn, ...a) => page.evaluate(([f, x]) => window.__spotHD[f](...x), [fn, a]);
const shot = (name) => page.screenshot({ path: join(tmp, name) });
const chase = async (n, r = 280, ms = 45, cx = 640, cy = 440) => {
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a * 2) * r * 0.45, { steps: 3 }); await page.waitForTimeout(ms); }
};
await H('setQuality', 'ultra');

const scene = async (room, time, cam, mode = 'endless', name, n = 40) => {
  await H('setRoom', room); await H('setTime', time); await H('setCamera', cam);
  await H('startGame', mode);
  await chase(n);
  await shot(name);
  await H('toTitle');
};
await H('setRoom', 'living'); await H('setTime', 'evening'); await page.waitForTimeout(1500); await shot('title.png');
await scene('living', 'evening', 'room', 'lure', 'hero.png', 50);
await scene('living', 'day', 'low', 'endless', 'closeup.png', 30);
await scene('garden', 'day', 'room', 'endless', 'garden.png');
await scene('cabin', 'night', 'room', 'endless', 'cabin.png');
await scene('living', 'night', 'follow', 'hide', 'night.png');
await H('setRetro', true); await scene('living', 'evening', 'room', 'dodge', 'retro.png', 20); await H('setRetro', false);

// animated demo: living room, evening, room camera, 12 fps for 6 s
await H('setRoom', 'living'); await H('setTime', 'evening'); await H('setCamera', 'room');
await page.setViewportSize({ width: 960, height: 600 });
await H('startGame', 'dodge');
await chase(20, 220, 40, 480, 330);
const frames = [];
for (let i = 0; i < 72; i++) {
  const a = i / 72 * Math.PI * 4;
  await page.mouse.move(480 + Math.cos(a) * 260, 330 + Math.sin(a * 1.5) * 130, { steps: 2 });
  const f = join(tmp, `f${String(i).padStart(3, '0')}.png`); await page.screenshot({ path: f }); frames.push(f);
  await page.waitForTimeout(30);
}
await browser.close();

const m = (...a) => execFileSync('magick', a, { stdio: 'inherit' });
m(join(tmp, 'hero.png'), '-resize', '1600x', '-quality', '84', join(docs, 'screenshot.jpg'));
m(join(tmp, 'closeup.png'), '-resize', '1440x', '-quality', '84', join(docs, 'closeup.jpg'));
m(join(tmp, 'title.png'), '-resize', '1440x', '-quality', '84', join(docs, 'title.jpg'));
m(join(tmp, 'retro.png'), '-resize', '1200x', '-quality', '86', join(docs, 'retro.jpg'));
m('montage', ...['garden', 'cabin', 'night'].map(v => join(tmp, `${v}.png`)), '-tile', '3x', '-geometry', '640x400+4+4', '-background', '#14110e', '-quality', '84', join(docs, 'places.jpg'));
const small = frames.map(f => { const o = f.replace('.png', '-s.png'); m(f, '-resize', '720x', o); return o; });
execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', '60', '-d', '83', ...small, '-o', join(docs, 'demo.webp')], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
console.log('docs/ updated');
