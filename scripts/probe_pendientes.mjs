import { terrainHeight, terrainSteepness, COLOSSUS_WIDTH, COLOSSUS_LENGTH } from './src/sim/terrain.ts';
const SEED = 20260730;
const bins = {};
let n = 0;
for (let x = -50; x <= 50; x += 1.3) {
  for (let z = -170; z <= 170; z += 1.3) {
    const y = terrainHeight(x, z, SEED);
    if (y < -5) continue; // fuera del lomo andable
    const s = terrainSteepness(x, z, SEED);
    const b = s < 0.5 ? 'llano <0.5' : s < 1.15 ? 'rampa 0.5-1.15' : s < 1.8 ? 'pared 1.15-1.8' : 'muro >1.8';
    bins[b] = (bins[b] || 0) + 1; n++;
  }
}
for (const [k, v] of Object.entries(bins)) console.log(k.padEnd(16), ((v / n) * 100).toFixed(1) + '%');
