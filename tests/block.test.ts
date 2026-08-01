// Bloqueo con escudo: arco frontal, reducción de daño y penalizaciones.

import { describe, expect, it } from 'vitest';
import { isBlockedHit } from '../src/sim/combat';
import { Sim } from '../src/sim/sim';
import {
  BLOCK_DAMAGE_MULT,
  BLOCK_MOVE_MULT,
  IDLE_INPUT,
  MOB_DAMAGE_MAX,
  RUN_SPEED,
  type Entity,
  type MoveInput,
  type SimEvent,
} from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

function fakeEntity(over: Partial<Entity>): Entity {
  const s = new Sim(1);
  return { ...s.player, ...over };
}

describe('bloqueo con escudo', () => {
  it('isBlockedHit: cubre el frente, no la espalda', () => {
    const target = fakeEntity({ blocking: true, hasShield: true, x: 0, z: 0, yaw: 0 });
    const front = fakeEntity({ id: 99, x: 0, z: 2 }); // delante (+Z, yaw 0)
    const back = fakeEntity({ id: 98, x: 0, z: -2 }); // detrás
    expect(isBlockedHit(target, front)).toBe(true);
    expect(isBlockedHit(target, back)).toBe(false);
  });

  it('sin escudo o sin bloquear no hay bloqueo', () => {
    const attacker = fakeEntity({ id: 99, x: 0, z: 2 });
    expect(isBlockedHit(fakeEntity({ blocking: false, hasShield: true, yaw: 0 }), attacker)).toBe(
      false,
    );
    expect(isBlockedHit(fakeEntity({ blocking: true, hasShield: false, yaw: 0 }), attacker)).toBe(
      false,
    );
  });

  it('el mordisco bloqueado entra reducido y emite blockedHit', () => {
    const s = new Sim(99);
    const wolf = s.mobs()[0];
    const events: SimEvent[] = [];
    // plántate en el campamento cubriéndote y deja que muerda
    for (let t = 0; t < 300; t++) {
      s.player.x = wolf.x;
      s.player.z = wolf.z;
      s.player.y = wolf.y;
      events.push(...s.tick(move({ block: true })));
      if (events.some((e) => e.type === 'blockedHit')) break;
    }
    const blocked = events.filter((e) => e.type === 'blockedHit');
    expect(blocked.length).toBeGreaterThan(0);
    // nunca un hitLanded del lobo al jugador: el auto-encara garantiza el arco
    const unblocked = events.filter(
      (e) => e.type === 'hitLanded' && e.targetId === s.player.id,
    );
    expect(unblocked.length).toBe(0);
    for (const b of blocked) {
      if (b.type !== 'blockedHit') continue;
      expect(b.amount).toBeLessThanOrEqual(Math.floor(MOB_DAMAGE_MAX * BLOCK_DAMAGE_MULT));
    }
  });

  it('bloquear frena el movimiento', () => {
    const s = new Sim(1);
    for (let t = 0; t < 40; t++) s.tick(move({ moveZ: 1, block: true }));
    const speed = Math.hypot(s.player.vx, s.player.vz);
    expect(speed).toBeLessThanOrEqual(RUN_SPEED * BLOCK_MOVE_MULT + 1e-9);
    expect(speed).toBeGreaterThan(0.5); // pero sí caminas
  });

  it('bloqueando no puedes atacar', () => {
    const s = new Sim(1);
    const evs = s.tick(move({ attack: true, block: true }));
    expect(evs.some((e) => e.type === 'swung')).toBe(false);
    const evs2 = s.tick(move({ attack: true }));
    expect(evs2.some((e) => e.type === 'swung')).toBe(true);
  });
});
