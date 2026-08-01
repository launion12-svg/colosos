// IA de mob: máquina de estados patrol -> chase -> attack, con leash y evade.
// Clásico de MMO: si lo alejas demasiado de casa, vuelve inmune y se cura.

import type { Rng } from './rng';
import { inMeleeCone, resolveSwing } from './combat';
import { terrainHeight } from './terrain';
import {
  DT,
  MOB_ATTACK_COOLDOWN,
  MOB_ATTACK_RANGE,
  MOB_ATTACK_WINDUP,
  MOB_EVADE_SPEED_MULT,
  MOB_LEASH_DISTANCE,
  MOB_PATROL_SPEED_MULT,
  MOB_RESPAWN_TIME,
  dist2d,
  type Entity,
  type SimEvent,
} from './types';

function moveToward(m: Entity, tx: number, tz: number, speed: number, seed: number): number {
  const dx = tx - m.x;
  const dz = tz - m.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 1e-6) return 0;
  const step = Math.min(speed * DT, dist);
  m.x += (dx / dist) * step;
  m.z += (dz / dist) * step;
  m.vx = (dx / dist) * speed;
  m.vz = (dz / dist) * speed;
  m.yaw = Math.atan2(dx, dz);
  m.y = terrainHeight(m.x, m.z, seed);
  return dist;
}

function pickPatrolPoint(rng: Rng, m: Entity): void {
  const ang = rng.range(0, Math.PI * 2);
  const rad = rng.range(3, 10);
  m.patrolX = m.homeX + Math.sin(ang) * rad;
  m.patrolZ = m.homeZ + Math.cos(ang) * rad;
  m.patrolWait = rng.range(1.5, 4);
}

export function updateMob(
  rng: Rng,
  m: Entity,
  player: Entity,
  seed: number,
  emit: (ev: SimEvent) => void,
): void {
  // --- Muerto: temporizador de respawn ---
  if (!m.alive) {
    if (m.aiState !== 'dead') {
      m.aiState = 'dead';
      m.respawnTimer = MOB_RESPAWN_TIME;
      m.attackWindup = 0;
      m.vx = 0;
      m.vz = 0;
    }
    m.respawnTimer -= DT;
    if (m.respawnTimer <= 0) {
      m.alive = true;
      m.hp = m.maxHp;
      m.x = m.homeX;
      m.z = m.homeZ;
      m.y = terrainHeight(m.x, m.z, seed);
      m.aiState = 'patrol';
      m.aggroAnnounced = false;
      pickPatrolPoint(rng, m);
      emit({ type: 'respawned', id: m.id, kind: 'mob' });
    }
    return;
  }

  m.vx = 0;
  m.vz = 0;
  m.attackCooldown = Math.max(0, m.attackCooldown - DT);
  const distToPlayer = dist2d(m.x, m.z, player.x, player.z);
  const distHome = dist2d(m.x, m.z, m.homeX, m.homeZ);

  // Golpe anunciado en curso: se resuelve aunque cambie de estado (commit)
  if (m.attackWindup > 0) {
    m.attackWindup -= DT;
    // encara al jugador durante el windup
    if (player.alive) m.yaw = Math.atan2(player.x - m.x, player.z - m.z);
    if (m.attackWindup <= 0) {
      resolveSwing(rng, m, [player], m.dmgMin, m.dmgMax, emit);
    }
    return; // plantado mientras golpea
  }

  switch (m.aiState) {
    case 'patrol': {
      if (player.alive && distToPlayer < m.aggroRadius) {
        m.aiState = 'chase';
        if (!m.aggroAnnounced) {
          m.aggroAnnounced = true;
          emit({ type: 'aggroed', id: m.id });
        }
        break;
      }
      if (m.patrolWait > 0) {
        m.patrolWait -= DT;
      } else {
        const d = moveToward(m, m.patrolX, m.patrolZ, m.moveSpeed * MOB_PATROL_SPEED_MULT, seed);
        if (d < 1.2) pickPatrolPoint(rng, m);
      }
      break;
    }
    case 'chase': {
      if (!player.alive) {
        m.aiState = 'evade';
        break;
      }
      // el leash mide la distancia del MOB a su casa: si lo arrastras
      // demasiado lejos, suelta y vuelve (regla clásica anti-kiting)
      if (distHome > MOB_LEASH_DISTANCE) {
        m.aiState = 'evade';
        break;
      }
      if (distToPlayer <= MOB_ATTACK_RANGE) {
        m.aiState = 'attack';
        break;
      }
      moveToward(m, player.x, player.z, m.moveSpeed, seed);
      break;
    }
    case 'attack': {
      if (!player.alive) {
        m.aiState = 'evade';
        break;
      }
      if (distToPlayer > MOB_ATTACK_RANGE * 1.4) {
        m.aiState = 'chase';
        break;
      }
      m.yaw = Math.atan2(player.x - m.x, player.z - m.z);
      if (m.attackCooldown <= 0 && inMeleeCone(m, player, MOB_ATTACK_RANGE * 1.2)) {
        m.attackWindup = MOB_ATTACK_WINDUP;
        m.attackCooldown = MOB_ATTACK_COOLDOWN;
        emit({ type: 'swung', id: m.id });
      }
      break;
    }
    case 'evade': {
      // vuelve a casa inmune y se cura al llegar
      const d = moveToward(m, m.homeX, m.homeZ, m.moveSpeed * MOB_EVADE_SPEED_MULT, seed);
      if (d < 1.5) {
        m.hp = m.maxHp;
        m.aiState = 'patrol';
        m.aggroAnnounced = false;
        pickPatrolPoint(rng, m);
      }
      break;
    }
    case 'dead':
      break;
  }
}

// ¿El mob en evade es inmune? (regla clásica)
export function isEvading(m: Entity): boolean {
  return m.aiState === 'evade';
}
