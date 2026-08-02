// La barra de volumen, en su sitio del HUD.
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
page.setDefaultTimeout(180000);
await page.goto('http://localhost:4173/?clase=vigia');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 90000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.4);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.2, 6);
});
await page.evaluate(
  () =>
    new Promise((r) => {
      let n = 10;
      const s = () => (--n <= 0 ? r() : requestAnimationFrame(s));
      requestAnimationFrame(s);
    }),
);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/33_volumen.png', timeout: 180000 });
const caja = await page.evaluate(() => {
  const el = document.getElementById('music-vol');
  const r = el?.getBoundingClientRect();
  return { existe: !!el, valor: el?.value, visible: !!r && r.width > 40 };
});
console.log('barra ->', JSON.stringify(caja));
await browser.close();
server.kill();
process.exit(0);
