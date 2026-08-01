// Trae piezas nuevas del pack de KayKit (CC0) al proyecto:
//   1) las armas sueltas vienen en .gltf + .bin, y aquí todo es .glb
//   2) el pícaro sin capucha viene SIN animaciones: se le trasplantan las de
//      su hermano encapuchado, que comparte rig hueso por hueso
//
// Uso: node scripts/traer_del_pack.mjs [carpeta-del-pack]

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';

const PACK = process.argv[2] ?? '/tmp/kaykit/KayKit_Adventurers_2.0_FREE';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const kb = (n) => `${Math.round(n / 1024)} KB`;

// --- 1) armas: .gltf + .bin → .glb de una pieza ---
const ARMAS = [
  ['Assets/gltf/crossbow_2handed.gltf', 'public/models/crossbow.glb'],
  ['Assets/gltf/arrow_crossbow.gltf', 'public/models/bolt.glb'],
];
for (const [origen, destino] of ARMAS) {
  const doc = await io.read(`${PACK}/${origen}`);
  await doc.transform(unpartition());
  const bin = await io.writeBinary(doc);
  writeFileSync(destino, bin);
  console.log(`arma  ${destino.padEnd(28)} ${kb(bin.length)}`);
}

// --- 2) el pícaro sin capucha, con las animaciones del encapuchado ---
const doc = await io.read(`${PACK}/Characters/gltf/Rogue.glb`);
const src = await io.read('public/models/rogue_hooded.glb');

const huesos = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
const escenasPropias = new Set(doc.getRoot().listScenes());
const nodosPropios = new Set(doc.getRoot().listNodes());
const mallasPropias = new Set(doc.getRoot().listMeshes());
const pielesPropias = new Set(doc.getRoot().listSkins());
const materialesPropios = new Set(doc.getRoot().listMaterials());
const texturasPropias = new Set(doc.getRoot().listTextures());

mergeDocuments(doc, src);

let traidas = 0;
const sinHueso = new Set();
for (const anim of doc.getRoot().listAnimations()) {
  for (const canal of anim.listChannels()) {
    const objetivo = canal.getTargetNode();
    const equivalente = objetivo ? huesos.get(objetivo.getName()) : null;
    if (equivalente) canal.setTargetNode(equivalente);
    else {
      if (objetivo) sinHueso.add(objetivo.getName());
      canal.dispose();
    }
  }
  traidas++;
}

// fuera el cuerpo del encapuchado: solo queríamos su movimiento
const root = doc.getRoot();
for (const escena of root.listScenes()) if (!escenasPropias.has(escena)) escena.dispose();
for (const malla of root.listMeshes()) if (!mallasPropias.has(malla)) malla.dispose();
for (const piel of root.listSkins()) if (!pielesPropias.has(piel)) piel.dispose();
for (const mat of root.listMaterials()) if (!materialesPropios.has(mat)) mat.dispose();
for (const tex of root.listTextures()) if (!texturasPropias.has(tex)) tex.dispose();
for (const nodo of root.listNodes()) if (!nodosPropios.has(nodo)) nodo.dispose();

await doc.transform(prune({ keepExtras: true }), unpartition());
const bin = await io.writeBinary(doc);
writeFileSync('public/models/rogue.glb', bin);
console.log(
  `pícaro sin capucha: ${traidas} animaciones · ${kb(bin.length)}` +
    (sinHueso.size ? ` [huesos ausentes: ${[...sinHueso].join(', ')}]` : ' · rig compatible'),
);
