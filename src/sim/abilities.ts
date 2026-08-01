// Habilidades de clase: datos y resolución. El sim es dueño de esto; la capa
// de render solo escucha eventos. Una habilidad por clase en F2.1 (tecla 1).

import { inMeleeCone, resolveSwing } from './combat';
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
  // si existe, el ataque básico es un proyectil (arco, bastón) en vez de melee.
  // `kind` es la firma visual del disparo: la capa de render la lee para saber
  // si dibuja una flecha o una brasa de niebla.
  rangedBasic?: { speed: number; life: number; radius: number; kind: string };
}

export const WEAPON_SET_INFO: Record<string, WeaponSetInfo> = {
  medula: { hasShield: true },
  vigia: { hasShield: false, rangedBasic: { speed: 28, life: 0.6, radius: 0.65, kind: 'flecha' } },
  cordelero: { hasShield: false },
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
        const amount = rng.int(dmgMin, dmgMax);
        m.hp = Math.max(0, m.hp - amount);
        const killed = m.hp === 0;
        if (killed) m.alive = false;
        if (def.knockback) {
          const d = Math.max(0.4, dist2d(p.x, p.z, m.x, m.z));
          m.x += ((m.x - p.x) / d) * def.knockback;
          m.z += ((m.z - p.z) / d) * def.knockback;
        }
        emit({
          type: 'hitLanded',
          attackerId: p.id,
          targetId: m.id,
          amount,
          x: m.x,
          y: m.y + 1.1,
          z: m.z,
          killed,
        });
        if (killed) emit({ type: 'died', id: m.id, kind: 'mob' });
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
): void {
  const dmgMin = Math.floor(playerDamageMin(p.level) * def.damageMult * rarityMult);
  const dmgMax = Math.floor(playerDamageMax(p.level) * def.damageMult * rarityMult);
  for (const m of mobs) {
    if (!m.alive || alreadyHit.has(m.id)) continue;
    if (dist2d(p.x, p.z, m.x, m.z) > 1.5) continue;
    alreadyHit.add(m.id);
    const amount = rng.int(dmgMin, dmgMax);
    m.hp = Math.max(0, m.hp - amount);
    const killed = m.hp === 0;
    if (killed) m.alive = false;
    emit({
      type: 'hitLanded',
      attackerId: p.id,
      targetId: m.id,
      amount,
      x: m.x,
      y: m.y + 1.1,
      z: m.z,
      killed,
    });
    if (killed) emit({ type: 'died', id: m.id, kind: 'mob' });
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
      const amount = rng.int(pr.damageMin, pr.damageMax);
      m.hp = Math.max(0, m.hp - amount);
      const killed = m.hp === 0;
      if (killed) m.alive = false;
      emit({
        type: 'hitLanded',
        attackerId: -1,
        targetId: m.id,
        amount,
        x: m.x,
        y: m.y + 1.1,
        z: m.z,
        killed,
      });
      if (killed) emit({ type: 'died', id: m.id, kind: 'mob' });
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
