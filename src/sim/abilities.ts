// Habilidades de clase: datos y resolución. El sim es dueño de esto; la capa
// de render solo escucha eventos. Una habilidad por clase en F2.1 (tecla 1).

import { NO_MODS, inMeleeCone, resolveSwing, strikeTarget, type HitMods } from './combat';
import type { Rng } from './rng';
import {
  DT,
  dist2d,
  normAngle,
  playerDamageMax,
  playerDamageMin,
  type Entity,
  type SimEvent,
} from './types';

export type AbilityKind = 'heavy' | 'dash' | 'projectile';

// Qué aporta cada set de arma más allá de su habilidad (el escudo, hoy;
// pasivas, mañana). La identidad ya no es una clase: es lo que empuñas.
export interface WeaponSetInfo {
  hasShield: boolean;
  // el peso del arma en el básico: el hacha pega el doble de fuerte pero
  // tarda lo suyo en volver arriba; las dagas, al revés. Por defecto, 1.
  basicDmgMult?: number;
  basicCooldownMult?: number;
  // si existe, el ataque básico es un proyectil (arco, bastón) en vez de melee.
  // `kind` es la firma visual del disparo: la capa de render la lee para saber
  // si dibuja una flecha o una brasa de niebla.
  rangedBasic?: { speed: number; life: number; radius: number; kind: string };
}

export const WEAPON_SET_INFO: Record<string, WeaponSetInfo> = {
  medula: { hasShield: true },
  vigia: { hasShield: false, rangedBasic: { speed: 28, life: 0.6, radius: 0.65, kind: 'flecha' } },
  cordelero: { hasShield: false, basicDmgMult: 0.78, basicCooldownMult: 0.62 },
  hachero: { hasShield: false, basicDmgMult: 1.5, basicCooldownMult: 1.5 },
  // la ballesta: lenta de recargar y demoledora, el contrapunto del arco
  ballestero: {
    hasShield: false,
    basicDmgMult: 1.7,
    basicCooldownMult: 1.85,
    rangedBasic: { speed: 40, life: 0.55, radius: 0.6, kind: 'virote' },
  },
  // el bastón no se blande: destila brasas de niebla. Más lentas y más gordas
  // que una flecha (perdonan la puntería), pero de alcance algo más corto.
  fumarel: { hasShield: false, rangedBasic: { speed: 21, life: 0.7, radius: 0.85, kind: 'brasa' } },
};

export const SWAP_COOLDOWN = 0.8; // el cambio de arma no es un parpadeo
export const WEAPON_DROP_CHANCE = 0.3; // prob. de que un mob suelte arma
export const LOOT_PICKUP_RADIUS = 1.7;

// --- Rarezas: toda caída es una mejora ---
export const RARITY_NAMES = ['común', 'mágica', 'rara'] as const;
export const RARITY_MULT = [1, 1.25, 1.55]; // multiplicador de daño del arma activa
export const BAG_SLOTS = 10; // capacidad del zurrón (las celdas de la ventana)

// La calidad la decide el NIVEL de la criatura: una alimaña de nivel 1 solo
// suelta chatarra común; los jefes son los que reparten lo bueno. Devuelve
// los pesos [común, mágica, rara] de su tabla de botín.
export function rarityWeightsForLevel(level: number): number[] {
  const magic = Math.min(0.5, Math.max(0, (level - 1) * 0.07));
  const rare = Math.min(0.3, Math.max(0, (level - 3) * 0.05));
  return [Math.max(0, 1 - magic - rare), magic, rare];
}

export interface WeaponDrop {
  id: number;
  x: number;
  y: number;
  z: number;
  setId: string;
  rarity: number; // 0 común, 1 mágica, 2 rara
}

export interface AbilityDef {
  id: string;
  nombre: string;
  desc: string;
  kind: AbilityKind;
  cooldown: number;
  windup: number; // anticipación antes de resolver
  damageMult: number;
  // heavy
  range?: number;
  arc?: number;
  knockback?: number;
  // dash
  dashSpeed?: number;
  dashTime?: number;
  // projectile
  projSpeed?: number;
  projRadius?: number;
  projLife?: number;
}

