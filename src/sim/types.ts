// Tipos compartidos y constantes de tuning globales del sim.
// Todo número que defina el carácter del juego vive aquí con nombre, nunca inline.

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

// --- Movimiento (fricción >= accel: paradas secas, control preciso) ---
export const RUN_SPEED = 7;
export const ACCEL = 60;
export const FRICTION = 70;
export const GRAVITY = 22;
export const FALL_MULTIPLIER = 1.9; // caída más decidida que la subida
export const JUMP_VELOCITY = 8.4;
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER_TIME = 0.12;
export const AIR_CONTROL_ACCEL = 20; // valor heredado del kernel de WoC
// dy por unidad horizontal a partir del cual resbalas. Subido de 1,15 a 1,9
// con las terrazas: sus paredes rondan 1,2-1,8 y con el valor viejo el lomo se
// volvía un tobogán — un resbalón cada veinte metros. El desplome del flanco
// hacia la niebla pasa de 3, así que ese sigue matando igual.
export const MAX_WALK_SLOPE = 1.9;
export const STEEP_SLIDE_SPEED = 8;
export const HARD_LANDING_SPEED = 14; // |vy| a partir del cual el aterrizaje es "duro"

// --- Energía y esprint ---
export const STAMINA_MAX = 100;
export const SPRINT_MULT = 1.5; // velocidad al esprintar
export const SPRINT_DRAIN = 24; // energía por segundo esprintando
export const JUMP_STAMINA_COST = 16; // saltar también cansa
export const STAMINA_REGEN = 20; // por segundo, tras el respiro
export const STAMINA_REGEN_DELAY = 0.7; // respiro tras gastar
export const WINDED_RECOVER = 30; // jadeando hasta recuperar este mínimo

// --- Bloqueo con escudo ---
export const BLOCK_DAMAGE_MULT = 0.25; // el escudo se come el 75% del golpe
export const BLOCK_ARC = Math.PI * 1.2; // ~216 grados de cobertura frontal
export const BLOCK_MOVE_MULT = 0.35; // cubrirse te frena
export const BLOCK_FACE_RADIUS = 12; // auto-encara al enemigo más cercano

// --- Combate ---
export const MELEE_RANGE = 2.6;
export const MELEE_ARC = Math.PI * 0.62; // ~112 grados
export const ATTACK_WINDUP = 0.15; // anticipación antes del impacto
export const ATTACK_COOLDOWN = 0.62;
export const PLAYER_DAMAGE_MIN = 10;
export const PLAYER_DAMAGE_MAX = 16;
export const PLAYER_MAX_HP = 100;
export const PLAYER_RESPAWN_TIME = 3;
export const MAX_LEVEL = 20;
// Maestría: cada ARMA tiene su propio nivel y sube usándola. De ahí salen los
// puntos de talento, no del personaje: un arma recién caída empieza de cero
// aunque tú vayas por el nivel 15.
export const WEAPON_MAX_LEVEL = 10;

// --- Progresión ---
// XP necesaria para pasar del nivel l al l+1 (curva clásica suave)
export function xpToNext(level: number): number {
  return Math.floor(40 * level * (1 + level * 0.18));
}
// XP de maestría para pasar el arma del nivel l al l+1
export function weaponXpToNext(level: number): number {
  return Math.floor(50 * level * (1 + level * 0.22));
}
// Stats derivadas del nivel: LA única fuente (sim y HUD leen de aquí)
export function playerMaxHp(level: number): number {
  return PLAYER_MAX_HP + (level - 1) * 12;
}
export function playerDamageMin(level: number): number {
  return PLAYER_DAMAGE_MIN + Math.floor((level - 1) * 1.2);
}
export function playerDamageMax(level: number): number {
  return PLAYER_DAMAGE_MAX + Math.floor((level - 1) * 1.8);
}

