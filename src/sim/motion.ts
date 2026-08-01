// Kernel de movimiento del jugador: función pura de (entidad, input, seed).
// Diseño derivado del kernel de WoC player_motion.ts (MIT, Levy Street) y de
// las recetas de game feel: fricción >= accel (paradas secas), gravedad
// asimétrica, salto de altura variable, coyote time y jump buffer.

import {
  ACCEL,
  AIR_CONTROL_ACCEL,
  BLOCK_MOVE_MULT,
  COYOTE_TIME,
  DT,
  FALL_MULTIPLIER,
  FRICTION,
  GRAVITY,
  JUMP_BUFFER_TIME,
  JUMP_STAMINA_COST,
  JUMP_VELOCITY,
  MAX_WALK_SLOPE,
  RUN_SPEED,
  SPRINT_DRAIN,
  SPRINT_MULT,
  STAMINA_MAX,
  SIT_STAMINA_MULT,
  STAMINA_REGEN,
  STAMINA_REGEN_DELAY,
  STEEP_SLIDE_SPEED,
  WINDED_RECOVER,
  type Entity,
  type MoveInput,
  type SimEvent,
} from './types';
import { terrainDownhill, terrainHeight, terrainSteepness } from './terrain';

export function stepPlayerMotion(
  p: Entity,
  inp: MoveInput,
  seed: number,
  emit: (ev: SimEvent) => void,
): void {
  if (!p.alive) return;

  const wishLen = Math.hypot(inp.moveX, inp.moveZ);
  const wishX = wishLen > 1e-6 ? inp.moveX / wishLen : 0;
  const wishZ = wishLen > 1e-6 ? inp.moveZ / wishLen : 0;
  const wants = wishLen > 1e-6;

  // --- Energía: esprint, jadeo y regeneración ---
  p.sprinting =
    inp.sprint && wants && p.grounded && !p.blocking && p.stamina > 0 && !p.winded;
  if (p.sprinting) {
    p.stamina = Math.max(0, p.stamina - SPRINT_DRAIN * DT);
    p.staminaDelay = STAMINA_REGEN_DELAY;
    if (p.stamina === 0) p.winded = true; // vaciada: toca jadear
  } else {
    p.staminaDelay = Math.max(0, p.staminaDelay - DT);
    if (p.staminaDelay <= 0) {
      const ritmo = STAMINA_REGEN * (p.sitting ? SIT_STAMINA_MULT : 1);
      p.stamina = Math.min(STAMINA_MAX, p.stamina + ritmo * DT);
    }
  }
  if (p.winded && p.stamina >= WINDED_RECOVER) p.winded = false;

  // cubrirse con el escudo te frena; esprintar te dispara
  const maxSpeed = p.blocking
    ? RUN_SPEED * BLOCK_MOVE_MULT
    : p.sprinting
      ? RUN_SPEED * SPRINT_MULT
      : RUN_SPEED;

  // --- Horizontal ---
  if (p.grounded) {
    if (wants) {
      // acelera hacia la dirección deseada
      p.vx += wishX * ACCEL * DT;
      p.vz += wishZ * ACCEL * DT;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > maxSpeed) {
        p.vx = (p.vx / sp) * maxSpeed;
        p.vz = (p.vz / sp) * maxSpeed;
      }
    } else {
      // fricción: parada seca
      const sp = Math.hypot(p.vx, p.vz);
      const drop = FRICTION * DT;
      const ns = Math.max(0, sp - drop);
      if (sp > 1e-6) {
        p.vx *= ns / sp;
        p.vz *= ns / sp;
      } else {
        p.vx = 0;
        p.vz = 0;
      }
    }
  } else if (wants) {
    // control aéreo: acelera hacia el deseo sin pasar de RUN_SPEED
    p.vx += wishX * AIR_CONTROL_ACCEL * DT;
    p.vz += wishZ * AIR_CONTROL_ACCEL * DT;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > maxSpeed) {
      p.vx = (p.vx / sp) * maxSpeed;
      p.vz = (p.vz / sp) * maxSpeed;
    }
  }

  // Encara la dirección de marcha (la hitbox del golpe cuelga del yaw).
  // Bloqueando NO: el escudo apunta a la amenaza (el sim encara al enemigo).
  // con marcha lateral el yaw lo manda el input, no la dirección de marcha
  if (inp.faceYaw !== null && !p.blocking) p.yaw = inp.faceYaw;
  else if (wants && !p.blocking) p.yaw = Math.atan2(wishX, wishZ);

  // --- Buffers de salto ---
  p.jumpBuffer = inp.jump ? JUMP_BUFFER_TIME : Math.max(0, p.jumpBuffer - DT);
  if (p.grounded) p.coyote = COYOTE_TIME;
  else p.coyote = Math.max(0, p.coyote - DT);

  // saltar también cansa: sin energía suficiente, las piernas no responden
  if (p.jumpBuffer > 0 && p.coyote > 0 && p.stamina >= JUMP_STAMINA_COST) {
    p.vy = JUMP_VELOCITY;
    p.grounded = false;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.fallVy = 0;
    p.stamina -= JUMP_STAMINA_COST;
    p.staminaDelay = STAMINA_REGEN_DELAY;
    emit({ type: 'jumped', id: p.id });
  }

  // Salto de altura variable: soltar el botón durante la subida corta el impulso
  if (!p.grounded && p.vy > 0 && !inp.jumpHeld) {
    p.vy *= 0.5;
  }

  // --- Vertical ---
  if (!p.grounded) {
    const g = GRAVITY * (p.vy < 0 ? FALL_MULTIPLIER : 1);
    p.vy -= g * DT;
    if (p.vy < p.fallVy) p.fallVy = p.vy;
  }

  // --- Integración + suelo ---
  const steep = terrainSteepness(p.x, p.z, seed);
  if (p.grounded && steep > MAX_WALK_SLOPE) {
    // pendiente imposible: resbala cuesta abajo
    const dh = terrainDownhill(p.x, p.z, seed);
    p.vx += dh.x * STEEP_SLIDE_SPEED * DT * 4;
    p.vz += dh.z * STEEP_SLIDE_SPEED * DT * 4;
  }

  p.x += p.vx * DT;
  p.z += p.vz * DT;
  const ground = terrainHeight(p.x, p.z, seed);

  if (p.grounded) {
    // pegado al suelo mientras el desnivel sea razonable; si el suelo se
    // hunde de golpe (borde), pasa a caída
    if (ground < p.y - 1.2) {
      p.grounded = false;
      p.fallVy = 0;
      p.vy = 0;
    } else {
      p.y = ground;
    }
  } else {
    p.y += p.vy * DT;
    if (p.vy <= 0 && p.y <= ground) {
      p.y = ground;
      const fallSpeed = -p.fallVy;
      p.grounded = true;
      p.vy = 0;
      p.fallVy = 0;
      emit({ type: 'landed', id: p.id, fallSpeed });
    }
  }
}
