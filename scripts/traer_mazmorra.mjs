// Empaqueta las piezas modulares del KayKit Dungeon Remastered en un único GLB
// con la textura de gradiente compartida, igual que hicimos con nature.glb.
//
// El kit está construido sobre una retícula de 4 m: los muros miden 4 de ancho
// por 4 de alto con el pivote centrado en X y la base en Y=0, y las losas
// grandes son 4x4 centradas. Eso es lo que permite encajarlas sin pensar.
//
// Fuente: https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 (CC0)

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { existsSync, writeFileSync } from 'node:fs';

const PACK = '/tmp/kaydungeon/addons/kaykit_dungeon_remastered/Assets/gltf';

// [fichero, nombre interno]. Los nombres son los que usa structures.ts.
const PIEZAS = [
  // --- estructura ---
  ['wall', 'muro'],
  ['wall_cracked', 'muro_agrietado'],
  ['wall_broken', 'muro_roto'],
  ['wall_half', 'muro_bajo'],
  ['wall_corner', 'muro_esquina'],
  ['wall_doorway', 'muro_puerta'],
  ['wall_arched', 'muro_arco'],
  ['wall_window_open', 'muro_ventana'],
  ['wall_endcap', 'muro_remate'],
  ['wall_pillar', 'muro_pilar'],
  // --- suelos ---
  ['floor_tile_large', 'losa'],
  ['floor_tile_large_rocks', 'losa_rota'],
  ['floor_tile_small', 'losa_pequena'],
  ['floor_tile_small_weeds_A', 'losa_hierba'],
  ['floor_dirt_large', 'tierra'],
  // --- escaleras y verticales ---
  ['stairs', 'escalera'],
  ['stairs_wide', 'escalera_ancha'],
  ['stairs_narrow', 'escalera_estrecha'],
  ['column', 'columna'],
  ['pillar', 'pilar'],
  ['pillar_decorated', 'pilar_labrado'],
  // --- atrezo ---
  ['rubble_large', 'escombro'],
  ['rubble_half', 'escombro_bajo'],
  ['barrel_large', 'barril'],
  ['barrel_small_stack', 'barriles'],
  ['crates_stacked', 'cajas'],
  ['box_large', 'caja'],
  ['chest', 'cofre'],
  ['torch_mounted', 'antorcha'],
  ['banner_red', 'estandarte'],
  ['sword_shield', 'trofeo'],
  ['table_long_broken', 'mesa_rota'],
  ['shelf_large', 'estante'],
];

// el pack mezcla dos convenciones de nombre de fichero
const ruta = (base) => {
  for (const ext of ['.gltf.glb', '.glb', '.gltf']) {
    if (existsSync(`${PACK}/${base}${ext}`)) return `${PACK}/${base}${ext}`;
  }
  throw new Error(`no encuentro la pieza ${base}`);
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

// Medir antes de fusionar: necesito saber cuánto sube cada escalera para
// encajarlas con la altura de muro (4 m) sin adivinar.
async function medir(doc) {
  const c = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  for (const m of doc.getRoot().listMeshes()) {
    for (const pr of m.listPrimitives()) {
      const pos = pr.getAttribute('POSITION');
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        for (let k = 0; k < 3; k++) {
          c[0][k] = Math.min(c[0][k], v[k]);
          c[1][k] = Math.max(c[1][k], v[k]);
        }
      }
    }
  }
  return c;
}

const doc = await io.read(ruta(PIEZAS[0][0]));
const escena = doc.getRoot().listScenes()[0];
for (const nodo of escena.listChildren()) nodo.setName(PIEZAS[0][1]);
const medidas = [[PIEZAS[0][1], await medir(doc)]];

for (const [origen, nombre] of PIEZAS.slice(1)) {
  const src = await io.read(ruta(origen));
  medidas.push([nombre, await medir(src)]);
  const mapa = mergeDocuments(doc, src);
  const escenaSrc = mapa.get(src.getRoot().listScenes()[0]);
  for (const nodo of escenaSrc.listChildren()) {
    nodo.setName(nombre);
    escena.addChild(nodo);
  }
  escenaSrc.dispose();
}

// NADA de meshopt aquí, y es a propósito. La cuantización guarda los vértices
// como enteros y compensa con una escala en el nodo; three.js los marca como
// normalizados y la geometría deja de medir lo que dice medir. Para hojas de
// árbol da igual, pero esto es ARQUITECTURA: si un muro no mide exactamente 4
// metros, la retícula no cierra y se ven las juntas. 390 KB comprimidos no
// valen un muro de 2 metros.
await doc.transform(dedup(), prune(), unpartition());
const bin = await io.writeBinary(doc);
writeFileSync('public/models/dungeon.glb', bin);

const root = doc.getRoot();
console.log(
  `dungeon.glb ${Math.round(bin.length / 1024)} KB · piezas ${escena.listChildren().length}` +
    ` · mallas ${root.listMeshes().length} · materiales ${root.listMaterials().length}` +
    ` · texturas ${root.listTextures().length}`,
);
console.log('\nmedidas (ancho x alto x fondo, y base..techo):');
for (const [nombre, [min, max]] of medidas) {
  const t = max.map((v, i) => (v - min[i]).toFixed(2));
  console.log(
    `  ${nombre.padEnd(18)} ${t[0]} x ${t[1]} x ${t[2]}   y ${min[1].toFixed(2)}..${max[1].toFixed(2)}`,
  );
}
