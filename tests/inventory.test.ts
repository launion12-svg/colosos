// El zurrón: lo looteado se conserva, y equipar desde el inventario
// sustituye el hueco guardado, jamás la mano.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { IDLE_INPUT, type MoveInput, type SimEvent } from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

function killFirstMob(s: Sim, maxTicks = 500): SimEvent[] {
  const mob = s.mobs()[0];
  const events: SimEvent[] = [];
  for (let t = 0; t < maxTicks && mob.alive; t++) {
    s.player.x = mob.x;
    s.player.z = mob.z;
    s.player.y = mob.y;
    s.player.yaw = Math.atan2(mob.x - s.player.x, mob.z - s.player.z);
    s.player.hp = s.player.maxHp;
    events.push(...s.tick(move({ attack: t % 2 === 0 })));
  }
  return events;
}

describe('inventario y zurrón', () => {
  it('arrancas con tu arma inicial en el zurrón', () => {
    const s = new Sim(11, { setA: 'medula' });
    expect(s.player.ownedWeapons).toEqual(['medula']);
    const s2 = new Sim(11, { setA: 'medula', setB: 'fumarel' });
    expect(s2.player.ownedWeapons).toEqual(['medula', 'fumarel']);
  });

  it('lo looteado va al zurrón y se conserva (ya no sustituye)', () => {
    const s = new Sim(11, { setA: 'medula', setB: 'fumarel' });
    // con la secundaria ocupada el drop es probabilístico: caza hasta que caiga
    for (const mob of s.mobs()) {
      if (s.drops.length > 0) break;
      const events: SimEvent[] = [];
      for (let t = 0; t < 400 && mob.alive; t++) {
        s.player.x = mob.x;
        s.player.z = mob.z;
        s.player.y = mob.y;
        s.player.yaw = 0;
        s.player.hp = s.player.maxHp;
        events.push(...s.tick(move({ attack: t % 2 === 0 })));
      }
    }
    const drop = s.drops[0];
    expect(drop).toBeDefined();
    const setABefore = s.player.setA;
    const setBBefore = s.player.setB;
    s.player.x = drop.x;
    s.player.z = drop.z;
    s.tick(move());
    // el equipo en mano no cambia; el zurrón registra el tipo (nuevo o mejorado)
    expect(s.player.setA).toBe(setABefore);
    expect(s.player.setB).toBe(setBBefore);
    expect(s.player.ownedWeapons).toContain(drop.setId);
    expect(s.player.weaponRarity[drop.setId]).toBe(drop.rarity);
  });

  it('equipStored equipa del zurrón al hueco guardado, nunca a la mano', () => {
    const s = new Sim(11, { setA: 'medula', setB: 'fumarel' });
    s.player.ownedWeapons.push('vigia'); // como si la hubieras looteado
    const ok = s.equipStored('vigia');
    expect(ok).toBe(true);
    expect(s.player.setA).toBe('medula'); // la mano no se toca
    expect(s.player.setB).toBe('vigia'); // el hueco guardado sí
    const evs = s.tick(move());
    expect(evs.some((e) => e.type === 'weaponEquipped' && e.setId === 'vigia')).toBe(true);
  });

  it('con el set B en mano, equipar sustituye el A guardado', () => {
    const s = new Sim(11, { setA: 'medula', setB: 'fumarel' });
    s.player.ownedWeapons.push('cordelero');
    s.tick(move({ swap: true })); // ahora B (fumarel) está en mano
    expect(s.activeSetId).toBe('fumarel');
    s.equipStored('cordelero');
    expect(s.player.setB).toBe('fumarel'); // la mano sigue igual
    expect(s.player.setA).toBe('cordelero'); // el guardado cambió
  });

  it('validaciones: ni armas ajenas ni ya equipadas', () => {
    const s = new Sim(11, { setA: 'medula', setB: 'fumarel' });
    expect(s.equipStored('vigia')).toBe(false); // no la tienes
    expect(s.equipStored('medula')).toBe(false); // ya en mano
    expect(s.equipStored('fumarel')).toBe(false); // ya equipada
  });

  it('los drops nunca duplican nada del zurrón', () => {
    const s = new Sim(11, { setA: 'medula', setB: 'fumarel' });
    s.player.ownedWeapons.push('vigia', 'cordelero'); // zurrón completo
    const events = killFirstMob(s);
    expect(events.some((e) => e.type === 'lootDropped')).toBe(false);
  });
});
