// El mapa nuevo: mesetas escalonadas, paredes de roca con estratos y el lomo
// poblado con el pack de naturaleza. Tres vistas para juzgarlo.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const frames = (n) =>
  page.evaluate((c) => new Promise((r) => { let k = c; const s = () => (--k <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n);
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 120000 });
await page.waitForTimeout(2000);

const vistas = [
  ['38_mapa_bosque', 8, -70, 0.25, 12],
  ['39_mapa_terrazas', -16, -40, 0.5, 20],
  ['40_mapa_cabeza', 4, 60, 0.3, 14],
];
for (const [nombre, x, z, pitch, dist] of vistas) {
  await page.evaluate(({ x, z, pitch, dist }) => {
    const h = window.__colosos;
    h.setTimeOfDay(0.4);
    h.teleport(x, z);
    h.setCamera(Math.PI * 0.15, pitch, dist);
    for (const m of h.sim.mobs()) { m.x = h.sim.player.x + 400; m.z = h.sim.player.z + 400; m.homeX = m.x; m.homeZ = m.z; }
  }, { x, z, pitch, dist });
  await frames(14);
  await page.evaluate(() => window.__colosos.setPaused(true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${nombre}.png`, timeout: 240000 });
  await page.evaluate(() => window.__colosos.setPaused(false));
}
const datos = await page.evaluate(() => {
  const h = window.__colosos;
  let instancias = 0, mallas = 0;
  h.renderer.scene.traverse((o) => { if (o.isInstancedMesh) { instancias += o.count; mallas++; } });
  const porTipo = {};
  h.renderer.scene.traverse((o) => { if (o.isInstancedMesh) porTipo[o.geometry.name || o.name || '?'] = o.count; });
  return { porTipo, especies: mallas, piezas: instancias, triangulos: h.renderer.renderer.info.render.triangles, llamadas: h.renderer.renderer.info.render.calls };
});
console.log('mapa ->', JSON.stringify(datos));
console.log('shots: 38_mapa_bosque, 39_mapa_terrazas, 40_mapa_cabeza');
await browser.close(); server.kill(); process.exit(0);
