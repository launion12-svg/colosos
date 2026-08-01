// Bootstrap del cliente: sim a paso fijo de 20 Hz, render a rAF con
// interpolación, hitstop escalando el tiempo. main es un firewall: aquí solo
// se cablea, la lógica vive en sim/, render/, ui/.

import * as THREE from 'three';
import { AudioSink } from './game/audio';
import { classById, type ClassDef } from './game/classes';
import { CLASS_ABILITY, WEAPON_SET_INFO } from './sim/abilities';
import { InputReader } from './input';
import { GameRenderer } from './render/renderer';
import { SelectScreen } from './select/select_screen';
import { Sim } from './sim/sim';
import { DT } from './sim/types';
import { Hud } from './ui/hud';
import { InventoryWindow } from './ui/inventory';

const WORLD_SEED = 20260730;

async function boot(): Promise<void> {
  const canvas = document.getElementById('app') as HTMLCanvasElement;
  const hudRoot = document.getElementById('hud') as HTMLElement;

  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  gl.setSize(window.innerWidth, window.innerHeight);

  // ¿clase ya elegida por URL (capturas, recargas rápidas)? Si no, campamento.
  const params = new URLSearchParams(location.search);
  let defA: ClassDef | undefined = classById(params.get('clase'));
  let defB: ClassDef | undefined = classById(params.get('clase2'));
  let playerName = '';
  if (!defA) {
    const select = new SelectScreen(gl, hudRoot);
    (window as unknown as Record<string, unknown>).__colososSelect = select;
    const chosen = await select.run();
    defA = chosen.defA;
    playerName = chosen.name;
  }
  if (defB && defB.id === defA.id) defB = undefined;
  if (!playerName) playerName = defA.nombre; // vía URL: el nombre de la clase
  document.getElementById('loading')?.remove();

  const sim = new Sim(WORLD_SEED, {
    playerName,
    setA: defA.id,
    setB: defB?.id ?? '', // la segunda arma cae de los bichos
  });
  const setInfo = (id: string) => {
    const ab = CLASS_ABILITY[id];
    return {
      id,
      nombre: ab.nombre,
      cooldown: ab.cooldown,
      desc: ab.desc,
      hasShield: WEAPON_SET_INFO[id]?.hasShield ?? false,
    };
  };
  const hudSets = defB ? [setInfo(defA.id), setInfo(defB.id)] : [setInfo(defA.id)];
  const hud = new Hud(hudRoot, playerName, hudSets);
  const audio = new AudioSink();
  const input = new InputReader(canvas);
  const renderer = new GameRenderer(gl, sim, audio, hud, defA, defB);

  await renderer.loadAssets();
  const inventory = new InventoryWindow(hudRoot, sim);
  document.getElementById('loading')?.remove();

  let acc = 0;
  let last = performance.now();
  let paused = false;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;

    // hitstop: escala tiempo de sim Y de animación
    const scale = renderer.hitstop.scale(realDt);
    const dt = paused ? 0 : realDt * scale;

    // en pausa el mundo se congela pero se sigue dibujando: es una foto fija,
    // no una pantalla muerta (y las capturas automáticas dependen de ello)
    if (!paused) {
      acc += dt;
      while (acc >= DT) {
        acc -= DT;
        const events = sim.tick(input.sample());
        for (const ev of events) {
          renderer.onSimEvent(ev);
          if (ev.type === 'lootPickedUp' || ev.type === 'weaponEquipped') inventory.refresh();
        }
      }
    }

    renderer.camYaw = input.camYaw;
    renderer.camPitch = input.camPitch;
    renderer.camDist = input.camDist;
    renderer.update(dt, acc / DT);
    hud.update(sim.player, sim.mobs(), sim.timeOfDay);
  }
  requestAnimationFrame(frame);

  // Ganchos para las capturas automatizadas y la depuración.
  const hooks = {
    sim,
    renderer,
    setPaused(v: boolean) {
      paused = v;
    },
    setTimeOfDay(t: number) {
      const v = ((t % 1) + 1) % 1;
      sim.timeOfDayOverride = v;
      sim.timeOfDay = v;
    },
    releaseClock() {
      sim.timeOfDayOverride = null;
    },
    teleport(x: number, z: number) {
      const { terrainHeight } = hooksTerra;
      const p = sim.player;
      p.x = x;
      p.z = z;
      p.y = terrainHeight(x, z, sim.seed);
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
    },
    holdBlock(v: boolean) {
      input.debugBlock = v;
    },
    setCamera(yaw: number, pitch: number, dist?: number) {
      input.camYaw = yaw;
      input.camPitch = pitch;
      if (dist !== undefined) input.camDist = dist;
    },
    // devuelve los eventos generados: las capturas comprueban qué pasó, no
    // solo cómo se ve
    tickN(n: number, inp?: Partial<import('./sim/types').MoveInput>) {
      const all: import('./sim/types').SimEvent[] = [];
      for (let i = 0; i < n; i++) {
        const events = sim.tick({
          moveX: 0,
          moveZ: 0,
          jump: false,
          jumpHeld: false,
          attack: false,
          block: false,
          ability: false,
          sprint: false,
          swap: false,
          ...inp,
        });
        for (const ev of events) renderer.onSimEvent(ev);
        all.push(...events);
      }
      return all;
    },
  };
  (window as unknown as Record<string, unknown>).__colosos = hooks;
  (window as unknown as Record<string, unknown>).__colososReady = true;
}

// import estático de la función de terreno para el hook de teleport
import * as hooksTerra from './sim/terrain';

boot().catch((err) => {
  console.error('[colosos] fallo de arranque:', err);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Error al cargar. Mira la consola.';
});
