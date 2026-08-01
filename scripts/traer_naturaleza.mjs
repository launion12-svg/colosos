import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, unpartition, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
const PACK = '/tmp/natura2/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf';
const PIEZAS = [
  ['Tree_1_A_Color1', 'arbol_1'], ['Tree_2_A_Color1', 'arbol_2'], ['Tree_2_C_Color1', 'arbol_3'],
  ['Tree_3_A_Color1', 'pino_1'], ['Tree_4_A_Color1', 'pino_2'],
  ['Tree_Bare_1_A_Color1', 'seco_1'], ['Tree_Bare_2_B_Color1', 'seco_2'],
  ['Bush_1_A_Color1', 'mata_1'], ['Bush_2_A_Color1', 'mata_2'], ['Bush_4_A_Color1', 'mata_3'],
  ['Grass_1_A_Color1', 'hierba_1'], ['Grass_2_B_Color1', 'hierba_2'],
  ['Rock_1_A_Color1', 'roca_1'], ['Rock_1_E_Color1', 'roca_2'], ['Rock_2_C_Color1', 'roca_3'],
  ['Rock_3_A_Color1', 'roca_4'], ['Rock_3_H_Color1', 'roca_5'],
];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
// Las 17 piezas comparten la MISMA textura de paleta. Guardarlas por separado
// significaba 17 copias del PNG (895 KB para unos pocos polígonos), así que se
// empaquetan en un único GLB con un nodo por pieza y una sola textura.
const doc = await io.read(`${PACK}/${PIEZAS[0][0]}.gltf`);
const escena = doc.getRoot().listScenes()[0];
for (const nodo of escena.listChildren()) nodo.setName(PIEZAS[0][1]);

for (const [origen, nombre] of PIEZAS.slice(1)) {
  const src = await io.read(`${PACK}/${origen}.gltf`);
  const mapa = mergeDocuments(doc, src);
  const escenaSrc = mapa.get(src.getRoot().listScenes()[0]);
  for (const nodo of escenaSrc.listChildren()) {
    nodo.setName(nombre);
    escena.addChild(nodo); // todas las piezas cuelgan de una escena única
  }
  escenaSrc.dispose();
}

await doc.transform(dedup(), prune(), unpartition(), meshopt({ encoder: MeshoptEncoder }));
const bin = await io.writeBinary(doc);
writeFileSync('public/models/nature.glb', bin);
const root = doc.getRoot();
console.log(
  `nature.glb ${Math.round(bin.length / 1024)} KB · piezas ${escena.listChildren().length}` +
    ` · mallas ${root.listMeshes().length} · materiales ${root.listMaterials().length}` +
    ` · texturas ${root.listTextures().length}`,
);
console.log('nombres:', escena.listChildren().map((n) => n.getName()).join(', '));
