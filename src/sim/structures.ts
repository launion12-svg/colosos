// Estructuras construidas con piezas modulares (dungeon.glb).
//
// Esto es el ensayo del modo mazmorra: el kit de KayKit está hecho sobre una
// retícula de 4 m — los muros miden 4 de ancho por 4 de alto con la base en
// Y=0, y las losas son 4x4 — así que colocar arquitectura es rellenar celdas,
// no esculpir un heightfield. Que es justo lo que el terreno no sabe hacer:
// un muro vertical.
//
// La salida es DATO PURO: una lista de piezas colocadas (que el render
// instancia) y una lista de cajas sólidas (que el sim usa para chocar). Un
// generador procedural de mazmorras emitiría exactamente lo mismo, que es la
// gracia de escribirlo así desde ya.

export const MODULO = 4; // lado de celda del kit, en metros

// --- El Baluarte Roto: un puesto en ruinas en mitad del bosque ---
export const RUINA_X = 0;
export const RUINA_Z = -70;
export const PLINTO = 3; // cuánto se levanta la explanada sobre el lomo
// OJO con estos dos números: la explanada llana tiene que cubrir el enlosado
// ENTERO, esquinas incluidas. Con distancia octogonal la esquina del recinto
// (22, 22) queda a 27,3 — más lejos que el lado — así que RUINA_DENTRO va por
// encima de eso o las torres de las esquinas se construyen en cuesta.
export const RUINA_DENTRO = 29; // radio de la explanada llana
export const RUINA_FUERA = 40; // hasta dónde llega la falda de tierra

const BORDE = 22; // media anchura del enlosado (5 celdas y media)

export interface Placed {
  pieza: string;
  x: number;
  y: number; // relativa a la cota de la explanada
  z: number;
  rot: number; // radianes, siempre múltiplo de 90°
}

// Caja sólida alineada a los ejes. Los muros solo giran en múltiplos de 90°,
// así que no hace falta nada más caro que esto.
export interface Caja {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const N = 0;
const E = Math.PI / 2;
const S = Math.PI;
const O = -Math.PI / 2;

// Ruido entero reproducible: decide qué variante de muro toca en cada hueco
// sin necesidad de arrastrar un Rng por todo el constructor.
function dado(a: number, b: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// Distancia octogonal al centro de la ruina: cuadrada pero con las esquinas
// matadas, para que la explanada no sea un ladrillo.
export function distRuina(x: number, z: number): number {
  const dx = Math.abs(x - RUINA_X);
  const dz = Math.abs(z - RUINA_Z);
  return Math.max(Math.max(dx, dz), (dx + dz) * 0.62);
}

interface Ruina {
  piezas: Placed[];
  cajas: Caja[];
}

let cache: Ruina | null = null;

export function ruina(): Ruina {
  if (cache) return cache;
  const piezas: Placed[] = [];
  const cajas: Caja[] = [];

  const pon = (pieza: string, x: number, z: number, rot = N, y = 0): void => {
    piezas.push({ pieza, x: RUINA_X + x, y, z: RUINA_Z + z, rot });
  };
  // Caja de un muro: 4 m de largo por 1,2 de grueso, orientada según el giro.
  const solido = (x: number, z: number, rot: number, largo = 4, grueso = 1.2): void => {
    const horizontal = Math.abs(Math.cos(rot)) > 0.5; // mira a norte/sur
    const hx = (horizontal ? largo : grueso) / 2;
    const hz = (horizontal ? grueso : largo) / 2;
    cajas.push({
      x0: RUINA_X + x - hx,
      z0: RUINA_Z + z - hz,
      x1: RUINA_X + x + hx,
      z1: RUINA_Z + z + hz,
    });
  };

  // --- Enlosado del patio ---
  // Un tapiz de losas de 4 m con algunas rotas y otras comidas por la hierba:
  // el suelo liso de una sola pieza es lo que delata a un decorado.
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -5; gz <= 5; gz++) {
      const d = dado(gx + 40, gz + 40);
      const dentroTorre = Math.abs(gx) <= 1 && gz >= -4 && gz <= -2;
      let losa = 'losa';
      if (dentroTorre) losa = d < 0.4 ? 'losa_rota' : 'losa';
      else if (d < 0.14) losa = 'losa_rota';
      else if (d < 0.3) losa = 'tierra';
      pon(losa, gx * MODULO, gz * MODULO, [N, E, S, O][Math.floor(d * 4) % 4]);
    }
  }
  // orla de losa pequeña por fuera del enlosado, para que el borde no corte a hueso
  for (let i = -11; i <= 11; i++) {
    const t = i * 2;
    for (const [x, z] of [
      [t, -BORDE - 2],
      [t, BORDE + 2],
      [-BORDE - 2, t],
      [BORDE + 2, t],
    ]) {
      if (dado(x + 3, z + 7) < 0.55) pon('losa_hierba', x, z, N);
    }
  }

