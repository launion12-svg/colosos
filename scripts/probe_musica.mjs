// La música es lo único que no puedo oír: se comprueba que los dos temas
// cargan de verdad y que las rampas de volumen hacen lo que dicen.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4176', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
const errores = [];
page.on('pageerror', (e) => errores.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
await page.goto('http://localhost:4176/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 90000 });

const res = await page.evaluate(async () => {
  const a = window.__colosos.renderer.audio;
  window.__audioErr = [];
  a.unlock();
  for (const el of [a.explorar, a.combate]) {
    el?.addEventListener('error', () => window.__audioErr.push(`${el.src.split('/').pop()}: error ${el.error?.code}`));
  }
  a.setMusicVolume(0.6);
  await new Promise((r) => setTimeout(r, 9000)); // que carguen de verdad, no solo la cabecera
  const ficha = (el) => el ? {
    src: el.src.split('/').pop(),
    duracion: Number.isFinite(el.duration) ? Math.round(el.duration) : 'cargando',
    listo: el.readyState, // 4 = puede reproducirse entero
    pausado: el.paused,
  } : null;

  const traza = [];
  const paso = (dt, n) => { for (let i = 0; i < n; i++) a.updateMusic(dt); };
  // fuera de combate: la de explorar entra suave y sube
  paso(0.25, 4); traza.push(['1 s explorando', +a.explorar.volume.toFixed(3), +a.combate.volume.toFixed(3)]);
  paso(0.25, 16); traza.push(['5 s explorando', +a.explorar.volume.toFixed(3), +a.combate.volume.toFixed(3)]);
  paso(0.25, 16); traza.push(['9 s explorando', +a.explorar.volume.toFixed(3), +a.combate.volume.toFixed(3)]);
  // entra en combate
  a.setCombat(true);
  paso(0.25, 4); traza.push(['1 s de pelea', +a.explorar.volume.toFixed(3), +a.combate.volume.toFixed(3)]);
  paso(0.25, 10); traza.push(['3,5 s de pelea', +a.explorar.volume.toFixed(3), +a.combate.volume.toFixed(3)]);
  // se acabó la pelea
  a.setCombat(false);
  paso(0.25, 4); traza.push(['1 s tras la pelea', +a.explorar.volume.toFixed(3), +a.combate.volume.toFixed(3)]);
  paso(0.25, 12); traza.push(['4 s tras la pelea', +a.explorar.volume.toFixed(3), +a.combate.volume.toFixed(3)]);
  // ¿el servidor sirve bien los ficheros? (headless puede no traer el códec
  // MP3, así que la carga real hay que comprobarla por HTTP)
  const http = {};
  for (const f of ['explorar.mp3', 'combate.mp3']) {
    const r = await fetch(`music/${f}`, { method: 'GET', headers: { Range: 'bytes=0-2047' } });
    http[f] = { estado: r.status, tipo: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
  }
  return { explorar: ficha(a.explorar), combate: ficha(a.combate), traza, audioErr: window.__audioErr, http, soportaMp3: new Audio().canPlayType('audio/mpeg') };
});
console.log('temas ->', JSON.stringify(res.explorar), JSON.stringify(res.combate));
console.log('rampas [momento, explorar, combate]:');
for (const t of res.traza) console.log('   ', JSON.stringify(t));
console.log('http ->', JSON.stringify(res.http));
console.log('¿este navegador reproduce mp3? ->', res.soportaMp3 || 'no');
console.log('errores de audio ->', res.audioErr.length ? res.audioErr : 'ninguno');
console.log('errores ->', errores.length ? errores.slice(0, 4) : 'ninguno');
await browser.close(); server.kill(); process.exit(0);
