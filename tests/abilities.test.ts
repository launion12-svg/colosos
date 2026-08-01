// Habilidades de clase: cooldown, golpe pesado multiobjetivo, proyectiles
// que vuelan y golpean, y la acometida que atraviesa. Todo por el camino real.

import { describe, expect, it } from 'vitest';
import { CLASS_ABILITY } from '../src/sim/abilities';
import { Sim } from '../src/sim/sim';
import { IDLE_INPUT, type MoveInput, type SimEvent } from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

import type { Entity } from '../src/sim/types';

function placeNear(s: Sim, dx = 0, dz = 3): void {
  placeAt(s, s.mobs()[0], dx, dz);
}

// el yeti vive solo: objetivo limpio para probar proyectiles sin que un
// compañero de pack se coma el disparo
function lonelyTarget(s: Sim): Entity {
  return s.mobs().find((m) => m.templateId === 'gigante')!;
}

function placeAt(s: Sim, target: Entity, dx = 0, dz = 3): void {
  s.player.x = target.x + dx;
  s.player.z = target.z - dz;
  s.player.y = target.y;
  s.player.yaw = Math.atan2(target.x - s.player.x, target.z - s.player.z);
}

describe('habilidades de clase', () => {
  it('las 4 clases tienen habilidad definida', () => {
    for (const id of ['medula', 'vigia', 'cordelero', 'fumarel']) {
      expect(CLASS_ABILITY[id]).toBeDefined();
      expect(CLASS_ABILITY[id].cooldown).toBeGreaterThan(0);
    }
  });

  it('el cooldown impide reutilizarla en caliente', () => {
    const s = new Sim(5, { classId: 'medula' });
    const evs1 = s.tick(move({ ability: true }));
    expect(evs1.some((e) => e.type === 'abilityUsed')).toBe(true);
    const evs2 = s.tick(move({ ability: true }));
    expect(evs2.some((e) => e.type === 'abilityUsed')).toBe(false);
    expect(s.player.abilityCooldown).toBeGreaterThan(0);
  });

  it('Golpe de Vértebra: daña y empuja a los lobos del cono', () => {
    const s = new Sim(5, { classId: 'medula' });
    placeNear(s, 0, 2.5);
    const wolf = s.mobs()[0];
    const hpBefore = wolf.hp;
    const zBefore = wolf.z;
    const events: SimEvent[] = [];
    for (let t = 0; t < 12; t++) events.push(...s.tick(move({ ability: t === 0 })));
    expect(wolf.hp).toBeLessThan(hpBefore);
    expect(Math.abs(wolf.z - zBefore)).toBeGreaterThan(0.5); // el empujón
    expect(events.some((e) => e.type === 'abilityUsed')).toBe(true);
  });

  it('Chispa de Niebla: el proyectil vuela y revienta contra el objetivo', () => {
    const s = new Sim(5, { classId: 'fumarel' });
    const wolf = lonelyTarget(s);
    placeAt(s, wolf, 0, 6);
    const hpBefore = wolf.hp;
    const events: SimEvent[] = [];
    for (let t = 0; t < 40; t++) events.push(...s.tick(move({ ability: t === 0 })));
    expect(events.some((e) => e.type === 'projectileSpawned')).toBe(true);
    expect(events.some((e) => e.type === 'projectileGone')).toBe(true);
    expect(wolf.hp).toBeLessThan(hpBefore);
    expect(s.projectiles.length).toBe(0); // no quedan huérfanos
  });

  it('Acometida: desplaza al Cordelero y daña a quien atraviesa una sola vez', () => {
    const s = new Sim(5, { classId: 'cordelero' });
    placeNear(s, 0, 2);
    const wolf = s.mobs()[0];
    const hpBefore = wolf.hp;
    const zBefore = s.player.z;
    const events: SimEvent[] = [];
    for (let t = 0; t < 10; t++) events.push(...s.tick(move({ ability: t === 0 })));
    expect(s.player.z - zBefore).toBeGreaterThan(2.5); // el dash desplaza de verdad
    expect(wolf.hp).toBeLessThan(hpBefore);
    const hitsToWolf = events.filter(
      (e) => e.type === 'hitLanded' && e.targetId === wolf.id,
    ).length;
    expect(hitsToWolf).toBe(1); // una sola vez por acometida
  });

  it('Vigía: el ataque básico es una flecha que hiere a distancia', () => {
    const s = new Sim(5, { setA: 'vigia' });
    const wolf = lonelyTarget(s);
    placeAt(s, wolf, 0, 7); // lejos del alcance melee
    const hpBefore = wolf.hp;
    const events: SimEvent[] = [];
    for (let t = 0; t < 30; t++) events.push(...s.tick(move({ attack: t === 0 })));
    const arrow = events.find((e) => e.type === 'projectileSpawned');
    expect(arrow).toBeDefined();
    if (arrow?.type === 'projectileSpawned') expect(arrow.kind).toBe('flecha');
    expect(wolf.hp).toBeLessThan(hpBefore);
  });

  it('matar con proyectil concede XP (punto único de concesión)', () => {
    const s = new Sim(5, { classId: 'fumarel' });
    const wolf = lonelyTarget(s);
    placeAt(s, wolf, 0, 6);
    wolf.hp = 1;
    const events: SimEvent[] = [];
    for (let t = 0; t < 40; t++) events.push(...s.tick(move({ ability: t === 0 })));
    expect(wolf.alive).toBe(false);
    expect(events.some((e) => e.type === 'xpGained')).toBe(true);
    expect(s.player.xp).toBeGreaterThan(0);
  });

  it('la habilidad también entra en la paridad determinista', () => {
    const a = new Sim(31, { classId: 'cordelero' });
    const b = new Sim(31, { classId: 'cordelero' });
    for (let t = 0; t < 400; t++) {
      const inp = move({ moveZ: t % 3 === 0 ? 1 : 0, ability: t % 37 === 0, attack: t % 11 === 0 });
      a.tick(inp);
      b.tick({ ...inp });
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
