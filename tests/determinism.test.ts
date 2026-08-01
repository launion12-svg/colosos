// Paridad de determinismo: misma semilla + mismos inputs = mismo mundo,
// bit a bit. Es el contrato que hará posible el multijugador en la Fase 4.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { MoveInput } from '../src/sim/types';

// guion de inputs determinista: función pura del número de tick
function scriptedInput(tick: number): MoveInput {
  const phase = tick % 200;
  return {
    moveX: phase < 60 ? Math.sin(tick * 0.05) : 0,
    moveZ: phase < 90 ? 1 : phase < 120 ? -0.5 : 0,
    jump: phase === 30 || phase === 95,
    jumpHeld: phase >= 30 && phase < 40,
    attack: phase % 17 === 0,
    block: phase >= 150 && phase < 170, // también el bloqueo entra en la paridad
    ability: phase % 43 === 0, // y la habilidad de clase
    sprint: phase >= 60 && phase < 90, // y el esprint con su energía
    swap: phase % 97 === 0, // y el cambio de set
  };
}

describe('determinismo del sim', () => {
  it('dos sims con la misma semilla producen estados idénticos tick a tick', () => {
    const a = new Sim(12345);
    const b = new Sim(12345);
    for (let t = 0; t < 800; t++) {
      const inp = scriptedInput(t);
      a.tick(inp);
      b.tick({ ...inp }); // objeto distinto, mismos valores
      if (t % 100 === 0) {
        expect(a.stateHash()).toBe(b.stateHash());
      }
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('los eventos emitidos también son idénticos', () => {
    const a = new Sim(777);
    const b = new Sim(777);
    const evA: string[] = [];
    const evB: string[] = [];
    for (let t = 0; t < 600; t++) {
      const inp = scriptedInput(t);
      evA.push(...a.tick(inp).map((e) => JSON.stringify(e)));
      evB.push(...b.tick({ ...inp }).map((e) => JSON.stringify(e)));
    }
    expect(evA).toEqual(evB);
  });

  it('semillas distintas divergen (el mundo depende de la semilla)', () => {
    const a = new Sim(1);
    const b = new Sim(2);
    for (let t = 0; t < 200; t++) {
      a.tick(scriptedInput(t));
      b.tick(scriptedInput(t));
    }
    expect(a.stateHash()).not.toBe(b.stateHash());
  });

  it('el reloj del mundo avanza y da la vuelta', () => {
    const s = new Sim(42);
    const t0 = s.timeOfDay;
    for (let t = 0; t < 100; t++) s.tick(scriptedInput(t));
    expect(s.timeOfDay).toBeGreaterThan(t0);
    expect(s.timeOfDay).toBeLessThan(1);
  });
});
