// Marcha lateral: que Q/E muevan de lado SIN girar al personaje, y que la
// animación que sale sea la de andar de lado (no la de correr de frente).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4177', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const frames = (n) =>
  page.evaluate((c) => new Promise((r) => { let k = c; const s = () => (--k <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n);
await page.goto('http://localhost:4177/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 90000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const h = window.__colosos;
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.2, 7);
  for (const m of h.sim.mobs()) { m.x = h.sim.player.x + 300; m.z = h.sim.player.z + 300; m.homeX = m.x; m.homeZ = m.z; }
  h.sim.player.yaw = 0;
});
await frames(8);
const res = await page.evaluate(async () => {
  const h = window.__colosos;
  const p = h.sim.player;
  const prueba = (inp, etiqueta) => {
    p.yaw = 0; p.vx = 0; p.vz = 0;
    h.tickN(12, inp);
    return { caso: etiqueta, yaw: +p.yaw.toFixed(2), vx: +p.vx.toFixed(1), vz: +p.vz.toFixed(1) };
  };
  const lateral = prueba({ moveX: 1, faceYaw: 0 }, 'de lado con Q/E (mirando a +Z)');
  const anim = h.renderer.views.get(p.id)?.playing();
  const normal = prueba({ moveX: 1 }, 'de lado con A/D (sin encarar)');
  const atras = prueba({ moveZ: -1, faceYaw: 0 }, 'hacia atrás encarado');
  return { lateral, anim, normal, atras };
});
// Ahora con la tecla DE VERDAD: se mantiene pulsada y el juego corre solo,
// que es la única forma de ver qué animación sale al andar de lado.
await page.evaluate(() => { window.__colosos.sim.player.yaw = 0; });
await page.keyboard.down('KeyE');
await frames(8);
const conTecla = await page.evaluate(() => {
  const h = window.__colosos;
  return {
    anim: h.renderer.views.get(h.sim.player.id)?.playing(),
    yaw: +h.sim.player.yaw.toFixed(2),
    velocidad: +Math.hypot(h.sim.player.vx, h.sim.player.vz).toFixed(1),
  };
});
await page.keyboard.up('KeyE');
await page.keyboard.down('KeyQ');
await frames(8);
const conQ = await page.evaluate(() => ({
  anim: window.__colosos.renderer.views.get(window.__colosos.sim.player.id)?.playing(),
}));
await page.keyboard.up('KeyQ');
await page.keyboard.down('KeyS');
await page.keyboard.down('KeyE');
await frames(8);
const conS = await page.evaluate(() => ({
  anim: window.__colosos.renderer.views.get(window.__colosos.sim.player.id)?.playing(),
}));
await page.keyboard.up('KeyS');
await page.keyboard.up('KeyE');
const animFinal = conTecla.anim;
console.log(JSON.stringify(res, null, 1));
console.log('con E pulsada ->', JSON.stringify(conTecla));
console.log('con Q pulsada (izquierda) ->', JSON.stringify(conQ));
console.log('con S+E (atrás-derecha encarado) ->', JSON.stringify(conS));
void animFinal;
await browser.close(); server.kill(); process.exit(0);
