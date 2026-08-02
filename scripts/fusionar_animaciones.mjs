// Trae animaciones del pack oficial de KayKit (CC0) a nuestros personajes.
//
// Los personajes ya vienen con 22 animaciones fusionadas por el pipeline de
// World of ClaudeCraft, pero el pack libre trae otras que no teníamos: beber,
// recoger del suelo y un salto en tres tiempos. El rig es el mismo (Rig_Medium),
// así que basta con copiar los canales apuntando a los huesos por NOMBRE.
//
// Uso: node scripts/fusionar_animaciones.mjs <carpeta-del-pack>

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, meshopt, prune, resample, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const PACK = process.argv[2] ?? '/tmp/kaykit/KayKit_Adventurers_2.0_FREE';
const ANIMS = process.argv[3] ?? '/tmp/kayanim/KayKit_Character_Animations_1.1';
const FUENTES = [
  `${PACK}/Animations/gltf/Rig_Medium/Rig_Medium_General.glb`,
  `${PACK}/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb`,
  // el pack de animaciones aparte (también CC0) es el que trae la voltereta
  `${ANIMS}/Animations/gltf/Rig_Medium/Rig_Medium_MovementAdvanced.glb`,
  `${ANIMS}/Animations/gltf/Rig_Medium/Rig_Medium_CombatMelee.glb`,
  `${ANIMS}/Animations/gltf/Rig_Medium/Rig_Medium_CombatRanged.glb`,
  `${ANIMS}/Animations/gltf/Rig_Medium/Rig_Medium_Simulation.glb`,
];

// Lo que de verdad usamos. Nada de traerlo todo: cada animación pesa.
const COMUNES = new Set([
  'Use_Item', // beber la poción
  'PickUp', // recoger del suelo
  'Jump_Start', // el impulso del salto
  'Jump_Land', // la caída
  'Spawn_Ground', // reaparecer
  // La voltereta de verdad, en las cuatro direcciones
  'Dodge_Forward',
  'Dodge_Backward',
  'Dodge_Left',
  'Dodge_Right',
  // levantarse del suelo al dejar de descansar
  'Sit_Floor_StandUp',
]);

// Y lo que solo necesita QUIEN lo usa: cada animación pesa, así que el mago no
// carga el giro del hacha ni el caballero la recarga de la ballesta.
const PROPIAS = {
  'public/models/barbarian.glb': ['Melee_2H_Attack_Spin'], // Tajo Circular
  'public/models/rogue_hooded.glb': ['Melee_2H_Attack_Spin'], // Danza de Cuchillas
  'public/models/rogue.glb': ['Ranged_1H_Shoot', 'Ranged_1H_Reload', 'Ranged_1H_Aiming'],
};

const DESTINOS = [
  'public/models/knight.glb',
  'public/models/ranger.glb',
  'public/models/rogue_hooded.glb',
  'public/models/mage.glb',
  'public/models/barbarian.glb',
  'public/models/rogue.glb', // el pícaro sin capucha: el ballestero
];

// nuestros modelos vienen comprimidos con meshopt (así los dejó el pipeline
// de WoC): hay que registrar la extensión o ni se pueden abrir
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

for (const destino of DESTINOS) {
  if (!existsSync(destino)) {
    console.log(`${basename(destino).padEnd(20)} (aún no existe, se salta)`);
    continue;
  }
  const QUEREMOS = new Set([...COMUNES, ...(PROPIAS[destino] ?? [])]);
  const antesBytes = readFileSync(destino).length;
  const doc = await io.read(destino);
  const animsPropias = new Set(doc.getRoot().listAnimations());
  const yaTiene = new Set(
    doc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName()),
  );
  // los huesos del destino, por nombre: es el puente entre los dos rigs
  const huesos = new Map(
    doc
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  // Foto de lo que ya era nuestro: todo lo que aparezca de más tras fusionar
  // (el maniquí del pack, sus mallas, su piel) se tira. Solo queremos el
  // movimiento, no el muñeco que lo demuestra.
  const escenasPropias = new Set(doc.getRoot().listScenes());
  const nodosPropios = new Set(doc.getRoot().listNodes());
  const mallasPropias = new Set(doc.getRoot().listMeshes());
  const pielesPropias = new Set(doc.getRoot().listSkins());
  const materialesPropios = new Set(doc.getRoot().listMaterials());
  const texturasPropias = new Set(doc.getRoot().listTextures());
  const añadidas = [];
  const faltantes = new Set();

  for (const fuente of FUENTES) {
    const src = await io.read(fuente);
    const animsSrc = new Set(
      src
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    );
    if (![...QUEREMOS].some((n) => animsSrc.has(n))) continue;
    mergeDocuments(doc, src);

    for (const anim of doc.getRoot().listAnimations()) {
      const nombre = anim.getName();
      if (yaTiene.has(nombre)) {
        // ya la teníamos: la copia del pack sobra (si no, quedan duplicadas y
        // el reproductor coge la que no toca)
        if (!animsPropias.has(anim)) anim.dispose();
        continue;
      }
      if (!QUEREMOS.has(nombre)) {
        anim.dispose(); // lo que no usamos, fuera: no engordamos el fichero
        continue;
      }
      for (const canal of anim.listChannels()) {
        const objetivo = canal.getTargetNode();
        const equivalente = objetivo ? huesos.get(objetivo.getName()) : null;
        if (equivalente) canal.setTargetNode(equivalente);
        else {
          if (objetivo) faltantes.add(objetivo.getName());
          canal.dispose(); // hueso que no existe aquí: se descarta el canal
        }
      }
      yaTiene.add(nombre);
      // ¡ojo! pasa a ser NUESTRA: si no, la segunda pasada la tomaba por una
      // copia del pack y la borraba (así se perdían Use_Item, PickUp y Spawn)
      animsPropias.add(anim);
      añadidas.push(nombre);
    }
  }

  // fuera el maniquí del pack, entero
  const root = doc.getRoot();
  for (const escena of root.listScenes()) if (!escenasPropias.has(escena)) escena.dispose();
  for (const malla of root.listMeshes()) if (!mallasPropias.has(malla)) malla.dispose();
  for (const piel of root.listSkins()) if (!pielesPropias.has(piel)) piel.dispose();
  for (const mat of root.listMaterials()) if (!materialesPropios.has(mat)) mat.dispose();
  for (const tex of root.listTextures()) if (!texturasPropias.has(tex)) tex.dispose();
  for (const nodo of root.listNodes()) {
    if (nodosPropios.has(nodo)) continue;
    // sus huesos ya no los usa nadie: los canales apuntan a los nuestros
    nodo.dispose();
  }
  // Las animaciones del pack vienen crudas y pesan lo suyo: se limpian los
  // fotogramas redundantes y se recomprime con meshopt, que es como venían
  // las nuestras. Sin esto, cada personaje engordaba 1,2 MB.
  await doc.transform(
    resample(),
    prune({ keepExtras: true }),
    unpartition(),
    meshopt({ encoder: MeshoptEncoder }),
  );

  const salida = await io.writeBinary(doc);
  writeFileSync(destino, salida);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(
    `${basename(destino).padEnd(20)} +${añadidas.length} (${añadidas.join(', ') || '—'})  ${kb(antesBytes)} → ${kb(salida.length)}` +
      (faltantes.size ? `  [huesos ausentes: ${[...faltantes].join(', ')}]` : ''),
  );
}
