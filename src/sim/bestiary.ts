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
    hp: 90,
    dmgMin: 8,
    dmgMax: 13,
    speed: 5.6,
    aggro: 11,
    xp: 34,
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
    hp: 34,
    dmgMin: 5,
    dmgMax: 8,
    speed: 6.2,
    aggro: 9,
    xp: 14,
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
    hp: 130,
    dmgMin: 11,
    dmgMax: 17,
    speed: 4.8,
    aggro: 8,
    xp: 48,
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
    hp: 190,
    dmgMin: 14,
    dmgMax: 21,
    speed: 5.4,
    aggro: 12,
    xp: 78,
    anims: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: 'Attack',
      death: 'Death',
      hit: 'HitRecieve',
    },
  },
  cangrejo: {
    id: 'cangrejo',
    level: 2,
    nombre: 'Cangrejo costroso',
    model: 'models/crabenemy.glb',
    height: 0.9,
    hp: 55,
    dmgMin: 6,
    dmgMax: 10,
    speed: 4.4,
    aggro: 8,
    xp: 22,
    anims: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Walk',
      runTimeScale: 1.7,
      attack: 'Bite_Front',
      death: 'Death',
      hit: 'HitRecieve',
    },
  },
  corredor: {
    id: 'corredor',
    level: 5,
    nombre: 'Corredor de cresta',
    model: 'models/velociraptor.glb',
    height: 1.5,
    hp: 150,
    dmgMin: 13,
    dmgMax: 19,
    speed: 7.4, // el más rápido del lomo: no se le escapa uno andando
    aggro: 14,
    xp: 62,
    anims: {
      idle: 'Velociraptor_Idle',
      walk: 'Velociraptor_Walk',
      run: 'Velociraptor_Run',
      attack: 'Velociraptor_Attack',
      death: 'Velociraptor_Death',
    },
  },
  costillar: {
    id: 'costillar',
    level: 7,
    nombre: 'Costillar andante',
    model: 'models/skeleton_warrior.glb',
    height: 1.8,
    hp: 260,
    dmgMin: 18,
    dmgMax: 27,
    speed: 4.9,
    aggro: 12,
    xp: 95,
    anims: {
      idle: 'Idle_Combat',
      alert: 'Idle_Combat',
      walk: 'Walking_A',
      run: 'Running_A',
      attack: '2H_Melee_Attack_Chop',
      death: 'Death_A',
      hit: 'Hit_A',
    },
  },
  bruto: {
    id: 'bruto',
    level: 9,
    nombre: 'Bruto del espinazo',
    model: 'models/orc.glb',
    height: 2,
    hp: 400,
    dmgMin: 24,
    dmgMax: 36,
    speed: 4.6,
    aggro: 13,
    xp: 135,
    anims: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: 'Punch',
      death: 'Death',
      hit: 'HitReact',
    },
  },
  vaho: {
    id: 'vaho',
    level: 12,
    nombre: 'Vaho del Mar Tóxico',
    model: 'models/water_elemental.glb',
    height: 2.4,
    hp: 700,
    dmgMin: 30,
    dmgMax: 45,
    speed: 4.2,
    aggro: 15,
    xp: 220,
    anims: {
      idle: 'Idle',
      walk: 'Move',
      run: 'Move',
      runTimeScale: 1.5,
      attack: 'Cast',
      death: 'Death',
      hit: 'Hit',
    },
  },
  gigante: {
    id: 'gigante',
    level: 15,
    nombre: 'Gigante de la Cabeza',
    model: 'models/giant.glb',
    height: 3.4,
    hp: 2200,
    dmgMin: 38,
    dmgMax: 58,
    speed: 4.2,
    aggro: 16,
    xp: 600,
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
  // La cola (z muy negativa) es la guardería; la cabeza (z positiva), el final.
  // Cada tramo sube un peldaño: si te saltas campamentos, el siguiente te come.
  { template: 'arana', x: 16, z: -102, count: 3 },
  { template: 'cangrejo', x: -14, z: -95, count: 3 },
  { template: 'jabali', x: -18, z: -88, count: 2 },
  { template: 'lobo', x: 14, z: -78, count: 3 },
  { template: 'cangrejo', x: 18, z: -64, count: 3 },
  { template: 'corredor', x: -16, z: -52, count: 2 },
  { template: 'lobo', x: -18, z: -40, count: 3 },
  { template: 'corredor', x: 12, z: -26, count: 3 },
  { template: 'goblin', x: -14, z: -10, count: 3 },
  { template: 'goblin', x: 10, z: 2, count: 3 },
  { template: 'costillar', x: -20, z: 18, count: 2 },
  { template: 'jabali', x: 16, z: 32, count: 3 },
  { template: 'costillar', x: -12, z: 48, count: 3 },
  { template: 'bruto', x: 14, z: 62, count: 2 },
  { template: 'bruto', x: -16, z: 76, count: 3 },
  { template: 'vaho', x: 6, z: 90, count: 1 }, // el portero de la cabeza
  { template: 'gigante', x: 0, z: 104, count: 1 },
];

// Radio en el que un pack acude en ayuda del que hace aggro
export const SOCIAL_AGGRO_RADIUS = 9;
