// Bootstrap del cliente: sim a paso fijo de 20 Hz, render a rAF con
// interpolación, hitstop escalando el tiempo. main es un firewall: aquí solo
// se cablea, la lógica vive en sim/, render/, ui/.

import * as THREE from 'three';
import { AudioSink } from './game/audio';
import { classById, type ClassDef } from './game/classes';
import { CLASS_ABILITY, WEAPON_SET_INFO } from './sim/abilities';
import { applySave, clearSave, readSave, writeSave } from './game/save';
import { InputReader } from './input';
import { GameRenderer } from './render/renderer';
import { SelectScreen } from './select/select_screen';
import { Sim } from './sim/sim';
import { DT } from './sim/types';
import { Hud } from './ui/hud';
import { InventoryWindow } from './ui/inventory';
import { TalentWindow } from './ui/talents';

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
  // ¿hay partida guardada? Se pregunta antes del campamento: quien vuelve no
  // tiene por qué volver a elegir arma.
  const guardada = params.has('clase') || params.has('nuevo') ? null : readSave();
  if (guardada) {
    const seguir = await preguntarContinuar(guardada);
    if (seguir) {
      defA = classById(guardada.setA);
      defB = classById(guardada.setB);
      playerName = guardada.nombre;
    } else {
      clearSave();
    }
  }
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
  if (guardada && defA.id === guardada.setA) applySave(sim, guardada);
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
  // política de autoplay: nada suena hasta que el jugador toca algo
  const desbloquear = () => audio.unlock();
  window.addEventListener('pointerdown', desbloquear, { once: true });
  window.addEventListener('keydown', desbloquear, { once: true });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) {
      const m = audio.toggleMute();
      document.getElementById('music-box')?.classList.toggle('mute', m);
      hud.toast(m ? 'Sonido apagado (M)' : 'Sonido encendido (M)', 1600);
    }
  });
  // barra de volumen de la música, con memoria entre partidas
  const volEl = document.getElementById('music-vol') as HTMLInputElement | null;
  if (volEl) {
    const guardado = Number(localStorage.getItem('colosos.musicaVol') ?? '55');
    volEl.value = String(Number.isFinite(guardado) ? guardado : 55);
    audio.setMusicVolume(Number(volEl.value) / 100);
    volEl.addEventListener('input', () => {
      audio.setMusicVolume(Number(volEl.value) / 100);
      try {
        localStorage.setItem('colosos.musicaVol', volEl.value);
      } catch {
        /* sin almacenamiento: el volumen vale para esta partida */
      }
      audio.unlock(); // tocar la barra ya es gesto suficiente para arrancar
    });
  }
  const input = new InputReader(canvas);
  const renderer = new GameRenderer(gl, sim, audio, hud, defA, defB);

  await renderer.loadAssets();
  const inventory = new InventoryWindow(hudRoot, sim);
  const talents = new TalentWindow(hudRoot, sim);
  document.getElementById('loading')?.remove();

  // La segunda habilidad aparece y desaparece con el arma y con el árbol:
  // se refresca cuando cambia algo que pueda abrirla o cerrarla.
  const refreshAbility2 = () => {
    const ab2 = sim.ability2;
    hud.setAbility2(ab2 ? { nombre: ab2.nombre, cooldown: ab2.cooldown, desc: ab2.desc } : null);
  };
  refreshAbility2();

  // Guardado: se marca sucio con lo que cuesta ganar y se vuelca cada pocos
  // segundos, no en cada tick (escribir en disco 20 veces por segundo, no).
  let sucio = false;
  const marcar = () => (sucio = true);
  window.setInterval(() => {
    if (!sucio) return;
    sucio = false;
    writeSave(sim, Date.now());
  }, 3000);
  window.addEventListener('beforeunload', () => {
    if (sucio) writeSave(sim, Date.now());
  });

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
          if (
            ev.type === 'lootPickedUp' ||
            ev.type === 'weaponEquipped' ||
            ev.type === 'helmetPickedUp' ||
            ev.type === 'helmetToggled'
          ) {
            inventory.refresh();
          }
          if (ev.type === 'weaponLeveledUp') {
            audio.play('mastery');
            const arma = classById(ev.setId)?.nombre ?? ev.setId;
            hud.toast(`Maestría de ${arma} · nivel ${ev.level} — tienes un punto de talento (T)`);
          }
          switch (ev.type) {
            case 'leveledUp':
            case 'weaponLeveledUp':
            case 'talentSpent':
            case 'talentsReset':
            case 'weaponSwapped':
            case 'weaponEquipped':
              refreshAbility2();
              talents.refresh();
              marcar();
              break;
            case 'lootPickedUp':
            case 'helmetPickedUp':
            case 'helmetToggled':
              marcar();
              break;
            default:
              break;
          }
        }
      }
    }

    renderer.camYaw = input.camYaw;
    renderer.camPitch = input.camPitch;
    renderer.camDist = input.camDist;
    renderer.update(dt, acc / DT);
    // la música sigue al combate: el sim ya sabe si estás peleando
    audio.setCombat(sim.player.combatTimer > 0 && sim.player.alive);
    audio.updateMusic(realDt);
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
          ability2: false,
          sprint: false,
          swap: false,
          drink: false,
          sit: false,
          faceYaw: null,
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

// Pregunta de "continuar o empezar de nuevo". DOM a pelo y una promesa: no
// merece un módulo, pero sí un sitio propio fuera del arranque.
async function preguntarContinuar(save: import('./game/save').SaveData): Promise<boolean> {
  const dias = Math.floor((Date.now() - save.fecha) / 86400000);
  const cuando = dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
  const el = document.createElement('div');
  el.id = 'continue-prompt';
  el.innerHTML = `
    <div class="cp-panel ornate">
      <div class="cp-title">Te esperábamos</div>
      <div class="cp-sub">${save.nombre} · Nivel ${save.level} · última vez ${cuando}</div>
      <div class="cp-buttons">
        <button id="cp-continue">Continuar</button>
        <button id="cp-new">Empezar de nuevo</button>
      </div>
      <div class="cp-warn">Empezar de nuevo borra el nivel, las armas y los talentos.</div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('loading')?.remove();
  return new Promise<boolean>((resolve) => {
    const cerrar = (v: boolean) => {
      el.remove();
      resolve(v);
    };
    el.querySelector('#cp-continue')?.addEventListener('click', () => cerrar(true));
    el.querySelector('#cp-new')?.addEventListener('click', () => cerrar(false));
  });
}

// import estático de la función de terreno para el hook de teleport
import * as hooksTerra from './sim/terrain';

boot().catch((err) => {
  console.error('[colosos] fallo de arranque:', err);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Error al cargar. Mira la consola.';
});
