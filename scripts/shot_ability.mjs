// Verificación visual: la chispa de Fumarel en vuelo y la barra de acción.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4173/?clase=fumarel');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const frames = (n) =>
  page.evaluate(
    (c) =>
      new Promise((r) => {
        let k = c;
        const s = () => (--k <= 0 ? r() : requestAnimationFrame(s));
        requestAnimationFrame(s);
      }),
    n,
  );
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.35, 6);
  h.tickN(20); // que el lobo venga
  h.tickN(2, { ability: true }); // lanza la chispa
  h.tickN(4); // en vuelo
});
await frames(4);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/14_chispa.png', timeout: 120000 });
console.log('shot: 14_chispa');
await browser.close();
server.kill();
process.exit(0);
