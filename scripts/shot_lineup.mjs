// Alineación de verificación: goblin y yeti plantados delante del jugador.
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
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.5);
  h.teleport(6, -60);
  const p = h.sim.player;
  const put = (m, dx, dz) => {
    m.x = p.x + dx; m.z = p.z + dz;
    m.homeX = m.x; m.homeZ = m.z; // que no huyan por el leash
    m.px = m.x; m.pz = m.z;
  };
  const goblin = h.sim.mobs().find((m) => m.templateId === 'goblin');
  const yeti = h.sim.mobs().find((m) => m.templateId === 'yeti');
  const spider = h.sim.mobs().find((m) => m.templateId === 'arana');
  const boar = h.sim.mobs().find((m) => m.templateId === 'jabali');
  put(goblin, -2.6, 3.2);
  put(yeti, 1.5, 4.2);
  put(spider, -4.8, 2.2);
  put(boar, 4.6, 2.6);
  h.setCamera(Math.PI * 1.0, 0.24, 8);
  h.tickN(2);
});
await page.evaluate(() => new Promise((r) => { let n = 8; const s = () => (--n <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/27_lineup.png', timeout: 120000 });
console.log('shot: 27_lineup');
await browser.close();
server.kill();
process.exit(0);
