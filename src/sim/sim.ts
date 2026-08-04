// El coordinador del sim: reloj del mundo, tick a 20 Hz, entidades y eventos.
// Determinista: misma semilla + misma secuencia de inputs = mismo mundo, bit a bit.
// Sin una sola dependencia del navegador (guardado por tests/architecture.test.ts).

import {
  BAG_SLOTS,
  CLASS_ABILITY,
  CLASS_ABILITY2,
  LOOT_PICKUP_RADIUS,
  RARITY_MULT,
  rarityWeightsForLevel,
  SWAP_COOLDOWN,
  WEAPON_DROP_CHANCE,
  WEAPON_SET_INFO,
  abilityYaw,
  dashDamage,
  resolveAbility,
  stepProjectiles,
  type AbilityDef,
  type Projectile,
  type WeaponDrop,
} from './abilities';
import { updateMob, isEvading } from './ai';
import { BESTIARY, CAMPS, SOCIAL_AGGRO_RADIUS } from './bestiary';
import { resolveSwing, type HitMods } from './combat';
import {
  CRIT_MULT_BASE,
  DOT_KIND,
  DOT_TIME,
  SLOW_TIME,
  TALENT_POINTS_PER_WEAPON_LEVEL,
  canSpend,
  resolveTalents,
  type TalentSpent,
} from './talents';
import { stepPlayerMotion } from './motion';
import { Rng } from './rng';
import { SPAWN_X, SPAWN_Z, MIST_LEVEL, terrainHeight } from './terrain';
import {
  ATTACK_COOLDOWN,
  ATTACK_WINDUP,
  BAG_FULL_NOTICE_COOLDOWN,
  BLOCK_FACE_RADIUS,
  DAY_LENGTH_SECONDS,
  DT,
  dist2d,
  IDLE_INPUT,
  MAX_LEVEL,
  WEAPON_MAX_LEVEL,
  MIST_DEATH_MARGIN,
  MOB_RESPAWN_TIME,
  MOB_XP_REWARD,
  OUT_OF_COMBAT_TIME,
  REGEN_PER_SEC,
  SIT_REGEN_MULT,
  SIT_STAMINA_MULT,
  PLAYER_MAX_HP,
  DODGE_COOLDOWN,
  DODGE_IFRAMES,
  DODGE_SPEED,
  DODGE_STAMINA_COST,
  DODGE_TIME,
  PLAYER_RESPAWN_TIME,
  HELMET_ARMOR,
  HELMET_DROP_CHANCE,
  HELMET_HP,
  POTION_COOLDOWN,
  POTION_DROP_CHANCE,
  POTION_HEAL_PCT,
  POTION_MAX,
  STAMINA_MAX,
  STAMINA_REGEN_DELAY,
  START_TIME_OF_DAY,
  playerDamageMax,
  playerDamageMin,
  playerMaxHp,
  weaponXpToNext,
  xpToNext,
  type Entity,
  type EntityKind,
  type MoveInput,
  type SimEvent,
} from './types';

function baseEntity(id: number, kind: EntityKind, name: string): Entity {
  return {
    id,
    kind,
    name,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    px: 0,
    py: 0,
    pz: 0,
    pyaw: 0,
    hp: 1,
    maxHp: 1,
    alive: true,
    grounded: true,
    coyote: 0,
    jumpBuffer: 0,
    fallVy: 0,
    attackWindup: 0,
    attackCooldown: 0,
    respawnTimer: 0,
    templateId: '',
    moveSpeed: 5,
    dmgMin: 5,
    dmgMax: 8,
    aggroRadius: 10,
    xpReward: 10,
    aiState: 'patrol',
    homeX: 0,
    homeZ: 0,
    patrolX: 0,
    patrolZ: 0,
    patrolWait: 0,
    camino: null,
    caminoPaso: 0,
    caminoTimer: 0,
    targetId: -1,
    aggroAnnounced: false,
    xp: 0,
    level: 1,
    blocking: false,
    hasShield: false,
    abilityCooldown: 0,
    abilityCooldownOther: 0,
    ability2Cooldown: 0,
    ability2CooldownOther: 0,
    abilityWindup: 0,
    abilitySlot: 1,
    dashTime: 0,
    dotDps: 0,
    dotTime: 0,
    dotKind: 'sangrado',
    dotAccum: 0,
    slowMult: 0,
    slowTime: 0,
    damageTakenMult: 1,
    setA: 'medula',
    setB: 'fumarel',
    activeSetB: false,
    swapCooldown: 0,
    ownedWeapons: [],
    weaponRarity: {},
    talentPoints: {},
    talents: {},
    weaponLevel: {},
    weaponXp: {},
    potions: 0,
    potionCooldown: 0,
    helmet: -1,
    helmetOn: true,
    dodgeTime: 0,
    dodgeCooldown: 0,
    invuln: 0,
    combatTimer: 0,
    regenAccum: 0,
    sitting: false,
    respawnTime: 0,
    stamina: STAMINA_MAX,
    staminaDelay: 0,
    winded: false,
    sprinting: false,
  };
}

export class Sim {
  readonly seed: number;
  readonly rng: Rng;
  time = 0;
  tickCount = 0;
  timeOfDay = START_TIME_OF_DAY;
  // Para capturas/depuración: si está fijado, el reloj del mundo se clava ahí.
  timeOfDayOverride: number | null = null;
  readonly entities: Entity[] = [];
  readonly player: Entity;
  private events: SimEvent[] = [];
  private nextId = 1;

