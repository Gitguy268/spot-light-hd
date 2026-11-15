// Smoke test, from file:// like a double-click: every place x every mode, the end-of-game treat,
// photo mode, cameras, the 8-bit look and the quality presets. Fails on console errors, failed
// console.assert self-checks, or a Spot who never moves.
// GPU=1 uses the real GPU (local); without it, SwiftShader at Low quality (CI).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gpu = !!process.env.GPU;
const args = gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, acceptDownloads: true });
const problems = [];
page.on('console', m => {
  if (m.type() === 'assert' || (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_INTERNET|ERR_NAME/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.setDefaultTimeout(gpu ? 30000 : 180000);

await page.goto(pathToFileURL(join(root, 'index.html')).href);
await page.waitForFunction(() => window.__spot && document.querySelector('#loading.done'));
const H = (fn, ...a) => page.evaluate(([f, x]) => window.__spotHD[f](...x), [fn, a]);
const state = () => page.evaluate(() => window.__spot());
if (!gpu) await H('setQuality', 'low');

const wiggle = async (n = 14) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; await page.mouse.move(550 + Math.cos(a) * 320, 380 + Math.sin(a * 2) * 160, { steps: 3 }); await page.waitForTimeout(gpu ? 50 : 120); } };
const modes = ['dodge', 'endless', 'lure', 'fetch', 'zoomies', 'hide', 'relax'];
let runs = 0;
for (const room of ['living', 'garden', 'cabin']) {
  await H('setRoom', room);
  for (const mode of modes) {
    await page.click(`[data-mode="${mode}"]`);
    const a = await state();
    await wiggle();
    const b = await state();
    if (b.mode !== mode || b.room !== room) problems.push(`${room}/${mode}: wrong state ${b.mode}/${b.room}`);
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.05 && b.state !== 'sleep') problems.push(`${room}/${mode}: Spot did not move (${b.state})`);
    await page.keyboard.press('Escape');
    if (mode !== 'relax' && !(await page.isVisible('#pause'))) problems.push(`${room}/${mode}: Esc did not pause`);
    if (await page.isVisible('#pause')) await page.click('#pause [data-act="title"]'); else await H('toTitle');
    runs++;
  }
}

// a game that runs out of time ends with a treat, then the result card
await page.click('[data-mode="lure"]');
await H('endNow');
await page.waitForSelector('#over:not(.hidden)', { timeout: gpu ? 15000 : 90000 });
const overTitle = await page.textContent('#overTitle');
if (!overTitle) problems.push('result card has no title');
await page.click('#over [data-act="title"]');

// photo mode, cameras, 8-bit, the laser toggle and a saved photo
await page.click('[data-mode="endless"]');
await wiggle(6);
for (const cam of ['follow', 'low', 'top', 'room']) { await H('setCamera', cam); await page.waitForTimeout(300); }
await H('setRetro', true); await page.waitForTimeout(300); await H('setRetro', false);
await page.keyboard.press(' ');
await page.waitForTimeout(gpu ? 800 : 2500);
if ((await state()).dot.on) problems.push('Space did not turn the laser off');
await page.keyboard.press(' ');
await page.keyboard.press('p');
if (!(await page.isVisible('#photoBar'))) problems.push('photo mode did not open');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#pSave')]);
if (!download.suggestedFilename().endsWith('.png')) problems.push('photo is not a PNG');
await page.click('#pBack');

// quality presets rebuild the scene without errors
if (gpu) for (const q of ['low', 'medium', 'high', 'ultra', 'high']) { await H('setQuality', q); await wiggle(4); }
const fps = (await state()).fps;
await browser.close();
if (problems.length) { console.error([...new Set(problems)].join('\n')); process.exit(1); }
console.log(`ok: ${runs} runs (3 places x 7 modes), treat + result card, photo saved, cameras, 8-bit${gpu ? `, 4 quality presets, ${fps.toFixed(0)} fps` : ''}; no console errors, self-checks pass`);
