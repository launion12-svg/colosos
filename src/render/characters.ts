// Carga de GLBs (meshopt) y vista animada de personaje.
// Cada instancia clona materiales: el flash de daño de un lobo no puede
// encender a los demás lobos.

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<GLTF>>();

export function loadGLB(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    cache.set(url, p);
  }
  return p;
}

export interface CharacterOpts {
  height: number; // altura objetivo en metros
  yawOffset?: number; // corrección si el modelo no mira a +Z
}

export class CharacterView {
  readonly group = new THREE.Group(); // posicionado por la entidad
  readonly visual = new THREE.Group(); // hijo para squash & stretch
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  readonly meshes: THREE.Mesh[] = [];
  // armas montadas con orientación distinta en combate y reposo
  readonly mounts: {
    obj: THREE.Object3D;
    rot?: [number, number, number];
    restRot?: [number, number, number];
  }[] = [];
  readonly yawOffset: number;
  baseScale = 1;

  constructor(gltf: GLTF, opts: CharacterOpts) {
    this.yawOffset = opts.yawOffset ?? 0;
    const root = SkeletonUtils.clone(gltf.scene);

    // Normaliza la altura midiendo los vértices CON el esqueleto aplicado
    // (receta de WoC): un Box3 normal ignora el skinning, y en rigs con el
    // armazón escalado (goblin, yeti) sale una caja falsa que encoge el
    // modelo a miniatura.
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    const v = new THREE.Vector3();
    root.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      sm.skeleton.update();
      const pos = sm.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        sm.applyBoneTransform(i, v);
        v.applyMatrix4(sm.matrixWorld);
        bounds.expandByPoint(v);
      }
    });
    // modelos sin esqueleto: la caja clásica sirve
    if (bounds.isEmpty()) bounds.setFromObject(root);
    const h = Math.max(0.001, bounds.max.y - bounds.min.y);
    this.baseScale = opts.height / h;
    root.scale.setScalar(this.baseScale);
    root.position.y = -bounds.min.y * this.baseScale;

    // materiales por instancia + sombras + lista de meshes para el flash
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else {
          mesh.material = mesh.material.clone();
        }
        this.meshes.push(mesh);
      }
    });

    this.visual.add(root);
    this.group.add(this.visual);

    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  // Cuelga un objeto (arma, escudo) de un hueso del rig. GLTFLoader sanea los
  // nombres de nodo ('handslot.l' -> 'handslotl'), así que comparamos
  // normalizando. El objeto hereda la escala del rig: los kits KayKit están
  // autorados a la misma escala, así que encaja sin más.
  // Enseña u oculta piezas del cuerpo por nombre de malla. Es lo que permite
  // quitarse el yelmo y salir a cara descubierta sin un modelo aparte.
  setPieceVisible(nombres: string[], visible: boolean): void {
    if (nombres.length === 0) return;
    for (const m of this.meshes) {
      const n = m.name;
      if (nombres.some((x) => n === x || n.endsWith(`_${x}`))) m.visible = visible;
    }
  }

  attach(boneName: string, object: THREE.Object3D): boolean {
    const want = boneName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let bone: THREE.Object3D | null = null;
    this.visual.traverse((o) => {
      if (!bone && o.name.toLowerCase().replace(/[^a-z0-9]/g, '') === want) bone = o;
    });
    if (!bone) return false;
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    (bone as THREE.Object3D).add(object);
    return true;
  }

  // Reproduce con crossfade. once = animación de disparo único que se queda
  // clavada en el último frame (muerte) o vuelve sola (la gestiona el caller).
  play(name: string, opts: { fade?: number; once?: boolean; timeScale?: number } = {}): void {
    if (this.currentName === name && !opts.once) {
      // misma animación: solo refresca la velocidad (p. ej. correr vs esprintar)
      if (opts.timeScale !== undefined && this.current) this.current.timeScale = opts.timeScale;
      return;
    }
    const next = this.actions.get(name);
    if (!next) return;
    const fade = opts.fade ?? 0.16;
    next.reset();
    next.timeScale = opts.timeScale ?? 1;
    if (opts.once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (this.current && this.current !== next) {
      next.crossFadeFrom(this.current, fade, false);
    }
    next.play();
    this.current = next;
    this.currentName = name;
  }

  playing(): string {
    return this.currentName;
  }

  // ¿La acción actual sigue reproduciéndose? (false cuando un one-shot acaba)
  isRunning(): boolean {
    return this.current?.isRunning() ?? false;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
