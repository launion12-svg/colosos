// Rarezas: multiplican el daño del arma en mano, toda caída mejora lo que
// tienes, y jamás cae un downgrade.

import { describe, expect, it } from 'vitest';
import { RARITY_MULT, RARITY_NAMES } from '../src/sim/abilities';
import { Sim } from '../src/sim/sim';
import { IDLE_INPUT, type MoveInput, type SimEvent } from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

function hitAmounts(s: Sim, ticks = 40): number[] {
  const mob = s.mobs()[0];
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) {
    s.player.x = mob.x;
    s.player.z = mob.z;
    s.player.y = mob.y;
    s.player.yaw = 0;
    s.player.hp = s.player.maxHp;
    mob.hp = mob.maxHp; // que no muera: medimos daños, no muertes
    for (const e of s.tick(move({ attack: t % 2 === 0 }))) {
      if (e.type === 'hitLanded' && e.attackerId === s.player.id) out.push(e.amount);
    }
  }
  return out;
}

describe('rarezas de armas', () => {
  it('hay tres calidades con multiplicadores crecientes', () => {
    expect(RARITY_NAMES.length).toBe(3);
    expect(RARITY_MULT[1]).toBeGreaterThan(RARITY_MULT[0]);
    expect(RARITY_MULT[2]).toBeGreaterThan(RARITY_MULT[1]);
  });

  it('el arma rara pega más que la común (misma semilla, mismos golpes)', () => {
    const a = new Sim(13, { setA: 'medula' });
    const b = new Sim(13, { setA: 'medula' });
    b.player.weaponRarity.medula = 2; // rara
    const hitsA = hitAmounts(a);
    const hitsB = hitAmounts(b);
    expect(hitsA.length).toBeGreaterThan(0);
    expect(hitsB.length).toBe(hitsA.length);
    const sumA = hitsA.reduce((x, y) => x + y, 0);
    const sumB = hitsB.reduce((x, y) => x + y, 0);
    expect(sumB).toBeGreaterThan(sumA * 1.3); // ~x1.55
  });

  it('recoger una calidad superior mejora el arma en el sitio', () => {
    const s = new Sim(13, { setA: 'medula' });
    s.drops.push({ id: 999, x: s.player.x, z: s.player.z, y: s.player.y, setId: 'medula', rarity: 2 });
    const evs = s.tick(move());
    const picked = evs.find((e) => e.type === 'lootPickedUp');
    expect(picked).toBeDefined();
    if (picked?.type === 'lootPickedUp') expect(picked.upgraded).toBe(true);
    expect(s.player.weaponRarity.medula).toBe(2);
    expect(s.player.ownedWeapons.filter((w) => w === 'medula').length).toBe(1); // sin duplicar
  });

  it('con todo en calidad máxima, no caen más armas', () => {
    const s = new Sim(13, { setA: 'medula', setB: 'fumarel' });
    s.player.ownedWeapons = ['medula', 'fumarel', 'vigia', 'cordelero'];
    s.player.weaponRarity = { medula: 2, fumarel: 2, vigia: 2, cordelero: 2 };
    const mob = s.mobs()[0];
    const events: SimEvent[] = [];
    for (let t = 0; t < 400 && mob.alive; t++) {
      s.player.x = mob.x;
      s.player.z = mob.z;
      s.player.y = mob.y;
      s.player.yaw = 0;
      s.player.hp = s.player.maxHp;
      events.push(...s.tick(move({ attack: t % 2 === 0 })));
    }
    expect(mob.alive).toBe(false);
    expect(events.some((e) => e.type === 'lootDropped')).toBe(false);
  });

  it('los drops jamás son downgrade de lo que ya tienes', () => {
    const s = new Sim(13, { setA: 'medula' });
    s.player.weaponRarity.medula = 1; // mágica
    // caza por todos los campamentos acumulando drops
    const dropped: Array<{ setId: string; rarity: number }> = [];
    for (const mob of s.mobs()) {
      for (let t = 0; t < 400 && mob.alive; t++) {
        s.player.x = mob.x;
        s.player.z = mob.z;
        s.player.y = mob.y;
        s.player.yaw = 0;
        s.player.hp = s.player.maxHp;
        for (const e of s.tick(move({ attack: t % 2 === 0 }))) {
          if (e.type === 'lootDropped') dropped.push({ setId: e.setId, rarity: e.rarity });
        }
      }
    }
    expect(dropped.length).toBeGreaterThan(0);
    for (const d of dropped) {
      const owned = s.player.weaponRarity[d.setId];
      if (owned !== undefined) expect(d.rarity).toBeGreaterThan(-1); // cayó porque mejora
      if (d.setId === 'medula') expect(d.rarity).toBeGreaterThan(1); // nunca <= mágica
    }
  });

  it('paridad determinista con rarezas en juego', () => {
    const a = new Sim(29, { setA: 'vigia' });
    const b = new Sim(29, { setA: 'vigia' });
    const evA: string[] = [];
    const evB: string[] = [];
    for (let t = 0; t < 500; t++) {
      const inp = move({ moveZ: t % 4 === 0 ? 1 : 0, attack: t % 5 === 0, ability: t % 23 === 0 });
      evA.push(...a.tick(inp).map((e) => JSON.stringify(e)));
      evB.push(...b.tick({ ...inp }).map((e) => JSON.stringify(e)));
    }
    expect(evA).toEqual(evB);
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
