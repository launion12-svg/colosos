// La esquiva: que se vea el quiebro (animación de correr de lado, inclinado)
// y que el golpe del bicho pase de largo durante los fotogramas intocables.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const frames = (n) =>
  page.evaluate((c) => new Promise((r) => { let k = c; const s = () => (--k <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n);

await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 90000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.42);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.2, 7);
  const p = h.sim.player;
  p.yaw = Math.PI * 0.15 + Math.PI;
  for (const m of h.sim.mobs()) { m.x = p.x + 300; m.z = p.z + 300; m.homeX = m.x; m.homeZ = m.z; }
});
await frames(10);

const res = await page.evaluate(() => {
  const h = window.__colosos;
  const p = h.sim.player;
  const x0 = p.x, z0 = p.z;
  // esquiva lateral DE VERDAD: hacia la derecha del personaje, no del mundo
  const dcha = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
  const evs = h.tickN(3, { jump: true, moveX: dcha.x, moveZ: dcha.z });
  const anim = h.renderer.views.get(p.id)?.playing();
  h.setPaused(true);
  return {
    esquivo: evs.some((e) => e.type === 'dodged'),
    anim,
    desplazado: +Math.hypot(p.x - x0, p.z - z0).toFixed(2),
    energia: Math.round(p.stamina),
    intocable: +p.invuln.toFixed(2),
    enfriamiento: +p.dodgeCooldown.toFixed(1),
  };
});
await frames(3);
const inclinacion = await page.evaluate(() => {
  const h = window.__colosos;
  const v = h.renderer.views.get(h.sim.player.id);
  return { inclinacion: +v.visual.rotation.z.toFixed(2), anim: v.playing(), enQuiebro: h.sim.player.dodgeTime > 0 };
});
await page.screenshot({ path: 'shots/34_esquiva.png', timeout: 180000 });
console.log('cuerpo ->', JSON.stringify(inclinacion));

// y ahora que un bicho le pegue mientras es intocable
const prueba = await page.evaluate(() => {
  const h = window.__colosos;
  h.setPaused(false);
  const p = h.sim.player;
  const mob = h.sim.mobs()[0];
  mob.x = p.x; mob.z = p.z + 1.4; mob.y = p.y; mob.aiState = 'attack';
  const hp0 = p.hp;
  const evs = [];
  for (let i = 0; i < 40; i++) {
    p.invuln = 0.5; // sostiene la ventana para la prueba
    mob.x = p.x; mob.z = p.z + 1.4;
    evs.push(...h.tickN(1));
  }
  return {
    esquivados: evs.filter((e) => e.type === 'evaded').length,
    golpesRecibidos: evs.filter((e) => e.type === 'hitLanded' && e.targetId === p.id).length,
    vidaIntacta: p.hp === hp0,
  };
});
console.log('quiebro ->', JSON.stringify(res));
console.log('intocable ->', JSON.stringify(prueba));
await browser.close(); server.kill(); process.exit(0);
