// Verificación del árbol de talentos: la ventana con los dos árboles, la
// segunda habilidad ya abierta en la barra, un crítico en pantalla y la
// pregunta de continuar partida al volver.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const frames = (n) =>
  page.evaluate((c) => new Promise((r) => { let k = c; const s = () => (--k <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n);

await page.goto('http://localhost:4173/?clase=hachero&clase2=fumarel');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1200);

// --- 1) la ventana de talentos con puntos por gastar ---
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.42);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.2, 6);
  // maestría a mano: 6 niveles de hacha y 3 de bastón, como si los hubieras usado
  h.sim.player.level = 10;
  h.sim.player.weaponLevel.hachero = 6;
  h.sim.player.talentPoints.hachero = 5;
  h.sim.player.weaponXp.hachero = 120;
  h.sim.player.weaponLevel.fumarel = 3;
  h.sim.player.talentPoints.fumarel = 2;
  h.sim.player.weaponXp.fumarel = 60;
  for (const m of h.sim.mobs()) { m.x = h.sim.player.x + 70; m.z = h.sim.player.z + 70; }
});
await frames(8);
await page.keyboard.press('KeyT');
await frames(4);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/27_talentos.png', timeout: 120000 });
await page.evaluate(() => window.__colosos.setPaused(false));

// --- 2) gastar hasta abrir la segunda habilidad, por la misma vía que el jugador ---
const abierto = await page.evaluate(() => {
  const nodos = [...document.querySelectorAll('#talents .talent-node[data-set="hachero"]')];
  const clic = (id, veces) => {
    const el = nodos.find((n) => n.dataset.node === id);
    for (let i = 0; i < veces; i++) el?.click();
  };
  clic('furia', 3);
  clic('cuero_curtido', 3); // solo entran 5: los puntos del arma son los que son
  // tras 6 puntos el tier 2 ya está abierto; el 7º abre el final
  const tras = [...document.querySelectorAll('#talents .talent-node[data-set="hachero"]')];
  const hend = tras.find((n) => n.dataset.node === 'hendidura');
  hend?.click();
  const fin = [...document.querySelectorAll('#talents .talent-node[data-set="hachero"]')].find(
    (n) => n.dataset.node === 'sismo',
  );
  fin?.click();
  const h = window.__colosos;
  return {
    puntos: h.sim.player.talentPoints,
    maestria: h.sim.player.weaponLevel,
    arbol: h.sim.player.talents.hachero,
    ability2: h.sim.ability2?.id ?? null,
    vida: h.sim.player.maxHp,
  };
});
await page.screenshot({ path: 'shots/28_talentos_gastados.png', timeout: 120000 });
await page.keyboard.press('KeyT');
await frames(3);

// --- 3) la segunda habilidad en la barra, lanzada contra un bicho ---
const golpe = await page.evaluate(() => {
  const h = window.__colosos;
  const p = h.sim.player;
  p.yaw = Math.PI * 0.15 + Math.PI;
  const vivos = h.sim.mobs().filter((m) => m.alive);
  for (const m of vivos) { m.x = p.x + 70; m.z = p.z + 70; }
  const mob = vivos[0];
  mob.x = p.x + Math.sin(p.yaw) * 3;
  mob.z = p.z + Math.cos(p.yaw) * 3;
  mob.hp = mob.maxHp * 4;
  mob.maxHp = mob.hp;
  h.sim.player.talentPoints.hachero += 4; // para llegar al nodo final en la foto
  for (const n of ['hendidura', 'sismo']) h.sim.spendTalent('hachero', n);
  h.sim.spendTalent('hachero', 'hendidura');
  h.sim.spendTalent('hachero', 'sismo');
  const evs = h.tickN(12, { ability2: true });
  h.setPaused(true);
  return {
    usada: evs.filter((e) => e.type === 'abilityUsed').map((e) => `${e.ability}#${e.slot}`),
    golpes: evs.filter((e) => e.type === 'hitLanded').map((e) => e.amount),
    dot: evs.filter((e) => e.type === 'dotDamage').length,
  };
});
await frames(3);
await page.screenshot({ path: 'shots/29_segunda_habilidad.png', timeout: 120000 });

// --- 4) al volver, la partida sigue ahí ---
await page.evaluate(() => {
  window.__colosos.setPaused(false);
  window.dispatchEvent(new Event('beforeunload'));
});
await page.waitForTimeout(300);
await page.goto('http://localhost:4173/');
await page.waitForSelector('#continue-prompt', { timeout: 30000 });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/30_continuar.png', timeout: 120000 });
const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('colosos.save.v1')));

// --- 5) continuar de verdad: el nivel y el árbol vuelven con el jugador ---
await page.click('#cp-continue');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await frames(4);
const restaurado = await page.evaluate(() => {
  const h = window.__colosos;
  return {
    nivel: h.sim.player.level,
    vida: h.sim.player.maxHp,
    arma: h.sim.activeSetId,
    talentos: h.sim.player.talents,
    ability2: h.sim.ability2?.id ?? null,
    ranura2Visible: !document.getElementById('slot-2')?.classList.contains('hidden'),
  };
});
console.log('restaurado ->', JSON.stringify(restaurado));
console.log('talentos ->', JSON.stringify(abierto));
console.log('segunda habilidad ->', JSON.stringify(golpe));
console.log('guardado ->', JSON.stringify({
  nivel: guardado?.level,
  talentos: guardado?.talents,
  armas: guardado?.ownedWeapons,
}));
console.log('shots: 27_talentos, 28_talentos_gastados, 29_segunda_habilidad, 30_continuar');
await browser.close();
server.kill();
process.exit(0);
