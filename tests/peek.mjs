// Quick visual check during development: screenshots of the title and a game. Not run in CI.
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp';
const [room = 'living', cam = 'room', time = 'evening', mode = 'dodge', quality = 'high'] = process.argv.slice(3);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', m => { if (['error', 'assert', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
const t0 = Date.now();
await page.goto(pathToFileURL(join(root, 'index.html')).href);
await page.waitForFunction(() => window.__spot && document.querySelector('#loading.done'), null, { timeout: 60000 });
console.log('loaded in', Date.now() - t0, 'ms');
await page.evaluate(([r, c, t, q]) => { window.__spotHD.setQuality(q); window.__spotHD.setRoom(r); window.__spotHD.setCamera(c); window.__spotHD.setTime(t); }, [room, cam, time, quality]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/peek-${room}-${cam}-${time}-title.png` });
await page.evaluate(m => window.__spotHD.startGame(m), mode);
for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; await page.mouse.move(640 + Math.cos(a) * 300, 430 + Math.sin(a * 2) * 160, { steps: 3 }); await page.waitForTimeout(50); }
await page.screenshot({ path: `${out}/peek-${room}-${cam}-${time}-play.png` });
console.log(JSON.stringify(await page.evaluate(() => window.__spot())));
console.log(logs.slice(0, 15).join('\n'));
await browser.close();
