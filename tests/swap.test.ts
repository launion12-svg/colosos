// Doble equipo: tu arma es tu clase. El swap cambia habilidad y escudo en
// caliente, con cooldowns independientes por set (la base de los combos).

import { describe, expect, it } from 'vitest';
import { SWAP_COOLDOWN } from '../src/sim/abilities';
import { Sim } from '../src/sim/sim';
import { IDLE_INPUT, type MoveInput, type SimEvent } from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

describe('doble equipo y swap', () => {
  it('el swap alterna el set activo y su habilidad', () => {
    const s = new Sim(3, { setA: 'medula', setB: 'fumarel' });
    expect(s.ability.id).toBe('golpe_vertebra');
    const evs = s.tick(move({ swap: true }));
    expect(evs.some((e) => e.type === 'weaponSwapped' && e.setId === 'fumarel')).toBe(true);
    expect(s.ability.id).toBe('chispa_niebla');
  });

  it('el swap tiene su propio cooldown (no es un parpadeo)', () => {
    const s = new Sim(3, { setA: 'medula', setB: 'fumarel' });
    s.tick(move({ swap: true }));
    const evs = s.tick(move({ swap: true })); // inmediato: ignorado
    expect(evs.some((e) => e.type === 'weaponSwapped')).toBe(false);
    // pasado el cooldown, vuelve a funcionar
    for (let t = 0; t < Math.ceil(SWAP_COOLDOWN * 20); t++) s.tick(move());
    const evs2 = s.tick(move({ swap: true }));
    expect(evs2.some((e) => e.type === 'weaponSwapped')).toBe(true);
  });

  it('cooldowns independientes: usar A, cambiar, y B está fresca (combo)', () => {
    const s = new Sim(3, { setA: 'medula', setB: 'fumarel' });
    // usa la habilidad de A
    const evsA = s.tick(move({ ability: true }));
    expect(evsA.some((e) => e.type === 'abilityUsed')).toBe(true);
    // espera a que termine el windup del golpe
    for (let t = 0; t < 10; t++) s.tick(move());
    expect(s.player.abilityCooldown).toBeGreaterThan(0);
    // cambia a B: el cooldown visible pasa a ser el de B (fresco)
    s.tick(move({ swap: true }));
    expect(s.player.abilityCooldown).toBe(0);
    expect(s.player.abilityCooldownOther).toBeGreaterThan(0);
    // y la habilidad de B dispara ya
    const evsB = s.tick(move({ ability: true }));
    expect(evsB.some((e) => e.type === 'abilityUsed' && e.ability === 'chispa_niebla')).toBe(true);
  });

  it('el escudo va con el set: con espada bloqueas, con bastón no', () => {
    const s = new Sim(3, { setA: 'medula', setB: 'fumarel' });
    s.tick(move({ block: true }));
    expect(s.player.blocking).toBe(true);
    s.tick(move({ swap: true }));
    s.tick(move({ block: true }));
    expect(s.player.blocking).toBe(false); // el bastón no cubre
  });

  it('swap en la paridad determinista', () => {
    const a = new Sim(17, { setA: 'cordelero', setB: 'vigia' });
    const b = new Sim(17, { setA: 'cordelero', setB: 'vigia' });
    const evA: string[] = [];
    const evB: string[] = [];
    for (let t = 0; t < 500; t++) {
      const inp = move({
        moveZ: t % 4 === 0 ? 1 : 0,
        ability: t % 29 === 0,
        swap: t % 53 === 0,
        attack: t % 13 === 0,
      });
      evA.push(...a.tick(inp).map((e: SimEvent) => JSON.stringify(e)));
      evB.push(...b.tick({ ...inp }).map((e: SimEvent) => JSON.stringify(e)));
    }
    expect(evA).toEqual(evB);
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
