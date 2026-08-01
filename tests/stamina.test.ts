// Energía: esprintar acelera y agota, saltar cansa, y el jadeo obliga a
// respirar antes de volver a esprintar.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import {
  IDLE_INPUT,
  JUMP_STAMINA_COST,
  RUN_SPEED,
  SPRINT_MULT,
  STAMINA_MAX,
  type MoveInput,
} from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

describe('energía y esprint', () => {
  it('esprintar supera RUN_SPEED y consume energía', () => {
    const s = new Sim(1);
    for (let t = 0; t < 30; t++) s.tick(move({ moveZ: 1, sprint: true }));
    const speed = Math.hypot(s.player.vx, s.player.vz);
    expect(speed).toBeGreaterThan(RUN_SPEED * 1.2);
    expect(speed).toBeLessThanOrEqual(RUN_SPEED * SPRINT_MULT + 1e-9);
    expect(s.player.stamina).toBeLessThan(STAMINA_MAX);
  });

  it('sin Shift no se esprinta ni se gasta', () => {
    const s = new Sim(1);
    for (let t = 0; t < 30; t++) s.tick(move({ moveZ: 1 }));
    expect(Math.hypot(s.player.vx, s.player.vz)).toBeLessThanOrEqual(RUN_SPEED + 1e-9);
    expect(s.player.stamina).toBe(STAMINA_MAX);
  });

  it('vaciar la barra te deja jadeando: velocidad normal hasta recuperar', () => {
    const s = new Sim(1);
    // esprinta hasta vaciar (100 / 24 por segundo ≈ 4.2s ≈ 84 ticks)
    for (let t = 0; t < 120; t++) s.tick(move({ moveZ: 1, sprint: true }));
    expect(s.player.winded).toBe(true);
    expect(s.player.sprinting).toBe(false);
    const speed = Math.hypot(s.player.vx, s.player.vz);
    expect(speed).toBeLessThanOrEqual(RUN_SPEED + 1e-9);
    // sigue pidiendo esprint: mientras jadea JAMÁS esprinta, y cuando el
    // jadeo se disipa (recuperado el mínimo), vuelve a arrancar solo
    let sprintedWhileWinded = false;
    let recovered = false;
    for (let t = 0; t < 80; t++) {
      s.tick(move({ moveZ: 1, sprint: true }));
      if (s.player.winded && s.player.sprinting) sprintedWhileWinded = true;
      if (!s.player.winded && s.player.sprinting) {
        recovered = true;
        break;
      }
    }
    expect(sprintedWhileWinded).toBe(false);
    expect(recovered).toBe(true);
  });

  it('saltar cuesta energía', () => {
    const s = new Sim(1);
    const before = s.player.stamina;
    s.tick(move({ jump: true, jumpHeld: true }));
    expect(s.player.stamina).toBeCloseTo(before - JUMP_STAMINA_COST, 5);
  });

  it('sin energía suficiente no hay salto', () => {
    const s = new Sim(1);
    s.player.stamina = JUMP_STAMINA_COST - 5;
    const evs = s.tick(move({ jump: true, jumpHeld: true }));
    expect(evs.some((e) => e.type === 'jumped')).toBe(false);
    expect(s.player.grounded).toBe(true);
  });

  it('la energía regenera tras el respiro y no pasa del máximo', () => {
    const s = new Sim(1);
    s.tick(move({ jump: true, jumpHeld: true })); // gasta y arranca el respiro
    const justAfter = s.player.stamina;
    for (let t = 0; t < 8; t++) s.tick(move()); // dentro del respiro (0.7s = 14 ticks)
    expect(s.player.stamina).toBeCloseTo(justAfter, 1); // aún sin regenerar apenas
    for (let t = 0; t < 200; t++) s.tick(move());
    expect(s.player.stamina).toBe(STAMINA_MAX);
  });
});
