// El bestiario: plantillas sanas, campamentos poblados, XP por criatura y
// el aggro social del pack.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BESTIARY, CAMPS } from '../src/sim/bestiary';
import { Sim } from '../src/sim/sim';
import { IDLE_INPUT, type MoveInput, type SimEvent } from '../src/sim/types';

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');
const move = (over: Partial<MoveInput> = {}): MoveInput => ({ ...IDLE_INPUT, ...over });

describe('bestiario', () => {
  const files = new Set(readdirSync(MODELS_DIR));

  for (const t of Object.values(BESTIARY)) {
    it(`${t.nombre}: modelo presente y stats sanas`, () => {
      expect(files.has(t.model.replace('models/', ''))).toBe(true);
      expect(t.hp).toBeGreaterThan(0);
      expect(t.dmgMax).toBeGreaterThanOrEqual(t.dmgMin);
      expect(t.xp).toBeGreaterThan(0);
      expect(t.anims.idle.length).toBeGreaterThan(0);
      expect(t.anims.attack.length).toBeGreaterThan(0);
      expect(t.anims.death.length).toBeGreaterThan(0);
    });
  }

  it('los campamentos referencian plantillas existentes y pueblan el mundo', () => {
    for (const c of CAMPS) expect(BESTIARY[c.template]).toBeDefined();
    const s = new Sim(7);
    const total = CAMPS.reduce((acc, c) => acc + c.count, 0);
    expect(s.mobs().length).toBe(total);
    // hay variedad de verdad
    const kinds = new Set(s.mobs().map((m) => m.templateId));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('el gigante es un jefe: mucha más vida y recompensa que una araña', () => {
    expect(BESTIARY.gigante.hp).toBeGreaterThan(BESTIARY.arana.hp * 5);
    expect(BESTIARY.gigante.xp).toBeGreaterThan(BESTIARY.arana.xp * 5);
    expect(BESTIARY.gigante.boss).toBe(true);
  });

  it('matar una araña concede la XP de araña, no la genérica', () => {
    const s = new Sim(7);
    const spider = s.mobs().find((m) => m.templateId === 'arana')!;
    let xpEvent: SimEvent | undefined;
    for (let t = 0; t < 300 && !xpEvent; t++) {
      s.player.x = spider.x;
      s.player.z = spider.z;
      s.player.y = spider.y;
      s.player.yaw = Math.atan2(spider.x - s.player.x, spider.z - s.player.z);
      s.player.hp = s.player.maxHp;
      const evs = s.tick(move({ attack: t % 2 === 0 }));
      xpEvent = evs.find((e) => e.type === 'xpGained');
    }
    expect(xpEvent).toBeDefined();
    if (xpEvent?.type === 'xpGained') expect(xpEvent.amount).toBe(BESTIARY.arana.xp);
  });

  it('aggro social: molestar a una araña despierta a su pack', () => {
    const s = new Sim(7);
    const pack = s.mobs().filter((m) => m.templateId === 'arana');
    expect(pack.length).toBe(3);
    // plántate en el centro del campamento
    s.player.x = pack[0].homeX;
    s.player.z = pack[0].homeZ;
    s.player.y = pack[0].y;
    let anyAggro = false;
    for (let t = 0; t < 60 && !anyAggro; t++) {
      const evs = s.tick(move());
      anyAggro = evs.some((e) => e.type === 'aggroed');
      s.player.hp = s.player.maxHp;
    }
    expect(anyAggro).toBe(true);
    // en el tick siguiente, TODO el pack viene a por ti
    s.tick(move());
    const hunting = pack.filter((m) => m.aiState === 'chase' || m.aiState === 'attack');
    expect(hunting.length).toBe(3);
  });
});
