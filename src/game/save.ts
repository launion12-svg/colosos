// Guardado de la partida en el navegador. Es la capa de cliente: el sim no
// sabe que existe (sigue sin tocar el navegador). Guarda lo que costó ganar
// —nivel, armas, calidades y talentos— y nada del estado del mundo: los
// bichos y la hora vuelven a empezar, tu personaje no.

import type { Sim } from '../sim/sim';

const KEY = 'colosos.save.v1';

export interface SaveData {
  v: number;
  nombre: string;
  setA: string;
  setB: string;
  activeSetB: boolean;
  ownedWeapons: string[];
  weaponRarity: Record<string, number>;
  level: number;
  xp: number;
  talentPoints: Record<string, number>;
  talents: Record<string, Record<string, number>>;
  weaponLevel: Record<string, number>;
  weaponXp: Record<string, number>;
  fecha: number;
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.v !== 1 || !data.setA) return null;
    return data;
  } catch {
    return null; // partida corrupta o almacenamiento bloqueado: como si no hubiera
  }
}

export function writeSave(sim: Sim, fecha: number): void {
  const p = sim.player;
  const data: SaveData = {
    v: 1,
    nombre: p.name,
    setA: p.setA,
    setB: p.setB,
    activeSetB: p.activeSetB,
    ownedWeapons: [...p.ownedWeapons],
    weaponRarity: { ...p.weaponRarity },
    level: p.level,
    xp: p.xp,
    talentPoints: { ...p.talentPoints },
    weaponLevel: { ...p.weaponLevel },
    weaponXp: { ...p.weaponXp },
    talents: JSON.parse(JSON.stringify(p.talents)) as SaveData['talents'],
    fecha,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* sin espacio o en modo privado: se juega igual, solo que sin memoria */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* da igual: si no se puede borrar, la siguiente partida lo sobrescribe */
  }
}

// Vuelca la partida guardada sobre un sim recién creado. El sim ya nació con
// setA/setB correctos; aquí se restaura lo demás y se recalculan las derivadas.
export function applySave(sim: Sim, data: SaveData): void {
  const p = sim.player;
  p.name = data.nombre || p.name;
  p.setA = data.setA;
  p.setB = data.setB;
  p.activeSetB = data.activeSetB && data.setB !== '';
  p.ownedWeapons = [...data.ownedWeapons];
  p.weaponRarity = { ...data.weaponRarity };
  p.level = Math.max(1, data.level);
  p.xp = Math.max(0, data.xp);
  p.talentPoints = data.talentPoints ?? {};
  p.talents = data.talents ?? {};
  p.weaponLevel = data.weaponLevel ?? {};
  p.weaponXp = data.weaponXp ?? {};
  for (const id of p.ownedWeapons) sim.initWeapon(id); // altas que falten
  sim.rebuildDerived();
}