  // --- Muralla exterior ---
  // La variedad la deciden los dados: casi todo muro entero, con grietas,
  // ventanas, tramos partidos y tres huecos donde se vino abajo del todo.
  // OJO: 'muro_arco' es un arco CIEGO, macizo — se ve el relieve pero no se
  // pasa. El único que tiene hueco de verdad es 'muro_puerta'. Lo aprendí
  // montando el portón con el arco y quedándome fuera de mi propia fortaleza.
  const variante = (i: number, j: number): string => {
    const d = dado(i, j);
    if (d < 0.1) return 'muro_roto';
    if (d < 0.24) return 'muro_agrietado';
    if (d < 0.34) return 'muro_ventana';
    if (d < 0.42) return 'muro_arco';
    return 'muro';
  };

  for (let g = -5; g <= 5; g++) {
    const t = g * MODULO;
    // sur (donde está la puerta), norte, oeste, este
    const lados: [number, number, number, number][] = [
      [t, BORDE, N, 1],
      [t, -BORDE, N, 2],
      [-BORDE, t, E, 3],
      [BORDE, t, E, 4],
    ];
    for (const [x, z, rot, lado] of lados) {
      if (lado === 1 && g === 0) {
        // el portón: hueco de verdad, con dos jambas sólidas y el paso libre
        pon('muro_puerta', x, z, rot);
        solido(x - 1.4, z, rot, 1.2);
        solido(x + 1.4, z, rot, 1.2);
        continue;
      }
      const d = dado(g * 7 + lado, lado * 13);
      if (d > 0.88) {
        // Aquí la muralla se cayó. Escombro_bajo y no escombro: el grande mide
        // 8 m y se comía dos celdas, con lo que el boquete parecía un
        // corrimiento de tierra en vez de un muro caído.
        pon('escombro_bajo', x, z, rot);
        continue;
      }
      pon(variante(g * 7 + lado, lado), x, z, rot);
      solido(x, z, rot);
    }
  }
  // Esquinas: un pilar cuadrado de contrafuerte. La pieza 'muro_esquina' del
  // kit tiene el pivote en una esquina y no en el centro, así que encajarla
  // pedía adivinar giros; el pilar va a eje y cierra igual de bien.
  for (const [x, z] of [
    [-BORDE, -BORDE],
    [BORDE, -BORDE],
    [BORDE, BORDE],
    [-BORDE, BORDE],
  ]) {
    pon('pilar', x, z, N);
    solido(x, z, N, 2, 2);
  }

  // --- La torre del homenaje, al fondo del patio ---
  // Tres celdas por tres: 12x12 m con la puerta mirando al portón.
  const TN = -18; // cara norte
  const TS = -6; // cara sur
  const TO = -6; // cara oeste
  const TE = 6; // cara este
  for (const x of [-4, 0, 4]) {
    pon(dado(x, 1) < 0.3 ? 'muro_agrietado' : 'muro', x, TN, N);
    solido(x, TN, N);
    if (x === 0) {
      pon('muro_puerta', x, TS, S);
      solido(x - 1.4, TS, S, 1.2);
      solido(x + 1.4, TS, S, 1.2);
    } else {
      pon(dado(x, 2) < 0.4 ? 'muro_ventana' : 'muro', x, TS, S);
      solido(x, TS, S);
    }
  }
  for (const z of [-16, -12, -8]) {
    pon(dado(z, 3) < 0.3 ? 'muro_agrietado' : 'muro', TO, z, E);
    solido(TO, z, E);
    pon(dado(z, 4) < 0.3 ? 'muro_ventana' : 'muro', TE, z, E);
    solido(TE, z, E);
  }

