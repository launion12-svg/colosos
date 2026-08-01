// El lomo del primer coloso: función pura de (x, z, seed).
// El render muestrea EXACTAMENTE estas funciones para construir la malla;
// mantenerlas idénticas entre sim y render es lo que hace que los pies
// toquen el suelo que se ve. (Patrón heredado de WoC world.ts.)

import { Rng, fbm2 } from './rng';

export const COLOSSUS_LENGTH = 380; // eje Z: cola (-) a cabeza (+)
export const COLOSSUS_WIDTH = 116; // eje X
export const MIST_LEVEL = -26; // altura del mar de niebla tóxica
export const VERTEBRA_SPACING = 30;
// El lomo no es una loma lisa: es una escalera de mesetas, como las placas de
// piel del coloso. La altura se cuantiza a escalones de TERRACE_STEP con una
// banda de transición estrecha (el "acantilado"). El escalón mide menos que lo
// que sube un salto (1,6 m), así que siempre se puede subir de un brinco.
export const TERRACE_STEP = 1.5; // por debajo de lo que sube un salto (1,60 m)
const TERRACE_EDGE = 0.09; // parte del escalón que ocupa la pared (0..1)
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

// Cuantiza una altura a mesetas planas separadas por paredes cortas.
function terrace(h: number): number {
  const t = h / TERRACE_STEP;
  const base = Math.floor(t);
  const frac = t - base;
  if (frac < 1 - TERRACE_EDGE) return base * TERRACE_STEP; // meseta plana
  const k = (frac - (1 - TERRACE_EDGE)) / TERRACE_EDGE; // 0..1 dentro de la pared
  return (base + smoothstep(0, 1, k)) * TERRACE_STEP;
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

  // Vértebras: mesetas de hueso periódicas sobre la espina
  h += 6 * vertebraFactor(x, z);

  // Ondulación grande (el lomo respira) + detalle fino
  // OJO: el ANCHO de cada meseta es el escalón dividido por la pendiente del
  // terreno de base. Con el ruido antiguo (amplitud 7, frecuencia 0,018) salían
  // terrazas de 7 m que parecían un mapa topográfico; suavizándolo salen
  // mesetas de veinte y pico metros, que es lo que se ve en la referencia.
  h += (fbm2(x * 0.009 + 7.3, z * 0.009, seed) - 0.5) * 5;
  h += (fbm2(x * 0.045, z * 0.045, seed + 991) - 0.5) * 1.1;

  // Escalonado. El hueso de las vértebras se queda liso (es hueso, no tierra)
  // y los flancos que se desploman también: allí las terrazas no pintan nada.
  // El escalonado alcanza a TODO el lomo andable, hueso incluido: si las
  // vértebras se quedaban lisas parecían dunas de arena en mitad de la escalera.
  const enPie = 1 - smoothstep(0.85, 1.15, u); // fuera del desplome del flanco
  return h + (terrace(h) - h) * enPie;
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

// Las piezas de naturaleza viven en un único GLB (nature.glb); aquí solo se
// nombran. 'wisp' es el espectro flotante, que tiene su propio modelo.
export type DecorationType = string;

export interface Decoration {
  type: DecorationType;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

// El lomo tiene tres tramos y cada uno se viste distinto: la cola es roca
// pelada donde poco agarra, el centro es el bosque espeso, y cerca de la
// cabeza el viento seca los árboles.
interface Tramo {
  hasta: number; // z máximo del tramo
  arboles: string[];
  matas: string[];
  densidad: number; // multiplicador de vegetación
}

const TRAMOS: Tramo[] = [
  { hasta: -90, arboles: ['seco_1', 'seco_2', 'pino_2'], matas: ['mata_3'], densidad: 0.45 },
  {
    hasta: -20,
    arboles: ['arbol_1', 'arbol_2', 'arbol_3', 'pino_1'],
    matas: ['mata_1', 'mata_2', 'mata_3'],
    densidad: 1,
  },
  {
    hasta: 55,
    arboles: ['pino_1', 'pino_2', 'arbol_2'],
    matas: ['mata_1', 'mata_2'],
    densidad: 0.8,
  },
  { hasta: 999, arboles: ['seco_1', 'seco_2'], matas: ['mata_3'], densidad: 0.4 },
];

const ROCAS = ['roca_1', 'roca_2', 'roca_3', 'roca_4', 'roca_5'];
const HIERBAS = ['hierba_1', 'hierba_2'];

function tramoDe(z: number): Tramo {
  return TRAMOS.find((t) => z <= t.hasta) ?? TRAMOS[TRAMOS.length - 1];
}

// Vegetación y vida ambiental, determinista a partir de la semilla.
// Sin colisión: es decorado. Las reglas son de sentido común y hacen casi todo
// el trabajo de que el sitio parezca un sitio: los árboles solo en llano, las
// rocas justo donde rompe la terraza (tapan la costura), y hierba a puñados.
export function generateDecorations(seed: number): Decoration[] {
  const rng = new Rng(seed ^ 0x5eed);
  const out: Decoration[] = [];
  const halfL = COLOSSUS_LENGTH / 2;
  const halfW = COLOSSUS_WIDTH / 2;

  const sitio = (): { x: number; z: number; y: number; steep: number; bone: number } => {
    const x = rng.range(-halfW, halfW);
    const z = rng.range(-halfL, halfL);
    return {
      x,
      z,
      y: terrainHeight(x, z, seed),
      steep: terrainSteepness(x, z, seed),
      bone: vertebraFactor(x, z),
    };
  };

  // Árboles: solo sobre meseta llana y lejos del hueso pelado
  for (let i = 0; i < 1400; i++) {
    const p = sitio();
    if (p.y < 2 || p.steep > 0.75 || p.bone > 0.3) continue;
    const t = tramoDe(p.z);
    if (!rng.chance(0.5 * t.densidad)) continue;
    out.push({
      type: t.arboles[Math.floor(rng.next() * t.arboles.length)],
      x: p.x,
      y: p.y,
      z: p.z,
      scale: rng.range(1.1, 1.9), // el pack viene a escala pequeña para el héroe
      rot: rng.range(0, Math.PI * 2),
    });
  }

  // Matorral: aguanta algo más de pendiente y se apiña bajo los árboles
  for (let i = 0; i < 1300; i++) {
    const p = sitio();
    if (p.y < 1.5 || p.steep > 1.1 || p.bone > 0.45) continue;
    const t = tramoDe(p.z);
    if (!rng.chance(0.34 * t.densidad)) continue;
    out.push({
      type: t.matas[Math.floor(rng.next() * t.matas.length)],
      x: p.x,
      y: p.y,
      z: p.z,
      scale: rng.range(0.7, 1.3),
      rot: rng.range(0, Math.PI * 2),
    });
  }

  // Hierba: en matas de varias briznas juntas, no espigas sueltas por el campo
  for (let i = 0; i < 1100; i++) {
    const p = sitio();
    if (p.y < 1 || p.steep > 0.7 || p.bone > 0.55) continue;
    const cuantas = 2 + Math.floor(rng.next() * 4);
    for (let k = 0; k < cuantas; k++) {
      const dx = rng.range(-1.4, 1.4);
      const dz = rng.range(-1.4, 1.4);
      out.push({
        type: HIERBAS[Math.floor(rng.next() * HIERBAS.length)],
        x: p.x + dx,
        y: terrainHeight(p.x + dx, p.z + dz, seed),
        z: p.z + dz,
        scale: rng.range(0.5, 0.95),
        rot: rng.range(0, Math.PI * 2),
      });
    }
  }

  // Rocas: EN el quiebro de la terraza. Es el truco que hace que el escalón
  // parezca tallado y no un corte de tijera.
  for (let i = 0; i < 1800; i++) {
    const p = sitio();
    if (p.y < 0.5 || p.bone > 0.6) continue;
    const enElBorde = p.steep > 0.6 && p.steep < 2.4;
    if (!enElBorde && !rng.chance(0.06)) continue; // alguna suelta por el llano
    out.push({
      type: ROCAS[Math.floor(rng.next() * ROCAS.length)],
      x: p.x,
      y: p.y - rng.range(0.1, 0.5), // medio enterradas
      z: p.z,
      scale: rng.range(0.6, 1.8),
      rot: rng.range(0, Math.PI * 2),
    });
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
