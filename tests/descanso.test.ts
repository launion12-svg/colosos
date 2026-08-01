// Fuera de combate el lomo te cura, sentarse acelera la cura, y los bichos
// tardan lo suyo en volver. Todo lo que evita el paseo de vuelta al campamento.

import { describe, expect, it } from 'vitest';
import { BESTIARY } from '../src/sim/bestiary';
import { Sim } from '../src/sim/sim';
import {
  IDLE_INPUT,
  MOB_RESPAWN_TIME,
  OUT_OF_COMBAT_TIME,
  REGEN_PER_SEC,
  SIT_REGEN_MULT,
  TICK_RATE,
  type MoveInput,
} from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

// aparta al jugador de todo bicho: los tests de descanso quieren paz
function enPaz(s: Sim): void {
  for (const m of s.mobs()) {
    m.x = s.player.x + 300;
    m.z = s.player.z + 300;
    m.homeX = m.x;
    m.homeZ = m.z;
  }
}

function segundos(s: Sim, t: number, inp: Partial<MoveInput> = {}): void {
  for (let i = 0; i < Math.round(t * TICK_RATE); i++) s.tick(move(inp));
}

describe('descanso y regeneración', () => {
  it('en combate no se regenera nada', () => {
    const s = new Sim(5, { setA: 'medula' });
    enPaz(s);
    s.player.hp = 50;
    s.player.combatTimer = OUT_OF_COMBAT_TIME;
    segundos(s, OUT_OF_COMBAT_TIME - 1);
    expect(s.player.hp).toBe(50);
  });

  it('pasados unos segundos sin pelear, la vida vuelve sola', () => {
    const s = new Sim(5, { setA: 'medula' });
    enPaz(s);
    s.player.hp = 40;
    segundos(s, 6); // el reloj de combate arranca a 0: cura desde ya
    const esperado = 40 + Math.floor(s.player.maxHp * REGEN_PER_SEC) * 5;
    expect(s.player.hp).toBeGreaterThan(40);
    expect(s.player.hp).toBeGreaterThanOrEqual(esperado - 6);
    expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
  });

  it('sentado se cura mucho más rápido', () => {
    const cura = (sentado: boolean): number => {
      const s = new Sim(5, { setA: 'medula' });
      enPaz(s);
      s.player.hp = 20;
      if (sentado) {
        s.tick(move({ sit: true }));
        expect(s.player.sitting).toBe(true);
      }
      segundos(s, 6);
      return s.player.hp - 20;
    };
    const dePie = cura(false);
    const sentado = cura(true);
    expect(sentado).toBeGreaterThan(dePie * (SIT_REGEN_MULT - 0.8));
  });

  it('cualquier cosa te levanta: moverte, atacar o que te peguen', () => {
    const s = new Sim(5, { setA: 'medula' });
    enPaz(s);
    s.tick(move({ sit: true }));
    expect(s.player.sitting).toBe(true);
    s.tick(move({ moveZ: 1 }));
    expect(s.player.sitting).toBe(false);

    s.tick(move({ sit: true }));
    expect(s.player.sitting).toBe(true);
    s.player.combatTimer = OUT_OF_COMBAT_TIME; // te han encontrado
    const evs = s.tick(move());
    expect(s.player.sitting).toBe(false);
    expect(evs.some((e) => e.type === 'sat' && !e.sitting)).toBe(true);
  });

  it('no te sientas en mitad de una pelea', () => {
    const s = new Sim(5, { setA: 'medula' });
    enPaz(s);
    s.player.combatTimer = OUT_OF_COMBAT_TIME;
    s.tick(move({ sit: true }));
    expect(s.player.sitting).toBe(false);
  });

  it('el reloj de combate se reinicia al recibir un golpe', () => {
    const s = new Sim(5, { setA: 'medula' });
    const mob = s.mobs()[0];
    let golpeado = false;
    for (let t = 0; t < 400 && !golpeado; t++) {
      s.player.x = mob.x;
      s.player.z = mob.z;
      s.player.y = mob.y;
      for (const e of s.tick(move())) {
        if (e.type === 'hitLanded' && e.targetId === s.player.id) golpeado = true;
      }
    }
    expect(golpeado).toBe(true);
    expect(s.player.combatTimer).toBeGreaterThan(0);
  });

  it('los bichos tardan de verdad en volver, y el jefe más', () => {
    expect(MOB_RESPAWN_TIME).toBeGreaterThanOrEqual(30);
    const jefe = BESTIARY.gigante;
    expect(jefe.respawn).toBeGreaterThan(MOB_RESPAWN_TIME * 3);
    const s = new Sim(5, { setA: 'medula' });
    const mob = s.mobs()[0];
    mob.hp = 0;
    mob.alive = false;
    s.tick(move());
    expect(mob.respawnTimer).toBeCloseTo(MOB_RESPAWN_TIME, 0);
    // a mitad de cuenta atrás sigue muerto
    segundos(s, MOB_RESPAWN_TIME / 2);
    expect(mob.alive).toBe(false);
  });
});
