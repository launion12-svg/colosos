// Verificación visual: el básico del mago ya no es un bastonazo — sale una
// brasa de niebla volando. Captura el básico y la habilidad para compararlos.
//
// Truco aprendido a base de fotos en blanco: la cámara persigue al jugador con
// lerp, así que tras un teletransporte hay que dejar correr frames (con
// swiftshader cada uno tarda ~1 s de reloj) ANTES de disparar. Y el sim se
// congela justo después del disparo, o el orbe se sale de la foto.
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
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4173/?clase=fumarel');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
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

// coloca la escena y deja que la cámara alcance al jugador
await page.evaluate(() => {
  const h = window.__colosos;
  h.setTimeOfDay(0.4);
  h.teleport(14, -82);
  h.setCamera(Math.PI * 0.15, 0.25, 7);
  const p = h.sim.player;
  p.yaw = 0;
  for (const m of h.sim.mobs()) {
    m.x = p.x + 70;
    m.z = p.z + 70;
  } // despeja la manada
});
await frames(10); // la cámara se asienta detrás del mago

const disparo = async (inp, ticks, file) => {
  const info = await page.evaluate(
    ({ inp, ticks }) => {
      const h = window.__colosos;
      const p = h.sim.player;
      const mob = h.sim.mobs().find((m) => m.alive);
      mob.x = p.x + Math.sin(p.yaw) * 13; // blanco lejano: se ve el vuelo
      mob.z = p.z + Math.cos(p.yaw) * 13;
      mob.hp = mob.maxHp;
      const kinds = [];
      for (const e of h.tickN(ticks, inp) ?? []) {
        if (e.type === 'projectileSpawned') kinds.push(e.kind);
      }
      h.tickN(2);
      h.setPaused(true);
      const cam = h.renderer.rig?.camera;
      const pr = h.sim.projectiles[0];
      let px = null;
      if (pr && cam) {
        const v = new (Object.getPrototypeOf(cam.position).constructor)(pr.x, pr.y, pr.z);
        v.project(cam);
        px = [Math.round(((v.x + 1) / 2) * 1280), Math.round(((1 - v.y) / 2) * 720)];
      }
      return { kinds, enVuelo: h.sim.projectiles.map((q) => q.kind), px };
    },
    { inp, ticks },
  );
  await frames(3);
  await page.screenshot({ path: `shots/${file}.png`, timeout: 120000 });
  await page.evaluate(() => window.__colosos.setPaused(false));
  console.log(file, '->', JSON.stringify(info));
};

await disparo({ attack: true }, 4, '20_mago_basico');
await frames(2); // deja pasar el enfriamiento
await disparo({ ability: true }, 7, '21_mago_habilidad');

await browser.close();
server.kill();
process.exit(0);