// La habilidad "1" de cada clase (por id de clase)
export const CLASS_ABILITY: Record<string, AbilityDef> = {
  medula: {
    id: 'golpe_vertebra',
    nombre: 'Golpe de Vértebra',
    desc: 'Descarga un golpe a dos manos en un cono ancho: daño ×2,2 a todos los enemigos de delante y los empuja lejos. Ideal contra manadas.',
    kind: 'heavy',
    cooldown: 6,
    windup: 0.32,
    damageMult: 2.2,
    range: 3.4,
    arc: Math.PI * 0.85,
    knockback: 2.2,
  },
  vigia: {
    id: 'disparo_certero',
    nombre: 'Disparo Certero',
    desc: 'Tensa a fondo y suelta una flecha potente y veloz: daño ×1,7 al primer enemigo que alcanza. Apunta sola al objetivo frente a ti.',
    kind: 'projectile',
    cooldown: 3,
    windup: 0.22,
    damageMult: 1.7,
    projSpeed: 32,
    projRadius: 0.7,
    projLife: 0.8,
  },
  cordelero: {
    id: 'acometida',
    nombre: 'Acometida',
    desc: 'Te lanzas hacia delante atravesando a los enemigos: daño ×1,4 a cada uno que cruces (una vez por acometida). También sirve para escapar.',
    kind: 'dash',
    cooldown: 5,
    windup: 0.08,
    damageMult: 1.4,
    dashSpeed: 26,
    dashTime: 0.2,
  },
  hachero: {
    id: 'tajo_circular',
    nombre: 'Tajo Circular',
    desc: 'Gira sobre ti mismo con el hacha por delante: daño ×2,4 a TODO lo que te rodea, mires donde mires, y los manda lejos. Para cuando te cierran el corro.',
    kind: 'heavy',
    cooldown: 7,
    windup: 0.35,
    damageMult: 2.4,
    range: 3.5,
    arc: Math.PI * 2, // el círculo entero: no hay espalda que valga
    knockback: 3,
  },
  ballestero: {
    id: 'saeta_perforante',
    nombre: 'Saeta Perforante',
    desc: 'Un virote lanzado a quemarropa que atraviesa lo que pilla: daño ×2,6 y vuela recto y rapidísimo.',
    kind: 'projectile',
    cooldown: 5,
    windup: 0.4,
    damageMult: 2.6,
    projSpeed: 46,
    projRadius: 0.75,
    projLife: 0.9,
  },
  fumarel: {
    id: 'chispa_niebla',
    nombre: 'Chispa de Niebla',
    desc: 'Destila la niebla en un orbe que estalla al impactar: daño ×2. Tu golpe más fuerte mientras mantengas la distancia.',
    kind: 'projectile',
    cooldown: 2.5,
    windup: 0.28,
    damageMult: 2.0,
    projSpeed: 17,
    projRadius: 1.1,
    projLife: 1.6,
  },
};

// La SEGUNDA habilidad de cada arma (tecla 2). No se tiene de salida: la
// abre el nodo final de su árbol de talentos, que cuesta 7 puntos.
export const CLASS_ABILITY2: Record<string, AbilityDef> = {
  medula: {
    id: 'embate_escudo',
    nombre: 'Embate de Escudo',
    desc: 'Cargas con el escudo por delante atravesando a quien pillas: daño ×1,6 y sales del apuro por el otro lado.',
    kind: 'dash',
    cooldown: 9,
    windup: 0.12,
    damageMult: 1.6,
    dashSpeed: 24,
    dashTime: 0.24,
  },
  vigia: {
    id: 'lluvia_astillas',
    nombre: 'Lluvia de Astillas',
    desc: 'Sueltas una andanada que revienta en un radio ancho: daño ×1,5 a lo que pille, aunque falles de puntería.',
    kind: 'projectile',
    cooldown: 8,
    windup: 0.3,
    damageMult: 1.5,
    projSpeed: 19,
    projRadius: 1.7,
    projLife: 1.3,
  },
  cordelero: {
    id: 'danza_cuchillas',
    nombre: 'Danza de Cuchillas',
    desc: 'Torbellino de dagas a tu alrededor: daño ×1,7 en círculo completo. Corto de alcance, largo de rencor.',
    kind: 'heavy',
    cooldown: 8,
    windup: 0.2,
    damageMult: 1.7,
    range: 2.7,
    arc: Math.PI * 2,
    knockback: 0.8,
  },
  hachero: {
    id: 'hachazo_sismico',
    nombre: 'Hachazo Sísmico',
    desc: 'Estrellas el hacha contra el lomo del coloso: daño ×3 en un semicírculo enorme y todo sale volando.',
    kind: 'heavy',
    cooldown: 12,
    windup: 0.45,
    damageMult: 3,
    range: 4.4,
    arc: Math.PI * 1.1,
    knockback: 4.5,
  },
  ballestero: {
    id: 'andanada_virotes',
    nombre: 'Andanada de Virotes',
    desc: 'Vacías el cargador de golpe en un abanico ancho: daño ×1,9 a todo lo que se cruce por delante.',
    kind: 'projectile',
    cooldown: 10,
    windup: 0.55,
    damageMult: 1.9,
    projSpeed: 30,
    projRadius: 2,
    projLife: 1.4,
  },
  fumarel: {
    id: 'aliento_toxico',
    nombre: 'Aliento del Mar Tóxico',
    desc: 'Una nube densa que avanza sola, lenta y enorme: daño ×2,6 a lo que engulle.',
    kind: 'projectile',
    cooldown: 11,
    windup: 0.4,
    damageMult: 2.6,
    projSpeed: 11,
    projRadius: 2.1,
    projLife: 2.2,
  },
};

