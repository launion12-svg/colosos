// Diagnóstico: ¿dónde cae la brasa en pantalla y con qué aspecto?
// Proyecta el orbe con la cámara real del render y devuelve sus coordenadas.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4174/?clase=fumarel');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
const frames = (n) =>
  page.evaluate(
    (c) =>
      new Promise((r) => {
        let k = c;
        const s = () => (--k <= 0 ? r() : requestAnimationFrame(s));
        requestAnimationFrame(s);
      }),
    n,
  );

const out = await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.4);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.25, 7);
  h.tickN(10);
  const p = h.sim.player;
  const vivos = h.sim.mobs().filter((m) => m.alive);
  for (const m of vivos) {
    m.x = p.x + 60;
    m.z = p.z + 60;
  }
  const mob = vivos[0];
  mob.x = p.x + Math.sin(p.yaw) * 12;
  mob.z = p.z + Math.cos(p.yaw) * 12;
  h.tickN(4, { attack: true });
  h.tickN(2);
  h.setPaused(true);
  return {
    proj: h.sim.projectiles.map((q) => ({ k: q.kind, x: q.x, y: q.y, z: q.z })),
    yaw: p.yaw,
  };
});
await frames(6);
const screen = await page.evaluate(() => {
  const h = window.__colosos;
  const cam = h.renderer.rig?.camera ?? h.renderer.camera;
  const pr = h.sim.projectiles[0];
  if (!pr || !cam) return { error: 'sin proyectil o sin cámara', tieneCam: !!cam };
  const info = [];
  for (const [id, m] of h.renderer.projMeshes) {
    const wp = m.getWorldPosition(new (Object.getPrototypeOf(m.position).constructor)());
    info.push({
      id,
      enEscena: m.parent === h.renderer.scene,
      visible: m.visible,
      pos: [+wp.x.toFixed(1), +wp.y.toFixed(1), +wp.z.toFixed(1)],
      escala: [m.scale.x, m.scale.y, m.scale.z],
      radio: m.geometry?.parameters?.radius,
      color: m.material?.color?.getHexString?.(),
      hijos: m.children.length,
      frustumCulled: m.frustumCulled,
      layers: m.layers.mask,
    });
  }
  window.__diag = info;
  const V = Object.getPrototypeOf(cam.position).constructor;
  const v = new V(pr.x, pr.y, pr.z);
  v.project(cam);
  const cv = document.querySelector('canvas');
  return {
    ndc: { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) },
    px: Math.round(((v.x + 1) / 2) * cv.clientWidth),
    py: Math.round(((1 - v.y) / 2) * cv.clientHeight),
    cam: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)],
    mallas: info,
  };
});
console.log(JSON.stringify({ ...out, screen }));
await page.screenshot({ path: 'shots/diag_mago.png', timeout: 120000 });
await browser.close();
server.kill();
process.exit(0);
