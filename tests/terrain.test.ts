// El terreno es una función pura: el render y el sim muestrean lo mismo.

import { describe, expect, it } from 'vitest';
import { GRAVITY, JUMP_VELOCITY } from '../src/sim/types';
import {
  COLOSSUS_LENGTH,
  COLOSSUS_WIDTH,
  MIST_LEVEL,
  SPAWN_X,
  NIVELES,
  plateLevel,
  SPAWN_Z,
  TERRACE_STEP,
  generateDecorations,
  terrainHeight,
  terrainSteepness,
  vertebraFactor,
} from '../src/sim/terrain';

const SEED = 20260730;

describe('terreno del coloso', () => {
  it('es determinista: misma entrada, misma altura', () => {
    for (let i = 0; i < 50; i++) {
      const x = ((i * 7.3) % COLOSSUS_WIDTH) - COLOSSUS_WIDTH / 2;
      const z = ((i * 13.7) % COLOSSUS_LENGTH) - COLOSSUS_LENGTH / 2;
      expect(terrainHeight(x, z, SEED)).toBe(terrainHeight(x, z, SEED));
    }
  });

  it('la espina es más alta que los flancos', () => {
    for (const z of [-100, -50, 0, 50, 100]) {
      const spine = terrainHeight(0, z, SEED);
      const flank = terrainHeight(COLOSSUS_WIDTH * 0.7, z, SEED);
      expect(spine).toBeGreaterThan(flank);
    }
  });

  it('los flancos lejanos se hunden bajo la niebla', () => {
    expect(terrainHeight(COLOSSUS_WIDTH, 0, SEED)).toBeLessThan(MIST_LEVEL);
  });

  it('el spawn es suelo andable y seguro', () => {
    const h = terrainHeight(SPAWN_X, SPAWN_Z, SEED);
    expect(h).toBeGreaterThan(0);
    expect(terrainSteepness(SPAWN_X, SPAWN_Z, SEED)).toBeLessThan(1.0);
  });

  it('vertebraFactor está acotado en [0,1] y pica en la espina', () => {
    for (let i = 0; i < 100; i++) {
      const v = vertebraFactor(i * 3 - 150, i * 5 - 250);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(vertebraFactor(0, 0)).toBeGreaterThan(vertebraFactor(30, 0));
  });

  it('las decoraciones son deterministas y caen en suelo válido', () => {
    const a = generateDecorations(SEED);
    const b = generateDecorations(SEED);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(100);
    for (const d of a) {
      if (d.type === 'wisp') continue;
      // el suelo válido ya no es "y > 0": con las terrazas hay mesetas a cota
      // cero. Lo que no puede pasar es que algo aparezca colgando en la niebla.
      expect(d.y).toBeGreaterThan(MIST_LEVEL + 8);
    }
  });

  it('el lomo es una escalera: mesetas planas y anchas, no una loma lisa', () => {
    // recorre una línea larga por el lomo y mide cuánto de plano hay
    let iguales = 0;
    let muestras = 0;
    let alturas = new Set<string>();
    for (let z = -140; z < 140; z += 0.5) {
      const h0 = terrainHeight(6, z, SEED);
      const h1 = terrainHeight(6, z + 0.5, SEED);
      muestras++;
      if (Math.abs(h1 - h0) < 0.01) iguales++;
      alturas.add(h0.toFixed(3));
    }
    // la mayor parte del recorrido es placa plana, no cuesta
    expect(iguales / muestras).toBeGreaterThan(0.6);
    // y hay placas a distintas cotas: si no, sería una mesa de billar
    expect(alturas.size).toBeGreaterThan(4);
  });

  it('el relieve son TRES niveles y no más: el suelo y dos placas encima', () => {
    // Se mide el NIVEL de placa, no la altura: la altura incluye la forma del
    // bicho (el lomo es una cúpula y las vértebras abultan), y eso no es
    // relieve de placas.
    const vistos = new Set<number>();
    for (let x = -50; x <= 50; x += 2.5) {
      for (let z = -160; z <= 160; z += 2.5) {
        const n = plateLevel(x, z, SEED);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(NIVELES - 1);
        vistos.add(n);
      }
    }
    expect(vistos.size).toBe(NIVELES); // y los tres se usan de verdad
  });

  it('los escalones se pueden subir de un salto', () => {
    // la altura que gana un salto: v² / 2g
    const alturaSalto = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
    expect(TERRACE_STEP).toBeLessThan(alturaSalto);
  });
});
