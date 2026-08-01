// Progresión: la curva de XP, el ding y el escalado de stats.
// Mata lobos por el camino real (input de ataque contra la IA viva).

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import {
  IDLE_INPUT,
  MAX_LEVEL,
  playerDamageMax,
  playerDamageMin,
  playerMaxHp,
  xpToNext,
  type MoveInput,
  type SimEvent,
} from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

describe('progresión', () => {
  it('la curva de XP crece de forma monótona', () => {
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
      expect(xpToNext(l)).toBeGreaterThan(0);
    }
  });

  it('las stats escalan con el nivel', () => {
    expect(playerMaxHp(5)).toBeGreaterThan(playerMaxHp(1));
    expect(playerDamageMin(5)).toBeGreaterThan(playerDamageMin(1));
    expect(playerDamageMax(5)).toBeGreaterThanOrEqual(playerDamageMin(5) + 1);
  });

  it('matar un lobo por el camino real concede XP', () => {
    const s = new Sim(99);
    const wolf = s.mobs()[0];
    // colócate encima del lobo y machaca el ataque
    const events: SimEvent[] = [];
    for (let t = 0; t < 400 && wolf.alive; t++) {
      s.player.x = wolf.x;
      s.player.z = wolf.z;
      s.player.y = wolf.y;
      s.player.yaw = Math.atan2(wolf.x - s.player.x, wolf.z - s.player.z);
      s.player.hp = s.player.maxHp; // que no nos mate mientras probamos XP
      events.push(...s.tick(move({ attack: t % 2 === 0 })));
    }
    expect(wolf.alive).toBe(false);
    expect(events.some((e) => e.type === 'xpGained')).toBe(true);
    expect(s.player.xp).toBeGreaterThan(0);
  });

  it('acumular XP sube de nivel, cura a tope y emite leveledUp', () => {
    const s = new Sim(7);
    const p = s.player;
    p.hp = 30; // herido: el ding debe curar
    p.xp = xpToNext(1) - 1;
    // un pelín de XP por el camino privado: matamos con daño directo simulado
    // (el camino real ya está cubierto en el test anterior)
    const wolf = s.mobs()[0];
    wolf.hp = 1;
    p.x = wolf.x;
    p.z = wolf.z;
    p.y = wolf.y;
    let dinged: SimEvent | undefined;
    for (let t = 0; t < 60 && !dinged; t++) {
      p.yaw = Math.atan2(wolf.x - p.x, wolf.z - p.z);
      const evs = s.tick(move({ attack: true }));
      dinged = evs.find((e) => e.type === 'leveledUp');
    }
    expect(dinged).toBeDefined();
    expect(p.level).toBe(2);
    expect(p.maxHp).toBe(playerMaxHp(2));
    expect(p.hp).toBe(p.maxHp); // curado por el ding
  });

  it('en el nivel máximo la XP deja de acumularse', () => {
    const s = new Sim(7);
    const p = s.player;
    p.level = MAX_LEVEL;
    p.xp = 0;
    const wolf = s.mobs()[0];
    wolf.hp = 1;
    p.x = wolf.x;
    p.z = wolf.z;
    p.y = wolf.y;
    for (let t = 0; t < 60 && wolf.alive; t++) {
      p.yaw = Math.atan2(wolf.x - p.x, wolf.z - p.z);
      s.tick(move({ attack: true }));
    }
    expect(wolf.alive).toBe(false);
    expect(p.xp).toBe(0);
    expect(p.level).toBe(MAX_LEVEL);
  });
});
