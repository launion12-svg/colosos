// Fábrica de iconos: renderiza un GLB a miniatura (dataURL) con luz y
// encuadre fijos. Los iconos del inventario son renders reales de los
// modelos, como los de Diablo — cero arte extra, y cualquier arma futura
// trae su icono gratis.

import * as THREE from 'three';
import { loadGLB } from '../render/characters';
import { tintWeapon } from '../render/weapon_tint';

const SIZE = 128; // celdas de 62px en pantallas retina

export class IconFactory {
  private renderer: THREE.WebGLRenderer | null = null;
  private cache = new Map<string, Promise<string>>();

  private ensureRenderer(): THREE.WebGLRenderer {
    if (!this.renderer) {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true, // necesario para toDataURL
      });
      this.renderer.setSize(SIZE, SIZE, false);
      this.renderer.setClearColor(0x000000, 0);
    }
    return this.renderer;
  }

  // rarity < 0: sin tintar (retratos de personaje)
  icon(modelPath: string, rarity = -1): Promise<string> {
    const key = `${modelPath}#${rarity}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.bake(modelPath, rarity);
      this.cache.set(key, p);
    }
    return p;
  }

  private async bake(modelPath: string, rarity: number): Promise<string> {
    const gl = this.ensureRenderer();
    const gltf = await loadGLB(modelPath);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404860, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    scene.add(key);

    const model = gltf.scene.clone(true);
    if (rarity >= 0) tintWeapon(model, rarity); // el icono luce su calidad
    // pose de escaparate: tres cuartos y en diagonal — un arma larga
    // aprovecha así la diagonal de la celda (~1,41x su lado) y se ve grande
    model.rotation.y = Math.PI * 0.18;
    model.rotation.z = Math.PI * 0.2;
    scene.add(model);

    // Encuadre calculado, no a ojo: distancia = (mitad del lado mayor) /
    // tan(fov/2), por un margen. Así ningún arma larga se sale del icono.
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const FOV = 34;
    const MARGEN = 1.08; // aire mínimo: la diagonal ya da holgura
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200);
    const dist = (maxDim / 2 / Math.tan((FOV * Math.PI) / 360)) * MARGEN;
    cam.position.copy(center).addScaledVector(new THREE.Vector3(0.42, 0.32, 1).normalize(), dist);
    cam.lookAt(center);

    gl.render(scene, cam);
    const url = (gl.domElement as HTMLCanvasElement).toDataURL('image/png');
    // limpieza: geometrías clonadas comparten buffers con la caché, no dispose
    scene.clear();
    return url;
  }
}

export const iconFactory = new IconFactory();
