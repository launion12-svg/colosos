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
// El lomo no es una loma: son PLACAS, como las escamas de piel del coloso.
//
// Historia de dos intentos fallidos, que explica por qué el código es así:
//   1) cuantizar la ALTURA daba surcos finos, porque el ancho de cada franja
//      es el escalón dividido por la pendiente;
//   2) cuantizar el suelo en una CUADRÍCULA daba un damero de cajas.
// Lo que funciona es Voronoi: el suelo se reparte entre puntos sembrados al
// azar y cada región es una placa plana con contorno irregular. La pared sale
// donde dos placas se tocan, que es justo lo que se ve en la referencia.
export const CELL_SIZE = 19; // separación media entre placas, en metros
export const TERRACE_STEP = 1.5; // por debajo de lo que sube un salto (1,60 m)
const WALL_BAND = 1.5; // ancho de la pared entre placas, en metros
export const GRASS_LIP = 0.42; // cuánto césped desborda por el canto
export const NIVELES = 3; // el suelo y dos placas encima: ni una más

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

// Desorden reproducible por celda (dos valores independientes).
function hash2(cx: number, cz: number, seed: number): [number, number] {
  const a = Math.sin(cx * 127.1 + cz * 311.7 + seed * 0.0013) * 43758.5453;
  const b = Math.sin(cx * 269.5 + cz * 183.3 + seed * 0.0017) * 24634.6345;
  return [a - Math.floor(a), b - Math.floor(b)];
}

// Forma suave del coloso: la que se muestrea en cada semilla para decidir a
// qué cota se asienta su placa.
function shapeHeight(x: number, z: number, seed: number): number {
  const halfL = COLOSSUS_LENGTH / 2;
  const halfW = COLOSSUS_WIDTH / 2;
  const u = Math.abs(x) / halfW; // 0 espina, 1 borde del flanco
  const w = Math.abs(z) / halfL; // 0 centro, 1 cabeza/cola

  let h = 13 * (1 - smoothstep(0.12, 1.0, u)); // meseta del lomo
  h -= 60 * smoothstep(0.8, 1.3, u); // el flanco se desploma hacia la niebla
  h -= 45 * smoothstep(0.8, 1.15, w); // la cabeza y la cola caen
  h += 6 * vertebraFactor(x, z); // vértebras sobre la espina
  // Ondulación MUY suave: es solo la forma del bicho. El relieve de verdad lo
  // ponen las placas, y esas van por niveles.
  h += (fbm2(x * 0.007 + 7.3, z * 0.007, seed) - 0.5) * 4;
  return h;
}

// La cota de una placa: la forma suave en su semilla, redondeada al escalón.
// El desplome del flanco no se escalona (allí el lomo se cae a la niebla).
// El nivel (0, 1 o 2) al que se levanta la placa de una semilla. Exportado
// para poder comprobar de un vistazo que el relieve no se va de tres alturas.
export function plateLevel(sx: number, sz: number, seed: number): number {
  const zona = fbm2(sx * 0.013 + 51, sz * 0.013, seed + 31);
  const [r] = hash2(sx * 0.37, sz * 0.41, seed + 5);
  return Math.max(0, Math.min(NIVELES - 1, Math.floor(zona * 3.5 + (r - 0.5) * 1.1)));
}

function plateHeight(sx: number, sz: number, seed: number): number {
  // TRES alturas y no más: el suelo, y hasta dos placas encima. Antes salía
  // una escalera de siete pisos y parecía una mina a cielo abierto; en la
  // referencia hay una base y como mucho dos peldaños.
  const base = shapeHeight(sx, sz, seed);
  const nivel = plateLevel(sx, sz, seed);
  const u = Math.abs(sx) / (COLOSSUS_WIDTH / 2);
  const enPie = 1 - smoothstep(0.8, 1.05, u); // el flanco que cae no se escalona
  return base + nivel * TERRACE_STEP * enPie;
}

interface Voronoi {
  alto: number; // cota de la placa que pisas
  vecina: number; // cota de la placa de al lado
  borde: number; // 0 en el centro de la placa, 1 pegado al canto
}

// Las dos placas más cercanas y lo cerca que estás de su frontera.
function voronoi(x: number, z: number, seed: number): Voronoi {
  const gx = Math.floor(x / CELL_SIZE);
  const gz = Math.floor(z / CELL_SIZE);
  let d1 = Infinity;
  let d2 = Infinity;
  let s1x = 0;
  let s1z = 0;
  let s2x = 0;
  let s2z = 0;
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const cx = gx + ox;
      const cz = gz + oz;
      const [jx, jz] = hash2(cx, cz, seed);
      const sx = (cx + jx) * CELL_SIZE;
      const sz = (cz + jz) * CELL_SIZE;
      const d = Math.hypot(x - sx, z - sz);
      if (d < d1) {
        d2 = d1;
        s2x = s1x;
        s2z = s1z;
        d1 = d;
        s1x = sx;
        s1z = sz;
      } else if (d < d2) {
        d2 = d;
        s2x = sx;
        s2z = sz;
      }
    }
  }
  return {
    alto: plateHeight(s1x, s1z, seed),
    vecina: plateHeight(s2x, s2z, seed),
    // (d2-d1)/2 es la distancia a la frontera entre las dos placas
    borde: 1 - smoothstep(0, WALL_BAND, (d2 - d1) / 2),
  };
}

// Altura del terreno. Pura y determinista: misma (x,z,seed) -> misma altura.
// Plana dentro de cada placa, con una pared corta en la frontera.
export function terrainHeight(x: number, z: number, seed: number): number {
  const v = voronoi(x, z, seed);
  if (v.borde <= 0) return v.alto;
  // solo se baja hacia la vecina MÁS BAJA: así el canto es un escalón hacia
  // fuera y no un valle entre dos placas
  const destino = Math.min(v.alto, v.vecina);
  return v.alto + (destino - v.alto) * smoothstep(0, 1, v.borde) * 0.5;
}

// Cota de la placa que se pisa, sin la pared. La usa el render para saber
// cuánto césped desborda por el canto.
export function plateauTop(x: number, z: number, seed: number): number {
  return voronoi(x, z, seed).alto;
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
      // ojo: la brizna se coloca DESPLAZADA, y ese punto puede caer por el
      // canto de la placa. Sin esta comprobación aparecía hierba flotando
      // sobre la niebla.
      if (terrainHeight(p.x + dx, p.z + dz, seed) < 1) continue;
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
