// Verificación del descanso: el héroe se sienta de verdad (animación del rig)
// y la vida sube sola con su número flotante.
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
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.45);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.22, 6);
  const p = h.sim.player;
  for (const m of h.sim.mobs()) { m.x = p.x + 300; m.z = p.z + 300; m.homeX = m.x; m.homeZ = m.z; }
  p.hp = Math.floor(p.maxHp * 0.35);
});
await frames(10);
const res = await page.evaluate(() => {
  const h = window.__colosos;
  const p = h.sim.player;
  const antes = p.hp;
  h.tickN(1, { sit: true });
  const sentado = p.sitting;
  const anim1 = h.renderer.views.get(p.id)?.playing();
  const evs = h.tickN(120); // seis segundos descansando
  window.__evs = evs;
  return {
    sentado,
    anim: anim1,
    animTrasSentarse: h.renderer.views.get(p.id)?.playing(),
    vidaAntes: antes,
    vidaAhora: p.hp,
    pulsos: evs.filter((e) => e.type === 'regenTick').map((e) => e.amount),
  };
});
await frames(16); // deja que el gesto de sentarse termine (dt topado a 0,1 s) y entre el respirar
const animFinal = await page.evaluate(() => {
  const h = window.__colosos;
  const a = h.renderer.views.get(h.sim.player.id)?.playing();
  h.setPaused(true);
  return a;
});
await frames(2);
await page.screenshot({ path: 'shots/32_descanso.png', timeout: 180000 });
console.log('descanso ->', JSON.stringify(res));
console.log('animación tras el gesto ->', animFinal);
await browser.close(); server.kill(); process.exit(0);
