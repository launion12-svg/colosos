// El bestiario en pantalla: pack de arañas, goblins y el yeti jefe.
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
await page.goto('http://localhost:4173/?clase=medula');
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
async function snap(name) {
  await frames(5);
  await page.evaluate(() => window.__colosos.setPaused(true));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `shots/${name}.png`, timeout: 120000 });
  await page.evaluate(() => window.__colosos.setPaused(false));
  console.log('shot:', name);
}
// 1. pack de arañas viniendo a por ti
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(16, -97);
  h.setCamera(Math.PI * 0.05, 0.32, 7);
  h.tickN(20);
});
await snap('24_pack_aranas');
// 2. el yeti de la cabeza
await page.evaluate(() => {
  const h = window.__colosos;
  h.teleport(0, 101);
  h.setCamera(Math.PI * 1.0, 0.42, 4.5);
  h.tickN(10);
});
await snap('25_yeti');
await browser.close();
server.kill();
process.exit(0);
