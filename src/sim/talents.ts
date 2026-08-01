// Árboles de talentos, uno por arma. La identidad ya era el arma; ahora
// también lo es la progresión: los puntos se gastan en el árbol del arma, no
// en el personaje, así que llevar dos armas es llevar dos caminos a medias.
//
// Datos puros: cero dependencias del navegador y cero lógica de combate. El
// sim pregunta por los modificadores resueltos y los aplica donde toca.

// Todo lo que un talento puede tocar. Los valores son POR RANGO y se suman.
export interface TalentEffects {
  critChance?: number; // probabilidad de crítico (0..1)
  critMult?: number; // se suma al x1,5 base
  basicDmg?: number; // +% al ataque básico
  abilityDmg?: number; // +% a las habilidades
  cooldown?: number; // -% de enfriamiento de habilidades
  maxHp?: number; // vida máxima, plano
  armor?: number; // -% del daño recibido
  lifesteal?: number; // % del daño hecho que te curas
  dotDps?: number; // daño por segundo del estado que aplicas al golpear
  slowMult?: number; // cuánto frenas al objetivo (0,15 = -15% de velocidad)
  unlockAbility2?: boolean; // abre la segunda habilidad del arma (tecla 2)
}

export interface TalentNode {
  id: string;
  nombre: string;
  desc: string;
  tier: number; // 1, 2 o 3
  maxRank: number;
  per: TalentEffects; // efecto de CADA rango
}

// Puntos ya invertidos en ese árbol que exige cada tier. Obliga a bajar por
// una rama antes de tocar la siguiente: es lo que hace que elegir duela.
export const TIER_REQ = [0, 3, 6];
export const TALENT_POINTS_PER_WEAPON_LEVEL = 1;
export const DOT_TIME = 3; // duración del estado (sangrado/veneno/quemadura)
export const SLOW_TIME = 2.5;
export const CRIT_MULT_BASE = 1.5;

// Sabor del estado por arma: mismo motor, distinto nombre y color.
export const DOT_KIND: Record<string, string> = {
  medula: 'sangrado',
  cordelero: 'veneno',
  hachero: 'sangrado',
  fumarel: 'quemadura',
  vigia: 'sangrado',
};

