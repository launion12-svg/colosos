// Tinte de arma por calidad: la común se ve de madera, la mágica de acero
// azulado y la rara dorada. Clona los materiales antes de teñir — los GLB
// vienen de una caché compartida y teñir en crudo pintaría TODAS las copias
// (la del héroe, la del suelo y la del icono a la vez).

import * as THREE from 'three';

export const RARITY_TINT = [0x8a6238, 0xaebfd8, 0xffcf5c]; // madera, acero, oro

export function tintWeapon(root: THREE.Object3D, rarity: number): void {
  const hex = RARITY_TINT[Math.max(0, Math.min(2, rarity))] ?? RARITY_TINT[0];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m) => {
      const mat = m as THREE.MeshStandardMaterial;
      // una sola clonación por instancia, marcada para no reclonar al re-teñir
      const own = mat.userData.tintOwned ? mat : (mat.clone() as THREE.MeshStandardMaterial);
      own.userData.tintOwned = true;
      own.color.setHex(hex);
      // el oro brilla un poco; la madera es mate
      own.metalness = rarity === 2 ? 0.85 : rarity === 1 ? 0.6 : 0.05;
      own.roughness = rarity === 2 ? 0.28 : rarity === 1 ? 0.42 : 0.85;
      return own;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}
