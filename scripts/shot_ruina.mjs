// El Baluarte Roto: la primera arquitectura construida con piezas modulares.
// Vistas de fuera, del patio, del interior de la torre y del portón.
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
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
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
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, {
  timeout: 120000,
});
await page.waitForTimeout(2000);

// [nombre, x, z, yaw, pitch, distancia, hora]
const vistas = [
  ['41_ruina_aire', 0, -50, Math.PI, 0.66, 52, 0.35],
  ['42_ruina_porton', 0, -42, Math.PI, 0.3, 17, 0.32],
  ['43_ruina_patio', 0, -56, Math.PI, 0.42, 15, 0.4],
  ['44_ruina_torre', 0, -73, Math.PI, 0.34, 11, 0.45],
  ['45_ruina_muralla', -14, -70, Math.PI * 0.5, 0.3, 18, 0.62],
  ['47_ruina_desdedentro', 0, -54, 0, 0.12, 10, 0.5],
];
for (const [nombre, x, z, yaw, pitch, dist, hora] of vistas) {
  await page.evaluate(
    ({ x, z, yaw, pitch, dist, hora }) => {
      const h = window.__colosos;
      h.setTimeOfDay(hora);
      h.teleport(x, z);
      h.setCamera(yaw, pitch, dist);
      for (const m of h.sim.mobs()) {
        m.x = h.sim.player.x + 500;
        m.z = h.sim.player.z + 500;
        m.homeX = m.x;
        m.homeZ = m.z;
      }
    },
    { x, z, yaw, pitch, dist, hora },
  );
  await frames(16);
  await page.evaluate(() => window.__colosos.setPaused(true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${nombre}.png`, timeout: 240000 });
  await page.evaluate(() => window.__colosos.setPaused(false));
}

// ¿Se puede entrar de verdad? Se camina desde el bosque hacia el portón.
const paseo = await page.evaluate(async () => {
  const h = window.__colosos;
  h.teleport(0, -24); // al sur del baluarte, abajo en el bosque
  await new Promise((r) => requestAnimationFrame(r));
  const inicio = { x: h.sim.player.x, y: h.sim.player.y, z: h.sim.player.z };
  for (let t = 0; t < 300; t++) h.sim.tick({ ...h.idleInput, moveZ: -1 });
  return {
    inicio,
    fin: { x: h.sim.player.x, y: h.sim.player.y, z: h.sim.player.z },
  };
});
console.log('paseo ->', JSON.stringify(paseo));

const datos = await page.evaluate(() => {
  const h = window.__colosos;
  let instancias = 0;
  let mallas = 0;
  h.renderer.scene.traverse((o) => {
    if (o.isInstancedMesh) {
      instancias += o.count;
      mallas++;
    }
  });
  return {
    especies: mallas,
    piezas: instancias,
    triangulos: h.renderer.renderer.info.render.triangles,
    llamadas: h.renderer.renderer.info.render.calls,
  };
});
console.log('escena ->', JSON.stringify(datos));
await browser.close();
server.kill();
process.exit(0);
