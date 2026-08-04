// Navegación: que un bicho sepa rodear un muro en vez de empotrarse.
//
// Es el bloqueo real del modo mazmorra. En campo abierto ir en línea recta al
// jugador basta y sobra; dentro de un edificio, la línea recta es una pared.
//
// El plan tiene dos mitades y la primera es la que hace que esto salga barato:
//   1) ¿hay muro de por medio? Si no lo hay —y el 99% de las veces no lo hay,
//      porque el mundo es casi todo pradera— se va recto y no se busca nada.
//   2) Si lo hay, A* sobre una rejilla de medio metro alrededor del baluarte.
//
// Todo aquí es puro y determinista: mismo estado -> mismo camino, tick a tick.
// El desempate del A* va por índice de celda precisamente por eso.

import { RUINA_X, RUINA_Z, ruina, type Caja } from './structures';

export const NAV_CELDA = 0.5; // lado de celda, en metros
export const NAV_RADIO = 0.45; // holgura del bicho al pasar entre muros
const NAV_ALCANCE = 34; // media anchura de la rejilla alrededor de la ruina
const LADO = Math.ceil((NAV_ALCANCE * 2) / NAV_CELDA); // celdas por eje

// OJO con el tamaño de celda: el hueco libre del portón mide 1,6 m. Con celdas
// de 1 m los centros caían a 0,3 m de la jamba, por debajo del radio del bicho,
// y la rejilla sellaba la puerta de la fortaleza. Con 0,5 m los centros quedan
// a 0,55 y se pasa. Si algún día se estrecha una puerta, revisar esto.

interface Rejilla {
  bloqueada: Uint8Array;
  x0: number;
  z0: number;
}

let rejilla: Rejilla | null = null;

function cajasInfladas(radio: number): Caja[] {
  return ruina().cajas.map((c) => ({
    x0: c.x0 - radio,
    z0: c.z0 - radio,
    x1: c.x1 + radio,
    z1: c.z1 + radio,
  }));
}

function construir(): Rejilla {
  const x0 = RUINA_X - NAV_ALCANCE;
  const z0 = RUINA_Z - NAV_ALCANCE;
  const bloqueada = new Uint8Array(LADO * LADO);
  const cajas = cajasInfladas(NAV_RADIO);
  for (let j = 0; j < LADO; j++) {
    const z = z0 + (j + 0.5) * NAV_CELDA;
    for (let i = 0; i < LADO; i++) {
      const x = x0 + (i + 0.5) * NAV_CELDA;
      for (const c of cajas) {
        if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) {
          bloqueada[j * LADO + i] = 1;
          break;
        }
      }
    }
  }
  return { bloqueada, x0, z0 };
}

function malla(): Rejilla {
  if (!rejilla) rejilla = construir();
  return rejilla;
}

// Solo para los tests: la rejilla se cachea y el baluarte no cambia en partida.
export function olvidarRejilla(): void {
  rejilla = null;
}

export function dentroDeLaRejilla(x: number, z: number): boolean {
  return Math.abs(x - RUINA_X) < NAV_ALCANCE && Math.abs(z - RUINA_Z) < NAV_ALCANCE;
}

// --- Visibilidad: ¿puedo ir en línea recta de A a B sin comerme un muro? ---
// Corte de segmento contra caja por el método de las franjas (slab test).
function corta(c: Caja, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  for (const [inicio, delta, min, max] of [
    [ax, dx, c.x0, c.x1],
    [az, dz, c.z0, c.z1],
  ] as [number, number, number, number][]) {
    if (Math.abs(delta) < 1e-9) {
      if (inicio < min || inicio > max) return false; // paralelo y fuera
      continue;
    }
    let ta = (min - inicio) / delta;
    let tb = (max - inicio) / delta;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

export function hayPasoLibre(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radio = NAV_RADIO,
): boolean {
  // atajo: si ni el origen ni el destino andan cerca del baluarte, no hay nada
  // que esquivar en todo el lomo
  if (!dentroDeLaRejilla(ax, az) && !dentroDeLaRejilla(bx, bz)) return true;
  for (const c of cajasInfladas(radio)) {
    if (corta(c, ax, az, bx, bz)) return false;
  }
  return true;
}

// --- A* ---
// Montón binario mínimo con desempate por índice de celda: sin ese desempate
// dos celdas de igual coste podrían salir en distinto orden y el sim dejaría
// de ser reproducible, que es la propiedad de la que cuelga todo lo demás.
class Monton {
  private f: number[] = [];
  private celda: number[] = [];

  get vacio(): boolean {
    return this.celda.length === 0;
  }

  private antes(a: number, b: number): boolean {
    if (this.f[a] !== this.f[b]) return this.f[a] < this.f[b];
    return this.celda[a] < this.celda[b];
  }

  private cambia(a: number, b: number): void {
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]];
    [this.celda[a], this.celda[b]] = [this.celda[b], this.celda[a]];
  }

  meter(celda: number, f: number): void {
    this.f.push(f);
    this.celda.push(celda);
    let i = this.celda.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.antes(i, p)) break;
      this.cambia(i, p);
      i = p;
    }
  }

  sacar(): number {
    const top = this.celda[0];
    const ultimoF = this.f.pop() as number;
    const ultimaC = this.celda.pop() as number;
    if (this.celda.length > 0) {
      this.f[0] = ultimoF;
      this.celda[0] = ultimaC;
      let i = 0;
      for (;;) {
        const iz = i * 2 + 1;
        const de = iz + 1;
        let mejor = i;
        if (iz < this.celda.length && this.antes(iz, mejor)) mejor = iz;
        if (de < this.celda.length && this.antes(de, mejor)) mejor = de;
        if (mejor === i) break;
        this.cambia(i, mejor);
        i = mejor;
      }
    }
    return top;
  }
}

