// Verificación visual: el básico del mago ya no es un bastonazo — sale una
// brasa de niebla volando. Captura el básico y la habilidad para compararlos.
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
await page.goto('http://localhost:4173/?clase=fumarel');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const frames = (n) =>
  page.evaluate((c) => new Promise((r) => { let k = c; const s = () => (--k <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n);

// --- básico: click izquierdo ---
const info = await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.3, 7.5);
  h.tickN(10);
  // el lobo, plantado a 10 m: así se ve la brasa cruzando el aire
  const p = h.sim.player;
  p.yaw = Math.PI * 0.15 + Math.PI; // de espaldas a la cámara: el disparo se aleja
  const vivos = h.sim.mobs().filter((m) => m.alive);
  for (const m of vivos) { m.x = p.x + 60; m.z = p.z + 60; } // despeja la manada
  const mob = vivos[0];
  mob.x = p.x + Math.sin(p.yaw) * 10;
  mob.z = p.z + Math.cos(p.yaw) * 10;
  const kinds = [];
  const evs = h.tickN(4, { attack: true }) ?? [];
  for (const e of evs) if (e.type === 'projectileSpawned') kinds.push(e.kind);
  h.tickN(3);
  h.setPaused(true); // congela el sim: si no, los frames lentos se comen el vuelo
  return { kinds, enVuelo: h.sim.projectiles.map((q) => q.kind) };
});
await frames(4);
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/20_mago_basico.png', timeout: 120000 });
console.log('básico ->', JSON.stringify(info));

// --- habilidad: tecla 1 ---
await page.evaluate(() => {
  const h = window.__colosos;
  h.setPaused(false);
  h.tickN(6);
  const p = h.sim.player;
  p.yaw = Math.PI * 0.15 + Math.PI;
  const vivos = h.sim.mobs().filter((m) => m.alive);
  for (const m of vivos) { m.x = p.x + 60; m.z = p.z + 60; }
  const mob = vivos[0];
  mob.x = p.x + Math.sin(p.yaw) * 10;
  mob.z = p.z + Math.cos(p.yaw) * 10;
  h.tickN(7, { ability: true });
  h.tickN(3);
  h.setPaused(true);
});
await frames(4);
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/21_mago_habilidad.png', timeout: 120000 });
console.log('shots: 20_mago_basico, 21_mago_habilidad');
await browser.close();
server.kill();
process.exit(0);
