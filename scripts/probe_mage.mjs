import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.setDefaultTimeout(120000);
await page.goto('http://localhost:4174/?clase=fumarel');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
const out = await page.evaluate(() => {
  const h = window.__colosos;
  h.teleport(14, -82);
  h.tickN(10);
  const p = h.sim.player;
  const vivos = h.sim.mobs().filter((m) => m.alive);
  for (const m of vivos) { m.x = p.x + 60; m.z = p.z + 60; }
  const mob = vivos[0];
  mob.x = p.x + Math.sin(p.yaw) * 10; mob.z = p.z + Math.cos(p.yaw) * 10;
  const log = [];
  const step = (n, inp) => { const evs = h.tickN(n, inp) ?? []; log.push(...evs.filter(e=>e.type.startsWith('projectile')||e.type==='hitLanded').map(e=>e.type+':'+(e.kind??e.amount))); };
  step(4, { attack: true });
  step(3);
  return { log, proj: h.sim.projectiles.map(q=>({k:q.kind,x:+q.x.toFixed(1),z:+q.z.toFixed(1),y:+q.y.toFixed(1)})), player:{x:+p.x.toFixed(1),z:+p.z.toFixed(1),y:+p.y.toFixed(1)}, meshes: h.renderer.projMeshes ? h.renderer.projMeshes.size : 'n/a' };
});
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.kill(); process.exit(0);
