// El casco: cae de los bichos, solo se queda si mejora, da vida y armadura, y
// se puede llevar guardado para ir a cara descubierta (que es medio chiste
// pero también medio decisión: quitártelo cuesta estadísticas).

import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/game/classes';
import { Sim } from '../src/sim/sim';
import { HELMET_ARMOR, HELMET_HP, IDLE_INPUT, playerMaxHp, type MoveInput } from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

function soltarCasco(s: Sim, rarity: number): void {
  const p = s.player;
  s.helmetDrops.push({ id: 700 + rarity, x: p.x, y: p.y, z: p.z, rarity });
}

describe('casco', () => {
  it('se recoge pisándolo y da vida y armadura según su calidad', () => {
    const s = new Sim(21, { setA: 'medula' });
    expect(s.player.helmet).toBe(-1);
    const vidaBase = s.player.maxHp;
    soltarCasco(s, 1);
    const evs = s.tick(move());
    expect(evs.some((e) => e.type === 'helmetPickedUp')).toBe(true);
    expect(s.player.helmet).toBe(1);
    expect(s.player.maxHp).toBe(vidaBase + HELMET_HP[1]);
    expect(s.player.damageTakenMult).toBeCloseTo(1 - HELMET_ARMOR[1], 5);
  });

  it('uno peor se queda en el suelo; uno mejor lo sustituye', () => {
    const s = new Sim(21, { setA: 'medula' });
    soltarCasco(s, 2);
    s.tick(move());
    expect(s.player.helmet).toBe(2);
    soltarCasco(s, 0); // chatarra: ni tocarla
    s.tick(move());
    expect(s.player.helmet).toBe(2);
    expect(s.helmetDrops.length).toBe(1); // sigue esperando en el suelo
  });

  it('quitárselo devuelve la vida y la armadura a su sitio', () => {
    const s = new Sim(21, { setA: 'medula' });
    soltarCasco(s, 2);
    s.tick(move());
    const conCasco = s.player.maxHp;
    expect(s.toggleHelmet()).toBe(true);
    expect(s.player.helmetOn).toBe(false);
    expect(s.player.maxHp).toBe(playerMaxHp(s.player.level));
    expect(s.player.damageTakenMult).toBe(1);
    s.toggleHelmet();
    expect(s.player.maxHp).toBe(conCasco);
  });

  it('sin casco no hay nada que quitarse', () => {
    const s = new Sim(21, { setA: 'medula' });
    expect(s.toggleHelmet()).toBe(false);
  });

  // OJO: con 8 bichos y un 18% de caída, sacar cero pasa una de cada cinco
  // veces. Este test se cayó solo el día que un cambio de terreno movió el
  // flujo del RNG, sin que el casco tuviera nada roto. Se vacía el bestiario
  // entero: con ~40 bajas, sacar cero es una entre cinco mil.
  it('las criaturas lo sueltan de verdad', () => {
    const s = new Sim(33, { setA: 'hachero' });
    let caidos = 0;
    for (const mob of s.mobs()) {
      for (let t = 0; t < 600 && mob.alive; t++) {
        s.player.x = mob.x;
        s.player.z = mob.z;
        s.player.y = mob.y;
        s.player.yaw = 0;
        s.player.hp = s.player.maxHp;
        s.player.helmet = -1; // vaciamos para contar caídas, no recogidas
        for (const e of s.tick(move({ attack: t % 2 === 0 }))) {
          if (e.type === 'helmetDropped') caidos++;
        }
      }
    }
    expect(caidos).toBeGreaterThan(0);
  });

  it('cada clase declara qué piezas de la cabeza tapa su casco', () => {
    for (const c of CLASSES) {
      expect(Array.isArray(c.headMeshes), `${c.id} necesita headMeshes`).toBe(true);
    }
    // el Caballero es el caso claro: yelmo y visera
    expect(CLASSES.find((c) => c.id === 'medula')?.headMeshes).toEqual(['Helmet', 'HelmetVisor']);
  });
});
