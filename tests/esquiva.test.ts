// La esquiva: Espacio en movimiento aparta, gasta energía, te hace intocable
// medio segundo y no se puede encadenar. Parado, Espacio sigue saltando.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import {
  DODGE_COOLDOWN,
  DODGE_IFRAMES,
  DODGE_STAMINA_COST,
  IDLE_INPUT,
  TICK_RATE,
  type MoveInput,
} from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

function lejosDeTodo(s: Sim): void {
  for (const m of s.mobs()) {
    m.x = s.player.x + 300;
    m.z = s.player.z + 300;
    m.homeX = m.x;
    m.homeZ = m.z;
  }
}

describe('esquiva', () => {
  it('en movimiento, Espacio aparta de verdad en la dirección pulsada', () => {
    const s = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s);
    const x0 = s.player.x;
    const z0 = s.player.z;
    const evs = s.tick(move({ jump: true, moveX: 1 }));
    expect(evs.some((e) => e.type === 'dodged')).toBe(true);
    for (let t = 0; t < 8; t++) s.tick(move({ moveX: 1 }));
    expect(s.player.x - x0).toBeGreaterThan(2.5); // se ha movido de lado
    expect(Math.abs(s.player.z - z0)).toBeLessThan(2);
    // y NO ha saltado: la esquiva se come el Espacio
    expect(s.player.vy).toBeLessThanOrEqual(0.01);
  });

  it('parado, Espacio sigue saltando como siempre', () => {
    const s = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s);
    const evs = s.tick(move({ jump: true }));
    expect(evs.some((e) => e.type === 'dodged')).toBe(false);
    expect(evs.some((e) => e.type === 'jumped')).toBe(true);
  });

  it('gasta energía, y sin energía no sale', () => {
    const s = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s);
    const antes = s.player.stamina;
    s.tick(move({ jump: true, moveZ: 1 }));
    expect(s.player.stamina).toBe(antes - DODGE_STAMINA_COST);

    const s2 = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s2);
    s2.player.stamina = DODGE_STAMINA_COST - 1;
    const evs = s2.tick(move({ jump: true, moveZ: 1 }));
    expect(evs.some((e) => e.type === 'dodged')).toBe(false);
  });

  it('no se encadena: el enfriamiento es largo a propósito', () => {
    const s = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s);
    s.tick(move({ jump: true, moveZ: 1 }));
    expect(s.player.dodgeCooldown).toBeCloseTo(DODGE_COOLDOWN, 1);
    for (let t = 0; t < 20; t++) s.tick(move({ moveZ: 1 }));
    const evs = s.tick(move({ jump: true, moveZ: 1 }));
    expect(evs.some((e) => e.type === 'dodged')).toBe(false); // sigue enfriando
    expect(DODGE_COOLDOWN).toBeGreaterThanOrEqual(5);
  });

  it('durante la esquiva los golpes te atraviesan', () => {
    const s = new Sim(17, { setA: 'medula' });
    const mob = s.mobs()[0];
    s.player.x = mob.x;
    s.player.z = mob.z;
    s.player.y = mob.y;
    s.player.invuln = DODGE_IFRAMES;
    const hpAntes = s.player.hp;
    const eventos = [];
    for (let t = 0; t < Math.round(DODGE_IFRAMES * TICK_RATE) - 1; t++) {
      s.player.invuln = DODGE_IFRAMES; // sostiene la ventana durante la prueba
      s.player.x = mob.x;
      s.player.z = mob.z;
      eventos.push(...s.tick(move()));
    }
    expect(s.player.hp).toBe(hpAntes); // ni un rasguño
    expect(eventos.some((e) => e.type === 'hitLanded' && e.targetId === s.player.id)).toBe(false);
  });

  it('pasada la ventana vuelves a ser de carne', () => {
    const s = new Sim(17, { setA: 'medula' });
    const mob = s.mobs()[0];
    s.player.invuln = DODGE_IFRAMES;
    let golpeado = false;
    for (let t = 0; t < 600 && !golpeado; t++) {
      s.player.x = mob.x;
      s.player.z = mob.z;
      s.player.y = mob.y;
      for (const e of s.tick(move())) {
        if (e.type === 'hitLanded' && e.targetId === s.player.id) golpeado = true;
      }
    }
    expect(golpeado).toBe(true);
    expect(s.player.invuln).toBe(0);
  });

  it('marcha lateral: te mueves de lado sin dejar de mirar al frente', () => {
    const s = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s);
    s.player.yaw = 0; // mirando a +Z
    const x0 = s.player.x;
    // moverse hacia +X encarando +Z, que es lo que manda Q/E
    for (let t = 0; t < 10; t++) s.tick(move({ moveX: 1, faceYaw: 0 }));
    expect(s.player.x - x0).toBeGreaterThan(1.5); // se ha desplazado de lado
    expect(s.player.yaw).toBe(0); // y sigue mirando al frente
  });

  it('sin encaramiento forzado, el personaje sí se gira hacia donde anda', () => {
    const s = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s);
    s.player.yaw = 0;
    for (let t = 0; t < 10; t++) s.tick(move({ moveX: 1 }));
    expect(Math.abs(s.player.yaw)).toBeCloseTo(Math.PI / 2, 1); // mira a +X
  });

  it('esquivar de lado con la marcha lateral mantiene la cara al enemigo', () => {
    const s = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s);
    s.player.yaw = 0;
    const evs = s.tick(move({ jump: true, moveX: 1, faceYaw: 0 }));
    expect(evs.some((e) => e.type === 'dodged')).toBe(true);
    for (let t = 0; t < 6; t++) s.tick(move({ moveX: 1, faceYaw: 0 }));
    expect(s.player.yaw).toBe(0);
  });

  it('no se esquiva a media estocada ni en el aire', () => {
    const s = new Sim(17, { setA: 'medula' });
    lejosDeTodo(s);
    s.player.attackWindup = 0.15;
    expect(s.tick(move({ jump: true, moveZ: 1 })).some((e) => e.type === 'dodged')).toBe(false);
    s.player.attackWindup = 0;
    s.player.grounded = false;
    expect(s.tick(move({ jump: true, moveZ: 1 })).some((e) => e.type === 'dodged')).toBe(false);
  });
});
