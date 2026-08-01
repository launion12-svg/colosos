// Catálogo de clases: los modelos referenciados existen de verdad y el
// bloqueo solo pertenece a quien lleva escudo.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLASSES, classById, weaponName } from '../src/game/classes';
import { CLASS_ABILITY, WEAPON_SET_INFO } from '../src/sim/abilities';
import { Sim } from '../src/sim/sim';
import { IDLE_INPUT, type MoveInput, type SimEvent } from '../src/sim/types';

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');
const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

describe('catálogo de clases', () => {
  const files = new Set(readdirSync(MODELS_DIR));

  it('hay 6 clases con ids únicos', () => {
    expect(CLASSES.length).toBe(6);
    expect(new Set(CLASSES.map((c) => c.id)).size).toBe(6);
  });

  it('cada clase tiene su habilidad y su ficha de arma', () => {
    for (const c of CLASSES) {
      expect(CLASS_ABILITY[c.id], `falta la habilidad de ${c.id}`).toBeDefined();
      expect(WEAPON_SET_INFO[c.id], `falta la ficha de arma de ${c.id}`).toBeDefined();
      expect(WEAPON_SET_INFO[c.id].hasShield).toBe(c.hasShield);
    }
  });

  for (const c of CLASSES) {
    it(`${c.nombre}: sus modelos existen en public/models`, () => {
      expect(files.has(c.model.replace('models/', ''))).toBe(true);
      for (const w of c.weapons) {
        expect(files.has(w.model.replace('models/', ''))).toBe(true);
      }
      expect(c.gesture.length).toBeGreaterThan(0);
      expect(c.attackAnim.length).toBeGreaterThan(0);
    });
  }

  it('cada arma tiene un nombre por calidad, y son distintos entre sí', () => {
    for (const c of CLASSES) {
      expect(c.armaNombres.length).toBe(3);
      expect(new Set(c.armaNombres).size).toBe(3);
      for (const n of c.armaNombres) expect(n.length).toBeGreaterThan(3);
    }
    // el ejemplo del diseño: la espada común es de madera
    expect(weaponName('medula', 0)).toBe('Espada de madera');
    expect(weaponName('medula', 2)).not.toBe(weaponName('medula', 0));
  });

  it('solo Médula lleva escudo', () => {
    expect(classById('medula')?.hasShield).toBe(true);
    expect(CLASSES.filter((c) => c.hasShield).length).toBe(1);
  });

  it('sin escudo no hay bloqueo: el input se ignora y el mordisco entra entero', () => {
    const s = new Sim(99, { setA: 'fumarel' }); // set activo sin escudo
    const wolf = s.mobs()[0];
    const events: SimEvent[] = [];
    for (let t = 0; t < 300; t++) {
      s.player.x = wolf.x;
      s.player.z = wolf.z;
      s.player.y = wolf.y;
      s.player.hp = s.player.maxHp;
      events.push(...s.tick(move({ block: true })));
      if (events.some((e) => e.type === 'hitLanded' && e.targetId === s.player.id)) break;
    }
    expect(s.player.blocking).toBe(false);
    expect(events.some((e) => e.type === 'blockedHit')).toBe(false);
    expect(events.some((e) => e.type === 'hitLanded' && e.targetId === s.player.id)).toBe(true);
  });
});
