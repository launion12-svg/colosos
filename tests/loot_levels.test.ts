// El nivel de la criatura gobierna la calidad de su botín, y el zurrón
// lleno deja el arma en el suelo en vez de tragársela.

import { describe, expect, it } from 'vitest';
import { BAG_SLOTS, rarityWeightsForLevel } from '../src/sim/abilities';
import { BESTIARY } from '../src/sim/bestiary';
import { Sim } from '../src/sim/sim';
import { IDLE_INPUT, type MoveInput, type SimEvent } from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

// mata a una criatura concreta por el camino real y devuelve sus eventos
function farm(s: Sim, templateId: string, rounds = 6): SimEvent[] {
  const events: SimEvent[] = [];
  for (let r = 0; r < rounds; r++) {
    const mob = s.mobs().find((m) => m.templateId === templateId && m.alive);
    if (!mob) break;
    for (let t = 0; t < 500 && mob.alive; t++) {
      s.player.x = mob.x;
      s.player.z = mob.z;
      s.player.y = mob.y;
      s.player.yaw = 0;
      s.player.hp = s.player.maxHp;
      events.push(...s.tick(move({ attack: t % 2 === 0 })));
    }
    // deja que respawnee para volver a farmearla
    for (let t = 0; t < 260 && !mob.alive; t++) s.tick(move());
  }
  return events;
}

describe('niveles de criatura y calidad del botín', () => {
  it('cada criatura tiene nivel, y el jefe es el más alto', () => {
    for (const t of Object.values(BESTIARY)) expect(t.level).toBeGreaterThan(0);
    expect(BESTIARY.arana.level).toBe(1);
    expect(BESTIARY.gigante.level).toBeGreaterThan(BESTIARY.goblin.level);
  });

  it('nivel 1: prácticamente todo común; a más nivel, mejor tabla', () => {
    const l1 = rarityWeightsForLevel(1);
    expect(l1[0]).toBe(1);
    expect(l1[1]).toBe(0);
    expect(l1[2]).toBe(0);
    const l6 = rarityWeightsForLevel(6);
    const l10 = rarityWeightsForLevel(10);
    expect(l6[1]).toBeGreaterThan(0);
    expect(l10[1] + l10[2]).toBeGreaterThan(l6[1] + l6[2]);
    expect(l10[2]).toBeGreaterThan(0); // el jefe sí reparte raras
    for (const w of [l1, l6, l10]) {
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    }
  });

  it('las arañas de nivel 1 solo sueltan calidad común', () => {
    const s = new Sim(41, { setA: 'medula' });
    const events = farm(s, 'arana');
    const drops = events.filter((e) => e.type === 'lootDropped');
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) {
      if (d.type === 'lootDropped') expect(d.rarity).toBe(0);
    }
  });

  it('una criatura de nivel 1 nunca puede mejorarte un arma que ya tienes', () => {
    const s = new Sim(41, { setA: 'medula', setB: 'fumarel' });
    s.player.ownedWeapons = ['medula', 'fumarel', 'vigia', 'cordelero'];
    s.player.weaponRarity = { medula: 0, fumarel: 0, vigia: 0, cordelero: 0 };
    const events = farm(s, 'arana');
    // todo lo tiene en común y la araña solo da común: no hay nada que soltar
    expect(events.some((e) => e.type === 'lootDropped')).toBe(false);
  });

  it('el jefe sí puede soltar mejoras de calidad alta', () => {
    const s = new Sim(41, { setA: 'medula', setB: 'fumarel' });
    s.player.ownedWeapons = ['medula', 'fumarel', 'vigia', 'cordelero'];
    s.player.weaponRarity = { medula: 0, fumarel: 0, vigia: 0, cordelero: 0 };
    const events = farm(s, 'gigante', 10);
    const drops = events.filter(
      (e): e is Extract<SimEvent, { type: 'lootDropped' }> => e.type === 'lootDropped',
    );
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) expect(d.rarity).toBeGreaterThanOrEqual(1); // solo mejoras
  });

  it('zurrón lleno: avisa y el arma NO desaparece del suelo', () => {
    const s = new Sim(41, { setA: 'medula' });
    // llena el zurrón hasta la capacidad con tipos ficticios
    s.player.ownedWeapons = Array.from({ length: BAG_SLOTS }, (_, i) => `relleno_${i}`);
    s.drops.push({
      id: 777,
      x: s.player.x,
      y: s.player.y,
      z: s.player.z,
      setId: 'vigia',
      rarity: 1,
    });
    const evs = s.tick(move());
    expect(evs.some((e) => e.type === 'bagFull')).toBe(true);
    expect(evs.some((e) => e.type === 'lootPickedUp')).toBe(false);
    expect(s.drops.length).toBe(1); // sigue esperándote en el suelo
    expect(s.player.weaponRarity.vigia).toBeUndefined();
  });

  it('el aviso no se repite cada tick mientras lo pisas', () => {
    const s = new Sim(41, { setA: 'medula' });
    s.player.ownedWeapons = Array.from({ length: BAG_SLOTS }, (_, i) => `relleno_${i}`);
    s.drops.push({ id: 778, x: s.player.x, y: s.player.y, z: s.player.z, setId: 'vigia', rarity: 0 });
    let avisos = 0;
    for (let t = 0; t < 20; t++) {
      for (const e of s.tick(move())) if (e.type === 'bagFull') avisos++;
    }
    expect(avisos).toBe(1);
  });

  it('con el zurrón lleno, una MEJORA sí se recoge (no ocupa hueco nuevo)', () => {
    const s = new Sim(41, { setA: 'medula' });
    s.player.ownedWeapons = [
      'medula',
      ...Array.from({ length: BAG_SLOTS - 1 }, (_, i) => `relleno_${i}`),
    ];
    s.drops.push({ id: 779, x: s.player.x, y: s.player.y, z: s.player.z, setId: 'medula', rarity: 2 });
    const evs = s.tick(move());
    expect(evs.some((e) => e.type === 'bagFull')).toBe(false);
    expect(evs.some((e) => e.type === 'lootPickedUp')).toBe(true);
    expect(s.player.weaponRarity.medula).toBe(2);
    expect(s.drops.length).toBe(0);
  });
});