export const TALENT_TREES: Record<string, TalentNode[]> = {
  medula: [
    {
      id: 'hueso_duro',
      nombre: 'Hueso Duro',
      desc: '+10 de vida máxima por rango.',
      tier: 1,
      maxRank: 3,
      per: { maxHp: 10 },
    },
    {
      id: 'filo_constante',
      nombre: 'Filo Constante',
      desc: '+7% de daño con la espada por rango.',
      tier: 1,
      maxRank: 3,
      per: { basicDmg: 0.07 },
    },
    {
      id: 'muro_vivo',
      nombre: 'Muro Vivo',
      desc: 'Recibes un 7% menos de daño por rango, lleves el escudo alzado o no.',
      tier: 2,
      maxRank: 2,
      per: { armor: 0.07 },
    },
    {
      id: 'sangria',
      nombre: 'Sangría',
      desc: 'Tus golpes abren heridas: 5 de daño por segundo durante 3 s, por rango.',
      tier: 2,
      maxRank: 2,
      per: { dotDps: 5 },
    },
    {
      id: 'castigo',
      nombre: 'Castigo',
      desc: '+8% de daño de habilidades por rango.',
      tier: 2,
      maxRank: 2,
      per: { abilityDmg: 0.08 },
    },
    {
      id: 'embate',
      nombre: 'Embate de Escudo',
      desc: 'Abre tu segunda habilidad (tecla 2): una carga con el escudo por delante.',
      tier: 3,
      maxRank: 1,
      per: { unlockAbility2: true },
    },
  ],
  vigia: [
    {
      id: 'ojo_halcon',
      nombre: 'Ojo de Halcón',
      desc: '+5% de probabilidad de crítico por rango.',
      tier: 1,
      maxRank: 3,
      per: { critChance: 0.05 },
    },
    {
      id: 'cuerda_tensa',
      nombre: 'Cuerda Tensa',
      desc: '+7% de daño con el arco por rango.',
      tier: 1,
      maxRank: 3,
      per: { basicDmg: 0.07 },
    },
    {
      id: 'flecha_lastrada',
      nombre: 'Flecha Lastrada',
      desc: 'Lo que hieres se arrastra: -12% de velocidad durante 2,5 s, por rango.',
      tier: 2,
      maxRank: 2,
      per: { slowMult: 0.12 },
    },
    {
      id: 'aljaba_ligera',
      nombre: 'Aljaba Ligera',
      desc: '-8% de enfriamiento de habilidades por rango.',
      tier: 2,
      maxRank: 2,
      per: { cooldown: 0.08 },
    },
    {
      id: 'punto_debil',
      nombre: 'Punto Débil',
      desc: 'Tus críticos pegan un 20% más fuerte por rango.',
      tier: 2,
      maxRank: 2,
      per: { critMult: 0.2 },
    },
    {
      id: 'lluvia',
      nombre: 'Lluvia de Astillas',
      desc: 'Abre tu segunda habilidad (tecla 2): una andanada ancha que revienta en el sitio.',
      tier: 3,
      maxRank: 1,
      per: { unlockAbility2: true },
    },
  ],
  cordelero: [
    {
      id: 'reflejos',
      nombre: 'Reflejos',
      desc: '+5% de probabilidad de crítico por rango.',
      tier: 1,
      maxRank: 3,
      per: { critChance: 0.05 },
    },
    {
      id: 'filos_venenosos',
      nombre: 'Filos Venenosos',
      desc: 'Untas las hojas: 4 de daño por segundo durante 3 s, por rango.',
      tier: 1,
      maxRank: 3,
      per: { dotDps: 4 },
    },
    {
      id: 'sanguijuela',
      nombre: 'Sanguijuela',
      desc: 'Te curas un 5% del daño que haces, por rango.',
      tier: 2,
      maxRank: 2,
      per: { lifesteal: 0.05 },
    },
    {
      id: 'golpe_bajo',
      nombre: 'Golpe Bajo',
      desc: 'Tus críticos pegan un 25% más fuerte por rango.',
      tier: 2,
      maxRank: 2,
      per: { critMult: 0.25 },
    },
    {
      id: 'ligereza',
      nombre: 'Ligereza',
      desc: '+6% de daño con las dagas por rango.',
      tier: 2,
      maxRank: 2,
      per: { basicDmg: 0.06 },
    },
    {
      id: 'danza',
      nombre: 'Danza de Cuchillas',
      desc: 'Abre tu segunda habilidad (tecla 2): un torbellino de dagas a tu alrededor.',
      tier: 3,
      maxRank: 1,
      per: { unlockAbility2: true },
    },
  ],
  hachero: [
    {
      id: 'furia',
      nombre: 'Furia',
      desc: '+9% de daño con el hacha por rango.',
      tier: 1,
      maxRank: 3,
      per: { basicDmg: 0.09 },
    },
    {
      id: 'cuero_curtido',
      nombre: 'Cuero Curtido',
      desc: '+12 de vida máxima por rango.',
      tier: 1,
      maxRank: 3,
      per: { maxHp: 12 },
    },
    {
      id: 'hendidura',
      nombre: 'Hendidura',
      desc: 'El hachazo deja tajo abierto: 7 de daño por segundo durante 3 s, por rango.',
      tier: 2,
      maxRank: 2,
      per: { dotDps: 7 },
    },
    {
      id: 'impulso',
      nombre: 'Impulso',
      desc: '-9% de enfriamiento de habilidades por rango.',
      tier: 2,
      maxRank: 2,
      per: { cooldown: 0.09 },
    },
    {
      id: 'sed_de_savia',
      nombre: 'Sed de Savia',
      desc: 'Te curas un 4% del daño que haces, por rango.',
      tier: 2,
      maxRank: 2,
      per: { lifesteal: 0.04 },
    },
    {
      id: 'sismo',
      nombre: 'Hachazo Sísmico',
      desc: 'Abre tu segunda habilidad (tecla 2): un hachazo al suelo que revienta un semicírculo enorme.',
      tier: 3,
      maxRank: 1,
      per: { unlockAbility2: true },
    },
  ],
  fumarel: [
    {
      id: 'niebla_ardiente',
      nombre: 'Niebla Ardiente',
      desc: 'Tus brasas prenden: 5 de daño por segundo durante 3 s, por rango.',
      tier: 1,
      maxRank: 3,
      per: { dotDps: 5 },
    },
    {
      id: 'foco',
      nombre: 'Foco',
      desc: '+8% de daño de habilidades por rango.',
      tier: 1,
      maxRank: 3,
      per: { abilityDmg: 0.08 },
    },
    {
      id: 'escarcha',
      nombre: 'Escarcha',
      desc: 'La niebla congela: -15% de velocidad durante 2,5 s, por rango.',
      tier: 2,
      maxRank: 2,
      per: { slowMult: 0.15 },
    },
    {
      id: 'conducto',
      nombre: 'Conducto',
      desc: '-9% de enfriamiento de habilidades por rango.',
      tier: 2,
      maxRank: 2,
      per: { cooldown: 0.09 },
    },
    {
      id: 'aliento_vital',
      nombre: 'Aliento Vital',
      desc: '+10 de vida máxima por rango.',
      tier: 2,
      maxRank: 2,
      per: { maxHp: 10 },
    },
    {
      id: 'aliento',
      nombre: 'Aliento del Mar Tóxico',
      desc: 'Abre tu segunda habilidad (tecla 2): una nube densa que avanza sola y arrasa.',
      tier: 3,
      maxRank: 1,
      per: { unlockAbility2: true },
    },
  ],
};