  // --- La avenida: pilares labrados desde el portón hasta la torre ---
  for (const z of [16, 10, 4, -2]) {
    for (const x of [-6, 6]) {
      const caido = dado(x, z) < 0.22;
      pon(caido ? 'escombro_bajo' : 'pilar_labrado', x, z, x < 0 ? E : O);
      if (!caido)
        cajas.push({
          x0: RUINA_X + x - 1,
          z0: RUINA_Z + z - 1,
          x1: RUINA_X + x + 1,
          z1: RUINA_Z + z + 1,
        });
    }
  }

  // --- Antorchas en la cara interior de la muralla ---
  for (const [x, z, rot] of [
    [-BORDE + 0.6, -8, O],
    [-BORDE + 0.6, 8, O],
    [BORDE - 0.6, -8, E],
    [BORDE - 0.6, 8, E],
    [-4, TS - 0.7, N],
    [4, TS - 0.7, N],
  ] as [number, number, number][]) {
    pon('antorcha', x, z, rot, 2.2);
  }
  // estandartes flanqueando el portón y en la torre
  pon('estandarte', -3.2, BORDE - 0.7, S);
  pon('estandarte', 3.2, BORDE - 0.7, S);
  pon('trofeo', 0, TN + 0.7, N, 2.4);

  // --- Atrezo del patio y de la torre ---
  const atrezo: [string, number, number, number][] = [
    ['barril', -17, -16, 0.4],
    ['barriles', -14.5, -17, 1.9],
    ['cajas', -17.5, 15, 0.2],
    ['caja', -14.6, 16.5, 2.6],
    ['barril', 17, 16, 1.1],
    ['barriles', 18, 12.5, 0.5],
    ['escombro', -18, 3, 1.6], // un montón grande de verdad, solo uno
    ['cajas', 15, -16, 2.2],
    // dentro de la torre
    ['mesa_rota', -1.5, -13, 1.6],
    ['cofre', 3.8, -16.4, 0.3],
    ['barril', -4.2, -16.6, 0.9],
    ['estante', 0, -17.4, 0],
    ['caja', 4.2, -8.6, 2.1],
  ];
  for (const [pieza, x, z, rot] of atrezo) {
    pon(pieza, x, z, rot);
    // el atrezo bajo no bloquea; los bultos grandes sí
    if (['barril', 'cajas', 'caja', 'barriles', 'escombro_bajo'].includes(pieza)) {
      const r = pieza === 'escombro_bajo' ? 1.8 : 1;
      cajas.push({
        x0: RUINA_X + x - r,
        z0: RUINA_Z + z - r,
        x1: RUINA_X + x + r,
        z1: RUINA_Z + z + r,
      });
    }
  }

  cache = { piezas, cajas };
  return cache;
}

// Empuja un punto fuera de cualquier caja sólida por el lado más corto.
// Devuelve la posición corregida. Es lo mínimo que hace falta para que un muro
// SEA un muro: sin esto la arquitectura es un fondo de pantalla.
export function apartarDeMuros(x: number, z: number, radio: number): { x: number; z: number } {
  // atajo: casi todas las llamadas caen lejos de la ruina
  if (distRuina(x, z) > RUINA_DENTRO + 6) return { x, z };
  const { cajas } = ruina();
  let px = x;
  let pz = z;
  for (const c of cajas) {
    if (px + radio <= c.x0 || px - radio >= c.x1 || pz + radio <= c.z0 || pz - radio >= c.z1)
      continue;
    const dIzq = px + radio - c.x0;
    const dDer = c.x1 - (px - radio);
    const dSur = pz + radio - c.z0;
    const dNor = c.z1 - (pz - radio);
    const min = Math.min(dIzq, dDer, dSur, dNor);
    if (min === dIzq) px = c.x0 - radio;
    else if (min === dDer) px = c.x1 + radio;
    else if (min === dSur) pz = c.z0 - radio;
    else pz = c.z1 + radio;
  }
  return { x: px, z: pz };
}
