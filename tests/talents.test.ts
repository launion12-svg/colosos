// Árboles de talentos: puntos por nivel, tiers que se abren, y que cada
// efecto (crítico, estado, armadura, vida, segunda habilidad) se note de
// verdad en el sim y no solo en la ficha.

import { describe, expect, it } from 'vitest';
import { CLASS_ABILITY2 } from '../src/sim/abilities';
import { Sim } from '../src/sim/sim';
import { TALENT_TREES, TIER_REQ } from '../src/sim/talents';
import { IDLE_INPUT, playerMaxHp, type Entity, type MoveInput, type SimEvent } from '../src/sim/types';

const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

function lonelyTarget(s: Sim): Entity {
  return s.mobs().find((m) => m.templateId === 'gigante')!;
}

function placeAt(s: Sim, target: Entity, dz = 1.6): void {
  s.player.x = target.x;
  s.player.z = target.z - dz;
  s.player.y = target.y;
  s.player.yaw = 0;
}

// mete puntos a saco en un nodo (los tests no farmean 20 niveles)
function invertir(s: Sim, setId: string, nodeId: string, veces: number): void {
  s.player.talentPoints += veces;
  for (let i = 0; i < veces; i++) expect(s.spendTalent(setId, nodeId)).toBe(true);
}

describe('árboles de talentos', () => {
  it('cada arma tiene su árbol, con tiers 1-2-3 y un nodo final que abre la segunda habilidad', () => {
    for (const setId of Object.keys(TALENT_TREES)) {
      const nodes = TALENT_TREES[setId];
      expect(nodes.length).toBeGreaterThanOrEqual(5);
      expect(new Set(nodes.map((n) => n.tier))).toEqual(new Set([1, 2, 3]));
      const final = nodes.filter((n) => n.per.unlockAbility2);
      expect(final.length, `${setId} necesita un nodo que abra la tecla 2`).toBe(1);
      expect(CLASS_ABILITY2[setId], `${setId} necesita su segunda habilidad`).toBeDefined();
    }
  });

  it('cada nivel da un punto de talento', () => {
    const s = new Sim(7, { setA: 'medula' });
    expect(s.player.talentPoints).toBe(0);
    const antes = s.player.level;
    while (s.player.level < antes + 3) s.grantXpForTests(500);
    expect(s.player.talentPoints).toBe(s.player.level - antes);
  });

  it('el tier 2 está cerrado hasta invertir en el árbol, y solo en ESE árbol', () => {
    const s = new Sim(7, { setA: 'medula', setB: 'fumarel' });
    s.player.talentPoints = 10;
    expect(s.spendTalent('medula', 'muro_vivo')).toBe(false); // tier 2 aún cerrado
    invertir(s, 'medula', 'hueso_duro', TIER_REQ[1]); // los puntos que pide
    expect(s.spendTalent('medula', 'muro_vivo')).toBe(true);
    // lo invertido en la espada no abre nada del bastón
    expect(s.spendTalent('fumarel', 'escarcha')).toBe(false);
  });

  it('no se gasta más de lo que hay ni por encima del rango máximo', () => {
    const s = new Sim(7, { setA: 'medula' });
    s.player.talentPoints = 1;
    expect(s.spendTalent('medula', 'hueso_duro')).toBe(true);
    expect(s.spendTalent('medula', 'hueso_duro')).toBe(false); // sin puntos
    s.player.talentPoints = 10;
    invertir(s, 'medula', 'hueso_duro', 2); // hasta 3/3
    expect(s.spendTalent('medula', 'hueso_duro')).toBe(false); // al máximo
    expect(s.spendTalent('medula', 'nodo_inventado')).toBe(false);
  });

  it('devolver los puntos los recupera todos y borra los efectos', () => {
    const s = new Sim(7, { setA: 'medula' });
    invertir(s, 'medula', 'hueso_duro', 3);
    const conTalento = s.player.maxHp;
    expect(conTalento).toBeGreaterThan(playerMaxHp(s.player.level));
    const devueltos = s.resetTalents();
    expect(devueltos).toBe(3);
    expect(s.player.talentPoints).toBe(3);
    expect(s.player.maxHp).toBe(playerMaxHp(s.player.level));
  });

  it('la vida del árbol es la del arma EN MANO: cambiar de arma cambia el build', () => {
    const s = new Sim(7, { setA: 'medula', setB: 'hachero' });
    invertir(s, 'hachero', 'cuero_curtido', 3); // +36 de vida, pero en el hacha
    const conEspada = s.player.maxHp;
    expect(conEspada).toBe(playerMaxHp(s.player.level)); // la espada no sabe nada
    s.tick(move({ swap: true }));
    expect(s.activeSetId).toBe('hachero');
    expect(s.player.maxHp).toBe(playerMaxHp(s.player.level) + 36);
  });

  it('el crítico existe y pega más: con 100% de crítico el daño sube', () => {
    const golpes = (crit: boolean): number[] => {
      const s = new Sim(23, { setA: 'vigia' });
      if (crit) invertir(s, 'vigia', 'ojo_halcon', 3);
      // 15% no basta para un test estable: se fuerza la tirada al máximo
      if (crit) s.player.talents.vigia.ojo_halcon = 100;
      const mob = lonelyTarget(s);
      const out: number[] = [];
      for (let t = 0; t < 120; t++) {
        placeAt(s, mob, 5);
        mob.hp = mob.maxHp;
        for (const e of s.tick(move({ attack: t % 3 === 0 }))) {
          if (e.type === 'hitLanded' && !e.killed) out.push(e.amount);
        }
      }
      return out;
    };
    const normales = golpes(false);
    const criticos = golpes(true);
    expect(normales.length).toBeGreaterThan(0);
    expect(criticos.length).toBeGreaterThan(0);
    const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(media(criticos)).toBeGreaterThan(media(normales));
  });

  it('el estado sigue haciendo daño después del golpe, y puede rematar', () => {
    const s = new Sim(29, { setA: 'hachero' });
    invertir(s, 'hachero', 'furia', 3); // abre el tier 2
    invertir(s, 'hachero', 'hendidura', 2); // 14 de daño por segundo
    const mob = lonelyTarget(s);
    placeAt(s, mob, 1.5);
    const events: SimEvent[] = [];
    for (let t = 0; t < 8; t++) events.push(...s.tick(move({ attack: t === 0 })));
    expect(mob.dotDps).toBeGreaterThan(0);
    const hpTrasGolpe = mob.hp;
    // sin volver a atacar, el sangrado sigue restando
    for (let t = 0; t < 20; t++) events.push(...s.tick(move()));
    expect(mob.hp).toBeLessThan(hpTrasGolpe);
    expect(events.some((e) => e.type === 'dotDamage')).toBe(true);
    // y se agota solo: no es un veneno eterno
    for (let t = 0; t < 80; t++) s.tick(move());
    expect(mob.dotDps).toBe(0);
  });

  it('la armadura recorta el daño que te entra', () => {
    const daño = (conArmadura: boolean): number => {
      const s = new Sim(31, { setA: 'medula' });
      if (conArmadura) {
        invertir(s, 'medula', 'hueso_duro', 3);
        invertir(s, 'medula', 'muro_vivo', 2); // -14%
      }
      const mob = s.mobs()[0];
      let total = 0;
      for (let t = 0; t < 400; t++) {
        s.player.x = mob.x;
        s.player.z = mob.z;
        s.player.y = mob.y;
        s.player.hp = s.player.maxHp;
        for (const e of s.tick(move())) {
          if (e.type === 'hitLanded' && e.targetId === s.player.id) total += e.amount;
        }
      }
      return total;
    };
    expect(daño(true)).toBeLessThan(daño(false));
  });

  it('la segunda habilidad no existe hasta el nodo final, y entonces sí dispara', () => {
    const s = new Sim(37, { setA: 'fumarel' });
    expect(s.ability2).toBeNull();
    const sinAbrir = s.tick(move({ ability2: true }));
    expect(sinAbrir.some((e) => e.type === 'abilityUsed')).toBe(false);

    invertir(s, 'fumarel', 'niebla_ardiente', 3);
    invertir(s, 'fumarel', 'escarcha', 2);
    invertir(s, 'fumarel', 'conducto', 2); // 7 puntos: se abre el tier 3
    invertir(s, 'fumarel', 'aliento', 1);
    expect(s.ability2?.id).toBe('aliento_toxico');
    const evs = s.tick(move({ ability2: true }));
    const usada = evs.find((e) => e.type === 'abilityUsed');
    expect(usada).toBeDefined();
    if (usada?.type === 'abilityUsed') {
      expect(usada.ability).toBe('aliento_toxico');
      expect(usada.slot).toBe(2);
    }
    expect(s.player.ability2Cooldown).toBeGreaterThan(0);
    expect(s.player.abilityCooldown).toBe(0); // la 1 sigue lista: son independientes
  });

  it('los talentos no rompen la paridad determinista', () => {
    const build = (seed: number): Sim => {
      const s = new Sim(seed, { setA: 'cordelero', setB: 'hachero' });
      s.player.talentPoints = 12;
      s.spendTalent('cordelero', 'reflejos');
      s.spendTalent('cordelero', 'filos_venenosos');
      s.spendTalent('cordelero', 'filos_venenosos');
      s.spendTalent('cordelero', 'sanguijuela');
      return s;
    };
    const a = build(51);
    const b = build(51);
    for (let t = 0; t < 400; t++) {
      const inp = move({
        moveZ: t % 3 === 0 ? 1 : 0,
        attack: t % 7 === 0,
        ability: t % 41 === 0,
        swap: t % 89 === 0,
      });
      a.tick(inp);
      b.tick({ ...inp });
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
