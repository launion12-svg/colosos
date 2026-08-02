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
const page = await browser.newPage({ viewport: { width: 1178, height: 813 } });
page.setDefaultTimeout(120000);
await page.goto('http://localhost:4173/?clase=medula&clase2=fumarel');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.5);
  h.teleport(6, -60);
  const p = h.sim.player;
  p.ownedWeapons.push('vigia', 'cordelero');
  p.weaponRarity.vigia = 1; // mágica: acero azulado
  p.weaponRarity.cordelero = 2; // rara: dorada
  p.weaponRarity.medula = 0; // en mano: espada de madera (marrón)
  p.weaponRarity.fumarel = 1;
  h.tickN(2);
});
await page.keyboard.press('KeyI');
await page.evaluate(
  () =>
    new Promise((r) => {
      let n = 6;
      const s = () => (--n <= 0 ? r() : requestAnimationFrame(s));
      requestAnimationFrame(s);
    }),
);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/32_rarezas_inv.png', timeout: 120000 });
console.log('shot: 32_rarezas_inv');
await browser.close();
server.kill();
process.exit(0);