const RECTO = 1;
const DIAGONAL = Math.SQRT2;
// vecinos en orden FIJO: parte del determinismo
const VECINOS: [number, number, number][] = [
  [1, 0, RECTO],
  [-1, 0, RECTO],
  [0, 1, RECTO],
  [0, -1, RECTO],
  [1, 1, DIAGONAL],
  [1, -1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [-1, -1, DIAGONAL],
];

const MAX_VISITADAS = 6000; // tope de seguridad: nunca colgar el tick

export interface Punto {
  x: number;
  z: number;
}

// Celda libre más cercana a un punto, buscando en anillos. Hace falta porque un
// bicho puede acabar medio metido en un muro (empujado, o recién revivido).
function celdaLibre(g: Rejilla, x: number, z: number): number {
  const ci = Math.floor((x - g.x0) / NAV_CELDA);
  const cj = Math.floor((z - g.z0) / NAV_CELDA);
  for (let r = 0; r <= 8; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (r > 0 && Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= LADO || j >= LADO) continue;
        if (!g.bloqueada[j * LADO + i]) return j * LADO + i;
      }
    }
  }
  return -1;
}

// Camino de (ax,az) a (bx,bz) esquivando la arquitectura. null si no hay.
export function buscarCamino(ax: number, az: number, bx: number, bz: number): Punto[] | null {
  const g = malla();
  const inicio = celdaLibre(g, ax, az);
  const meta = celdaLibre(g, bx, bz);
  if (inicio < 0 || meta < 0) return null;
  if (inicio === meta) return [{ x: bx, z: bz }];

  const metaI = meta % LADO;
  const metaJ = (meta / LADO) | 0;
  const h = (c: number): number => {
    const di = Math.abs((c % LADO) - metaI);
    const dj = Math.abs(((c / LADO) | 0) - metaJ);
    // heurística octogonal: exacta para movimiento en 8 direcciones
    return Math.max(di, dj) + (DIAGONAL - 1) * Math.min(di, dj);
  };

  const gScore = new Map<number, number>();
  const padre = new Map<number, number>();
  const cerrada = new Set<number>();
  const abierta = new Monton();
  gScore.set(inicio, 0);
  abierta.meter(inicio, h(inicio));

  let visitadas = 0;
  while (!abierta.vacio) {
    const actual = abierta.sacar();
    if (cerrada.has(actual)) continue;
    if (actual === meta) break;
    cerrada.add(actual);
    if (++visitadas > MAX_VISITADAS) return null;

    const ci = actual % LADO;
    const cj = (actual / LADO) | 0;
    const gActual = gScore.get(actual) as number;
    for (const [di, dj, coste] of VECINOS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= LADO || j >= LADO) continue;
      const vecino = j * LADO + i;
      if (g.bloqueada[vecino] || cerrada.has(vecino)) continue;
      // nada de cortar esquinas en diagonal: si los dos ortogonales están
      // tapados, por ahí no cabe nadie
      if (di !== 0 && dj !== 0) {
        if (g.bloqueada[cj * LADO + i] && g.bloqueada[j * LADO + ci]) continue;
      }
      const tentativo = gActual + coste;
      const previo = gScore.get(vecino);
      if (previo !== undefined && tentativo >= previo) continue;
      gScore.set(vecino, tentativo);
      padre.set(vecino, actual);
      abierta.meter(vecino, tentativo + h(vecino));
    }
  }

  if (!padre.has(meta) && meta !== inicio) return null;

  const celdas: number[] = [];
  for (let c = meta; c !== inicio; c = padre.get(c) as number) {
    celdas.push(c);
    if (padre.get(c) === undefined) return null;
  }
  celdas.reverse();

  const camino: Punto[] = celdas.map((c) => ({
    x: g.x0 + ((c % LADO) + 0.5) * NAV_CELDA,
    z: g.z0 + (((c / LADO) | 0) + 0.5) * NAV_CELDA,
  }));
  // el último salto va al destino de verdad, no al centro de su celda
  camino[camino.length - 1] = { x: bx, z: bz };
  return camino;
}

// De todos los puntos que quedan por delante, el más lejano que se ve en línea
// recta. Es el "tirar de la cuerda" clásico: sin esto el bicho va dando
// tumbos de celda en celda como una hormiga sobre papel milimetrado.
export function siguientePunto(camino: Punto[], desde: number, x: number, z: number): number {
  let mejor = desde;
  for (let i = camino.length - 1; i >= desde; i--) {
    if (hayPasoLibre(x, z, camino[i].x, camino[i].z)) {
      mejor = i;
      break;
    }
  }
  return mejor;
}
