// La economía de XP, calculada y no adivinada: cuánta XP hay en el lomo,
// cuántas muertes hacen falta para plantarse ante el jefe y con qué nivel
// llegas. Si algún día se desmadra una cifra, este test lo canta.
//
// Imprime la tabla al ejecutarlo (npx vitest run tests/economia.test.ts).

import { describe, expect, it } from 'vitest';
import { BESTIARY, CAMPS } from '../src/sim/bestiary';
import { WEAPON_MAX_LEVEL, weaponXpToNext, xpToNext } from '../src/sim/types';

// XP total para llegar del nivel 1 al nivel dado
function xpHastaNivel(nivel: number): number {
  let total = 0;
  for (let l = 1; l < nivel; l++) total += xpToNext(l);
  return total;
}

function xpMaestriaHasta(nivel: number): number {
  let total = 0;
  for (let l = 1; l < nivel; l++) total += weaponXpToNext(l);
  return total;
}

// Nivel al que llegas con una cantidad de XP acumulada
function nivelCon(xp: number): number {
  let nivel = 1;
  let resto = xp;
  while (resto >= xpToNext(nivel)) {
    resto -= xpToNext(nivel);
    nivel++;
  }
  return nivel;
}

function maestriaCon(xp: number): number {
  let nivel = 1;
  let resto = xp;
  while (nivel < WEAPON_MAX_LEVEL && resto >= weaponXpToNext(nivel)) {
    resto -= weaponXpToNext(nivel);
    nivel++;
  }
  return nivel;
}

describe('economía de XP del lomo', () => {
  const jefe = BESTIARY.gigante;
  // todo lo que hay en el mundo salvo el jefe: la escalera hasta su puerta
  const previos = CAMPS.filter((c) => !BESTIARY[c.template].boss);
  const xpUnaVuelta = previos.reduce((a, c) => a + BESTIARY[c.template].xp * c.count, 0);
  const bichosUnaVuelta = previos.reduce((a, c) => a + c.count, 0);

  it('imprime la tabla de la escalera', () => {
    const filas = Object.values(BESTIARY)
      .sort((a, b) => a.level - b.level)
      .map((t) => {
        const camps = CAMPS.filter((c) => c.template === t.id);
        const cuantos = camps.reduce((a, c) => a + c.count, 0);
        return `  Nv ${String(t.level).padStart(2)} · ${t.nombre.padEnd(22)} ${String(t.hp).padStart(5)} vida  ${String(t.dmgMin).padStart(2)}-${String(t.dmgMax).padEnd(2)} daño  ${String(t.xp).padStart(3)} px  ×${cuantos}`;
      });
    const vueltas = [1, 2, 3, 4];
    const acumulado = vueltas.map((v) => {
      const xp = xpUnaVuelta * v;
      return `  ${v} vuelta${v > 1 ? 's' : ''} (${bichosUnaVuelta * v} bichos): ${xp} px → personaje Nv ${nivelCon(xp)}, maestría ${maestriaCon(xp)}/${WEAPON_MAX_LEVEL}`;
    });
    console.log(
      [
        '',
        'BESTIARIO',
        ...filas,
        '',
        `UNA VUELTA COMPLETA AL LOMO (sin el jefe): ${bichosUnaVuelta} bichos, ${xpUnaVuelta} px`,
        ...acumulado,
        '',
        `Jefe: ${jefe.nombre} · Nv ${jefe.level} · ${jefe.hp} vida · ${jefe.xp} px`,
        `Para el personaje Nv 12 hacen falta ${xpHastaNivel(12)} px`,
        `Para maestría 8 (segunda habilidad + margen) hacen falta ${xpMaestriaHasta(8)} px`,
        '',
      ].join('\n'),
    );
    expect(filas.length).toBe(Object.keys(BESTIARY).length);
  });

  it('una vuelta al lomo no basta: hay que farmear para el jefe', () => {
    // si con una sola pasada ya llegaras al jefe sobrado, el mundo sería un pasillo
    expect(nivelCon(xpUnaVuelta)).toBeLessThan(12);
  });

  it('tres vueltas dejan al personaje y al arma listos para el jefe', () => {
    const xp = xpUnaVuelta * 3;
    expect(nivelCon(xp)).toBeGreaterThanOrEqual(11);
    // con esa XP en una sola arma, su árbol ya tiene la segunda habilidad
    expect(maestriaCon(xp)).toBeGreaterThanOrEqual(8);
  });

  it('el jefe pega y aguanta como un jefe: fuera de la escala del resto', () => {
    const normales = Object.values(BESTIARY).filter((t) => !t.boss);
    const masDuro = Math.max(...normales.map((t) => t.hp));
    const masFuerte = Math.max(...normales.map((t) => t.dmgMax));
    expect(jefe.hp).toBeGreaterThan(masDuro * 2.5);
    expect(jefe.dmgMax).toBeGreaterThan(masFuerte);
    expect(jefe.xp).toBeGreaterThan(Math.max(...normales.map((t) => t.xp)) * 2);
  });

  it('la escalera sube de verdad: más nivel es más vida, más daño y más XP', () => {
    const orden = Object.values(BESTIARY).sort((a, b) => a.level - b.level);
    for (let i = 1; i < orden.length; i++) {
      const a = orden[i - 1];
      const b = orden[i];
      expect(b.hp, `${b.id} debería aguantar más que ${a.id}`).toBeGreaterThan(a.hp);
      expect(b.dmgMax, `${b.id} debería pegar más que ${a.id}`).toBeGreaterThan(a.dmgMax);
      expect(b.xp, `${b.id} debería dar más XP que ${a.id}`).toBeGreaterThan(a.xp);
    }
  });

  it('los campamentos están ordenados por dificultad de la cola a la cabeza', () => {
    const conNivel = CAMPS.map((c) => ({ z: c.z, level: BESTIARY[c.template].level }));
    // no exigimos monotonía estricta (hay repechos), pero sí correlación fuerte
    const primeros = conNivel.filter((c) => c.z < -40);
    const ultimos = conNivel.filter((c) => c.z > 40);
    const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(media(ultimos.map((c) => c.level))).toBeGreaterThan(
      media(primeros.map((c) => c.level)) * 2,
    );
  });
});
