// Capturas automatizadas: arranca el build, carga el juego en Chromium
// headless y fotografía día, atardecer, noche y combate.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });

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
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 30000 });
await page.waitForTimeout(1500);

// espera a que se PRESENTEN frames nuevos tras un cambio (swiftshader es lento)
async function waitFrames(n = 3) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let left = count;
        function step() {
          if (--left <= 0) resolve(null);
          else requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }),
    n,
  );
}

async function shot(name, fn) {
  if (fn) await page.evaluate(fn);
  await waitFrames(4);
  await page.evaluate(() => window.__colosos.setPaused(true));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `shots/${name}.png`, timeout: 120000 });
  await page.evaluate(() => window.__colosos.setPaused(false));
  console.log('shot:', name);
}

// 1. Mediodía: pradera abierta mirando a lo largo del lomo
await shot('01_dia', () => {
  const h = window.__colosos;
  h.setTimeOfDay(0.46);
  h.teleport(6, -60);
  h.setCamera(Math.PI * 1.02, 0.3);
  h.tickN(2);
});

// 2. En marcha: corriendo por la pradera
await page.evaluate(() => {
  const h = window.__colosos;
  h.tickN(12, { moveZ: 1, moveX: -0.08 });
});
await shot('02_dia_marcha');

// 3. Atardecer sobre el flanco, mirando a la niebla
await shot('03_atardecer', () => {
  const h = window.__colosos;
  h.setTimeOfDay(0.72);
  h.teleport(-26, -14);
  h.setCamera(Math.PI * 0.5, 0.18);
  h.tickN(2);
});

// 4. Noche: estrellas sobre la espina
await shot('04_noche', () => {
  const h = window.__colosos;
  h.setTimeOfDay(0.93);
  h.teleport(-14, 46);
  h.setCamera(2.35, 0.52);
  h.tickN(2);
});

// 5. Combate: el lobo del campamento viene a por ti
await shot('05_combate_aggro', () => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(14, -72);
  h.setCamera(Math.PI * 0.85, 0.48);
  h.tickN(26);
});

// 6. El golpe: flash + partículas + número de daño
await shot('06_combate_golpe', () => {
  const h = window.__colosos;
  h.tickN(3, { attack: true });
  h.tickN(2);
});

await browser.close();
server.kill();
process.exit(0);
