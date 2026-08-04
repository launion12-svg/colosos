// Pociones: caen de los bichos, se recogen pisándolas y curan con freno.
// Son la única red de seguridad del juego, así que conviene que no se rompa.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import {
  IDLE_INPUT,
  POTION_COOLDOWN,
  POTION_HEAL_PCT,
  POTION_MAX,
  type MoveInput,
} from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

function soltarPocion(s: Sim, cerca = true): void {
  const p = s.player;
  s.potionDrops.push({
    id: 1000 + s.potionDrops.length,
    x: cerca ? p.x : p.x + 40,
    y: p.y,
    z: cerca ? p.z : p.z + 40,
  });
}

describe('pociones', () => {
  it('se recogen pisándolas y se anuncian', () => {
    const s = new Sim(3, { setA: 'medula' });
    soltarPocion(s);
    const evs = s.tick(move());
    expect(evs.some((e) => e.type === 'potionPickedUp')).toBe(true);
    expect(s.player.potions).toBe(1);
    expect(s.potionDrops.length).toBe(0);
  });

  it('con el cinturón lleno se quedan en el suelo esperándote', () => {
    const s = new Sim(3, { setA: 'medula' });
    s.player.potions = POTION_MAX;
    soltarPocion(s);
    s.tick(move());
    expect(s.player.potions).toBe(POTION_MAX);
    expect(s.potionDrops.length).toBe(1); // sigue ahí
  });

  it('beber cura un pellizco gordo, gasta una y deja enfriamiento', () => {
    const s = new Sim(3, { setA: 'medula' });
    s.player.potions = 2;
    s.player.hp = 20;
    const evs = s.tick(move({ drink: true }));
    const esperado = Math.floor(s.player.maxHp * POTION_HEAL_PCT);
    expect(s.player.hp).toBe(20 + esperado);
    expect(s.player.potions).toBe(1);
    expect(s.player.potionCooldown).toBeCloseTo(POTION_COOLDOWN, 1);
    expect(evs.some((e) => e.type === 'potionDrunk')).toBe(true);
    expect(evs.some((e) => e.type === 'healed')).toBe(true);
  });

  it('no se encadenan: mientras enfría, no bebes', () => {
    const s = new Sim(3, { setA: 'medula' });
    s.player.potions = 3;
    s.player.hp = 10;
    s.tick(move({ drink: true }));
    const tras = s.player.hp;
    s.tick(move({ drink: true }));
    expect(s.player.hp).toBe(tras);
    expect(s.player.potions).toBe(2);
  });

  it('a vida llena no se malgasta, y sin pociones no pasa nada', () => {
    const s = new Sim(3, { setA: 'medula' });
    s.player.potions = 1;
    s.tick(move({ drink: true })); // vida al máximo
    expect(s.player.potions).toBe(1);
    s.player.potions = 0;
    s.player.hp = 5;
    const evs = s.tick(move({ drink: true }));
    expect(evs.some((e) => e.type === 'potionDrunk')).toBe(false);
    expect(s.player.hp).toBe(5);
  });

  // Mismo cuento que en casco.test.ts: con 8 bichos esto era una tirada de
  // dados disfrazada de test. Se caza el lomo entero.
  it('los bichos las sueltan: cazando un rato acabas con reservas', () => {
    const s = new Sim(9, { setA: 'hachero' });
    let caidas = 0;
    for (const mob of s.mobs()) {
      mob.hp = 1; // a un punto: se mide lo que SUELTA, no lo que aguanta
      for (let t = 0; t < 40 && mob.alive; t++) {
        s.player.x = mob.x;
        s.player.z = mob.z;
        s.player.y = mob.y;
        s.player.yaw = 0;
        s.player.hp = s.player.maxHp;
        s.player.potions = 0; // vacía el cinturón: nos interesa contar caídas
        for (const e of s.tick(move({ attack: t % 2 === 0 }))) {
          if (e.type === 'potionDropped') caidas++;
        }
      }
    }
    expect(caidas).toBeGreaterThan(0);
  });
});
