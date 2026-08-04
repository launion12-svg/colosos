// Pathfinding: que un bicho rodee un muro en vez de empotrarse.
//
// Lo que se comprueba aquí no es "el A* devuelve algo", que eso lo hace
// cualquier A*, sino las tres propiedades de las que depende el modo mazmorra:
// que el camino EXISTA entre dos puntos separados por muralla, que no atraviese
// piedra, y que un bicho encerrado en el patio acabe saliendo por la puerta.

import { describe, expect, it } from 'vitest';
import { CAMPS } from '../src/sim/bestiary';
import {
  NAV_CELDA,
  buscarCamino,
  dentroDeLaRejilla,
  hayPasoLibre,
  olvidarRejilla,
} from '../src/sim/navigation';
import { Sim } from '../src/sim/sim';
import { RUINA_X, RUINA_Z, apartarDeMuros, distRuina, ruina } from '../src/sim/structures';
import { terrainHeight } from '../src/sim/terrain';
import { IDLE_INPUT, MOB_RADIUS, type MoveInput } from '../src/sim/types';

const SEED = 21;
const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

// DENTRO de la torre del homenaje y un punto en el bosque, al sur. Ojo con
// elegir estos dos: el primer intento iba del patio al sur en línea recta y
// pasaba limpiamente por el portón, que está abierto — el test decía que no
// había muro y tenía razón. Desde la torre hay que cruzar dos puertas.
const TORRE = { x: RUINA_X, z: RUINA_Z - 12 };
const FUERA = { x: RUINA_X, z: RUINA_Z + 34 };
// al norte de la torre solo hay muro macizo: ni puerta ni ventana
const NORTE = { x: RUINA_X, z: RUINA_Z - 30 };

describe('navegación', () => {
  it('la muralla tapa la vista y el campo abierto no', () => {
    expect(hayPasoLibre(TORRE.x, TORRE.z, NORTE.x, NORTE.z)).toBe(false);
    // y el portón, que SÍ está abierto, deja pasar la vista
    expect(hayPasoLibre(RUINA_X, RUINA_Z + 2, RUINA_X, RUINA_Z + 34)).toBe(true);
    // dos puntos en mitad del lomo, lejos de todo: siempre libre
    expect(hayPasoLibre(40, 40, 10, 60)).toBe(true);
  });

  it('encuentra la salida de la torre al bosque, cruzando dos puertas', () => {
    const camino = buscarCamino(TORRE.x, TORRE.z, FUERA.x, FUERA.z);
    expect(camino).not.toBeNull();
    expect((camino as { x: number; z: number }[]).length).toBeGreaterThan(4);
  });

  it('el camino no atraviesa piedra en ningún tramo', () => {
    const camino = buscarCamino(TORRE.x, TORRE.z, FUERA.x, FUERA.z);
    expect(camino).not.toBeNull();
    const pasos = camino as { x: number; z: number }[];
    // ningún punto del camino cae dentro de un muro...
    for (const p of pasos) {
      const libre = apartarDeMuros(p.x, p.z, MOB_RADIUS);
      expect(
        Math.hypot(libre.x - p.x, libre.z - p.z),
        `paso en (${p.x}, ${p.z}) dentro de un muro`,
      ).toBeLessThan(0.01);
    }
    // ...y ningún tramo entre puntos consecutivos cruza uno
    let anterior = TORRE;
    for (const p of pasos) {
      expect(
        hayPasoLibre(anterior.x, anterior.z, p.x, p.z, MOB_RADIUS),
        `el tramo hasta (${p.x}, ${p.z}) cruza un muro`,
      ).toBe(true);
      anterior = p;
    }
  });

  it('los pasos van de celda en celda, sin saltos', () => {
    const camino = buscarCamino(TORRE.x, TORRE.z, FUERA.x, FUERA.z) as { x: number; z: number }[];
    let anterior = camino[0];
    for (const p of camino.slice(1, -1)) {
      expect(Math.hypot(p.x - anterior.x, p.z - anterior.z)).toBeLessThan(NAV_CELDA * 1.6);
      anterior = p;
    }
  });

  it('es determinista: dos búsquedas iguales dan el mismo camino', () => {
    const a = buscarCamino(TORRE.x, TORRE.z, FUERA.x, FUERA.z);
    olvidarRejilla();
    const b = buscarCamino(TORRE.x, TORRE.z, FUERA.x, FUERA.z);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('un punto metido en el muro también encuentra salida', () => {
    // el centro de una caja sólida: la búsqueda tiene que reflotarlo
    const c = ruina().cajas[0];
    const camino = buscarCamino((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, FUERA.x, FUERA.z);
    expect(camino).not.toBeNull();
  });

  it('lejos del baluarte la rejilla ni se consulta', () => {
    expect(dentroDeLaRejilla(0, 60)).toBe(false);
    expect(dentroDeLaRejilla(RUINA_X, RUINA_Z)).toBe(true);
  });

  it('la guarnición vive dentro de la muralla', () => {
    const dentro = CAMPS.filter((c) => distRuina(c.x, c.z) < 22);
    expect(dentro.length, 'el baluarte tiene que estar guarnecido').toBeGreaterThan(0);
  });

  it('la guarnición sale del patio a por ti en vez de empotrarse', () => {
    const s = new Sim(SEED, { setA: 'medula' });
    // el héroe espera fuera, al sur del portón, sobre la falda
    const px = RUINA_X;
    const pz = RUINA_Z + 30;
    const guarnicion = s
      .mobs()
      .filter((m) => distRuina(m.x, m.z) < 20)
      .slice(0, 3);
    expect(guarnicion.length).toBeGreaterThan(0);

    for (const m of guarnicion) {
      m.aiState = 'chase';
      m.homeX = m.x; // para que el leash no lo suelte a mitad de camino
      m.homeZ = m.z;
    }
    const distInicial = guarnicion.map((m) => Math.hypot(m.x - px, m.z - pz));

    for (let t = 0; t < 400; t++) {
      s.player.x = px;
      s.player.z = pz;
      s.player.y = terrainHeight(px, pz, SEED);
      s.player.hp = s.player.maxHp;
      for (const m of guarnicion) {
        if (m.aiState === 'evade' || m.aiState === 'patrol') m.aiState = 'chase';
      }
      s.tick(move());
    }

    // Todos tienen que haber ACORTADO de verdad. Uno pegado a la muralla se
    // quedaría a la misma distancia tick tras tick, que es exactamente el
    // fallo que este sistema viene a arreglar.
    guarnicion.forEach((m, i) => {
      const ahora = Math.hypot(m.x - px, m.z - pz);
      expect(ahora, `bicho ${m.id} atascado a ${ahora.toFixed(1)} m`).toBeLessThan(
        distInicial[i] - 8,
      );
    });
  });

  it('ningún bicho acaba dentro de un muro', () => {
    const s = new Sim(SEED, { setA: 'medula' });
    s.player.x = RUINA_X;
    s.player.z = RUINA_Z + 26;
    for (let t = 0; t < 300; t++) {
      s.player.y = terrainHeight(s.player.x, s.player.z, SEED);
      s.player.hp = s.player.maxHp;
      s.tick(move());
    }
    for (const m of s.mobs()) {
      if (!m.alive) continue;
      const libre = apartarDeMuros(m.x, m.z, MOB_RADIUS);
      expect(
        Math.hypot(libre.x - m.x, libre.z - m.z),
        `bicho ${m.id} metido en piedra`,
      ).toBeLessThan(0.05);
    }
  });
});
