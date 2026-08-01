import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore', cwd: '/home/claude/colosos' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
await page.goto('http://localhost:4173/?clase=medula');
await page.waitForFunction(() => window.__colososReady === true, null, { timeout: 60000 });
await page.waitForTimeout(1200);
// congela el destello en su pico parando la animación a los 150ms
await page.evaluate(() => {
  window.__colosos.setPaused(true);
  const slot = document.querySelector('#slot-1');
  slot.classList.add('ready');
  setTimeout(() => { slot.style.animationPlayState = 'paused'; }, 150);
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/16_slot_brillo.png', clip: { x: 480, y: 520, width: 320, height: 200 }, timeout: 120000 });
console.log('shot: 16_slot_brillo');
await browser.close();
server.kill();
process.exit(0);
