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
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
const out = await page.evaluate(() => {
  const h = window.__colosos;
  const p = h.sim.player;
  p.ownedWeapons = Array.from({ length: 10 }, (_, i) => `relleno_${i}`);
  h.sim.drops.push({ id: 900, x: p.x, y: p.y, z: p.z, setId: 'vigia', rarity: 1 });
  const evs = h.sim.tick({
    moveX: 0,
    moveZ: 0,
    jump: false,
    jumpHeld: false,
    attack: false,
    block: false,
    ability: false,
    sprint: false,
    swap: false,
  });
  const types = evs.map((e) => e.type);
  for (const ev of evs) h.renderer.onSimEvent(ev);
  const el = document.querySelector('#toast');
  return {
    types,
    exists: !!el,
    cls: el?.className,
    text: el?.textContent,
    dropsLeft: h.sim.drops.length,
  };
});
console.log(JSON.stringify(out));
await browser.close();
server.kill();
process.exit(0);