export interface Projectile {
  id: number;
  x: number;
  y: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  life: number;
  radius: number;
  damageMin: number;
  damageMax: number;
  kind: string; // id de la habilidad, para el VFX
  mods?: HitMods; // crítico/estados del arma que lo disparó, congelados al salir
}

// Resuelve la habilidad anunciada del jugador (tras su windup).
export function resolveAbility(
  rng: Rng,
  def: AbilityDef,
  p: Entity,
  mobs: Entity[],
  spawnProjectile: (proj: Omit<Projectile, 'id' | 'px' | 'pz'>) => void,
  emit: (ev: SimEvent) => void,
  rarityMult = 1,
  mods: HitMods = NO_MODS,
): void {
  const dmgMin = Math.floor(playerDamageMin(p.level) * def.damageMult * rarityMult);
  const dmgMax = Math.floor(playerDamageMax(p.level) * def.damageMult * rarityMult);
  switch (def.kind) {
    case 'heavy': {
      const before = mobs.filter((m) => m.alive).length;
      // cono ancho y largo; el empujón separa a la manada
      for (const m of mobs) {
        if (!m.alive) continue;
        if (!inMeleeCone(p, m, def.range, def.arc)) continue;
        if (def.knockback) {
          const d = Math.max(0.4, dist2d(p.x, p.z, m.x, m.z));
          m.x += ((m.x - p.x) / d) * def.knockback;
          m.z += ((m.z - p.z) / d) * def.knockback;
        }
        strikeTarget(rng, p, m, dmgMin, dmgMax, mods, emit);
      }
      void before;
      break;
    }
    case 'projectile': {
      spawnProjectile({
        x: p.x,
        y: p.y + 1.3,
        z: p.z,
        vx: Math.sin(p.yaw) * (def.projSpeed ?? 20),
        vz: Math.cos(p.yaw) * (def.projSpeed ?? 20),
        life: def.projLife ?? 1.2,
        radius: def.projRadius ?? 0.8,
        damageMin: dmgMin,
        damageMax: dmgMax,
        kind: def.id,
        mods,
      });
      break;
    }
    case 'dash': {
      // el dash lo integra el tick: velocidad fijada durante dashTime
      p.dashTime = def.dashTime ?? 0.2;
      p.vx = Math.sin(p.yaw) * (def.dashSpeed ?? 24);
      p.vz = Math.cos(p.yaw) * (def.dashSpeed ?? 24);
      break;
    }
  }
}

// Daño del dash a los mobs atravesados (una vez por acometida).
export function dashDamage(
  rng: Rng,
  def: AbilityDef,
  p: Entity,
  mobs: Entity[],
  alreadyHit: Set<number>,
  emit: (ev: SimEvent) => void,
  rarityMult = 1,
  mods: HitMods = NO_MODS,
): void {
  const dmgMin = Math.floor(playerDamageMin(p.level) * def.damageMult * rarityMult);
  const dmgMax = Math.floor(playerDamageMax(p.level) * def.damageMult * rarityMult);
  for (const m of mobs) {
    if (!m.alive || alreadyHit.has(m.id)) continue;
    if (dist2d(p.x, p.z, m.x, m.z) > 1.5) continue;
    alreadyHit.add(m.id);
    strikeTarget(rng, p, m, dmgMin, dmgMax, mods, emit);
  }
}

// Avanza los proyectiles: movimiento, vida y colisión contra mobs.
export function stepProjectiles(
  rng: Rng,
  projectiles: Projectile[],
  mobs: Entity[],
  emit: (ev: SimEvent) => void,
): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.px = pr.x;
    pr.pz = pr.z;
    pr.x += pr.vx * DT;
    pr.z += pr.vz * DT;
    pr.life -= DT;
    let dead = pr.life <= 0;
    for (const m of mobs) {
      if (!m.alive) continue;
      if (dist2d(pr.x, pr.z, m.x, m.z) > pr.radius + 0.5) continue;
      strikeTarget(rng, null, m, pr.damageMin, pr.damageMax, pr.mods ?? NO_MODS, emit);
      dead = true;
      break;
    }
    if (dead) {
      emit({ type: 'projectileGone', pid: pr.id, x: pr.x, y: pr.y, z: pr.z, kind: pr.kind });
      projectiles.splice(i, 1);
    }
  }
}

export function abilityYaw(p: Entity, mobs: Entity[]): number {
  // apunta al mob vivo más cercano en un radio generoso; si no, a donde miras
  let best: Entity | null = null;
  let bestD = 14;
  for (const m of mobs) {
    if (!m.alive) continue;
    const d = dist2d(p.x, p.z, m.x, m.z);
    // solo auto-apunta si está razonablemente delante (no gira 180 grados)
    const ang = Math.abs(normAngle(Math.atan2(m.x - p.x, m.z - p.z) - p.yaw));
    if (d < bestD && ang < Math.PI * 0.5) {
      bestD = d;
      best = m;
    }
  }
  return best ? Math.atan2(best.x - p.x, best.z - p.z) : p.yaw;
}
