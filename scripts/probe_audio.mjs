// El audio nuevo es código sin red: se comprueba que ni revienta ni deja
// errores en consola al disparar todos los sonidos y la música.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errores = [];
page.on('pageerror', (e) => errores.push(String(e.message)));
page.on('console', (m) => {
  if (m.type() === 'error') errores.push(m.text());
});
await page.goto('http://localhost:4175/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 90000 });
const res = await page.evaluate(async () => {
  const a = window.__colosos.renderer.audio;
  const nombres = [
    'swing',
    'hit',
    'hit_hard',
    'crit',
    'jump',
    'land',
    'land_hard',
    'aggro',
    'death_mob',
    'death_player',
    'respawn',
    'xp',
    'levelup',
    'mastery',
    'block',
    'ability',
    'swap',
    'loot_drop',
    'loot_pickup',
    'bag_full',
    'potion',
    'talent',
  ];
  a.unlock();
  for (const n of nombres) a.play(n);
  for (let i = 0; i < 6; i++) a.updateMusic(4, i % 2 === 0);
  await new Promise((r) => setTimeout(r, 600));
  const ctx = a.ctx ?? null;
  return {
    sonidos: nombres.length,
    estado: ctx ? ctx.state : 'sin contexto',
    ultimo: a.lastPlayed,
  };
});
console.log('audio ->', JSON.stringify(res));
console.log('errores ->', errores.length ? errores.slice(0, 5) : 'ninguno');
await browser.close();
server.kill();
process.exit(0);
