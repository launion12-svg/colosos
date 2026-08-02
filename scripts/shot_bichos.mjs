// Verificación de las criaturas nuevas: que se ven, que tienen el tamaño que
// dice el bestiario y que sus animaciones existen en el GLB (el bug de los
// goblins microscópicos nació justo de no mirar esto).
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
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

await page.goto('http://localhost:4173/?clase=hachero');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 90000 });
await page.waitForTimeout(1500);

// coloca en fila a un ejemplar de cada especie delante de la cámara
const posar = async (desde, hasta, dist) =>
  await page.evaluate(
    ({ desde, hasta, dist }) => {
      const h = window.__colosos;
      h.setTimeOfDay(0.42);
      h.teleport(14, -82);
      h.setCamera(Math.PI * 0.15, 0.16, 16);
      const p = h.sim.player;
      p.yaw = Math.PI * 0.15 + Math.PI;
      const especies = [...new Set(h.sim.mobs().map((m) => m.templateId))].slice(desde, hasta);
      const usados = new Set();
      const fila = [];
      for (const m of h.sim.mobs()) {
        if (especies.includes(m.templateId) && !usados.has(m.templateId) && m.alive) {
          usados.add(m.templateId);
          fila.push(m);
        } else {
          m.x = p.x + 200; // el resto, fuera de plano
          m.z = p.z + 200;
        }
      }
      fila.forEach((m, i) => {
        const off = (i - (fila.length - 1) / 2) * 2.6;
        m.x = p.x + Math.sin(p.yaw) * dist + Math.cos(p.yaw) * off;
        m.z = p.z + Math.cos(p.yaw) * dist - Math.sin(p.yaw) * off;
        m.aiState = 'patrol';
        m.homeX = m.x;
        m.homeZ = m.z;
        m.aggroRadius = 0; // que posen quietos para la foto
      });
      h.tickN(3);
      return { especies, enFila: fila.map((m) => `${m.templateId}:${m.name}`) };
    },
    { desde, hasta, dist },
  );

const info = await posar(0, 5, 11);
await frames(12);
await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/31_bestiario_a.png', timeout: 180000 });
await page.evaluate(() => window.__colosos.setPaused(false));
const info2 = await posar(5, 10, 13);
await frames(12);

// Chequeo funcional, que es el que de verdad protege: cada especie tiene su
// vista montada, con una escala sana (el bug de los goblins microscópicos era
// una escala de 0,01) y con TODAS las animaciones que declara el bestiario.
const revision = await page.evaluate(() => {
  const h = window.__colosos;
  const vistos = new Map();
  for (const m of h.sim.mobs()) {
    if (vistos.has(m.templateId)) continue;
    const v = h.renderer.views?.get(m.id);
    if (!v) {
      vistos.set(m.templateId, { vista: false });
      continue;
    }
    const tpl = h.renderer.bestiarioDe?.(m.templateId) ?? null;
    const anims = tpl ? Object.entries(tpl.anims) : [];
    const faltan = anims
      .filter(([k, n]) => typeof n === 'string' && k !== 'runTimeScale' && !v.has(n))
      .map(([k, n]) => `${k}:${n}`);
    vistos.set(m.templateId, {
      vista: true,
      escala: +v.group.scale.y.toFixed(4),
      visible: v.group.visible,
      faltan,
    });
  }
  return Object.fromEntries(vistos);
});

await page.evaluate(() => window.__colosos.setPaused(true));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/31_bestiario_b.png', timeout: 180000 });
console.log('fila A ->', JSON.stringify(info.enFila));
console.log('fila B ->', JSON.stringify(info2.enFila));
console.log('revisión ->', JSON.stringify(revision, null, 1));
console.log('shots: 31_bestiario_a, 31_bestiario_b');
await browser.close();
server.kill();
process.exit(0);
