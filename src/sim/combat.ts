// Combate cuerpo a cuerpo: golpe con anticipación (windup) que se resuelve
// en cono. El atacante anuncia el golpe (evento 'swung', el render arranca la
// animación) y el daño llega ATTACK_WINDUP después: leíble y esquivable.

import type { Rng } from './rng';
import { CRIT_MULT_BASE } from './talents';
import {
  BLOCK_ARC,
  BLOCK_DAMAGE_MULT,
  MELEE_ARC,
  MELEE_RANGE,
  normAngle,
  type Entity,
  type SimEvent,
} from './types';

// ¿El objetivo está cubriendo este golpe con el escudo? Solo bloquea lo que
// entra por su arco frontal: un mordisco por la espalda entra entero.
export function isBlockedHit(target: Entity, attacker: Entity): boolean {
  if (!target.blocking || !target.hasShield) return false;
  const angTo = Math.atan2(attacker.x - target.x, attacker.z - target.z);
  return Math.abs(normAngle(angTo - target.yaw)) <= BLOCK_ARC / 2;
}

// ¿'target' está dentro del cono de golpe de 'attacker'?
export function inMeleeCone(
  attacker: Entity,
  target: Entity,
  range: number = MELEE_RANGE,
  arc: number = MELEE_ARC,
): boolean {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > range) return false;
  if (Math.abs(target.y - attacker.y) > 3) return false;
  if (dist < 0.4) return true; // encima: siempre golpea
  const angTo = Math.atan2(dx, dz);
  return Math.abs(normAngle(angTo - attacker.yaw)) <= arc / 2;
}

export interface DamageResult {
  amount: number;
  killed: boolean;
}

// Todo lo que los talentos añaden a UN golpe del jugador. Se resuelve una vez
// por tick de ataque y viaja hasta aquí; así crítico, estados y robo de vida
// se aplican igual venga el daño de la espada, de la habilidad o de un orbe.
export interface HitMods {
  critChance: number;
  critMult: number;
  dotDps: number;
  dotTime: number;
  dotKind: string;
  slowMult: number;
  slowTime: number;
  lifesteal: number;
}

export const NO_MODS: HitMods = {
  critChance: 0,
  critMult: CRIT_MULT_BASE,
  dotDps: 0,
  dotTime: 0,
  dotKind: 'sangrado',
  slowMult: 0,
  slowTime: 0,
  lifesteal: 0,
};

// Punto ÚNICO por el que pasa cualquier daño del jugador a una criatura:
// tirada, crítico, estado aplicado, robo de vida y evento. Si algún día hay
// un arma nueva, hereda todo esto gratis.
export function strikeTarget(
  rng: Rng,
  attacker: Entity | null,
  target: Entity,
  min: number,
  max: number,
  mods: HitMods,
  emit: (ev: SimEvent) => void,
  extra: { x?: number; y?: number; z?: number } = {},
): DamageResult {
  // esquivando eres intocable: el golpe te atraviesa y se anuncia
  if (target.invuln > 0) {
    emit({
      type: 'evaded',
      id: target.id,
      x: extra.x ?? target.x,
      y: extra.y ?? target.y + 1.4,
      z: extra.z ?? target.z,
    });
    return { amount: 0, killed: false };
  }
  let amount = rng.int(min, max);
  // el crítico se tira SIEMPRE (aunque la probabilidad sea 0) para no
  // desalinear la secuencia de aleatorios entre partidas con y sin talentos
  const crit = rng.next() < mods.critChance;
  if (crit) amount = Math.floor(amount * mods.critMult);
  // la armadura vive en el objetivo (el jugador la saca de su árbol)
  if (target.damageTakenMult !== 1) {
    amount = Math.max(1, Math.floor(amount * target.damageTakenMult));
  }
  target.hp = Math.max(0, target.hp - amount);
  const killed = target.hp === 0;
  if (killed) target.alive = false;
  if (!killed && mods.dotDps > 0) {
    // el estado no se acumula: se renueva al valor más alto
    target.dotDps = Math.max(target.dotDps, mods.dotDps);
    target.dotTime = Math.max(target.dotTime, mods.dotTime);
    target.dotKind = mods.dotKind;
  }
  if (!killed && mods.slowMult > 0) {
    target.slowMult = Math.max(target.slowMult, mods.slowMult);
    target.slowTime = Math.max(target.slowTime, mods.slowTime);
  }
  if (attacker && mods.lifesteal > 0 && amount > 0) {
    const cura = Math.max(1, Math.floor(amount * mods.lifesteal));
    const antes = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + cura);
    if (attacker.hp > antes) {
      emit({ type: 'healed', id: attacker.id, amount: attacker.hp - antes });
    }
  }
  emit({
    type: 'hitLanded',
    attackerId: attacker?.id ?? -1,
    targetId: target.id,
    amount,
    x: extra.x ?? target.x,
    y: extra.y ?? target.y + 1.1,
    z: extra.z ?? target.z,
    killed,
    crit,
  });
  if (killed) emit({ type: 'died', id: target.id, kind: target.kind });
  return { amount, killed };
}

// Aplica daño y devuelve el resultado. El que llama emite los eventos
// (hitLanded/died) para mantener un único punto de emisión por sistema.
export function applyDamage(rng: Rng, target: Entity, min: number, max: number): DamageResult {
  const amount = rng.int(min, max);
  target.hp = Math.max(0, target.hp - amount);
  const killed = target.hp === 0;
  if (killed) target.alive = false;
  return { amount, killed };
}

// Resuelve el golpe anunciado de 'attacker' contra los objetivos candidatos.
export function resolveSwing(
  rng: Rng,
  attacker: Entity,
  candidates: Entity[],
  min: number,
  max: number,
  emit: (ev: SimEvent) => void,
  mods: HitMods = NO_MODS,
): void {
  for (const t of candidates) {
    if (!t.alive || t.id === attacker.id) continue;
    if (!inMeleeCone(attacker, t)) continue;
    if (t.invuln > 0) {
      emit({ type: 'evaded', id: t.id, x: t.x, y: t.y + 1.4, z: t.z });
      continue;
    }
    if (isBlockedHit(t, attacker)) {
      // el escudo absorbe la mayor parte; el resto sí entra
      const raw = rng.int(min, max);
      const amount = Math.max(
        0,
        Math.floor(raw * BLOCK_DAMAGE_MULT * t.damageTakenMult),
      );
      t.hp = Math.max(0, t.hp - amount);
      const killed = t.hp === 0;
      if (killed) t.alive = false;
      emit({
        type: 'blockedHit',
        attackerId: attacker.id,
        targetId: t.id,
        amount,
        x: t.x,
        y: t.y + 1.1,
        z: t.z,
      });
      if (killed) emit({ type: 'died', id: t.id, kind: t.kind });
      continue;
    }
    strikeTarget(rng, attacker, t, min, max, mods, emit);
  }
}
