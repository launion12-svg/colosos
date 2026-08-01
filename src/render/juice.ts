// Game feel: screen shake amortiguado, hitstop, flash de daño, squash &
// stretch, partículas y números de daño. Todo con dt y curvas, nada por frame.

import * as THREE from 'three';

// --- Screen shake (trauma con caída cuadrática y ruido) ---
const TRAUMA_DECAY = 1.7;
const MAX_OFFSET = 0.24;
const MAX_ROLL = 0.07;
const FREQUENCY = 24;

export class CameraShake {
  private trauma = 0;
  private time = 0;

  request(amount: number): void {
    this.trauma = Math.min(1, Math.max(this.trauma, amount));
  }

  update(dt: number): { ox: number; oy: number; roll: number } {
    if (this.trauma <= 0) return { ox: 0, oy: 0, roll: 0 };
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    this.time += dt * FREQUENCY;
    const s = this.trauma * this.trauma; // el final se apaga suave
    return {
      ox: MAX_OFFSET * s * (Math.sin(this.time * 1.1) + Math.sin(this.time * 2.3) * 0.5),
      oy: MAX_OFFSET * s * (Math.cos(this.time * 0.9) + Math.sin(this.time * 2.9) * 0.5),
      roll: MAX_ROLL * s * Math.sin(this.time * 1.7),
    };
  }
}

// --- Hitstop: congela el tiempo unos ms en el impacto ---
export class Hitstop {
  private remaining = 0; // segundos de tiempo REAL

  freeze(duration = 0.06): void {
    this.remaining = Math.max(this.remaining, duration);
  }

  // devuelve la escala de tiempo a aplicar este frame y consume el hitstop
  scale(realDt: number): number {
    if (this.remaining <= 0) return 1;
    this.remaining -= realDt;
    return 0.05;
  }
}

// --- Flash de daño sobre los materiales de una vista ---
// Un registro POR MATERIAL: si dos flashes se solapan (golpe + subida de
// nivel), el segundo NO recaptura el color ya teñido como "original" — ese
// era el bug del brillo que se quedaba pegado. El original se captura solo
// la primera vez y se restaura cuando el último flash del material expira.
interface ActiveFlash {
  mat: THREE.MeshStandardMaterial;
  emissive: THREE.Color; // el color original de verdad
  intensity: number;
  t: number;
}

export class FlashPool {
  private byMat = new Map<THREE.MeshStandardMaterial, ActiveFlash>();

  flash(meshes: THREE.Mesh[], color = 0xffffff, duration = 0.09): void {
    for (const mesh of meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat.emissive) continue;
        let f = this.byMat.get(mat);
        if (!f) {
          f = {
            mat,
            emissive: mat.emissive.clone(),
            intensity: mat.emissiveIntensity,
            t: duration,
          };
          this.byMat.set(mat, f);
        } else {
          f.t = Math.max(f.t, duration); // extiende, sin recapturar originales
        }
        mat.emissive.setHex(color);
        mat.emissiveIntensity = 2.2;
      }
    }
  }

  update(dt: number): void {
    for (const [mat, f] of this.byMat) {
      f.t -= dt;
      if (f.t <= 0) {
        mat.emissive.copy(f.emissive);
        mat.emissiveIntensity = f.intensity;
        this.byMat.delete(mat);
      }
    }
  }
}

// --- Squash & stretch con retorno elástico (sobre el nodo visual, jamás
// sobre el grupo raíz que posiciona la física) ---
interface SquashState {
  target: THREE.Object3D;
  t: number;
  dur: number;
  from: THREE.Vector3;
}

const ONE = new THREE.Vector3(1, 1, 1);

export class SquashPool {
  private active: SquashState[] = [];

  // amount > 0: aplastado (aterrizar); amount < 0: estirado (despegar)
  squash(target: THREE.Object3D, amount = 0.25, dur = 0.24): void {
    // sustituye cualquier squash en curso del mismo nodo
    this.active = this.active.filter((s) => s.target !== target);
    const from = new THREE.Vector3(1 + amount, 1 - amount, 1 + amount);
    target.scale.copy(from);
    this.active.push({ target, t: 0, dur, from });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      // elastic-out: vuelve a escala 1 con un pequeño rebote
      const k = 1 - Math.pow(2, -10 * u) * Math.cos(u * 9.5);
      s.target.scale.lerpVectors(s.from, ONE, k);
      if (u >= 1) {
        s.target.scale.set(1, 1, 1);
        this.active.splice(i, 1);
      }
    }
  }
}

// --- Partículas one-shot (impactos, polvo, muerte) ---
interface Burst {
  points: THREE.Points;
  vels: Float32Array;
  life: number;
  maxLife: number;
  gravity: number;
  mat: THREE.PointsMaterial;
}

export class ParticleSystem {
  private bursts: Burst[] = [];

  constructor(private scene: THREE.Scene) {}

  burst(
    pos: THREE.Vector3,
    opts: {
      count?: number;
      color?: number;
      speed?: number;
      life?: number;
      size?: number;
      gravity?: number;
      up?: number; // sesgo hacia arriba de las velocidades
    } = {},
  ): void {
    const count = opts.count ?? 14;
    const positions = new Float32Array(count * 3);
    const vels = new Float32Array(count * 3);
    const speed = opts.speed ?? 5;
    const up = opts.up ?? 0.5;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const r = (0.4 + Math.random() * 0.6) * speed;
      vels[i * 3] = Math.sin(a) * r;
      vels[i * 3 + 1] = (Math.random() * 0.9 + up) * speed * 0.8;
      vels[i * 3 + 2] = Math.cos(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: opts.color ?? 0xffffff,
      size: opts.size ?? 0.14,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    const life = opts.life ?? 0.4;
    this.bursts.push({ points, vels, life, maxLife: life, gravity: opts.gravity ?? 14, mat });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.mat.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < pos.count; j++) {
        b.vels[j * 3 + 1] -= b.gravity * dt;
        pos.setXYZ(
          j,
          pos.getX(j) + b.vels[j * 3] * dt,
          pos.getY(j) + b.vels[j * 3 + 1] * dt,
          pos.getZ(j) + b.vels[j * 3 + 2] * dt,
        );
      }
      pos.needsUpdate = true;
      b.mat.opacity = Math.min(1, (b.life / b.maxLife) * 1.6);
    }
  }
}

// --- Números de daño flotantes (DOM proyectado) ---
interface DamageNumber {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  dur: number;
}

export class DamageNumbers {
  private active: DamageNumber[] = [];
  private v = new THREE.Vector3();

  constructor(private container: HTMLElement) {}

  spawn(
    pos: THREE.Vector3,
    text: string,
    cls:
      | 'dmg'
      | 'dmg-in'
      | 'xp'
      | 'ding'
      | 'blocked'
      | 'loot-magic'
      | 'crit'
      | 'dot'
      | 'heal',
  ): void {
    const el = document.createElement('div');
    el.className = `fct ${cls}`;
    el.textContent = text;
    this.container.appendChild(el);
    this.active.push({ el, pos: pos.clone(), t: 0, dur: 0.9 });
  }

  update(dt: number, camera: THREE.Camera): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.t += dt;
      if (d.t >= d.dur) {
        d.el.remove();
        this.active.splice(i, 1);
        continue;
      }
      const u = d.t / d.dur;
      this.v.copy(d.pos);
      this.v.y += u * 1.4; // sube
      this.v.project(camera);
      if (this.v.z > 1) {
        d.el.style.display = 'none';
        continue;
      }
      d.el.style.display = '';
      const x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
      d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      d.el.style.opacity = String(u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3);
    }
  }
}