// --- Mobs ---
export const MOB_MAX_HP = 42;
export const MOB_AGGRO_RADIUS = 11;
export const MOB_LEASH_DISTANCE = 34;
// Radio del cuerpo de un bicho para chocar con la arquitectura. Por debajo del
// del héroe a propósito: si no, los packs de tres se atascan en el portón.
export const MOB_RADIUS = 0.35;
// Cada cuánto se permite recalcular la ruta. A 20 Hz, buscar camino en cada
// tick para cada bicho sería tirar el presupuesto entero a la basura por un
// resultado que apenas cambia.
export const PATH_REFRESH = 0.45; // segundos
export const MOB_ATTACK_RANGE = 2.2;
export const MOB_ATTACK_WINDUP = 0.35; // telegrafiado: se puede leer y esquivar
export const MOB_ATTACK_COOLDOWN = 1.7;
export const MOB_DAMAGE_MIN = 6;
export const MOB_DAMAGE_MAX = 10;
export const MOB_SPEED = 5.4;
export const MOB_PATROL_SPEED_MULT = 0.42;
export const MOB_EVADE_SPEED_MULT = 1.35;
export const MOB_RESPAWN_TIME = 45; // el lomo tarda en volver a poblarse
export const BOSS_RESPAWN_TIME = 240; // al jefe se le respeta el luto
export const MOB_XP_REWARD = 15;

// --- Esquiva (Espacio en movimiento) ---
// No hay animación de rodar en ningún rig, así que es un quiebro lateral:
// desplazamiento corto y seco con medio segundo de intocable.
export const DODGE_SPEED = 17;
export const DODGE_TIME = 0.26; // lo que dura el desplazamiento
export const DODGE_IFRAMES = 0.5; // lo que dura el ser intocable
export const DODGE_COOLDOWN = 5.5; // no es un recurso de movimiento: es un salvavidas
export const DODGE_STAMINA_COST = 26;

// --- Fuera de combate: el lomo también cura ---
export const OUT_OF_COMBAT_TIME = 6; // segundos sin dar ni recibir para regenerar
export const REGEN_PER_SEC = 0.05; // del máximo de vida, por segundo (20 s a tope)
export const SIT_REGEN_MULT = 2.5; // sentado se recupera mucho antes
export const SIT_STAMINA_MULT = 2; // y el aire vuelve al doble de rápido

// --- Casco: la primera pieza de armadura, y se ve ---
export const HELMET_DROP_CHANCE = 0.18;
export const HELMET_HP = [10, 20, 34]; // vida por calidad
export const HELMET_ARMOR = [0.03, 0.06, 0.1]; // reducción de daño por calidad
export const HELMET_NAMES = ['Yelmo abollado', 'Yelmo de placas', 'Yelmo del Coloso'];

// --- Pociones (el único consumible: curan un pellizco gordo y tienen freno) ---
export const POTION_MAX = 5;
export const POTION_HEAL_PCT = 0.4; // del máximo de vida
export const POTION_COOLDOWN = 12;
export const POTION_DROP_CHANCE = 0.24;

// --- Mundo ---
export const DAY_LENGTH_SECONDS = 240;
export const START_TIME_OF_DAY = 0.32; // media mañana
export const BAG_FULL_NOTICE_COOLDOWN = 2.5; // segundos entre avisos de zurrón lleno
export const MIST_DEATH_MARGIN = 6; // metros por debajo del nivel de niebla = muerte

export type EntityKind = 'player' | 'mob';
export type MobAiState = 'patrol' | 'chase' | 'attack' | 'evade' | 'dead';