// Lo que has gastado: árbol -> nodo -> rangos.
export type TalentSpent = Record<string, Record<string, number>>;

// Rangos totales de un árbol. Siempre serán más que los puntos que da la
// maestría: el árbol no se llena, se elige.
export function treeTotalRanks(setId: string): number {
  return (TALENT_TREES[setId] ?? []).reduce((a, n) => a + n.maxRank, 0);
}

export function nodeById(setId: string, nodeId: string): TalentNode | undefined {
  return TALENT_TREES[setId]?.find((n) => n.id === nodeId);
}

export function pointsInTree(spent: TalentSpent, setId: string): number {
  const tree = spent[setId];
  if (!tree) return 0;
  let total = 0;
  for (const id of Object.keys(tree)) total += tree[id];
  return total;
}

// ¿Se puede meter un punto más en este nodo? Requisitos: existe, no está al
// máximo y su tier está desbloqueado por lo ya invertido en ESE árbol.
export function canSpend(spent: TalentSpent, setId: string, nodeId: string): boolean {
  const node = nodeById(setId, nodeId);
  if (!node) return false;
  const rank = spent[setId]?.[nodeId] ?? 0;
  if (rank >= node.maxRank) return false;
  return pointsInTree(spent, setId) >= (TIER_REQ[node.tier - 1] ?? 0);
}

// Suma los rangos gastados en un árbol y devuelve el efecto total.
export function resolveTalents(spent: TalentSpent, setId: string): Required<TalentEffects> {
  const out: Required<TalentEffects> = {
    critChance: 0,
    critMult: 0,
    basicDmg: 0,
    abilityDmg: 0,
    cooldown: 0,
    maxHp: 0,
    armor: 0,
    lifesteal: 0,
    dotDps: 0,
    slowMult: 0,
    unlockAbility2: false,
  };
  const tree = TALENT_TREES[setId];
  const mine = spent[setId];
  if (!tree || !mine) return out;
  for (const node of tree) {
    const rank = mine[node.id] ?? 0;
    if (rank <= 0) continue;
    for (const [k, v] of Object.entries(node.per)) {
      if (typeof v === 'boolean') {
        if (v) out.unlockAbility2 = true;
      } else {
        (out as unknown as Record<string, number>)[k] += v * rank;
      }
    }
  }
  // el freno tiene tope: nada se queda clavado en el sitio
  out.slowMult = Math.min(0.6, out.slowMult);
  out.armor = Math.min(0.5, out.armor);
  out.cooldown = Math.min(0.5, out.cooldown);
  return out;
}
