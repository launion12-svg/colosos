// Hoja de contactos del kit de mazmorra: cada pieza a la vista, con la retícula
// de 4 m marcada. Sirve para dejar de adivinar qué muro tiene hueco de verdad y
// cuál es macizo. Se monta sobre la escena ya cargada, sin tocar el juego: se
// esconden las instancias del baluarte y se colocan copias sueltas en el patio,
// que es la única superficie perfectamente llana del mapa.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const server = spawn('npx', ['vite', 'preview', '--port', '4176', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
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
await page.goto('http://localhost:4176/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, {
  timeout: 120000,
});
await page.waitForTimeout(1500);

const filas = await page.evaluate(() => {
  const h = window.__colosos;
  const scene = h.renderer.scene;
  // el patio del baluarte es la única superficie perfectamente llana: se
  // aterriza ahí y se usa su cota como mesa de exposición
  h.teleport(0, -70);
  const cota = h.sim.player.y;
  for (const m of h.sim.mobs()) {
    m.x = 900;
    m.z = 900;
    m.homeX = m.x;
    m.homeZ = m.z;
    m.alive = false;
  }

  const piezas = [];
  let unaMalla = null;
  scene.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && !unaMalla) unaMalla = o;
    if (o.isInstancedMesh && o.name.startsWith('kit_')) {
      piezas.push([o.name.slice(4), o.geometry, o.material]);
      o.visible = false; // fuera el baluarte, que estorba la vista
    }
  });
  piezas.sort((a, b) => a[0].localeCompare(b[0]));
  const Malla = unaMalla.constructor; // THREE.Mesh sin importar THREE

  const COLS = 7;
  const PASO = 8;
  const orden = [];
  piezas.forEach(([nombre, geo, mat], i) => {
    const cx = (i % COLS) - (COLS - 1) / 2;
    const cz = Math.floor(i / COLS) - 2;
    const m = new Malla(geo, mat);
    m.position.set(cx * PASO, cota, -70 + cz * PASO);
    m.frustumCulled = false;
    scene.add(m);
    orden.push(`${Math.floor(i / COLS) + 1}.${(i % COLS) + 1} ${nombre}`);
  });
  return orden;
});

// el jugador se planta en el centro de la exposición y la cámara mira desde alto
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.42);
  h.teleport(0, -70);
  h.setCamera(Math.PI, 0.5, 42);
});
await frames(20);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/46_kit_piezas.png', timeout: 240000 });

console.log('orden de lectura (fila.columna):');
console.log(filas.join('\n'));
await browser.close();
server.kill();
process.exit(0);
