// El Baluarte Roto: la primera arquitectura de verdad del juego. Lo que hay
// que garantizar es que la explanada sea LLANA (las piezas modulares no
// perdonan un suelo ondulado), que los muros sean sólidos, y que se pueda
// entrar por la puerta.

import { describe, expect, it } from 'vitest';
import { CAMPS } from '../src/sim/bestiary';
import { buscarCamino } from '../src/sim/navigation';
import { Sim } from '../src/sim/sim';
import {
  RUINA_DENTRO,
  RUINA_X,
  RUINA_Z,
  apartarDeMuros,
  distRuina,
  ruina,
} from '../src/sim/structures';
import { generateDecorations, plazaHeight, terrainHeight } from '../src/sim/terrain';
import { IDLE_INPUT, type MoveInput } from '../src/sim/types';

const SEED = 21;
const move = (over: Partial<MoveInput> = {}): MoveInput => ({
  ...IDLE_INPUT,
  ...over,
});

describe('el baluarte roto', () => {
  it('la explanada es llana de verdad, no "casi llana"', () => {
    const cota = plazaHeight(SEED);
    let peor = 0;
    for (let x = -20; x <= 20; x += 1.5) {
      for (let z = -20; z <= 20; z += 1.5) {
        const h = terrainHeight(RUINA_X + x, RUINA_Z + z, SEED);
        peor = Math.max(peor, Math.abs(h - cota));
      }
    }
    expect(peor).toBeLessThan(0.01);
  });

  // Lo que importa de la falda no es un número de pendiente sino que se pueda
  // subir: se planta al héroe fuera, mirando al portón, y se le deja andar.
  it('se puede subir del bosque al patio andando y entrar por el portón', () => {
    const s = new Sim(SEED, { setA: 'medula' });
    s.player.x = RUINA_X;
    s.player.z = RUINA_Z + 46; // abajo, en el bosque, al sur del baluarte
    s.player.y = terrainHeight(s.player.x, s.player.z, SEED);
    for (let t = 0; t < 240; t++) s.tick(move({ moveZ: -1 }));
    // ha cruzado el arco y está dentro del recinto
    expect(s.player.z).toBeLessThan(RUINA_Z + 20);
    expect(Math.abs(s.player.x - RUINA_X)).toBeLessThan(4);
    // y está a la cota de la explanada, no colgado a media cuesta
    expect(Math.abs(s.player.y - plazaHeight(SEED))).toBeLessThan(0.3);
  });

  it('usa las piezas del kit y ninguna se queda sin colocar', () => {
    const { piezas, cajas } = ruina();
    expect(piezas.length).toBeGreaterThan(150);
    expect(cajas.length).toBeGreaterThan(30);
    // La ARQUITECTURA va a escuadra: un muro girado 23° rompe la retícula y
    // se ve el hueco. El atrezo (barriles, cajas) sí gira a capricho, que es
    // justo lo que hace que no parezca colocado con regla.
    for (const p of piezas) {
      if (!/^(muro|losa|tierra|pilar|escalera)/.test(p.pieza)) continue;
      const cuartos = p.rot / (Math.PI / 2);
      expect(Math.abs(cuartos - Math.round(cuartos)), `${p.pieza} torcida`).toBeLessThan(1e-9);
    }
    // hay muralla, suelo, torre y atrezo
    const tipos = new Set(piezas.map((p) => p.pieza));
    for (const t of ['muro', 'pilar', 'muro_puerta', 'losa', 'antorcha', 'escombro']) {
      expect(tipos.has(t), `falta ${t}`).toBe(true);
    }
  });

  it('un muro es un muro: no se atraviesa', () => {
    const { cajas } = ruina();
    for (const c of cajas) {
      const cx = (c.x0 + c.x1) / 2;
      const cz = (c.z0 + c.z1) / 2;
      const fuera = apartarDeMuros(cx, cz, 0.45);
      // el centro de una caja SIEMPRE tiene que salir despedido
      expect(Math.hypot(fuera.x - cx, fuera.z - cz)).toBeGreaterThan(0.3);
    }
  });

  it('lejos del baluarte no estorba nada', () => {
    const p = apartarDeMuros(RUINA_X + 80, RUINA_Z + 80, 0.45);
    expect(p.x).toBe(RUINA_X + 80);
    expect(p.z).toBe(RUINA_Z + 80);
  });

  it('el portón deja pasar y la muralla de al lado no', () => {
    // el arco está en el sur (z = +22 relativo), centrado en x
    const enElHueco = apartarDeMuros(RUINA_X, RUINA_Z + 22, 0.45);
    expect(Math.hypot(enElHueco.x - RUINA_X, enElHueco.z - (RUINA_Z + 22))).toBeLessThan(0.01);
    // cuatro metros a un lado ya es muralla
    const contraElMuro = apartarDeMuros(RUINA_X + 4, RUINA_Z + 22, 0.45);
    expect(
      Math.hypot(contraElMuro.x - (RUINA_X + 4), contraElMuro.z - (RUINA_Z + 22)),
    ).toBeGreaterThan(0.3);
  });

  it('el jugador choca contra la muralla en vez de colarse', () => {
    const s = new Sim(SEED, { setA: 'medula' });
    // plantado dentro del patio, empujando hacia el norte contra la torre
    s.player.x = RUINA_X;
    s.player.z = RUINA_Z - 2;
    s.player.y = terrainHeight(s.player.x, s.player.z, SEED);
    for (let t = 0; t < 120; t++) s.tick(move({ moveZ: -1 }));
    // la cara sur de la torre está en z = -6; con puerta en x=0 entra, pero
    // no puede seguir atravesando la cara norte (z = -18)
    expect(s.player.z).toBeGreaterThan(RUINA_Z - 18);
  });

  // Este test decía lo contrario hasta que los bichos aprendieron a rodear un
  // muro: entonces un campamento dentro del recinto era un fallo. Ahora la
  // guarnición es una función, y lo que hay que garantizar es que tenga
  // salida — un pack encerrado sin ruta al exterior sí sería un fallo.
  it('todo campamento del recinto tiene salida al exterior', () => {
    const fuera = { x: RUINA_X, z: RUINA_Z + 34 };
    for (const c of CAMPS) {
      if (distRuina(c.x, c.z) > 22) continue; // este vive fuera, no aplica
      const camino = buscarCamino(c.x, c.z, fuera.x, fuera.z);
      expect(camino, `${c.template} en (${c.x}, ${c.z}) está emparedado`).not.toBeNull();
    }
  });

  it('no crece vegetación dentro del recinto', () => {
    for (const d of generateDecorations(SEED)) {
      if (d.type === 'wisp') continue;
      expect(distRuina(d.x, d.z), `${d.type} colado en el patio`).toBeGreaterThan(RUINA_DENTRO);
    }
  });
});
