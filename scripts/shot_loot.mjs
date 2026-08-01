// Verificación: el haz dorado del arma caída, y el HUD tras recogerla.
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
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const frames = (n) => page.evaluate((c) => new Promise((r) => { let k = c; const s = () => (--k <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n);
async function snap(name) {
  await frames(5);
  await page.evaluate(() => window.__colosos.setPaused(true));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `shots/${name}.png`, timeout: 120000 });
  await page.evaluate(() => window.__colosos.setPaused(false));
  console.log('shot:', name);
}
// mata al lobo del campamento a base de ticks con ataque
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  const wolf = h.sim.mobs()[0];
  const p = h.sim.player;
  for (let t = 0; t < 300 && wolf.alive; t++) {
    p.x = wolf.x; p.z = wolf.z; p.y = wolf.y;
    p.yaw = Math.atan2(wolf.x - p.x, wolf.z - p.z);
    p.hp = p.maxHp;
    h.tickN(1, { attack: t % 2 === 0 });
  }
  // aléjate un paso para ver el haz
  const d = h.sim.drops[0];
  if (d) {
    h.teleport(d.x + 3.5, d.z + 2);
    h.setCamera(Math.atan2(d.x - p.x, d.z - p.z) + Math.PI, 0.35, 5.5);
  }
});
await snap('19_loot_haz');
// recógela y mira el HUD con el slot X nuevo
await page.evaluate(() => {
  const h = window.__colosos;
  const d = h.sim.drops[0];
  if (d) h.teleport(d.x, d.z);
  h.tickN(3);
});
await snap('20_loot_recogida');
await browser.close();
server.kill();
process.exit(0);