  readonly projectiles: Projectile[] = [];
  readonly drops: WeaponDrop[] = [];
  readonly potionDrops: { id: number; x: number; y: number; z: number }[] = [];
  readonly helmetDrops: { id: number; x: number; y: number; z: number; rarity: number }[] = [];
  private nextProjectileId = 1;
  private nextDropId = 1;
  private dashHitIds = new Set<number>();
  private regenTick = 0; // acumulador del pulso de regeneración (1 s)
  private bagFullNotice = 0; // antirrepetición del aviso mientras pisas el arma

  // La habilidad y el escudo son SIEMPRE los del set activo
  get activeSetId(): string {
    return this.player.activeSetB ? this.player.setB : this.player.setA;
  }
  get ability(): AbilityDef {
    return CLASS_ABILITY[this.activeSetId] ?? CLASS_ABILITY.medula;
  }
  // La segunda solo existe si el árbol del arma la ha abierto
  get ability2(): AbilityDef | null {
    return this.mods.unlockAbility2 ? (CLASS_ABILITY2[this.activeSetId] ?? null) : null;
  }
  // Talentos del arma EN MANO, ya resueltos. Cambiar de arma cambia el build.
  get mods() {
    return resolveTalents(this.player.talents, this.activeSetId);
  }
  // Lo que los talentos añaden a cada golpe (crítico, estados, robo de vida)
  get hitMods(): HitMods {
    const m = this.mods;
    return {
      critChance: m.critChance,
      critMult: CRIT_MULT_BASE + m.critMult,
      dotDps: m.dotDps,
      dotTime: m.dotDps > 0 ? DOT_TIME : 0,
      dotKind: DOT_KIND[this.activeSetId] ?? 'sangrado',
      slowMult: m.slowMult,
      slowTime: m.slowMult > 0 ? SLOW_TIME : 0,
      lifesteal: m.lifesteal,
    };
  }
  // Multiplicador de daño por la calidad del arma en mano
  get activeRarityMult(): number {
    return RARITY_MULT[this.player.weaponRarity[this.activeSetId] ?? 0] ?? 1;
  }

  constructor(
    seed: number,
    opts: { playerName?: string; setA?: string; setB?: string; classId?: string } = {},
  ) {
    this.seed = seed;
    this.rng = new Rng(seed);
    const setA = opts.setA ?? opts.classId ?? 'medula';
    const setB = opts.setB ?? ''; // vacío: la segunda arma hay que ganársela

    this.player = baseEntity(this.nextId++, 'player', opts.playerName ?? 'Errante');
    this.player.setA = setA;
    this.player.setB = setB;
    this.player.ownedWeapons = setB ? [setA, setB] : [setA];
    this.player.weaponRarity = setB ? { [setA]: 0, [setB]: 0 } : { [setA]: 0 };
    for (const id of this.player.ownedWeapons) this.initWeapon(id);
    this.player.hasShield = WEAPON_SET_INFO[setA]?.hasShield ?? false;
    this.player.maxHp = PLAYER_MAX_HP;
    this.player.hp = PLAYER_MAX_HP;
    this.player.x = SPAWN_X;
    this.player.z = SPAWN_Z;
    this.player.y = terrainHeight(SPAWN_X, SPAWN_Z, seed);
    this.snapPrev(this.player);
    this.entities.push(this.player);

    // puebla los campamentos del bestiario: packs con dificultad creciente
    for (const camp of CAMPS) {
      const t = BESTIARY[camp.template];
      for (let i = 0; i < camp.count; i++) {
        const ang = (i / camp.count) * Math.PI * 2;
        const cx = camp.x + (camp.count > 1 ? Math.sin(ang) * 2.4 : 0);
        const cz = camp.z + (camp.count > 1 ? Math.cos(ang) * 2.4 : 0);
        const m = baseEntity(this.nextId++, 'mob', t.nombre);
        m.templateId = t.id;
        m.maxHp = t.hp;
        m.hp = t.hp;
        m.moveSpeed = t.speed;
        m.dmgMin = t.dmgMin;
        m.dmgMax = t.dmgMax;
        m.aggroRadius = t.aggro;
        m.xpReward = t.xp;
        m.respawnTime = t.respawn ?? MOB_RESPAWN_TIME;
        m.level = t.level; // su nivel decide la calidad de lo que suelta
        m.homeX = cx;
        m.homeZ = cz;
        m.x = cx;
        m.z = cz;
        m.y = terrainHeight(cx, cz, seed);
        m.patrolX = cx;
        m.patrolZ = cz;
        m.patrolWait = this.rng.range(0.5, 3);
        this.snapPrev(m);
        this.entities.push(m);
      }
    }
  }

  private snapPrev(e: Entity): void {
    e.px = e.x;
    e.py = e.y;
    e.pz = e.z;
    e.pyaw = e.yaw;
  }

  private emit = (ev: SimEvent): void => {
    this.events.push(ev);
  };

