// Verificación de la quinta clase y del cambio de arma principal:
// 1) el corro de selección con cinco, 2) el Hachero empuñando el hacha,
// 3) el inventario tras arrastrar un arma al hueco de la mano principal.
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
page.setDefaultTimeout(120000);
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

// --- 1) selección con cinco ---
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__selectReady === true, null, { timeout: 60000 });
await frames(8);
await page.evaluate(() => {
  window.__colososSelect.paused = true;
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/22_seleccion_cinco.png', timeout: 120000 });
await page.evaluate(() => {
  window.__colososSelect.paused = false;
  window.__colososSelect.pick('hachero');
});
await page.fill('#select-name-input', 'Sergio');
await frames(10);
await page.evaluate(() => {
  window.__colososSelect.paused = true;
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/23_seleccion_hachero.png', timeout: 120000 });

// --- 2) el Hachero en el mundo, con el hacha en la mano ---
await page.goto('http://localhost:4173/?clase=hachero');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.42);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.2, 5.5);
  for (const m of h.sim.mobs()) {
    m.x = h.sim.player.x + 70;
    m.z = h.sim.player.z + 70;
  }
});
await frames(10); // la cámara se asienta
await page.evaluate(() => {
  window.__colosos.tickN(4, { attack: true });
  window.__colosos.setPaused(true);
});
await frames(2);
await page.screenshot({ path: 'shots/24_hachero_mundo.png', timeout: 120000 });
await page.evaluate(() => window.__colosos.setPaused(false));

// --- 3) arrastrar del zurrón a la mano principal ---
const cambio = await page.evaluate(async () => {
  const h = window.__colosos;
  h.sim.player.ownedWeapons.push('vigia', 'cordelero', 'fumarel');
  h.tickN(2);
  return { antes: h.sim.player.setA, mano: h.sim.activeSetId };
});
await page.keyboard.press('KeyI');
await frames(4);
// simula el arrastre real: dragstart en la celda del zurrón, drop en la mano
const soltado = await page.evaluate(() => {
  const cell = document.querySelector('#inventory .inv-cell.clickable[data-id="vigia"]');
  const slot = document.querySelector('#inventory .drop-slot[data-slot="A"]');
  if (!cell || !slot) return { error: 'sin celda o sin hueco' };
  const dt = new DataTransfer();
  cell.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  slot.dispatchEvent(
    new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }),
  );
  slot.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const h = window.__colosos;
  return { setA: h.sim.player.setA, mano: h.sim.activeSetId, zurron: h.sim.player.ownedWeapons };
});
await frames(4);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/25_inventario_arrastre.png', timeout: 120000 });
// el cuerpo también tiene que haber cambiado: cierra el zurrón y mira
await page.evaluate(() => window.__colosos.setPaused(false));
await page.keyboard.press('KeyI');
await frames(6);
const cuerpo = await page.evaluate(() => {
  const h = window.__colosos;
  h.setPaused(true);
  return { vista: h.renderer.activeDef?.id, mano: h.sim.activeSetId };
});
await frames(2);
await page.screenshot({ path: 'shots/26_cuerpo_cambiado.png', timeout: 120000 });
console.log('cuerpo ->', JSON.stringify(cuerpo));
console.log('mano antes ->', JSON.stringify(cambio));
console.log('tras soltar ->', JSON.stringify(soltado));
console.log(
  'shots: 22_seleccion_cinco, 23_seleccion_hachero, 24_hachero_mundo, 25_inventario_arrastre',
);
await browser.close();
server.kill();
process.exit(0);