export interface Entity {
  id: number;
  kind: EntityKind;
  name: string;
  // pose actual
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  // pose del tick anterior (el render interpola entre ambas)
  px: number;
  py: number;
  pz: number;
  pyaw: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  fallVy: number; // pico de velocidad de caída del salto en curso (para el aterrizaje)
  // combate
  attackWindup: number; // >0: golpe anunciado pendiente de resolver
  attackCooldown: number;
  respawnTimer: number;
  // IA (solo mobs)
  templateId: string;
  moveSpeed: number;
  dmgMin: number;
  dmgMax: number;
  aggroRadius: number;
  xpReward: number;
  aiState: MobAiState;
  homeX: number;
  homeZ: number;
  patrolX: number;
  patrolZ: number;
  patrolWait: number;
  // Ruta para rodear la arquitectura. null mientras se pueda ir en línea recta,
  // que es lo normal: el lomo es casi todo pradera y buscar camino cuesta.
  camino: { x: number; z: number }[] | null;
  caminoPaso: number;
  caminoTimer: number; // cuánto queda para poder volver a buscar
  targetId: number;
  aggroAnnounced: boolean;
  xp: number; // XP acumulada hacia el siguiente nivel (solo player)
  level: number;
  blocking: boolean;
  hasShield: boolean;
  // habilidades del set activo (teclas 1 y 2)
  abilityCooldown: number; // SIEMPRE la del set activo (se permutan al cambiar)
  abilityCooldownOther: number; // la del set guardado
  ability2Cooldown: number; // la segunda, que abre el árbol de talentos
  ability2CooldownOther: number;
  abilityWindup: number;
  abilitySlot: number; // 1 o 2: cuál está anunciada y pendiente de resolver
  dashTime: number;
  // estados que te ponen encima (sangrado, veneno, quemadura, freno)
  dotDps: number;
  dotTime: number;
  dotKind: string;
  dotAccum: number; // daño fraccionado pendiente de redondear
  slowMult: number; // 0,25 = te mueves un 25% más lento
  slowTime: number;
  damageTakenMult: number; // 1 = normal; lo baja la armadura del árbol
  // doble equipo: tu arma es tu clase
  setA: string;
  setB: string;
  activeSetB: boolean;
  swapCooldown: number;
  ownedWeapons: string[]; // el zurrón: todo lo looteado se conserva
  weaponRarity: Record<string, number>; // calidad por tipo (0 común, 1 mágica, 2 rara)
  // energía (esprint y salto)
  // maestría y talentos, TODO por arma: puntos sin gastar, lo gastado,
  // el nivel del arma y su XP hacia el siguiente
  talentPoints: Record<string, number>;
  talents: Record<string, Record<string, number>>;
  weaponLevel: Record<string, number>;
  weaponXp: Record<string, number>;
  potions: number;
  potionCooldown: number;
  helmet: number; // -1 sin casco; 0..2 la calidad del que tienes
  helmetOn: boolean; // se puede llevar guardado para ir a cara descubierta
  dodgeTime: number; // >0: esquiva en curso (desplazamiento)
  dodgeCooldown: number;
  invuln: number; // >0: los golpes te atraviesan
  combatTimer: number; // >0: sigues en combate, no hay regeneración
  regenAccum: number; // vida fraccionada pendiente de sumar
  sitting: boolean;
  respawnTime: number; // lo que tarda ESTA criatura en volver
  stamina: number;
  staminaDelay: number;
  winded: boolean; // vació la barra: no esprinta hasta recuperar el mínimo
  sprinting: boolean;
}

// Intención de movimiento por tick: la calcula la capa de input (relativa a cámara)
// y el sim la consume tal cual. Grabable y reproducible.
export interface MoveInput {
  moveX: number; // dirección deseada en mundo, normalizada (0,0 = quieto)
  moveZ: number;
  jump: boolean; // flanco: pulsado desde el último tick
  jumpHeld: boolean;
  attack: boolean; // flanco
  block: boolean; // mantenido: cubrirse con el escudo
  ability: boolean; // flanco: la habilidad del set activo (tecla 1)
  ability2: boolean; // flanco: la segunda habilidad, si el árbol la ha abierto (tecla 2)
  sprint: boolean; // mantenido: esprintar (Shift)
  swap: boolean; // flanco: cambiar de set de arma (tecla X)
  drink: boolean; // flanco: beber poción (tecla Q)
  sit: boolean; // flanco: sentarse a descansar (tecla C)
  // Si no es null, el personaje mira SIEMPRE hacia este ángulo en vez de hacia
  // donde anda. Es lo que hace que moverse de lado con Q/E no te dé la espalda
  // al enemigo (y que esquivar de lado siga mirándolo).
  faceYaw: number | null;
}

