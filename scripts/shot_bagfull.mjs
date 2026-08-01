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
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(16, -99); // campamento de arañas: nivel 1
  h.setCamera(Math.PI * 0.1, 0.32, 7);
  h.tickN(22); // que las arañas hagan aggro -> marco de objetivo con nivel
});
// deja que el render se estabilice ANTES de disparar el aviso (swiftshader
// tarda segundos por frame y el toast solo dura 2,2 s)
await page.evaluate(() => new Promise((r) => { let n = 6; const s = () => (--n <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));
await page.evaluate(() => {
  const h = window.__colosos;
  h.setPaused(true);
  const p = h.sim.player;
  p.ownedWeapons = Array.from({ length: 10 }, (_, i) => `relleno_${i}`);
  h.sim.drops.push({ id: 900, x: p.x, y: p.y, z: p.z, setId: 'vigia', rarity: 1 });
  h.tickN(1); // emite bagFull -> toast, con el frame ya presentado
  // la captura por software tarda más que los 4 s del aviso: lo fijamos
  h.renderer.hud.toast('Zurrón lleno · Arco de caza sigue en el suelo', 120000);
});
await page.waitForTimeout(120);
await page.screenshot({ path: 'shots/33_zurron_lleno.png', timeout: 120000 });
console.log('shot: 33_zurron_lleno');
await browser.close();
server.kill();
process.exit(0);
