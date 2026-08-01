// Malla del lomo del coloso: muestrea LAS MISMAS funciones puras del sim
// (terrainHeight etc.) y pinta por vértice: pradera, roca en pendientes,
// hueso marfil sobre las vértebras.

import * as THREE from 'three';
import { fbm2 } from '../sim/rng';
import {
  COLOSSUS_LENGTH,
  COLOSSUS_WIDTH,
  terrainHeight,
  terrainSteepness,
  vertebraFactor,
} from '../sim/terrain';

const GRASS_A = new THREE.Color(0x5a9440);
const GRASS_B = new THREE.Color(0x3f7a35);
const ROCK = new THREE.Color(0x6e6a66);
const ROCK_DARK = new THREE.Color(0x4a4a4c);
const BONE = new THREE.Color(0xe8ddc4);
const EDGE = new THREE.Color(0x3a3f52);

export function buildTerrainMesh(seed: number): THREE.Mesh {
  // margen extra para que los flancos se hundan visualmente en la niebla
  const width = COLOSSUS_WIDTH * 1.9;
  const length = COLOSSUS_LENGTH * 1.25;
  const segX = 150;
  const segZ = 300;

  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2); // plano XZ, +Y arriba

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

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
    // roca en cuanto empina
    const rockMix = THREE.MathUtils.smoothstep(steep, 0.55, 1.15);
    c.lerp(n > 0.5 ? ROCK : ROCK_DARK, rockMix);
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
