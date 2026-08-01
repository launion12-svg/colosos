// Las clases de Colosos: definición de datos, no de lógica. Añadir una clase
// nueva es añadir una entrada aquí (y su modelo en public/models).

export interface WeaponMount {
  bone: string;
  model: string;
  offset?: [number, number, number];
  rot?: [number, number, number]; // orientación en combate (radianes)
  restRot?: [number, number, number]; // orientación en reposo (si difiere)
}

export interface ClassDef {
  id: string;
  nombre: string; // nombre de la clase en el mundo de Colosos
  rol: string;
  armaNombres: [string, string, string]; // nombre por calidad: común, mágica, rara
  desc: string;
  model: string;
  weapons: WeaponMount[];
  hasShield: boolean; // habilita el bloqueo con botón derecho
  gesture: string; // animación del gesto en la pantalla de selección
  attackAnim: string;
  attackTimeScale: number;
}

export const CLASSES: ClassDef[] = [
  {
    id: 'medula',
    nombre: 'Médula',
    rol: 'Guardián',
    armaNombres: ['Espada de madera', 'Espada de acero', 'Espada de Vértebra'],
    desc: 'Canaliza la fuerza del coloso. Espada, escudo y la primera línea: bloquea con el botón derecho.',
    model: 'models/knight.glb',
    weapons: [
      { bone: 'handslot.r', model: 'models/adv_sword_1handed.glb' },
      { bone: 'handslot.l', model: 'models/shield_round.glb', offset: [0, 0.02, 0.045] },
    ],
    hasShield: true,
    gesture: 'Cheer',
    attackAnim: '1H_Melee_Attack_Slice_Diagonal',
    attackTimeScale: 1.35,
  },
  {
    id: 'vigia',
    nombre: 'Vigía',
    rol: 'Arquera',
    armaNombres: ['Arco de caza', 'Arco de tejo', 'Arco del Vigía Mayor'],
    desc: 'Ojos del coloso. Dispara flechas a distancia: el único ataque básico que no necesita acercarse.',
    model: 'models/ranger.glb',
    weapons: [{ bone: 'handslot.l', model: 'models/bow.glb', rot: [Math.PI / 2, -Math.PI / 2, 0], restRot: [0, 0, 0] }],
    hasShield: false,
    gesture: '2H_Ranged_Shoot',
    attackAnim: '2H_Ranged_Shoot',
    attackTimeScale: 1.5,
  },
  {
    id: 'cordelero',
    nombre: 'Cordelero',
    rol: 'Pícaro',
    armaNombres: ['Dagas melladas', 'Dagas de cordelero', 'Colmillos Gemelos'],
    desc: 'Maestro de puentes y cuerdas. Dos dagas y ninguna paciencia.',
    model: 'models/rogue_hooded.glb',
    weapons: [
      { bone: 'handslot.r', model: 'models/adv_dagger.glb' },
      { bone: 'handslot.l', model: 'models/adv_dagger.glb' },
    ],
    hasShield: false,
    gesture: 'Dualwield_Melee_Attack_Chop',
    attackAnim: 'Dualwield_Melee_Attack_Chop',
    attackTimeScale: 1.4,
  },
  {
    id: 'fumarel',
    nombre: 'Fumarel',
    rol: 'Mago',
    armaNombres: ['Vara astillada', 'Bastón de niebla', 'Bastón del Mar Tóxico'],
    desc: 'Destila la niebla del mar tóxico en poder. El bastón pega; los hechizos, en la Fase 2.',
    model: 'models/mage.glb',
    weapons: [{ bone: 'handslot.r', model: 'models/adv_staff.glb' }],
    hasShield: false,
    gesture: 'Spellcast_Raise',
    attackAnim: '2H_Melee_Attack_Chop',
    attackTimeScale: 1.25,
  },
];

export function classById(id: string | null): ClassDef | undefined {
  return CLASSES.find((c) => c.id === id);
}

// El nombre del arma depende de su calidad: la misma espada es "de madera"
// en común y "de Vértebra" en rara.
export function weaponName(setId: string, rarity = 0): string {
  const def = classById(setId);
  if (!def) return 'arma';
  return def.armaNombres[Math.max(0, Math.min(2, rarity))];
}
