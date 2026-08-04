// Loot de armas: entras con una, la segunda cae de los bichos.
// La primera está garantizada; nunca caen duplicados de lo que llevas.

import { describe, expect, it } from 'vitest';
import { CLASS_ABILITY } from '../src/sim/abilities';
import { Sim } from '../src/sim/sim';
import { IDLE_INPUT, type MoveInput, type SimEvent } from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

// mata al primer lobo por el camino real y devuelve todos los eventos
function killFirstWolf(s: Sim, maxTicks = 500): SimEvent[] {
  const wolf = s.mobs()[0];
  const events: SimEvent[] = [];
  for (let t = 0; t < maxTicks && wolf.alive; t++) {
    s.player.x = wolf.x;
    s.player.z = wolf.z;
    s.player.y = wolf.y;
    s.player.yaw = Math.atan2(wolf.x - s.player.x, wolf.z - s.player.z);
    s.player.hp = s.player.maxHp;
    events.push(...s.tick(move({ attack: t % 2 === 0 })));
  }
  return events;
}

describe('loot de armas', () => {
  it('empiezas con una sola arma: sin segunda no hay swap', () => {
    const s = new Sim(11, { setA: 'medula' });
    expect(s.player.setB).toBe('');
    const evs = s.tick(move({ swap: true }));
    expect(evs.some((e) => e.type === 'weaponSwapped')).toBe(false);
  });

  it('el primer lobo suelta arma garantizada, y nunca de un tipo que ya llevas', () => {
    const s = new Sim(11, { setA: 'medula' });
    const events = killFirstWolf(s);
    const drop = events.find((e) => e.type === 'lootDropped');
    expect(drop).toBeDefined();
    if (drop?.type === 'lootDropped') {
      expect(drop.setId).not.toBe('medula');
      // cualquier arma del catálogo menos la que ya llevas
      expect(Object.keys(CLASS_ABILITY)).toContain(drop.setId);
    }
  });

  it('pasar por encima recoge el arma, la equipa como secundaria y desbloquea el swap', () => {
    const s = new Sim(11, { setA: 'medula' });
    killFirstWolf(s);
    const drop = s.drops[0];
    expect(drop).toBeDefined();
    // camina hasta el drop
    s.player.x = drop.x;
    s.player.z = drop.z;
    const evs = s.tick(move());
    const picked = evs.find((e) => e.type === 'lootPickedUp');
    expect(picked).toBeDefined();
    expect(s.player.setB).not.toBe('');
    expect(s.drops.length).toBe(0);
    // y ahora sí: el swap funciona
    const evs2 = s.tick(move({ swap: true }));
    expect(evs2.some((e) => e.type === 'weaponSwapped')).toBe(true);
  });

  it('los drops son tipos nuevos o mejoras: jamás un duplicado exacto', () => {
    const s = new Sim(11, { setA: 'medula', setB: 'fumarel' });
    // mata lobos hasta ver varios drops
    const seen = new Set<string>();
    for (const wolf of s.mobs()) {
      const events: SimEvent[] = [];
      wolf.hp = 1; // a un punto: aquí se mide QUÉ cae, no cuánto aguanta
      for (let t = 0; t < 40 && wolf.alive; t++) {
        s.player.x = wolf.x;
        s.player.z = wolf.z;
        s.player.y = wolf.y;
        s.player.yaw = 0;
        s.player.hp = s.player.maxHp;
        // no pises los drops: quédate donde el lobo
        events.push(...s.tick(move({ attack: t % 2 === 0 })));
      }
      for (const e of events) {
        if (e.type === 'lootDropped') {
          seen.add(e.setId);
          if (e.setId === 'medula' || e.setId === 'fumarel') {
            expect(e.rarity).toBeGreaterThanOrEqual(1); // solo mejoras
          }
        }
      }
    }
    // con medula y fumarel en calidad común, un drop de esos tipos solo puede
    // ser mejora (mágica o rara); los tipos nuevos caen en cualquier calidad
    expect(seen.size).toBeGreaterThan(0);
  });

  it('el loot entra en la paridad determinista', () => {
    const a = new Sim(23, { setA: 'vigia' });
    const b = new Sim(23, { setA: 'vigia' });
    const evA: string[] = [];
    const evB: string[] = [];
    for (let t = 0; t < 600; t++) {
      const inp = move({
        moveZ: t % 5 === 0 ? 1 : 0,
        attack: t % 7 === 0,
        ability: t % 31 === 0,
        swap: t % 41 === 0,
      });
      evA.push(...a.tick(inp).map((e) => JSON.stringify(e)));
      evB.push(...b.tick({ ...inp }).map((e) => JSON.stringify(e)));
    }
    expect(evA).toEqual(evB);
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
