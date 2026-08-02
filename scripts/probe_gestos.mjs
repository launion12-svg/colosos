// Los gestos nuevos traídos del pack de KayKit: que existan en los cinco
// modelos y que salgan cuando toca (beber, recoger, saltar).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4178', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.setDefaultTimeout(180000);
const errores = [];
page.on('pageerror', (e) => errores.push(String(e.message)));
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
await page.goto('http://localhost:4178/?clase=medula&clase2=fumarel');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 90000 });
await page.waitForTimeout(1500);

const res = await page.evaluate(async () => {
  const h = window.__colosos;
  const p = h.sim.player;
  h.teleport(14, -82);
  for (const m of h.sim.mobs()) {
    m.x = p.x + 300;
    m.z = p.z + 300;
    m.homeX = m.x;
    m.homeZ = m.z;
  }
  const v = h.renderer.views.get(p.id);
  const tiene = ['Use_Item', 'PickUp', 'Jump_Start', 'Jump_Land', 'Spawn_Ground'].map(
    (n) => `${n}:${v.has(n)}`,
  );
  // beber
  p.potions = 2;
  p.hp = 20;
  p.potionCooldown = 0;
  h.tickN(1, { drink: true });
  const alBeber = v.playing();
  // recoger un arma del suelo (en otra partida limpia de gestos, que si no
  // el trago sigue protegido y tapa la medición)
  h.renderer.gestoHasta = -99;
  h.sim.drops.push({ id: 4242, x: p.x, y: p.y, z: p.z, setId: 'vigia', rarity: 0 });
  h.tickN(1);
  const alRecoger = v.playing();
  return { tiene, alBeber, alRecoger };
});
// y el salto, por el camino real del sim
const alSaltar = await page.evaluate(() => {
  const h = window.__colosos;
  h.renderer.gestoHasta = -99;
  h.tickN(1, { jump: true });
  return h.renderer.views.get(h.sim.player.id)?.playing();
});
console.log('animaciones presentes ->', JSON.stringify(res.tiene));
console.log(
  'al beber ->',
  res.alBeber,
  '| al recoger ->',
  res.alRecoger,
  '| al saltar ->',
  alSaltar,
);
console.log('errores ->', errores.length ? errores.slice(0, 3) : 'ninguno');
await browser.close();
server.kill();
process.exit(0);
