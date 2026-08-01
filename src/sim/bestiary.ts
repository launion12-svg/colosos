// El bestiario del coloso: datos-como-código. Añadir una criatura nueva es
// añadir una entrada aquí y colocarla en un campamento de CAMPS (sim.ts).
// Los nombres de animación son del GLB de cada criatura (varían por autor).

export interface MobAnims {
  idle: string;
  alert?: string; // en guardia (si el rig la trae)
  walk: string;
  run: string;
  attack: string;
  death: string;
  hit?: string;
  runTimeScale?: number; // para rigs sin animación de correr propia
}

export interface MobTemplate {
  id: string;
  nombre: string;
  model: string;
  level: number; // gobierna la tabla de calidades de su botín
  height: number; // metros en mundo
  hp: number;
  dmgMin: number;
  dmgMax: number;
  speed: number;
  aggro: number; // radio de detección
  xp: number;
  boss?: boolean;
  anims: MobAnims;
}

export const BESTIARY: Record<string, MobTemplate> = {
  lobo: {
    id: 'lobo',
    level: 3,
    nombre: 'Lobo de niebla',
    model: 'models/wolf_basic.glb',
    height: 1.15,
    hp: 42,
    dmgMin: 6,
    dmgMax: 10,
    speed: 5.4,
    aggro: 11,
    xp: 15,
    anims: {
      idle: 'Idle',
      alert: 'Idle Alert',
      walk: 'Walk',
      run: 'Gallop',
      attack: 'Attack',
      death: 'Death',
      hit: 'Idle_HitReact_Left',
    },
  },
  arana: {
    id: 'arana',
    level: 1,
    nombre: 'Araña del lomo',
    model: 'models/spider.glb',
    height: 0.8,
    hp: 24,
    dmgMin: 4,
    dmgMax: 7,
    speed: 6.2,
    aggro: 9,
    xp: 10,
    anims: {
      idle: 'Spider_Idle',
      walk: 'Spider_Walk',
      run: 'Spider_Walk',
      runTimeScale: 1.8,
      attack: 'Spider_Attack',
      death: 'Spider_Death',
    },
  },
  jabali: {
    id: 'jabali',
    level: 4,
    nombre: 'Jabalí cerdoso',
    model: 'models/wild_boar.glb',
    height: 1.05,
    hp: 60,
    dmgMin: 8,
    dmgMax: 13,
    speed: 4.6,
    aggro: 8,
    xp: 20,
    anims: {
      idle: 'Idle_AnimalArmature',
      walk: 'Walk_AnimalArmature',
      run: 'Gallop_AnimalArmature',
      attack: 'Attack_Headbutt_AnimalArmature',
      death: 'Death_AnimalArmature',
    },
  },
  goblin: {
    id: 'goblin',
    level: 6,
    nombre: 'Goblin de las cuerdas',
    model: 'models/goblin.glb',
    height: 1.3,
    hp: 38,
    dmgMin: 6,
    dmgMax: 11,
    speed: 5.2,
    aggro: 12,
    xp: 16,
    anims: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: 'Attack',
      death: 'Death',
      hit: 'HitRecieve',
    },
  },
  gigante: {
    id: 'gigante',
    level: 10,
    nombre: 'Gigante de la Cabeza',
    model: 'models/giant.glb',
    height: 3.2,
    hp: 200,
    dmgMin: 13,
    dmgMax: 21,
    speed: 3.9,
    aggro: 13,
    xp: 90,
    boss: true,
    anims: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: 'Attack',
      death: 'Death',
      hit: 'HitRecieve',
    },
  },
};

export interface CampDef {
  template: string;
  x: number;
  z: number;
  count: number;
}

// Campamentos por dificultad: alimañas cerca del spawn (cola, z negativa),
// y el yeti guardando el camino a la cabeza (z positiva).
export const CAMPS: CampDef[] = [
  { template: 'arana', x: 16, z: -102, count: 3 },
  { template: 'jabali', x: -18, z: -88, count: 2 },
  { template: 'lobo', x: 14, z: -78, count: 2 },
  { template: 'lobo', x: -18, z: -40, count: 2 },
  { template: 'jabali', x: -20, z: 20, count: 2 },
  { template: 'goblin', x: 10, z: 2, count: 3 },
  { template: 'lobo', x: -12, z: 52, count: 2 },
  { template: 'goblin', x: 22, z: 70, count: 3 },
  { template: 'gigante', x: 0, z: 104, count: 1 },
];

// Radio en el que un pack acude en ayuda del que hace aggro
export const SOCIAL_AGGRO_RADIUS = 9;