  private spawnProjectile(proj: Omit<Projectile, 'id' | 'px' | 'pz'>): void {
    const pr: Projectile = { ...proj, id: this.nextProjectileId++, px: proj.x, pz: proj.z };
    this.projectiles.push(pr);
    this.emit({
      type: 'projectileSpawned',
      pid: pr.id,
      x: pr.x,
      y: pr.y,
      z: pr.z,
      vx: pr.vx,
      vz: pr.vz,
      kind: pr.kind,
    });
  }

  mobs(): Entity[] {
    return this.entities.filter((e) => e.kind === 'mob');
  }

  // Un tick de simulación. El orden de fases es carga del orden de draws
  // del rng: no reordenar a la ligera (tests/determinism lo pinna).
  tick(input: MoveInput = IDLE_INPUT): SimEvent[] {
    this.time += DT;
    this.tickCount++;
    this.timeOfDay =
      this.timeOfDayOverride ?? (START_TIME_OF_DAY + this.time / DAY_LENGTH_SECONDS) % 1;

    // pose previa para la interpolación del render
    for (const e of this.entities) this.snapPrev(e);

    const p = this.player;

    // --- Jugador: respawn, movimiento, combate ---
    if (!p.alive) {
      p.blocking = false;
      p.respawnTimer -= DT;
      if (p.respawnTimer <= 0) this.respawnPlayer();
    } else {
      p.abilityCooldown = Math.max(0, p.abilityCooldown - DT);
      p.abilityCooldownOther = Math.max(0, p.abilityCooldownOther - DT);
      p.ability2Cooldown = Math.max(0, p.ability2Cooldown - DT);
      p.ability2CooldownOther = Math.max(0, p.ability2CooldownOther - DT);
      p.swapCooldown = Math.max(0, p.swapCooldown - DT);
      this.bagFullNotice = Math.max(0, this.bagFullNotice - DT);

      // cambio de set: tu otra arma, tu otra identidad. Los cooldowns son
      // independientes por set (se permutan): la base de los combos.
      if (
        input.swap &&
        p.setB !== '' && // sin segunda arma no hay swap: gánatela
        p.swapCooldown <= 0 &&
        p.abilityWindup <= 0 &&
        p.attackWindup <= 0 &&
        p.dashTime <= 0
      ) {
        p.activeSetB = !p.activeSetB;
        const cd = p.abilityCooldown;
        p.abilityCooldown = p.abilityCooldownOther;
        p.abilityCooldownOther = cd;
        const cd2 = p.ability2Cooldown;
        p.ability2Cooldown = p.ability2CooldownOther;
        p.ability2CooldownOther = cd2;
        p.hasShield = WEAPON_SET_INFO[this.activeSetId]?.hasShield ?? false;
        this.refreshMaxHp(); // la vida del árbol es la del arma en mano
        p.blocking = false;
        p.swapCooldown = SWAP_COOLDOWN;
        this.emit({ type: 'weaponSwapped', id: p.id, setId: this.activeSetId });
      }

      // bloqueo: mantenido, en el suelo y sin golpe en curso
      p.blocking =
        input.block && p.hasShield && p.grounded && p.attackWindup <= 0 && p.dashTime <= 0;

      // Esquiva: Espacio EN MOVIMIENTO. Parado, Espacio salta como siempre.
      // Cuesta energía (la misma barra del esprint) y no encadena.
      p.dodgeCooldown = Math.max(0, p.dodgeCooldown - DT);
      p.invuln = Math.max(0, p.invuln - DT);
      const quiereMover = input.moveX !== 0 || input.moveZ !== 0;
      let inputEfectivo = input;
      if (
        input.jump &&
        quiereMover &&
        p.grounded &&
        p.dodgeTime <= 0 &&
        p.dashTime <= 0 &&
        p.dodgeCooldown <= 0 &&
        p.stamina >= DODGE_STAMINA_COST &&
        p.attackWindup <= 0 &&
        p.abilityWindup <= 0 &&
        p.alive
      ) {
        const len = Math.hypot(input.moveX, input.moveZ) || 1;
        const dx = input.moveX / len;
        const dz = input.moveZ / len;
        p.dodgeTime = DODGE_TIME;
        p.dodgeCooldown = DODGE_COOLDOWN;
        p.invuln = DODGE_IFRAMES;
        p.stamina = Math.max(0, p.stamina - DODGE_STAMINA_COST);
        p.staminaDelay = STAMINA_REGEN_DELAY;
        p.vx = dx * DODGE_SPEED;
        p.vz = dz * DODGE_SPEED;
        p.blocking = false;
        // el salto se consume aquí: esquivar y saltar a la vez, no
        inputEfectivo = { ...input, jump: false, jumpHeld: false };
        this.emit({ type: 'dodged', id: p.id, dirX: dx, dirZ: dz });
      }

      if (p.dodgeTime > 0) {
        // quiebro: velocidad fijada, sin daño y pegado al suelo
        p.dodgeTime -= DT;
        p.x += p.vx * DT;
        p.z += p.vz * DT;
        p.y = terrainHeight(p.x, p.z, this.seed);
        if (p.dodgeTime <= 0) {
          p.vx *= 0.2;
          p.vz *= 0.2;
        }
      } else if (p.dashTime > 0) {
        // acometida: velocidad fijada, daña a los atravesados una vez
        p.dashTime -= DT;
        p.x += p.vx * DT;
        p.z += p.vz * DT;
        p.y = terrainHeight(p.x, p.z, this.seed);
        dashDamage(
          this.rng,
          (p.abilitySlot === 2 ? this.ability2 : this.ability) ?? this.ability,
          p,
          this.mobs().filter((m) => !isEvading(m)),
          this.dashHitIds,
          this.emit,
          this.activeRarityMult * (1 + this.mods.abilityDmg),
          this.hitMods,
        );
        if (p.dashTime <= 0) {
          this.dashHitIds.clear();
          p.vx *= 0.25;
          p.vz *= 0.25;
        }
      } else {
        stepPlayerMotion(p, inputEfectivo, this.seed, this.emit);
      }

      // cubriéndote, el escudo apunta solo a la amenaza más cercana
      if (p.blocking) {
        let best: Entity | null = null;
        let bestD = BLOCK_FACE_RADIUS;
        for (const m of this.entities) {
          if (m.kind !== 'mob' || !m.alive || isEvading(m)) continue;
          const d = dist2d(p.x, p.z, m.x, m.z);
          if (d < bestD) {
            bestD = d;
            best = m;
          }
        }
        if (best) p.yaw = Math.atan2(best.x - p.x, best.z - p.z);
      }

      // caída al mar de niebla
      if (p.y < MIST_LEVEL - MIST_DEATH_MARGIN) {
        this.emit({ type: 'fellInMist', id: p.id });
        this.killPlayer();
      }

      // Sentarse (C): descansar acelera la recuperación. Se levanta solo en
      // cuanto te mueves, saltas, atacas o te pegan: nunca te deja vendido.
      if (input.sit && p.grounded && p.alive && p.combatTimer <= 0 && !p.sitting) {
        p.sitting = true;
        this.emit({ type: 'sat', id: p.id, sitting: true });
      } else if (
        p.sitting &&
        (input.sit ||
          input.attack ||
          input.jump ||
          input.ability ||
          input.ability2 ||
          input.moveX !== 0 ||
          input.moveZ !== 0 ||
          p.combatTimer > 0 ||
          !p.alive)
      ) {
        p.sitting = false;
        this.emit({ type: 'sat', id: p.id, sitting: false });
      }

      // Regeneración fuera de combate: pasados unos segundos sin dar ni
      // recibir, el lomo te cura. Sentado, más deprisa. Es lo que hace que
      // farmear no sea volver al campamento cada dos peleas.
      p.combatTimer = Math.max(0, p.combatTimer - DT);
      if (p.combatTimer <= 0 && p.hp < p.maxHp && p.alive) {
        const ritmo = REGEN_PER_SEC * (p.sitting ? SIT_REGEN_MULT : 1);
        p.regenAccum += p.maxHp * ritmo * DT;
        this.regenTick += DT;
        // se cura cada segundo de golpe, no veinte veces por segundo: así el
        // número flotante se lee y no ametralla la pantalla
        if (this.regenTick >= 1) {
          this.regenTick = 0;
          const cura = Math.min(Math.floor(p.regenAccum), p.maxHp - p.hp);
          p.regenAccum -= Math.floor(p.regenAccum);
          if (cura > 0) {
            p.hp += cura;
            this.emit({ type: 'regenTick', id: p.id, amount: cura });
          }
        }
      } else {
        p.regenAccum = 0;
        this.regenTick = 0;
      }

      // pociones: se recogen pisándolas y se beben con Q. Curan un pellizco
      // gordo pero con freno largo: sacan de un apuro, no sustituyen a jugar bien.
      p.potionCooldown = Math.max(0, p.potionCooldown - DT);
      for (let i = this.potionDrops.length - 1; i >= 0; i--) {
        const d = this.potionDrops[i];
        if (dist2d(p.x, p.z, d.x, d.z) > LOOT_PICKUP_RADIUS) continue;
        const lleno = p.potions >= POTION_MAX;
        if (!lleno) p.potions++;
        if (lleno) continue; // la dejas en el suelo hasta que te haga falta
        this.potionDrops.splice(i, 1);
        this.emit({ type: 'potionPickedUp', dropId: d.id, total: p.potions, lleno });
      }
      if (
        input.drink &&
        p.potions > 0 &&
        p.potionCooldown <= 0 &&
        p.hp < p.maxHp &&
        p.alive &&
        p.attackWindup <= 0
      ) {
        const cura = Math.max(1, Math.floor(p.maxHp * POTION_HEAL_PCT));
        const antes = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + cura);
        p.potions--;
        p.potionCooldown = POTION_COOLDOWN;
        this.emit({ type: 'potionDrunk', amount: p.hp - antes, quedan: p.potions });
        this.emit({ type: 'healed', id: p.id, amount: p.hp - antes });
      }

      // Casco: se recoge pisándolo y solo se queda si MEJORA lo que llevas.
      // Con casco puesto se te tapa la cabeza; sin él, sales a cara descubierta.
      for (let i = this.helmetDrops.length - 1; i >= 0; i--) {
        const d = this.helmetDrops[i];
        if (dist2d(p.x, p.z, d.x, d.z) > LOOT_PICKUP_RADIUS) continue;
        if (d.rarity <= p.helmet) continue; // peor que el tuyo: se queda en el suelo
        const mejora = p.helmet >= 0;
        p.helmet = d.rarity;
        p.helmetOn = true;
        this.helmetDrops.splice(i, 1);
        this.refreshMaxHp();
        this.emit({ type: 'helmetPickedUp', rarity: d.rarity, mejora });
      }

      // recogida de armas del suelo: siempre al zurrón; si el hueco
      // secundario está vacío, además se equipa sola (el primer gran momento)
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        if (dist2d(p.x, p.z, d.x, d.z) > LOOT_PICKUP_RADIUS) continue;
        const prev = p.weaponRarity[d.setId];
        const isNew = prev === undefined;
        const upgraded = !isNew && d.rarity > prev;
        // zurrón lleno: solo bloquea lo NUEVO (una mejora no ocupa hueco).
        // El arma se queda en el suelo esperándote.
        if (isNew && p.ownedWeapons.length >= BAG_SLOTS) {
          if (this.bagFullNotice <= 0) {
            this.bagFullNotice = BAG_FULL_NOTICE_COOLDOWN;
            this.emit({ type: 'bagFull', setId: d.setId });
          }
          continue;
        }
        if (isNew) {
          p.ownedWeapons.push(d.setId);
          this.initWeapon(d.setId); // el arma nueva empieza su maestría de cero
          p.weaponRarity[d.setId] = d.rarity;
          if (p.setB === '') p.setB = d.setId;
        } else if (upgraded) {
          p.weaponRarity[d.setId] = d.rarity; // mejora en el sitio, incluso equipada
        }
        this.drops.splice(i, 1);
        this.emit({
          type: 'lootPickedUp',
          dropId: d.id,
          setId: d.setId,
          rarity: d.rarity,
          upgraded,
        });
      }

