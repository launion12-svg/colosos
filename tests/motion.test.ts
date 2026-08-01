// El kernel de movimiento: aceleración, fricción seca, salto, coyote time.
// Prueba el camino real (stepPlayerMotion), no atajos equivalentes.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import {
  COYOTE_TIME,
  DT,
  IDLE_INPUT,
  RUN_SPEED,
  type MoveInput,
} from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

describe('kernel de movimiento', () => {
  it('acelera hasta RUN_SPEED y no lo supera', () => {
    const s = new Sim(1);
    for (let t = 0; t < 40; t++) s.tick(move({ moveZ: 1 }));
    const speed = Math.hypot(s.player.vx, s.player.vz);
    expect(speed).toBeGreaterThan(RUN_SPEED * 0.95);
    expect(speed).toBeLessThanOrEqual(RUN_SPEED + 1e-9);
  });

  it('la fricción para en seco al soltar', () => {
    const s = new Sim(1);
    for (let t = 0; t < 40; t++) s.tick(move({ moveZ: 1 }));
    for (let t = 0; t < 6; t++) s.tick(move());
    expect(Math.hypot(s.player.vx, s.player.vz)).toBeLessThan(0.5);
  });

  it('el salto despega y vuelve a aterrizar en el suelo', () => {
    const s = new Sim(1);
    s.tick(move({ jump: true, jumpHeld: true }));
    expect(s.player.grounded).toBe(false);
    let landed = false;
    for (let t = 0; t < 60 && !landed; t++) {
      const evs = s.tick(move({ jumpHeld: true }));
      landed = evs.some((e) => e.type === 'landed');
    }
    expect(landed).toBe(true);
    expect(s.player.grounded).toBe(true);
  });

  it('soltar el salto en la subida lo corta (altura variable)', () => {
    const sHold = new Sim(1);
    const sTap = new Sim(1);
    sHold.tick(move({ jump: true, jumpHeld: true }));
    sTap.tick(move({ jump: true, jumpHeld: true }));
    let maxHold = -Infinity;
    let maxTap = -Infinity;
    for (let t = 0; t < 40; t++) {
      sHold.tick(move({ jumpHeld: true }));
      sTap.tick(move({ jumpHeld: false }));
      maxHold = Math.max(maxHold, sHold.player.y);
      maxTap = Math.max(maxTap, sTap.player.y);
    }
    expect(maxHold).toBeGreaterThan(maxTap + 0.3);
  });

  it('coyote time: puedes saltar justo después de dejar el suelo', () => {
    const s = new Sim(1);
    const p = s.player;
    // simula haber salido andando de un saliente: en el aire, sin saltar
    p.grounded = false;
    p.coyote = COYOTE_TIME;
    p.vy = 0;
    const evs = s.tick(move({ jump: true, jumpHeld: true }));
    expect(evs.some((e) => e.type === 'jumped')).toBe(true);
    expect(p.vy).toBeGreaterThan(0);
  });

  it('jump buffer: pulsar salto durante la caída re-salta al aterrizar', () => {
    const s = new Sim(1);
    const first = s.tick(move({ jump: true, jumpHeld: true }));
    expect(first.some((e) => e.type === 'jumped')).toBe(true);
    // pulsa salto mientras cae: el buffer debe disparar el re-salto al tocar suelo
    let secondJump = false;
    for (let t = 0; t < 100 && !secondJump; t++) {
      const falling = !s.player.grounded && s.player.vy < 0;
      const evs = s.tick(move({ jump: falling, jumpHeld: false }));
      secondJump = evs.some((e) => e.type === 'jumped');
    }
    expect(secondJump).toBe(true);
  });

  it(`un tick dura exactamente DT (${DT}s a 20 Hz)`, () => {
    const s = new Sim(1);
    s.tick();
    s.tick();
    expect(s.time).toBeCloseTo(DT * 2, 10);
  });
});
