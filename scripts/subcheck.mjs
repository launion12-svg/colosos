import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:4180/juego/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
const ok = await page.evaluate(() => ({
  mobs: window.__colosos.sim.mobs().length,
  hero: !!window.__colosos.renderer.view(window.__colosos.sim.player.id),
}));
console.log('SUBPATH OK:', JSON.stringify(ok), '| errores:', errs.length ? errs.slice(0,3) : 'ninguno');
await browser.close();
process.exit(0);
