import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
page.setDefaultTimeout(120000);
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(6, -60);
  h.setCamera(Math.PI + 0.75, 0.16, 3.2);
  h.holdBlock(true);
  h.tickN(6, { block: true });
});
await page.evaluate(() => new Promise((r) => { let n = 14; const s = () => (--n <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/10_bloqueo.png', timeout: 120000 });
console.log('shot: 10_bloqueo');
await browser.close();
server.kill();
process.exit(0);
