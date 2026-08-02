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
await page.goto('http://localhost:4173/?clase=medula&clase2=fumarel');
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
  await frames(4);
  await page.evaluate(() => window.__colosos.setPaused(true));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `shots/${name}.png`, timeout: 120000 });
  await page.evaluate(() => window.__colosos.setPaused(false));
  console.log('shot:', name);
}
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(12, -74);
  h.setCamera(Math.PI * 0.82, 0.4, 6.5);
  h.tickN(24); // el lobo viene
});
await snap('17_set_espada');
await page.evaluate(() => {
  const h = window.__colosos;
  h.tickN(2, { swap: true }); // ¡cambio de arma!
  h.tickN(3);
  h.tickN(2, { ability: true }); // y chispa inmediata: el combo
  h.tickN(4);
});
await snap('18_set_baston_combo');
await browser.close();
server.kill();
process.exit(0);
