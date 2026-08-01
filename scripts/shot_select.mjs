// Capturas de la pantalla de selección: campamento en reposo y héroe elegido.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__selectReady === true, null, { timeout: 60000 });
const frames = (n) => page.evaluate((c) => new Promise((r) => { let k = c; const s = () => (--k <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n);
await frames(6);
await page.evaluate(() => { window.__colososSelect.paused = true; });
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/12_seleccion.png', timeout: 120000 });
console.log('shot: 12_seleccion');
await page.evaluate(() => {
  window.__colososSelect.paused = false;
  window.__colososSelect.pick('fumarel');
});
await page.fill('#select-name-input', 'Sergio');
await frames(10);
await page.evaluate(() => { window.__colososSelect.paused = true; });
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/13_seleccion_fumarel.png', timeout: 120000 });
console.log('shot: 13_seleccion_fumarel');
await browser.close();
server.kill();
process.exit(0);
