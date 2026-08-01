// El terreno es una función pura: el render y el sim muestrean lo mismo.

import { describe, expect, it } from 'vitest';
import {
  COLOSSUS_LENGTH,
  COLOSSUS_WIDTH,
  MIST_LEVEL,
  SPAWN_X,
  SPAWN_Z,
  generateDecorations,
  terrainHeight,
  terrainSteepness,
  vertebraFactor,
} from '../src/sim/terrain';

const SEED = 20260730;

describe('terreno del coloso', () => {
  it('es determinista: misma entrada, misma altura', () => {
    for (let i = 0; i < 50; i++) {
      const x = (i * 7.3) % COLOSSUS_WIDTH - COLOSSUS_WIDTH / 2;
      const z = (i * 13.7) % COLOSSUS_LENGTH - COLOSSUS_LENGTH / 2;
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
      expect(d.y).toBeGreaterThan(0);
    }
  });
});