      // habilidades: dos ranuras (1 siempre, 2 si el árbol la ha abierto).
      // Anuncio + resolución con anticipación, como el golpe básico.
      const ab2 = this.ability2;
      if (p.abilityWindup > 0) {
        p.abilityWindup -= DT;
        if (p.abilityWindup <= 0 && p.alive) {
          const def = p.abilitySlot === 2 ? ab2 : this.ability;
          if (def) {
            resolveAbility(
              this.rng,
              def,
              p,
              this.mobs().filter((m) => !isEvading(m)),
              (proj) => this.spawnProjectile(proj),
              this.emit,
              this.activeRarityMult * (1 + this.mods.abilityDmg),
              this.hitMods,
            );
          }
        }
      } else if (
        (input.ability || (input.ability2 && ab2)) &&
        p.attackWindup <= 0 &&
        p.dashTime <= 0 &&
        !p.blocking &&
        p.alive
      ) {
        // la 2 tiene prioridad si se pulsan a la vez: es la cara
        const usar2 = Boolean(input.ability2 && ab2);
        const def = usar2 ? ab2! : this.ability;
        const enfriando = usar2 ? p.ability2Cooldown : p.abilityCooldown;
        if (enfriando <= 0) {
          p.yaw = abilityYaw(p, this.mobs());
          p.abilityWindup = def.windup;
          p.abilitySlot = usar2 ? 2 : 1;
          const cd = def.cooldown * (1 - this.mods.cooldown);
          if (usar2) p.ability2Cooldown = cd;
          else p.abilityCooldown = cd;
          this.emit({ type: 'abilityUsed', id: p.id, ability: def.id, slot: usar2 ? 2 : 1 });
        }
      }

