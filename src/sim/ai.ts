// IA de mob: máquina de estados patrol -> chase -> attack, con leash y evade.
// Clásico de MMO: si lo alejas demasiado de casa, vuelve inmune y se cura.

import type { Rng } from './rng';
import { inMeleeCone, resolveSwing } from './combat';
import { terrainHeight } from './terrain';
import { apartarDeMuros } from './structures';
import { buscarCamino, hayPasoLibre, siguientePunto } from './navigation';
import {
  DT,
  MOB_RADIUS,
  PATH_REFRESH,
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
  // La arquitectura también los para a ellos. Antes solo frenaba al héroe, así
  // que un lobo podía cruzar la muralla como si fuera humo.
  const libre = apartarDeMuros(m.x, m.z, MOB_RADIUS);
  m.x = libre.x;
  m.z = libre.z;
  m.vx = (dx / dist) * speed;
  m.vz = (dz / dist) * speed;
  m.yaw = Math.atan2(dx, dz);
  m.y = terrainHeight(m.x, m.z, seed);
  return dist;
}

// Ir hacia (tx,tz) rodeando muros si hace falta. La distancia que devuelve es
// la de línea recta al destino: el leash y el "ya he llegado" se miden así,
// no por lo que mida el rodeo.
function moveRodeando(m: Entity, tx: number, tz: number, speed: number, seed: number): number {
  const directo = dist2d(m.x, m.z, tx, tz);
  m.caminoTimer = Math.max(0, m.caminoTimer - DT);

  // Camino despejado: a por él de frente y a olvidarse de rutas. Este es el
  // caso del 99% del mapa y por eso el A* no cuesta nada en la práctica.
  if (hayPasoLibre(m.x, m.z, tx, tz, MOB_RADIUS)) {
    m.camino = null;
    moveToward(m, tx, tz, speed, seed);
    return directo;
  }

  // Hay muro de por medio. Se recalcula de vez en cuando, no cada tick.
  const destinoViejo = m.camino ? m.camino[m.camino.length - 1] : null;
  const seMovioElBlanco = destinoViejo ? dist2d(destinoViejo.x, destinoViejo.z, tx, tz) > 3 : true;
  if (m.caminoTimer <= 0 && (!m.camino || seMovioElBlanco)) {
    m.camino = buscarCamino(m.x, m.z, tx, tz);
    m.caminoPaso = 0;
    m.caminoTimer = PATH_REFRESH;
  }

  if (!m.camino || m.camino.length === 0) {
    // sin ruta (encerrado, o el destino es inalcanzable): empuja de frente,
    // que al menos se queda pegado al muro mirando a su presa
    moveToward(m, tx, tz, speed, seed);
    return directo;
  }

  // tirar de la cuerda: al punto más lejano que se vea, no de celda en celda
  m.caminoPaso = siguientePunto(m.camino, m.caminoPaso, m.x, m.z);
  const p = m.camino[m.caminoPaso];
  if (dist2d(m.x, m.z, p.x, p.z) < 0.6 && m.caminoPaso < m.camino.length - 1) {
    m.caminoPaso++;
  }
  const destino = m.camino[m.caminoPaso];
  moveToward(m, destino.x, destino.z, speed, seed);
  return directo;
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
      m.respawnTimer = m.respawnTime || MOB_RESPAWN_TIME;
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
      m.camino = null;
      pickPatrolPoint(rng, m);
      emit({ type: 'respawned', id: m.id, kind: 'mob' });
    }
    return;
  }

  m.vx = 0;
  m.vz = 0;
  m.attackCooldown = Math.max(0, m.attackCooldown - DT);
  // lo que va frenado (flecha lastrada, escarcha) se arrastra hasta su casa
  const speed = m.moveSpeed * (1 - m.slowMult);
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
        const d = moveRodeando(m, m.patrolX, m.patrolZ, speed * MOB_PATROL_SPEED_MULT, seed);
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
      moveRodeando(m, player.x, player.z, speed, seed);
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
      const d = moveRodeando(m, m.homeX, m.homeZ, speed * MOB_EVADE_SPEED_MULT, seed);
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
