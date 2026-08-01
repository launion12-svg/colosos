// Malla del lomo del coloso: muestrea LAS MISMAS funciones puras del sim
// (terrainHeight etc.) y pinta por vértice: pradera, roca en pendientes,
// hueso marfil sobre las vértebras.

import * as THREE from 'three';
import { fbm2 } from '../sim/rng';
import {
  COLOSSUS_LENGTH,
  COLOSSUS_WIDTH,
  GRASS_LIP,
  plateauTop,
  terrainHeight,
  terrainSteepness,
  vertebraFactor,
} from '../sim/terrain';

// Paleta a juego con la referencia: césped vivo y roca CLARA. La roca oscura
// de antes convertía las paredes en zanjas de barro.
const GRASS_A = new THREE.Color(0x66ab3e);
const GRASS_B = new THREE.Color(0x4d8f37);
const ROCK = new THREE.Color(0x9c9890);
const ROCK_DARK = new THREE.Color(0x746f68);
const ROCK_LIGHT = new THREE.Color(0xc8c4bb);
const BONE = new THREE.Color(0xe8ddc4);
const EDGE = new THREE.Color(0x3a3f52);

export function buildTerrainMesh(seed: number): THREE.Mesh {
  // margen extra para que los flancos se hundan visualmente en la niebla
  const width = COLOSSUS_WIDTH * 1.9;
  const length = COLOSSUS_LENGTH * 1.25;
  // Más resolución que antes: las paredes de las terrazas son estrechas y con
  // pocos vértices salían como rampas suaves en vez de cortes.
  const segX = 280;
  const segZ = 560;

  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2); // plano XZ, +Y arriba

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const pared = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z, seed);
    pos.setY(i, y);

    const steep = terrainSteepness(x, z, seed);
    const bone = vertebraFactor(x, z);
    const n = fbm2(x * 0.06 + 31, z * 0.06, seed + 5);

    // base: pradera con variación
    c.copy(GRASS_A).lerp(GRASS_B, n);
    // Roca en cuanto empina: la pared de la terraza. Se le pintan estratos
    // horizontales en función de la ALTURA, que es lo que hace que el corte
    // parezca piedra sedimentaria y no una rampa gris.
    // umbral bajo a propósito: la pared de una terraza ronda 0,9 de pendiente
    // y con el umbral antiguo salía verde, como una rampa de césped
    // El césped DESBORDA por el canto: los primeros centímetros de la pared
    // siguen siendo verdes. Es el detalle que hace que la placa parezca una
    // loncha de tierra con hierba encima y no un bloque pintado por arriba.
    const caida = plateauTop(x, z, seed) - y;
    const labio = 1 - THREE.MathUtils.smoothstep(caida, GRASS_LIP, GRASS_LIP * 2.2);
    const rockMix = THREE.MathUtils.smoothstep(steep, 0.28, 0.72) * (1 - labio);
    if (rockMix > 0.01) {
      const estrato = Math.sin(y * 6.5 + n * 1.2) * 0.5 + 0.5;
      pared.copy(ROCK).lerp(ROCK_DARK, estrato * 0.75);
      pared.lerp(ROCK_LIGHT, Math.pow(1 - estrato, 3) * 0.5); // la veta clara
      c.lerp(pared, rockMix);
    }
    // hueso en las coronas de las vértebras
    c.lerp(BONE, THREE.MathUtils.smoothstep(bone, 0.35, 0.8));
    // los flancos que caen a la niebla se oscurecen
    if (y < 0) c.lerp(EDGE, THREE.MathUtils.smoothstep(-y, 2, 22));

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
