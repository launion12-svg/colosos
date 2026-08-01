// Cámara en tercera persona con peso: pivote amortiguado, look-ahead en la
// dirección del movimiento, FOV dinámico con la velocidad, colisión con el
// terreno y punch de zoom en impactos. El shake se SUMA al final.

import * as THREE from 'three';
import { terrainHeight } from '../sim/terrain';
import { RUN_SPEED } from '../sim/types';

const BASE_FOV = 66;
const MAX_FOV_BOOST = 13;
const PIVOT_DECAY = 14;
const LOOKAHEAD_DECAY = 4.5;
const FOV_DECAY = 4;
const ZOOM_DECAY = 8;
const HEIGHT = 1.7;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private pivot = new THREE.Vector3();
  private lookAhead = new THREE.Vector3();
  private fovBoost = 0;
  private fovPunch = 0;
  private dist = 7.2; // distancia amortiguada (el zoom no pega saltos)
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 1500);
  }

  punch(amount = 5): void {
    this.fovPunch = Math.max(this.fovPunch, amount);
  }

  update(
    dt: number,
    target: THREE.Vector3,
    vel: THREE.Vector3,
    camYaw: number,
    camPitch: number,
    camDist: number,
    seed: number,
    shake: { ox: number; oy: number; roll: number },
  ): void {
    const k = (decay: number) => 1 - Math.exp(-decay * dt);

    // pivote amortiguado que persigue al jugador
    if (!this.initialized) {
      this.pivot.copy(target);
      this.initialized = true;
    }
    this.pivot.lerp(target, k(PIVOT_DECAY));

    // look-ahead: la cámara anticipa hacia donde te mueves
    const desiredAhead = new THREE.Vector3(vel.x, 0, vel.z).multiplyScalar(0.32);
    this.lookAhead.lerp(desiredAhead, k(LOOKAHEAD_DECAY));

    const focus = this.pivot.clone().add(this.lookAhead);
    focus.y += HEIGHT;

    // posición orbital: pitch positivo = cámara ARRIBA mirando hacia abajo
    // (el forward hacia el foco lleva -sin(pitch) en Y)
    const cp = Math.cos(camPitch);
    const dir = new THREE.Vector3(
      Math.sin(camYaw) * cp,
      -Math.sin(camPitch),
      Math.cos(camYaw) * cp,
    );
    this.dist += (camDist - this.dist) * k(ZOOM_DECAY);
    const desired = focus.clone().addScaledVector(dir, -this.dist);

    // no atravieses el suelo
    const ground = terrainHeight(desired.x, desired.z, seed);
    if (desired.y < ground + 0.6) desired.y = ground + 0.6;

    this.camera.position.copy(desired);

    // FOV: velocidad + punch de impacto
    const speed = Math.hypot(vel.x, vel.z);
    // esprintar supera RUN_SPEED: el FOV sigue abriéndose (hasta 1.5x)
    const targetBoost = MAX_FOV_BOOST * Math.min(1.5, speed / RUN_SPEED);
    this.fovBoost += (targetBoost - this.fovBoost) * k(FOV_DECAY);
    this.fovPunch = Math.max(0, this.fovPunch - dt * 34);
    this.camera.fov = BASE_FOV + this.fovBoost - this.fovPunch;
    this.camera.updateProjectionMatrix();

    this.camera.lookAt(focus);

    // shake: offsets sobre la pose final, nunca pisando la base
    this.camera.position.x += shake.ox;
    this.camera.position.y += shake.oy;
    this.camera.rotation.z += shake.roll;
  }
}