export const IDLE_INPUT: MoveInput = {
  moveX: 0,
  moveZ: 0,
  jump: false,
  jumpHeld: false,
  attack: false,
  block: false,
  ability: false,
  ability2: false,
  sprint: false,
  swap: false,
  drink: false,
  sit: false,
  faceYaw: null,
};

// Hechos ocurridos, en pasado: el render/HUD/audio los consumen para el juice.
export type SimEvent =
  | { type: 'swung'; id: number }
  | {
      type: 'hitLanded';
      attackerId: number;
      targetId: number;
      amount: number;
      x: number;
      y: number;
      z: number;
      killed: boolean;
      crit?: boolean;
    }
  | { type: 'healed'; id: number; amount: number }
  | {
      type: 'dotDamage';
      id: number;
      amount: number;
      kind: string;
      x: number;
      y: number;
      z: number;
      killed: boolean;
    }
  | { type: 'talentSpent'; setId: string; nodeId: string; rank: number }
  | { type: 'talentsReset'; setId: string; points: number }
  | { type: 'weaponXpGained'; setId: string; amount: number }
  | { type: 'potionDropped'; dropId: number; x: number; y: number; z: number }
  | { type: 'potionPickedUp'; dropId: number; total: number; lleno: boolean }
  | { type: 'potionDrunk'; amount: number; quedan: number }
  | { type: 'helmetDropped'; dropId: number; x: number; y: number; z: number; rarity: number }
  | { type: 'helmetPickedUp'; rarity: number; mejora: boolean }
  | { type: 'helmetToggled'; puesto: boolean }
  | { type: 'dodged'; id: number; dirX: number; dirZ: number }
  | { type: 'evaded'; id: number; x: number; y: number; z: number }
  | { type: 'sat'; id: number; sitting: boolean }
  | { type: 'regenTick'; id: number; amount: number }
  | { type: 'weaponLeveledUp'; setId: string; level: number }
  | { type: 'jumped'; id: number }
  | { type: 'landed'; id: number; fallSpeed: number }
  | { type: 'aggroed'; id: number }
  | { type: 'died'; id: number; kind: EntityKind }
  | { type: 'respawned'; id: number; kind: EntityKind }
  | { type: 'fellInMist'; id: number }
  | { type: 'xpGained'; id: number; amount: number }
  | { type: 'leveledUp'; id: number; level: number }
  | { type: 'abilityUsed'; id: number; ability: string; slot: number }
  | { type: 'weaponSwapped'; id: number; setId: string }
  | {
      type: 'lootDropped';
      dropId: number;
      x: number;
      y: number;
      z: number;
      setId: string;
      rarity: number;
    }
  | { type: 'lootPickedUp'; dropId: number; setId: string; rarity: number; upgraded: boolean }
  | { type: 'weaponEquipped'; setId: string }
  | { type: 'bagFull'; setId: string }
  | {
      type: 'projectileSpawned';
      pid: number;
      x: number;
      y: number;
      z: number;
      vx: number;
      vz: number;
      kind: string;
    }
  | { type: 'projectileGone'; pid: number; x: number; y: number; z: number; kind: string }
  | {
      type: 'blockedHit';
      attackerId: number;
      targetId: number;
      amount: number; // daño que SÍ entró tras el escudo
      x: number;
      y: number;
      z: number;
    };

export function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx,
    dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
