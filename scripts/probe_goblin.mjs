import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.setDefaultTimeout(120000);
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
const info = await page.evaluate(() => {
  const h = window.__colosos;
  const probe = (tid) => {
    const m = h.sim.mobs().find((x) => x.templateId === tid);
    const v = h.renderer.view(m.id);
    const out = [];
    v.group.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats)
          out.push({
            mesh: o.name,
            mat: mat.name,
            map: !!mat.map,
            mapImg: mat.map ? `${mat.map.image?.width}x${mat.map.image?.height}` : null,
            color: mat.color?.getHexString?.(),
          });
      }
    });
    return out;
  };
  return { goblin: probe('goblin'), lobo: probe('lobo'), yeti: probe('yeti') };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
server.kill();
process.exit(0);
