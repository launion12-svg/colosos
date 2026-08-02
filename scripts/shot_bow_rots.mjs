// Prueba varias rotaciones del arco EN VIVO y captura cada candidata.
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
const page = await browser.newPage({ viewport: { width: 700, height: 620 } });
page.setDefaultTimeout(120000);
await page.goto('http://localhost:4173/?clase=vigia');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.5);
  h.teleport(7, -62);
  h.setCamera(Math.PI * 0.75, 0.22, 3.3); // tres cuartos: reposo
});
await page.evaluate(
  () =>
    new Promise((r) => {
      let n = 10;
      const s = () => (--n <= 0 ? r() : requestAnimationFrame(s));
      requestAnimationFrame(s);
    }),
);
await page.evaluate(() => {
  const h = window.__colosos;
  h.setPaused(true);
  const v = h.renderer.view(h.sim.player.id);
  v.play('Idle', { fade: 0 });
  v.update(1.2);
});
const CANDS = [
  ['rest_orig', [0, 0, 0]],
  ['rest_x90', [Math.PI / 2, 0, 0]],
  ['rest_z90', [0, 0, Math.PI / 2]],
  ['rest_y90x', [0, -Math.PI / 2, Math.PI / 2]],
];
for (const [name, rot] of CANDS) {
  await page.evaluate((r) => {
    const h = window.__colosos;
    const v = h.renderer.view(h.sim.player.id);
    let bone = null;
    v.group.traverse((o) => {
      if (!bone && o.name.toLowerCase().replace(/[^a-z0-9]/g, '') === 'handslotl') bone = o;
    });
    const wrap = bone.children[bone.children.length - 1];
    wrap.rotation.set(r[0], r[1], r[2]);
    h.renderer.update(0.0001, 0);
  }, rot);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `shots/rot_${name}.png`, timeout: 120000 });
  console.log('shot:', name);
}
await browser.close();
server.kill();
process.exit(0);
