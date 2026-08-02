// Comprobación de la tanda: la voltereta de verdad, el ballestero con su
// ballesta y el casco que se pone y se quita.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
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

// --- el ballestero ---
await page.goto('http://localhost:4179/?clase=ballestero&clase2=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 90000 });
await page.waitForTimeout(1500);
const ballesta = await page.evaluate(() => {
  const h = window.__colosos;
  const p = h.sim.player;
  h.setTimeOfDay(0.42);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.2, 6.5);
  p.yaw = Math.PI * 0.15 + Math.PI;
  const vivos = h.sim.mobs().filter((m) => m.alive);
  for (const m of vivos) {
    m.x = p.x + 300;
    m.z = p.z + 300;
    m.homeX = m.x;
    m.homeZ = m.z;
  }
  const mob = vivos[0];
  mob.x = p.x + Math.sin(p.yaw) * 9;
  mob.z = p.z + Math.cos(p.yaw) * 9;
  mob.hp = mob.maxHp * 20;
  mob.maxHp = mob.hp;
  const evs = h.tickN(4, { attack: true });
  const disparo = evs.find((e) => e.type === 'projectileSpawned');
  return {
    arma: h.sim.activeSetId,
    modelo: h.renderer.views.get(p.id)?.group.children.length > 0,
    anim: h.renderer.views.get(p.id)?.playing(),
    proyectil: disparo?.kind ?? null,
    danio: evs.filter((e) => e.type === 'hitLanded').map((e) => e.amount),
  };
});
await frames(6);
await page.screenshot({ path: 'shots/36_ballestero.png', timeout: 180000 });

// --- la voltereta ---
const voltereta = await page.evaluate(() => {
  const h = window.__colosos;
  const p = h.sim.player;
  const dcha = { x: -Math.cos(p.yaw), z: Math.sin(p.yaw) }; // derecha de cámara
  const evs = h.tickN(2, { jump: true, moveX: dcha.x, moveZ: dcha.z, faceYaw: p.yaw });
  return {
    esquivo: evs.some((e) => e.type === 'dodged'),
    anim: h.renderer.views.get(p.id)?.playing(),
  };
});
await frames(2);
await page.screenshot({ path: 'shots/37_voltereta.png', timeout: 180000 });

// --- el casco ---
// el casco se prueba con el Caballero, que es quien tiene yelmo de verdad
// OJO: swap es un flanco pero el sim lee el input crudo, así que mantenerlo
// pulsado 20 ticks cambia ida y vuelta. Un tick basta.
await page.evaluate(() => {
  window.__colosos.tickN(1, { swap: true });
  window.__colosos.tickN(3);
});
await frames(4);
const casco = await page.evaluate(() => {
  const h = window.__colosos;
  const p = h.sim.player;
  const def = h.renderer.setDefs?.get?.(h.sim.activeSetId);
  h.sim.helmetDrops.push({ id: 991, x: p.x, y: p.y, z: p.z, rarity: 2 });
  h.tickN(1);
  const v = h.renderer.views.get(p.id);
  const cabezaVisible = () =>
    v.meshes.filter((m) => /Helmet|Hat|Mask/.test(m.name)).map((m) => `${m.name}:${m.visible}`);
  const conCasco = { helmet: p.helmet, puesto: p.helmetOn, vida: p.maxHp, piezas: cabezaVisible() };
  h.sim.toggleHelmet();
  h.tickN(1); // que el render se entere del cambio
  const sinCasco = { puesto: p.helmetOn, vida: p.maxHp, piezas: cabezaVisible() };
  return { conCasco, sinCasco, mallasDeCabezaDelSet: def?.headMeshes ?? null };
});
console.log('ballestero ->', JSON.stringify(ballesta));
console.log('voltereta ->', JSON.stringify(voltereta));
console.log('casco ->', JSON.stringify(casco, null, 1));
console.log('errores ->', errores.length ? errores.slice(0, 3) : 'ninguno');
await browser.close();
server.kill();
process.exit(0);
