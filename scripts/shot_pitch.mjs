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
  h.setCamera(Math.PI, 1.3); // pitch casi al tope: debe verse el suelo desde arriba
  h.tickN(2);
});
await page.evaluate(
  () =>
    new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
    ),
);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/07_pitch_cenital.png', timeout: 120000 });
console.log('shot: 07_pitch_cenital');

await browser.close();
server.kill();
process.exit(0);
