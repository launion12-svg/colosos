// La guarnición saliendo del baluarte. Tres instantes de la misma persecución:
// dentro del patio, cruzando el portón, y ya encima del héroe. Es la prueba
// visual de que el pathfinding funciona — antes se habrían quedado pegados a
// la muralla mirando a la pared.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const server = spawn('npx', ['vite', 'preview', '--port', '4177', '--strictPort'], {
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
await page.goto('http://localhost:4177/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 120000 });
await page.waitForTimeout(2000);

const RX = 0;
const RZ = -70;

// el héroe se planta fuera del portón, sobre la falda, y espera
await page.evaluate(
  ({ RX, RZ }) => {
    const h = window.__colosos;
    h.setTimeOfDay(0.4);
    h.teleport(RX, RZ + 30);
    h.setCamera(Math.PI, 0.42, 30);
  },
  { RX, RZ },
);
await frames(14);

const instantes = [
  ['48_guarnicion_dentro', 0],
  ['49_guarnicion_porton', 70],
  ['50_guarnicion_encima', 90],
];
const informe = [];
for (const [nombre, ticks] of instantes) {
  if (ticks > 0) {
    const estado = await page.evaluate(
      ({ n, RX, RZ }) => {
        const h = window.__colosos;
        for (let t = 0; t < n; t++) {
          h.sim.player.x = RX;
          h.sim.player.z = RZ + 30;
          h.sim.player.hp = h.sim.player.maxHp;
          h.tickN(1);
        }
        // ¿dónde está cada bicho de la guarnición respecto al portón (z=RZ+22)?
        return h.sim
          .mobs()
          .filter((m) => m.alive && Math.abs(m.x - RX) < 40 && Math.abs(m.z - RZ) < 40)
          .map((m) => ({
            id: m.id,
            estado: m.aiState,
            z: +(m.z - RZ).toFixed(1),
            dist: +Math.hypot(m.x - RX, m.z - (RZ + 30)).toFixed(1),
          }));
      },
      { n: ticks, RX, RZ },
    );
    informe.push([nombre, estado]);
  }
  await frames(12);
  await page.evaluate(() => window.__colosos.setPaused(true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${nombre}.png`, timeout: 240000 });
  await page.evaluate(() => window.__colosos.setPaused(false));
}

for (const [nombre, estado] of informe) {
  console.log(nombre, '->', JSON.stringify(estado));
}
await browser.close();
server.kill();
process.exit(0);