      // ataque: anuncio + resolución con anticipación. Con arco o bastón el
      // básico sale disparado (proyectil); con lo demás, el barrido melee.
      p.attackCooldown = Math.max(0, p.attackCooldown - DT);
      if (p.attackWindup > 0) {
        p.attackWindup -= DT;
        if (p.attackWindup <= 0 && p.alive) {
          const info = WEAPON_SET_INFO[this.activeSetId];
          const ranged = info?.rangedBasic;
          // rareza del arma × peso del arma: un hacha rara pega como un coloso
          const rMult =
            this.activeRarityMult * (info?.basicDmgMult ?? 1) * (1 + this.mods.basicDmg);
          if (ranged) {
            this.spawnProjectile({
              x: p.x,
              y: p.y + 1.3,
              z: p.z,
              vx: Math.sin(p.yaw) * ranged.speed,
              vz: Math.cos(p.yaw) * ranged.speed,
              life: ranged.life,
              radius: ranged.radius,
              damageMin: Math.floor(playerDamageMin(p.level) * rMult),
              damageMax: Math.floor(playerDamageMax(p.level) * rMult),
              kind: ranged.kind,
              mods: this.hitMods,
            });
          } else {
            resolveSwing(
              this.rng,
              p,
              this.mobs().filter((m) => !isEvading(m)),
              Math.floor(playerDamageMin(p.level) * rMult),
              Math.floor(playerDamageMax(p.level) * rMult),
              this.emit,
              this.hitMods,
            );
          }
        }
      } else if (
        input.attack &&
        p.attackCooldown <= 0 &&
        p.alive &&
        !p.blocking &&
        p.abilityWindup <= 0 &&
        p.dashTime <= 0
      ) {
        if (WEAPON_SET_INFO[this.activeSetId]?.rangedBasic) {
          p.yaw = abilityYaw(p, this.mobs()); // el disparo sale hacia el objetivo
        }
        p.attackWindup = ATTACK_WINDUP;
        p.attackCooldown =
          ATTACK_COOLDOWN * (WEAPON_SET_INFO[this.activeSetId]?.basicCooldownMult ?? 1);
        this.emit({ type: 'swung', id: p.id });
      }
    }

    // proyectiles en vuelo (fase fija: tras el jugador, antes de los mobs)
    stepProjectiles(
      this.rng,
      this.projectiles,
      this.mobs().filter((m) => !isEvading(m)),
      this.emit,
    );

    // --- Mobs (orden fijo por el array: determinista) ---
    for (const e of this.entities) {
      if (e.kind !== 'mob') continue;
      this.stepStatus(e); // sangrado/veneno/quemadura y freno, antes de decidir
      updateMob(this.rng, e, p, this.seed, this.emit);
    }

    // ¿Sigues en combate? Un único sitio que lo decide: cualquier golpe que
    // te toque o que repartas reinicia el reloj. El bloqueo también cuenta.
    for (const ev of this.events) {
      const enCombate =
        (ev.type === 'hitLanded' && (ev.targetId === p.id || ev.attackerId === p.id)) ||
        (ev.type === 'blockedHit' && ev.targetId === p.id) ||
        ev.type === 'dotDamage' ||
        (ev.type === 'aggroed' && p.alive);
      if (enCombate) {
        p.combatTimer = OUT_OF_COMBAT_TIME;
        if (p.sitting) {
          p.sitting = false;
          this.emit({ type: 'sat', id: p.id, sitting: false });
        }
        break;
      }
    }

    // XP: un único punto de concesión — cuenta los mobs muertos este tick
    // vengan de espada, habilidad, dash o proyectil.
    const deadMobs = this.events.filter(
      (e): e is Extract<SimEvent, { type: 'died' }> => e.type === 'died' && e.kind === 'mob',
    );
    if (deadMobs.length > 0 && p.alive) {
      let xpSum = 0;
      for (const ev of deadMobs) {
        const m = this.entities.find((e) => e.id === ev.id);
        xpSum += m?.xpReward ?? MOB_XP_REWARD;
      }
      this.grantXp(xpSum);
    }

    // Aggro social: el pack acude en ayuda del que ha dado la voz de alarma
    for (const ev of this.events) {
      if (ev.type !== 'aggroed') continue;
      const alerter = this.entities.find((e) => e.id === ev.id);
      if (!alerter) continue;
      for (const m of this.entities) {
        if (m.kind !== 'mob' || !m.alive || m.aiState !== 'patrol' || m.id === alerter.id) continue;
        if (dist2d(m.x, m.z, alerter.x, alerter.z) <= SOCIAL_AGGRO_RADIUS) {
          m.aiState = 'chase';
          m.aggroAnnounced = true; // acude sin repetir el aviso
        }
      }
    }

    // Loot de armas: la PRIMERA arma extra está garantizada; después, tirada.
    // Solo caen tipos que no llevas (duplicado = decepción).
    for (const ev of deadMobs) {
      const m = this.entities.find((e) => e.id === ev.id);
      if (!m) continue;
      // poción: tirada propia e independiente del arma. Sale del bicho, no del
      // aire, así que hay que ir a por ella (y a veces la dejas para luego).
      // casco: su propia tirada, con la calidad que marque el nivel del bicho
      if (this.rng.chance(HELMET_DROP_CHANCE)) {
        const pesos = rarityWeightsForLevel(m.level);
        const total = pesos.reduce((a, b) => a + b, 0);
        let roll = this.rng.next() * total;
        let rarity = 0;
        for (let r = 0; r < pesos.length; r++) {
          roll -= pesos[r];
          if (roll <= 0) {
            rarity = r;
            break;
          }
        }
        const d = { id: this.nextDropId++, x: m.x - 0.6, y: m.y, z: m.z - 0.6, rarity };
        this.helmetDrops.push(d);
        this.emit({ type: 'helmetDropped', dropId: d.id, x: d.x, y: d.y, z: d.z, rarity });
      }
      if (this.rng.chance(POTION_DROP_CHANCE)) {
        const d = { id: this.nextDropId++, x: m.x + 0.6, y: m.y, z: m.z + 0.6 };
        this.potionDrops.push(d);
        this.emit({ type: 'potionDropped', dropId: d.id, x: d.x, y: d.y, z: d.z });
      }
      // La tabla de botín es la del NIVEL de esta criatura, recortada a las
      // calidades que de verdad te mejoran. Un bicho de nivel 1 solo puede
      // soltar común: para él, un tipo que ya tienes no es candidato.
      const weightsFor = (id: string): number[] => {
        const floor = (p.weaponRarity[id] ?? -1) + 1;
        if (floor >= RARITY_MULT.length) return [0, 0, 0];
        return rarityWeightsForLevel(m.level).map((w, r) => (r >= floor ? w : 0));
      };
      const candidates = Object.keys(CLASS_ABILITY).filter(
        (id) => weightsFor(id).reduce((a, b) => a + b, 0) > 0,
      );
      if (candidates.length === 0) continue;
      const guaranteed = p.setB === '';
      if (!guaranteed && !this.rng.chance(WEAPON_DROP_CHANCE)) continue;
      const setId = candidates[Math.floor(this.rng.next() * candidates.length)];
      const weights = weightsFor(setId);
      const floor = (p.weaponRarity[setId] ?? -1) + 1;
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = this.rng.next() * total;
      let rarity = floor;
      for (let r = 0; r < weights.length; r++) {
        roll -= weights[r];
        if (roll <= 0) {
          rarity = r;
          break;
        }
      }
      const drop: WeaponDrop = {
        id: this.nextDropId++,
        x: m.x,
        y: m.y,
        z: m.z,
        setId,
        rarity,
      };
      this.drops.push(drop);
      this.emit({
        type: 'lootDropped',
        dropId: drop.id,
        x: drop.x,
        y: drop.y,
        z: drop.z,
        setId,
        rarity,
      });
    }

    // Si un mob mató al jugador este tick, arranca su temporizador de respawn
    // (la muerte por niebla ya lo hace en killPlayer).
    if (!p.alive && p.respawnTimer <= 0) {
      p.respawnTimer = PLAYER_RESPAWN_TIME;
      p.attackWindup = 0;
      p.abilityWindup = 0;
      p.dashTime = 0;
    }

    const out = this.events;
    this.events = [];
    return out;
  }

  // Estados con duración sobre una criatura. El daño por segundo se acumula
  // fraccionado y solo golpea cuando suma un punto entero: números limpios en
  // pantalla y cero dependencia del tick rate en el total repartido.
  private stepStatus(e: Entity): void {
    if (e.slowTime > 0) {
      e.slowTime = Math.max(0, e.slowTime - DT);
      if (e.slowTime === 0) e.slowMult = 0;
    }
    if (e.dotTime <= 0 || !e.alive) return;
    e.dotTime = Math.max(0, e.dotTime - DT);
    e.dotAccum += e.dotDps * DT;
    if (e.dotAccum < 1) {
      if (e.dotTime === 0) e.dotDps = 0;
      return;
    }
    const amount = Math.floor(e.dotAccum);
    e.dotAccum -= amount;
    e.hp = Math.max(0, e.hp - amount);
    const killed = e.hp === 0;
    if (killed) e.alive = false;
    this.emit({
      type: 'dotDamage',
      id: e.id,
      amount,
      kind: e.dotKind,
      x: e.x,
      y: e.y + 1.4,
      z: e.z,
      killed,
    });
    if (killed) this.emit({ type: 'died', id: e.id, kind: e.kind });
    if (e.dotTime === 0) e.dotDps = 0;
  }

  // La vida máxima y la armadura salen del árbol del arma EN MANO: al cambiar
  // de arma cambia el build, así que hay que recalcularlas en el sitio.
  private refreshMaxHp(): void {
    const p = this.player;
    const m = this.mods;
    const antes = p.maxHp;
    const casco = p.helmet >= 0 && p.helmetOn ? p.helmet : -1;
    p.maxHp = playerMaxHp(p.level) + m.maxHp + (casco >= 0 ? HELMET_HP[casco] : 0);
    p.damageTakenMult = 1 - Math.min(0.6, m.armor + (casco >= 0 ? HELMET_ARMOR[casco] : 0));
    if (p.maxHp > antes) p.hp += p.maxHp - antes; // lo que suma el talento, lo regala
    p.hp = Math.min(p.hp, p.maxHp);
  }

  // Recalcula todo lo derivado del estado del jugador (vida, escudo,
  // armadura). Lo usa el guardado al restaurar una partida: nadie tiene que
  // acordarse de qué campos dependen de qué.
  rebuildDerived(): void {
    const p = this.player;
    p.hasShield = WEAPON_SET_INFO[this.activeSetId]?.hasShield ?? false;
    this.refreshMaxHp();
    p.hp = p.maxHp;
  }

  // --- Talentos ---
  // Gasta un punto. Devuelve false si no hay puntos, el nodo está al máximo o
  // el tier sigue cerrado: la interfaz no necesita conocer las reglas.
  spendTalent(setId: string, nodeId: string): boolean {
    const p = this.player;
    if ((p.talentPoints[setId] ?? 0) <= 0) return false; // los puntos son DEL arma
    if (!canSpend(p.talents as TalentSpent, setId, nodeId)) return false;
    const tree = (p.talents[setId] ??= {});
    tree[nodeId] = (tree[nodeId] ?? 0) + 1;
    p.talentPoints[setId]--;
    this.refreshMaxHp();
    this.emit({ type: 'talentSpent', setId, nodeId, rank: tree[nodeId] });
    return true;
  }

  // Devuelve los puntos de UN arma: probar un camino no puede costar la
  // partida, pero tampoco arrasa el árbol de la otra.
  resetTalents(setId: string): number {
    const p = this.player;
    const tree = p.talents[setId];
    if (!tree) return 0;
    let devueltos = 0;
    for (const rank of Object.values(tree)) devueltos += rank;
    p.talents[setId] = {};
    p.talentPoints[setId] = (p.talentPoints[setId] ?? 0) + devueltos;
    this.refreshMaxHp();
    this.emit({ type: 'talentsReset', setId, points: devueltos });
    return devueltos;
  }

  // Alta de un arma en la maestría: nivel 1 y cero XP. Un arma recién caída
  // empieza de cero aunque tú lleves media vida jugando.
  initWeapon(setId: string): void {
    const p = this.player;
    p.weaponLevel[setId] ??= 1;
    p.weaponXp[setId] ??= 0;
    p.talentPoints[setId] ??= 0;
  }

  // Puntos sin gastar sumando todas las armas (para el aviso del HUD)
  get unspentPoints(): number {
    let n = 0;
    for (const v of Object.values(this.player.talentPoints)) n += v;
    return n;
  }

  // XP de maestría al arma EN MANO. Se usa el arma, sube el arma.
  private grantWeaponXp(amount: number): void {
    const p = this.player;
    const setId = this.activeSetId;
    this.initWeapon(setId);
    if (p.weaponLevel[setId] >= WEAPON_MAX_LEVEL) return;
    p.weaponXp[setId] += amount;
    this.emit({ type: 'weaponXpGained', setId, amount });
    while (
      p.weaponLevel[setId] < WEAPON_MAX_LEVEL &&
      p.weaponXp[setId] >= weaponXpToNext(p.weaponLevel[setId])
    ) {
      p.weaponXp[setId] -= weaponXpToNext(p.weaponLevel[setId]);
      p.weaponLevel[setId]++;
      p.talentPoints[setId] += TALENT_POINTS_PER_WEAPON_LEVEL;
      this.emit({ type: 'weaponLeveledUp', setId, level: p.weaponLevel[setId] });
    }
  }

  // Puerta para los tests: conceder XP sin tener que matar a nadie.
  grantXpForTests(amount: number): void {
    this.grantXp(amount);
  }

  // Concede XP y resuelve subidas de nivel: más vida, más daño, y el ding
  // cura a tope (regla clásica: subir de nivel en mitad de una pelea te salva).
  private grantXp(amount: number): void {
    const p = this.player;
    this.emit({ type: 'xpGained', id: p.id, amount });
    this.grantWeaponXp(amount); // la misma hazaña sube al héroe y a su arma
    if (p.level >= MAX_LEVEL) return;
    p.xp += amount;
    while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      this.refreshMaxHp();
      p.hp = p.maxHp;
      this.emit({ type: 'leveledUp', id: p.id, level: p.level });
    }
  }

  private killPlayer(): void {
    const p = this.player;
    p.hp = 0;
    p.alive = false;
    p.respawnTimer = PLAYER_RESPAWN_TIME;
    p.attackWindup = 0;
    this.emit({ type: 'died', id: p.id, kind: 'player' });
  }

  private respawnPlayer(): void {
    const p = this.player;
    p.alive = true;
    p.hp = p.maxHp;
    p.x = SPAWN_X;
    p.z = SPAWN_Z;
    p.y = terrainHeight(SPAWN_X, SPAWN_Z, this.seed);
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.grounded = true;
    this.snapPrev(p);
    this.emit({ type: 'respawned', id: p.id, kind: 'player' });
  }

  // Equipa un arma del zurrón en el hueco GUARDADO (nunca te cambia la mano).
  // Lo llama la ventana de inventario; valida propiedad y duplicados.
  // Nota multijugador (F4): esto deberá viajar por el flujo de comandos.
  // Equipa un arma del zurrón en el hueco que se pida. Si el hueco es el que
  // llevas en la mano, cambias de identidad en el sitio: mismo precio que el
  // cambio con X (enfriamiento incluido), y nunca en mitad de un golpe.
  equipInto(setId: string, slot: 'A' | 'B'): boolean {
    const p = this.player;
    if (!p.alive) return false;
    if (!p.ownedWeapons.includes(setId)) return false;
    if (setId === p.setA || setId === p.setB) return false;
    const enMano = slot === 'A' ? !p.activeSetB : p.activeSetB;
    if (
      enMano &&
      (p.swapCooldown > 0 || p.attackWindup > 0 || p.abilityWindup > 0 || p.dashTime > 0)
    ) {
      return false;
    }
    if (slot === 'A') p.setA = setId;
    else p.setB = setId;
    this.emit({ type: 'weaponEquipped', setId });
    if (enMano) {
      // el cuerpo y el escudo son del arma, no del personaje
      p.hasShield = WEAPON_SET_INFO[setId]?.hasShield ?? false;
      p.blocking = false;
      p.swapCooldown = SWAP_COOLDOWN;
      this.emit({ type: 'weaponSwapped', id: p.id, setId });
    }
    return true;
  }

  // Ponerse o quitarse el casco. Quitárselo cuesta sus estadísticas, pero hay
  // a quien le importa más verse la cara.
  toggleHelmet(): boolean {
    const p = this.player;
    if (p.helmet < 0) return false;
    p.helmetOn = !p.helmetOn;
    this.refreshMaxHp();
    this.emit({ type: 'helmetToggled', puesto: p.helmetOn });
    return true;
  }

  // Atajo clásico: al hueco guardado, sin tocar lo que llevas en la mano.
  equipStored(setId: string): boolean {
    return this.equipInto(setId, this.player.activeSetB ? 'A' : 'B');
  }

  // Huella serializada del estado para los tests de paridad/determinismo.
  stateHash(): string {
    return JSON.stringify(
      this.entities.map((e) => [
        e.id,
        e.x.toFixed(5),
        e.y.toFixed(5),
        e.z.toFixed(5),
        e.yaw.toFixed(5),
        e.hp,
        e.alive,
        e.aiState,
      ]),
    );
  }
}
