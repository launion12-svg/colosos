// Combate cuerpo a cuerpo: golpe con anticipación (windup) que se resuelve
// en cono. El atacante anuncia el golpe (evento 'swung', el render arranca la
// animación) y el daño llega ATTACK_WINDUP después: leíble y esquivable.

import type { Rng } from './rng';
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
): void {
  for (const t of candidates) {
    if (!t.alive || t.id === attacker.id) continue;
    if (!inMeleeCone(attacker, t)) continue;
    if (isBlockedHit(t, attacker)) {
      // el escudo absorbe la mayor parte; el resto sí entra
      const raw = rng.int(min, max);
      const amount = Math.max(0, Math.floor(raw * BLOCK_DAMAGE_MULT));
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
    const r = applyDamage(rng, t, min, max);
    emit({
      type: 'hitLanded',
      attackerId: attacker.id,
      targetId: t.id,
      amount: r.amount,
      x: t.x,
      y: t.y + 1.1,
      z: t.z,
      killed: r.killed,
    });
    if (r.killed) emit({ type: 'died', id: t.id, kind: t.kind });
  }
}
