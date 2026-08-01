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
await page.goto('http://localhost:4173/?clase=vigia');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(14, -84);
  h.setCamera(Math.PI * 0.92, 0.3, 5.5);
  h.tickN(12); // el lobo se acerca
  h.tickN(2, { attack: true }); // tensa y dispara
  h.tickN(2); // flecha en vuelo
});
await page.evaluate(() => new Promise((r) => { let n = 5; const s = () => (--n <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/21_arquera.png', timeout: 120000 });
console.log('shot: 21_arquera');
await browser.close();
server.kill();
process.exit(0);
