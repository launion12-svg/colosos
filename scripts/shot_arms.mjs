// Verificación rápida del arreglo de pitch: una captura casi cenital.
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
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 30000 });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.46);
  h.teleport(6, -60);
  h.setCamera(Math.PI * 0.25, 0.32, 3.6); // vista frontal-lateral: espada y escudo visibles
  h.tickN(2);
});
await page.evaluate(
  () =>
    new Promise((r) => {
      let n = 16;
      const step = () => (--n <= 0 ? r() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    }),
);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/09_espada_escudo.png', timeout: 120000 });
console.log('shot: 09_espada_escudo');

await browser.close();
server.kill();
process.exit(0);
