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
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
page.setDefaultTimeout(120000);
await page.goto('http://localhost:4173/?clase=vigia');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
// pose de disparo congelada de cerca, vista frontal-lateral
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.5);
  h.teleport(7, -62); // pradera abierta
  h.setCamera(Math.PI * 0.82, 0.24, 3.2); // de frente-lateral: la mano del arco a la vista
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
  // congela la pose a mitad del disparo, sin depender del framerate
  const v = h.renderer.view(h.sim.player.id);
  v.play('2H_Ranged_Shoot', { once: true, fade: 0 });
  v.update(0.45);
  h.renderer.update(0.0001, 0);
});
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/22_arco_pose.png', timeout: 120000 });
console.log('shot: 22_arco_pose');
await browser.close();
server.kill();
process.exit(0);
