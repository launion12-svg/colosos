// El lomo del primer coloso: función pura de (x, z, seed).
// El render muestrea EXACTAMENTE estas funciones para construir la malla;
// mantenerlas idénticas entre sim y render es lo que hace que los pies
// toquen el suelo que se ve. (Patrón heredado de WoC world.ts.)

import { Rng, fbm2 } from './rng';

export const COLOSSUS_LENGTH = 380; // eje Z: cola (-) a cabeza (+)
export const COLOSSUS_WIDTH = 116; // eje X
export const MIST_LEVEL = -26; // altura del mar de niebla tóxica
export const VERTEBRA_SPACING = 30;
export const SPAWN_X = 0;
export const SPAWN_Z = -120;

function smoothstep(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

// Factor 0..1 de "estás sobre una vértebra" (hueso asomando en la espina).
export function vertebraFactor(x: number, z: number): number {
  const k = z / VERTEBRA_SPACING;
  const f = k - Math.round(k); // -0.5..0.5, 0 en el centro de cada vértebra
  const along = Math.exp(-f * f * 26);
  const across = Math.exp(-(x * x) / (2 * 6.5 * 6.5));
  return along * across;
}

// Altura del terreno. Pura y determinista: misma (x,z,seed) -> misma altura.
export function terrainHeight(x: number, z: number, seed: number): number {
  const halfL = COLOSSUS_LENGTH / 2;
  const halfW = COLOSSUS_WIDTH / 2;
  const u = Math.abs(x) / halfW; // 0 espina, 1 borde del flanco
  const w = Math.abs(z) / halfL; // 0 centro, 1 cabeza/cola

  // Meseta del lomo que cae hacia los flancos
  let h = 13 * (1 - smoothstep(0.12, 1.0, u));
  // El flanco se desploma hacia la niebla
  h -= 60 * smoothstep(0.8, 1.3, u);
  // La cabeza y la cola caen
  h -= 45 * smoothstep(0.8, 1.15, w);

  // Vértebras: colinas de hueso periódicas sobre la espina
  h += 7 * vertebraFactor(x, z);

  // Ondulación grande (el lomo respira) + detalle fino
  h += (fbm2(x * 0.018 + 7.3, z * 0.018, seed) - 0.5) * 7;
  h += (fbm2(x * 0.09, z * 0.09, seed + 991) - 0.5) * 2.2;

  return h;
}

// Pendiente aproximada (dy máximo por unidad horizontal) por diferencias finitas.
export function terrainSteepness(x: number, z: number, seed: number): number {
  const e = 0.6;
  const h0 = terrainHeight(x, z, seed);
  const hx = terrainHeight(x + e, z, seed);
  const hz = terrainHeight(x, z + e, seed);
  return Math.max(Math.abs(hx - h0), Math.abs(hz - h0)) / e;
}

// Dirección cuesta abajo normalizada (para resbalar en pendientes imposibles).
export function terrainDownhill(x: number, z: number, seed: number): { x: number; z: number } {
  const e = 0.6;
  const dx = terrainHeight(x + e, z, seed) - terrainHeight(x - e, z, seed);
  const dz = terrainHeight(x, z + e, seed) - terrainHeight(x, z - e, seed);
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-6) return { x: 0, z: 0 };
  return { x: -dx / len, z: -dz / len };
}

export type DecorationType = 'oak' | 'pine' | 'bush' | 'wisp';

export interface Decoration {
  type: DecorationType;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

// Vegetación y vida ambiental, determinista a partir de la semilla.
// Sin colisión en F0 (decoración pura).
export function generateDecorations(seed: number): Decoration[] {
  const rng = new Rng(seed ^ 0x5eed);
  const out: Decoration[] = [];
  const halfL = COLOSSUS_LENGTH / 2;
  const halfW = COLOSSUS_WIDTH / 2;
  for (let i = 0; i < 480; i++) {
    const x = rng.range(-halfW, halfW);
    const z = rng.range(-halfL, halfL);
    const y = terrainHeight(x, z, seed);
    const steep = terrainSteepness(x, z, seed);
    // Solo sobre el lomo andable, fuera del hueso pelado de las vértebras
    if (y < 2 || steep > 0.9 || vertebraFactor(x, z) > 0.3) continue;
    const roll = rng.next();
    const type: DecorationType = roll < 0.42 ? 'oak' : roll < 0.62 ? 'pine' : 'bush';
    out.push({ type, x, y, z, scale: rng.range(0.8, 1.5), rot: rng.range(0, Math.PI * 2) });
  }
  // Espectros de niebla flotando cerca de los bordes (vida ambiental)
  for (let i = 0; i < 14; i++) {
    const side = rng.chance(0.5) ? 1 : -1;
    const x = side * rng.range(halfW * 0.55, halfW * 0.95);
    const z = rng.range(-halfL * 0.8, halfL * 0.8);
    const y = Math.max(terrainHeight(x, z, seed) + 2.5, MIST_LEVEL + 4);
    out.push({ type: 'wisp', x, y, z, scale: rng.range(0.8, 1.3), rot: rng.range(0, Math.PI * 2) });
  }
  return out;
}
