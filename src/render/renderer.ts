// El renderer compone la escena: terreno, cielo, niebla, personajes,
// vegetación y vida ambiental. Lee el sim (interpolando entre ticks);
// jamás lo muta.

import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import { MIST_LEVEL, generateDecorations } from '../sim/terrain';
import type { Entity, SimEvent } from '../sim/types';
import { HARD_LANDING_SPEED } from '../sim/types';
import { CameraRig } from './camera_rig';
import { CharacterView, loadGLB } from './characters';
import { DayNight, darkness } from './day_night';
import {
  CameraShake,
  DamageNumbers,
  FlashPool,
  Hitstop,
  ParticleSystem,
  SquashPool,
} from './juice';
import { buildTerrainMesh } from './terrain_mesh';
import { tintWeapon } from './weapon_tint';
import type { AudioSink } from '../game/audio';
import { CLASSES, weaponName, type ClassDef } from '../game/classes';
import { CLASS_ABILITY, WEAPON_SET_INFO } from '../sim/abilities';
import { BESTIARY } from '../sim/bestiary';
import { RARITY_NAMES } from '../sim/abilities';

const RARITY_COLORS = [0xf0f0e8, 0x5cb0ff, 0xffd35c]; // común, mágica, rara

// Firma visual de cada proyectil, por su `kind`. Una flecha se estira en el
// sentido del vuelo; una brasa de niebla es un orbe con halo y estela.
interface ProjStyle {
  radius: number;
  color: number;
  stretch?: boolean; // asta alargada (flechas)
  halo?: number; // esfera exterior translúcida
  haloOpacity?: number; // por defecto 0.32
  trail?: number; // color de la estela en vuelo
  burst: number; // partículas al reventar
}

const PROJ_STYLE: Record<string, ProjStyle> = {
  flecha: { radius: 0.14, color: 0xd8dce8, stretch: true, burst: 8 },
  disparo_certero: { radius: 0.15, color: 0xffe2a0, stretch: true, halo: 0xffc24d, burst: 12 },
  brasa: {
    radius: 0.24,
    color: 0xc08cff,
    halo: 0x8a3cff,
    haloOpacity: 0.5,
    trail: 0xb98cff,
    burst: 14,
  },
  chispa_niebla: { radius: 0.3, color: 0x7fe8e0, halo: 0x39c8bc, trail: 0x7fe8e0, burst: 20 },
  // las de la tecla 2: más grandes, se leen desde lejos
  lluvia_astillas: {
    radius: 0.34,
    color: 0xffe2a0,
    halo: 0xffb03c,
    haloOpacity: 0.45,
    trail: 0xffc86a,
    burst: 26,
  },
  aliento_toxico: {
    radius: 0.55,
    color: 0xb8e86a,
    halo: 0x5f9c2a,
    haloOpacity: 0.45,
    trail: 0x9ad84a,
    burst: 34,
  },
};

const PROJ_FALLBACK: ProjStyle = { radius: 0.16, color: 0xd8dce8, stretch: true, burst: 8 };
const projStyle = (kind: string): ProjStyle => PROJ_STYLE[kind] ?? PROJ_FALLBACK;
import type { Hud } from '../ui/hud';

interface Wisp {
  group: THREE.Group;
  baseY: number;
  phase: number;
  mats: THREE.MeshStandardMaterial[];
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly dayNight: DayNight;
  readonly shake = new CameraShake();
  readonly hitstop = new Hitstop();
  readonly flash = new FlashPool();
  readonly squash = new SquashPool();
  readonly particles: ParticleSystem;
  readonly damageNumbers: DamageNumbers;

  private views = new Map<number, CharacterView>();
  private stars!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private mistPlanes: THREE.Mesh[] = [];
  private mistMats: THREE.MeshBasicMaterial[] = [];
  private wisps: Wisp[] = [];
  private projMeshes = new Map<number, THREE.Mesh>();
  private tmp = new THREE.Vector3();
  private tmpVel = new THREE.Vector3();
  private tmpColor = new THREE.Color();
  private elapsed = 0;

  // vistas de héroe por set de arma (la inicial precargada; el resto,
  // perezosas: se construyen cuando el arma cae del mundo)
  private heroViews = new Map<string, CharacterView>();
  private setDefs = new Map<string, ClassDef>();
  private activeDef: ClassDef;
  private initialSets: string[];
  // Gestos de una sola vez que mandan sobre la animación de marcha mientras
  // duran. Sin esto, dar un paso al beber cortaba el trago por la mitad.
  private static readonly GESTOS: Record<string, { ts: number; dur: number }> = {
    Use_Item: { ts: 1.35, dur: 1.18 }, // beber la poción
    PickUp: { ts: 1.5, dur: 0.86 }, // recoger del suelo
    Jump_Start: { ts: 1.6, dur: 0.37 },
    Jump_Land: { ts: 1.5, dur: 0.44 },
    Spawn_Ground: { ts: 1.2, dur: 1.08 },
  };
  private gestoHasta = -99; // reloj hasta el que el gesto en curso no se toca
  private dodgeLean = 0; // inclinación del cuerpo durante el quiebro
  private sitStartedAt = -99; // cuándo empezó el gesto de sentarse
  private potionVisuals = new Map<number, THREE.Group>();
  private dropVisuals = new Map<number, { group: THREE.Group; weapon: THREE.Object3D }>();

  constructor(
    gl: THREE.WebGLRenderer,
    private sim: Sim,
    private audio: AudioSink,
    private hud: Hud,
    defA: ClassDef,
    defB?: ClassDef,
  ) {
    for (const d of CLASSES) this.setDefs.set(d.id, d); // todas: los drops pueden ser de cualquiera
    this.activeDef = defA;
    this.initialSets = defB ? [defA.id, defB.id] : [defA.id];
    this.renderer = gl;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.rig.camera.aspect = window.innerWidth / window.innerHeight;
      this.rig.camera.updateProjectionMatrix();
    });

    this.scene.fog = new THREE.Fog(0xb8d8f0, 60, 420);
    this.dayNight = new DayNight(this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.damageNumbers = new DamageNumbers(hud.fctContainer);

    // terreno
    const terrain = buildTerrainMesh(sim.seed);
    this.scene.add(terrain);

    this.buildMist();
    this.buildStars();
  }

  private buildMist(): void {
    // el mar de niebla tóxica: planos enormes superpuestos con deriva lenta
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xafcce0,
        transparent: true,
        opacity: i === 0 ? 0.85 : 0.45,
        depthWrite: false,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = MIST_LEVEL + i * 2.4;
      plane.renderOrder = 2;
      this.scene.add(plane);
      this.mistPlanes.push(plane);
      this.mistMats.push(mat);
    }
  }

  private buildStars(): void {
    const N = 900;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // esfera superior
      const a = Math.random() * Math.PI * 2;
      const el = Math.asin(Math.random());
      const r = 850;
      positions[i * 3] = Math.cos(a) * Math.cos(el) * r;
      positions[i * 3 + 1] = Math.sin(el) * r + 20;
      positions[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xdde8ff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  // Carga los GLBs y crea las vistas. Llamar antes de arrancar el bucle.
  async loadAssets(): Promise<void> {
    const [oak1, oak3, pine, bush, wisp] = await Promise.all([
      loadGLB('models/oak_1.glb'),
      loadGLB('models/oak_3.glb'),
      loadGLB('models/pine_1.glb'),
      loadGLB('models/bush.glb'),
      loadGLB('models/duskwisp.glb'),
    ]);

    // vistas de los sets con los que arrancas; las de armas futuras se
    // construyen al lootearlas. Tu arma es tu clase.
    for (const id of this.initialSets) await this.ensureHeroView(id);
    this.views.set(this.sim.player.id, this.heroViews.get(this.activeDef.id)!);

    // el bestiario: cada criatura con su modelo, escala y animaciones
    for (const m of this.sim.mobs()) {
      const t = BESTIARY[m.templateId];
      if (!t) continue;
      const gltf = await loadGLB(t.model);
      const v = new CharacterView(gltf, { height: t.height });
      v.play(t.anims.idle);
      this.scene.add(v.group);
      this.views.set(m.id, v);
    }

    // vegetación y wisps ambientales, deterministas de la semilla
    const templates = { oak: [oak1, oak3], pine: [pine], bush: [bush] } as const;
    const decos = generateDecorations(this.sim.seed);
    let ti = 0;
    for (const d of decos) {
      if (d.type === 'wisp') {
        const g = wisp.scene.clone(true);
        const mats: THREE.MeshStandardMaterial[] = [];
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            const arr = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of arr) {
              const sm = m as THREE.MeshStandardMaterial;
              if (sm.emissive) mats.push(sm);
            }
          }
        });
        const group = new THREE.Group();
        g.scale.setScalar(d.scale * 1.4);
        group.add(g);
        group.position.set(d.x, d.y, d.z);
        this.scene.add(group);
        this.wisps.push({ group, baseY: d.y, phase: d.rot, mats });
        continue;
      }
      const list = templates[d.type];
      const src = list[ti++ % list.length];
      const g = src.scene.clone(true);
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = true;
      });
      g.scale.setScalar(d.scale * (d.type === 'bush' ? 0.85 : 1.1));
      g.rotation.y = d.rot;
      g.position.set(d.x, d.y - 0.1, d.z);
      this.scene.add(g);
    }
  }

  // Construye (una vez) la vista de un set: cuerpo + armas montadas.
  private async ensureHeroView(setId: string): Promise<CharacterView | undefined> {
    const cached = this.heroViews.get(setId);
    if (cached) return cached;
    const def = this.setDefs.get(setId);
    if (!def) return undefined;
    const hero = await loadGLB(def.model);
    const pv = new CharacterView(hero, { height: 1.85 });
    pv.play('Idle');
    for (const w of def.weapons) {
      const weapon = await loadGLB(w.model);
      const obj = new THREE.Group();
      obj.add(weapon.scene.clone(true));
      // pequeño margen para que los dedos low-poly no asomen (p. ej. escudo)
      if (w.offset) obj.position.set(...w.offset);
      // arranca en la orientación de reposo (el combate la conmuta al vuelo)
      const startRot = w.restRot ?? w.rot;
      if (startRot) obj.rotation.set(...startRot);
      pv.attach(w.bone, obj);
      // todas las monturas se registran: el tinte por calidad las recorre
      pv.mounts.push({ obj, rot: w.rot, restRot: w.restRot });
    }
    pv.group.visible = setId === this.activeDef.id && this.heroViews.size === 0;
    if (this.heroViews.size === 0) pv.group.visible = setId === this.activeDef.id;
    else pv.group.visible = false;
    this.scene.add(pv.group);
    this.heroViews.set(setId, pv);
    this.applyWeaponTint(setId);
    return pv;
  }

  // Repinta las armas de un set con su calidad actual (madera/acero/oro).
  private applyWeaponTint(setId: string): void {
    const view = this.heroViews.get(setId);
    if (!view) return;
    const rarity = this.sim.player.weaponRarity[setId] ?? 0;
    for (const m of view.mounts) tintWeapon(m.obj, rarity);
  }

  // El haz de luz del loot: cilindro dorado + el arma flotando y girando.
  private async buildDropVisual(
    dropId: number,
    x: number,
    y: number,
    z: number,
    setId: string,
    rarity = 0,
  ) {
    const def = this.setDefs.get(setId);
    if (!def) return;
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.3, 3.2, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: RARITY_COLORS[rarity] ?? 0xf0f0e8,
        transparent: true,
        opacity: rarity > 0 ? 0.26 : 0.16, // las calidades altas brillan más
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 1.6;
    group.add(beam);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 20),
      new THREE.MeshBasicMaterial({
        color: RARITY_COLORS[rarity] ?? 0xffe89a,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    group.add(glow);
    const weaponGltf = await loadGLB(def.weapons[0].model);
    const weapon = weaponGltf.scene.clone(true);
    tintWeapon(weapon, rarity);
    weapon.position.y = 1.0;
    weapon.rotation.z = Math.PI / 5;
    group.add(weapon);
    group.position.set(x, y, z);
    this.scene.add(group);
    this.dropVisuals.set(dropId, { group, weapon });
  }

  view(id: number): CharacterView | undefined {
    return this.views.get(id);
  }

  // El HUD refleja los sets reales del jugador (A, y B si existe) y cuál manda.
  private refreshHudSets(): void {
    const p = this.sim.player;
    const info = (id: string) => {
      const ab = CLASS_ABILITY[id];
      return {
        id,
        nombre: ab.nombre,
        cooldown: ab.cooldown,
        desc: ab.desc,
        hasShield: WEAPON_SET_INFO[id]?.hasShield ?? false,
      };
    };
    const sets = [info(p.setA)];
    if (p.setB !== '') sets.push(info(p.setB));
    const activeId = p.activeSetB ? p.setB : p.setA;
    this.hud.setSets(sets, activeId);
  }

  // Traduce los hechos del sim a juice. Cada evento con impacto: feedback en
  // el objeto, en la cámara, en el tiempo y hook de audio.
  // Lanza un gesto del jugador si su rig lo tiene, y lo protege el tiempo que
  // dure. Si el modelo no lo trae, no pasa nada: el juego sigue igual.
  private gesto(id: number, nombre: string): void {
    const v = this.views.get(id);
    const g = GameRenderer.GESTOS[nombre];
    if (!v || !g || !v.has(nombre)) return;
    v.play(nombre, { once: true, fade: 0.08, timeScale: g.ts });
    this.gestoHasta = this.elapsed + g.dur;
  }

  // Para las capturas: la plantilla del bestiario de una especie
  bestiarioDe(id: string) {
    return BESTIARY[id];
  }

  onSimEvent(ev: SimEvent): void {
    const player = this.sim.player;
    switch (ev.type) {
      case 'swung': {
        const v = this.views.get(ev.id);
        if (!v) break;
        if (ev.id === player.id) {
          v.play(this.activeDef.attackAnim, {
            once: true,
            fade: 0.06,
            timeScale: this.activeDef.attackTimeScale,
          });
        } else {
          const t = BESTIARY[this.sim.entities.find((e) => e.id === ev.id)?.templateId ?? ''];
          v.play(t?.anims.attack ?? 'Attack', { once: true, fade: 0.08 });
        }
        this.audio.play('swing');
        break;
      }
      case 'hitLanded': {
        const target = this.sim.entities.find((e) => e.id === ev.targetId);
        const tv = this.views.get(ev.targetId);
        const pos = this.tmp.set(ev.x, ev.y, ev.z);
        // feedback en el objeto
        if (tv) {
          this.flash.flash(tv.meshes, ev.targetId === player.id ? 0xff5040 : 0xffffff);
          this.squash.squash(tv.visual, 0.16, 0.2);
          const tt = BESTIARY[target?.templateId ?? ''];
          if (!ev.killed && target?.kind === 'mob' && tt?.anims.hit && tv.has(tt.anims.hit)) {
            tv.play(tt.anims.hit, { once: true, fade: 0.05 });
          }
          if (!ev.killed && ev.targetId === player.id && tv.has('Hit_A')) {
            tv.play('Hit_A', { once: true, fade: 0.05 });
          }
        }
        // partículas del impacto
        this.particles.burst(pos, {
          count: ev.killed ? 26 : 14,
          color: ev.targetId === player.id ? 0xff6a50 : 0xffd890,
          speed: ev.killed ? 7 : 5,
          life: 0.32,
        });
        // cámara y tiempo
        if (ev.targetId === player.id) {
          this.shake.request(0.42);
          this.rig.punch(4);
          this.damageNumbers.spawn(pos, `-${ev.amount}`, 'dmg-in');
        } else {
          // el crítico se anuncia solo: número grande, naranja y más sacudida
          this.shake.request(ev.crit ? 0.5 : ev.killed ? 0.5 : 0.24);
          this.damageNumbers.spawn(pos, String(ev.amount), ev.crit ? 'crit' : 'dmg');
          if (ev.crit) {
            this.particles.burst(pos, {
              count: 18,
              color: 0xffb04a,
              speed: 7,
              life: 0.34,
              size: 0.16,
            });
          }
          if (target) this.hud.setTarget(target.id);
        }
        this.hitstop.freeze(ev.killed ? 0.09 : 0.045);
        this.audio.play(ev.killed ? 'hit_hard' : 'hit');
        break;
      }
      case 'dotDamage': {
        // el estado repica en pequeño: se ve que sigue ardiendo sin tapar el HUD
        const pos = this.tmp.set(ev.x, ev.y, ev.z);
        const color = ev.kind === 'quemadura' ? 0xff7a2a : ev.kind === 'veneno' ? 0x9be04a : 0xd44040;
        this.damageNumbers.spawn(pos, String(ev.amount), 'dot');
        this.particles.burst(pos, { count: 4, color, speed: 1.6, life: 0.4, gravity: -1, size: 0.1 });
        if (ev.killed) this.audio.play('hit_hard');
        break;
      }
      case 'healed': {
        const v = this.views.get(ev.id);
        if (v) this.flash.flash(v.meshes, 0x7fd8a0, 0.08);
        const p2 = this.sim.player;
        this.damageNumbers.spawn(this.tmp.set(p2.x, p2.y + 2, p2.z), `+${ev.amount}`, 'heal');
        break;
      }
      case 'jumped': {
        const v = this.views.get(ev.id);
        if (v) {
          this.squash.squash(v.visual, -0.18, 0.22); // estira al despegar
          if (ev.id === this.sim.player.id && v.has('Jump_Start')) {
            v.play('Jump_Start', { once: true, fade: 0.05, timeScale: 1.6 });
          } else v.play('Jump_Idle', { fade: 0.08 });
        }
        this.audio.play('jump');
        break;
      }
      case 'landed': {
        const v = this.views.get(ev.id);
        const e = this.sim.entities.find((x) => x.id === ev.id);
        const hard = ev.fallSpeed > HARD_LANDING_SPEED;
        if (v) this.squash.squash(v.visual, hard ? 0.32 : 0.16, hard ? 0.3 : 0.2);
        // el aterrizaje duro se acompaña: rodilla al suelo
        if (hard && ev.id === this.sim.player.id) this.gesto(ev.id, 'Jump_Land');
        if (e) {
          this.particles.burst(this.tmp.set(e.x, e.y + 0.15, e.z), {
            count: hard ? 18 : 9,
            color: 0xcbb794,
            speed: hard ? 4.5 : 2.5,
            life: 0.38,
            up: 0.25,
            size: 0.12,
          });
        }
        if (hard) {
          this.shake.request(0.3);
          this.rig.punch(3);
        }
        this.audio.play(hard ? 'land_hard' : 'land');
        break;
      }
      case 'aggroed': {
        this.hud.setTarget(ev.id);
        this.audio.play('aggro');
        break;
      }
      case 'died': {
        const v = this.views.get(ev.id);
        if (v) {
          const t = BESTIARY[this.sim.entities.find((e) => e.id === ev.id)?.templateId ?? ''];
          v.play(ev.kind === 'player' ? 'Death_A' : (t?.anims.death ?? 'Death'), {
            once: true,
            fade: 0.1,
          });
        }
        const e = this.sim.entities.find((x) => x.id === ev.id);
        if (e) {
          this.particles.burst(this.tmp.set(e.x, e.y + 0.8, e.z), {
            count: 30,
            color: ev.kind === 'player' ? 0xff5040 : 0x9fc8e8,
            speed: 6,
            life: 0.55,
            gravity: 6,
          });
        }
        if (ev.kind === 'player') {
          this.shake.request(1.0);
          this.hitstop.freeze(0.12);
        }
        this.audio.play(ev.kind === 'player' ? 'death_player' : 'death_mob');
        break;
      }
      case 'respawned': {
        if (ev.kind === 'player') this.gesto(ev.id, 'Spawn_Ground');
        const v = this.views.get(ev.id);
        if (v) v.play('Idle', { fade: 0 });
        this.audio.play('respawn');
        break;
      }
      case 'xpGained': {
        const p = this.sim.player;
        this.damageNumbers.spawn(this.tmp.set(p.x, p.y + 2, p.z), `+${ev.amount} px`, 'xp');
        this.audio.play('xp');
        break;
      }
      case 'potionDropped': {
        // frasco simple: cristal rojo con tapón. Se lee a distancia y no
        // cuesta un modelo nuevo
        const g = new THREE.Group();
        const cuerpo = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 10, 8),
          new THREE.MeshStandardMaterial({
            color: 0xd8342a,
            emissive: 0x8a1810,
            emissiveIntensity: 0.7,
            roughness: 0.35,
          }),
        );
        cuerpo.position.y = 0.24;
        const cuello = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, 0.16, 8),
          new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.8 }),
        );
        cuello.position.y = 0.46;
        g.add(cuerpo, cuello);
        g.position.set(ev.x, ev.y, ev.z);
        this.scene.add(g);
        this.potionVisuals.set(ev.dropId, g);
        this.audio.play('loot_drop');
        break;
      }
      case 'potionPickedUp': {
        const g = this.potionVisuals.get(ev.dropId);
        if (g) {
          this.particles.burst(g.position.clone().setY(g.position.y + 0.5), {
            count: 14,
            color: 0xff6a50,
            speed: 4,
            life: 0.4,
            gravity: 4,
          });
          this.scene.remove(g);
          this.potionVisuals.delete(ev.dropId);
        }
        this.audio.play('loot_pickup');
        break;
      }
      case 'dodged': {
        // no hay animación de rodar en ningún rig: se finge con el correr de
        // lado (o hacia atrás), acelerado, más inclinación y polvo
        const v7 = this.views.get(ev.id);
        const p7 = this.sim.player;
        const rel = Math.atan2(ev.dirX, ev.dirZ) - p7.yaw;
        const c = Math.cos(rel);
        const sn = Math.sin(rel);
        let anim = 'Running_A';
        if (c < -0.4) anim = v7?.has('Walking_Backwards') ? 'Walking_Backwards' : 'Running_A';
        else if (sn < -0.4) anim = 'Running_Strafe_Right';
        else if (sn > 0.4) anim = 'Running_Strafe_Left';
        if (v7?.has(anim)) v7.play(anim, { fade: 0.04, timeScale: 1.9 });
        this.dodgeLean = sn * 0.5; // se inclina hacia donde salta
        this.particles.burst(this.tmp.set(p7.x, p7.y + 0.15, p7.z), {
          count: 16,
          color: 0xe4d3b0,
          speed: 3.4,
          life: 0.4,
          gravity: 5,
          size: 0.13,
        });
        this.shake.request(0.12);
        this.audio.play('jump');
        break;
      }
      case 'evaded': {
        // el golpe pasa de largo: se ve el fallo, que es medio premio
        this.damageNumbers.spawn(this.tmp.set(ev.x, ev.y, ev.z), 'esquivado', 'blocked');
        this.particles.burst(this.tmp.set(ev.x, ev.y - 0.3, ev.z), {
          count: 8,
          color: 0xbfd8ff,
          speed: 3,
          life: 0.25,
          size: 0.09,
        });
        this.audio.play('swing');
        break;
      }
      case 'sat': {
        const v6 = this.views.get(ev.id);
        this.sitStartedAt = this.elapsed;
        if (ev.sitting) {
          if (v6?.has('Sit_Floor_Down')) {
            v6.play('Sit_Floor_Down', { once: true, fade: 0.15 });
          }
          this.hud.toast('Descansando · te curas más rápido (C para levantarte)', 2200);
        } else if (v6) {
          v6.play('Idle', { fade: 0.15 });
        }
        this.audio.play('swap');
        break;
      }
      case 'regenTick': {
        // la curación pasiva se ve, pero en pequeñito: nada de tapar la pelea
        const p6 = this.sim.player;
        this.damageNumbers.spawn(this.tmp.set(p6.x, p6.y + 2.1, p6.z), `+${ev.amount}`, 'heal');
        break;
      }
      case 'potionDrunk': {
        this.gesto(this.sim.player.id, 'Use_Item');
        const p5 = this.sim.player;
        const v5 = this.views.get(p5.id);
        if (v5) this.flash.flash(v5.meshes, 0xff6a50, 0.12);
        this.particles.burst(this.tmp.set(p5.x, p5.y + 1, p5.z), {
          count: 22,
          color: 0xff8a70,
          speed: 3,
          life: 0.5,
          gravity: -2,
          up: 0.6,
        });
        this.audio.play('potion');
        break;
      }
      case 'lootDropped': {
        void this.buildDropVisual(ev.dropId, ev.x, ev.y, ev.z, ev.setId, ev.rarity);
        this.audio.play('loot_drop');
        break;
      }
      case 'lootPickedUp': {
        this.gesto(this.sim.player.id, 'PickUp');
        const vis = this.dropVisuals.get(ev.dropId);
        if (vis) {
          this.particles.burst(vis.group.position.clone().setY(vis.group.position.y + 1), {
            count: 26,
            color: 0xffd35c,
            speed: 5,
            life: 0.5,
            gravity: 5,
            up: 0.9,
          });
          this.scene.remove(vis.group);
          this.dropVisuals.delete(ev.dropId);
        }
        const def = this.setDefs.get(ev.setId);
        const p = this.sim.player;
        if (def) {
          const nombre = weaponName(ev.setId, ev.rarity);
          const texto = ev.upgraded ? `¡${nombre}! (mejora)` : `¡${nombre}!`;
          this.damageNumbers.spawn(
            this.tmp.set(p.x, p.y + 2.3, p.z),
            texto,
            ev.rarity === 2 ? 'ding' : ev.rarity === 1 ? 'loot-magic' : 'ding',
          );
        }
        // precarga la vista del nuevo set, repinta por si fue mejora de calidad
        void this.ensureHeroView(ev.setId).then(() => this.applyWeaponTint(ev.setId));
        this.refreshHudSets();
        this.shake.request(0.15);
        this.audio.play('loot_pickup');
        break;
      }
      case 'bagFull': {
        const def = this.setDefs.get(ev.setId);
        this.hud.toast(`Zurrón lleno · ${weaponName(ev.setId)} sigue en el suelo`);
        this.audio.play('bag_full');
        break;
      }
      case 'weaponEquipped': {
        // arma del zurrón al hueco guardado: precarga su vista y refresca HUD
        void this.ensureHeroView(ev.setId);
        this.refreshHudSets();
        this.audio.play('swap');
        break;
      }
      case 'weaponSwapped': {
        const next = this.setDefs.get(ev.setId);
        const nextView = this.heroViews.get(ev.setId);
        const current = this.views.get(ev.id);
        if (next && !nextView) {
          // la vista aún carga: aplica el cambio en cuanto exista
          void this.ensureHeroView(ev.setId).then(() => this.onSimEvent(ev));
          break;
        }
        if (next && nextView && current) {
          // el cuerpo cambia: destello de transición + el nuevo entra en Idle
          current.group.visible = false;
          nextView.group.position.copy(current.group.position);
          nextView.group.rotation.copy(current.group.rotation);
          nextView.group.visible = true;
          nextView.play('Idle', { fade: 0 });
          this.views.set(ev.id, nextView);
          this.activeDef = next;
          const p = this.sim.player;
          this.particles.burst(this.tmp.set(p.x, p.y + 1, p.z), {
            count: 18,
            color: 0xd8c8ff,
            speed: 3.5,
            life: 0.35,
            gravity: 2,
            size: 0.13,
          });
          this.flash.flash(nextView.meshes, 0xd8c8ff, 0.12);
          this.refreshHudSets();
          this.audio.play('swap');
        }
        break;
      }
      case 'abilityUsed': {
        const v = this.views.get(ev.id);
        const anims: Record<string, { anim: string; ts: number }> = {
          golpe_vertebra: { anim: '2H_Melee_Attack_Chop', ts: 1.15 },
          disparo_certero: { anim: '2H_Ranged_Shoot', ts: 1.5 },
          acometida: { anim: 'Dualwield_Melee_Attack_Chop', ts: 1.3 },
          // el básico ya usa Spellcast_Shoot: la habilidad alza el bastón para
          // que se distinga de un vistazo cuál de los dos estás lanzando
          chispa_niebla: { anim: 'Spellcast_Raise', ts: 2.4 },
          tajo_circular: { anim: '2H_Melee_Attack_Chop', ts: 0.85 },
          // las segundas habilidades, las que abre el árbol de talentos
          embate_escudo: { anim: '1H_Melee_Attack_Chop', ts: 1.4 },
          lluvia_astillas: { anim: '2H_Ranged_Shoot', ts: 1.2 },
          danza_cuchillas: { anim: 'Dualwield_Melee_Attack_Chop', ts: 1.1 },
          hachazo_sismico: { anim: '2H_Melee_Attack_Chop', ts: 0.7 },
          aliento_toxico: { anim: 'Spellcasting', ts: 1.1 },
        };
        const a = anims[ev.ability];
        if (v && a) v.play(a.anim, { once: true, fade: 0.06, timeScale: a.ts });
        if (ev.ability === 'golpe_vertebra') {
          this.shake.request(0.3);
          this.rig.punch(4);
        }
        if (ev.ability === 'hachazo_sismico') {
          // el sismo levanta un frente de polvo por delante, no un anillo
          const p3 = this.sim.player;
          for (let i = 0; i < 22; i++) {
            const ang = p3.yaw + (i / 21 - 0.5) * Math.PI * 1.1;
            this.particles.burst(
              this.tmp.set(p3.x + Math.sin(ang) * 3.6, p3.y + 0.25, p3.z + Math.cos(ang) * 3.6),
              { count: 3, color: 0xe4d3b0, speed: 3.4, life: 0.6, gravity: 3.4, size: 0.2 },
            );
          }
          this.shake.request(0.75);
          this.rig.punch(7);
        }
        if (ev.ability === 'danza_cuchillas') {
          const p4 = this.sim.player;
          for (let i = 0; i < 18; i++) {
            const ang = (i / 18) * Math.PI * 2;
            this.particles.burst(
              this.tmp.set(p4.x + Math.sin(ang) * 1.9, p4.y + 1, p4.z + Math.cos(ang) * 1.9),
              { count: 2, color: 0xd8e4ff, speed: 3, life: 0.35, size: 0.12 },
            );
          }
          this.shake.request(0.3);
        }
        if (ev.ability === 'tajo_circular') {
          // el giro no está en el rig: lo cuenta el anillo de polvo a ras de suelo
          const p = this.sim.player;
          for (let i = 0; i < 26; i++) {
            const ang = (i / 26) * Math.PI * 2;
            this.particles.burst(
              this.tmp.set(p.x + Math.sin(ang) * 2.6, p.y + 0.25, p.z + Math.cos(ang) * 2.6),
              { count: 2, color: 0xe4d3b0, speed: 2.2, life: 0.45, gravity: 3, size: 0.16 },
            );
          }
          this.shake.request(0.42);
          this.rig.punch(5);
        }
        this.audio.play('ability');
        break;
      }
      case 'projectileSpawned': {
        const st = projStyle(ev.kind);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(st.radius, 10, 8),
          new THREE.MeshBasicMaterial({ color: st.color }),
        );
        if (st.stretch) mesh.scale.set(0.5, 0.5, 2.4); // asta: alargada en vuelo
        if (st.halo !== undefined) {
          // el halo hace que el orbe se lea como energía y no como una bola
          const halo = new THREE.Mesh(
            new THREE.SphereGeometry(st.radius * 1.9, 10, 8),
            new THREE.MeshBasicMaterial({
              color: st.halo,
              transparent: true,
              opacity: st.haloOpacity ?? 0.32,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          mesh.add(halo);
        }
        mesh.position.set(ev.x, ev.y, ev.z);
        mesh.rotation.y = Math.atan2(ev.vx, ev.vz);
        this.scene.add(mesh);
        this.projMeshes.set(ev.pid, mesh);
        break;
      }
      case 'projectileGone': {
        const mesh = this.projMeshes.get(ev.pid);
        if (mesh) {
          this.scene.remove(mesh);
          // el orbe puede llevar halo como hijo: se limpia todo el subárbol
          mesh.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          });
          this.projMeshes.delete(ev.pid);
        }
        const st = projStyle(ev.kind);
        this.particles.burst(this.tmp.set(ev.x, ev.y, ev.z), {
          count: st.burst,
          color: st.trail ?? st.color,
          speed: 4.5,
          life: 0.3,
          gravity: st.trail ? 2 : 6, // la magia se disipa, la flecha cae
          size: 0.12,
        });
        break;
      }
      case 'blockedHit': {
        const tv = this.views.get(ev.targetId);
        const pos = this.tmp.set(ev.x, ev.y, ev.z);
        // el escudo suena y chispea, pero sin hit-react: aguantas firme
        if (tv) this.flash.flash(tv.meshes, 0x9fc8ff, 0.06);
        this.particles.burst(pos, {
          count: 10,
          color: 0xbfd8ff,
          speed: 4,
          life: 0.25,
          size: 0.1,
        });
        this.shake.request(0.12);
        this.damageNumbers.spawn(pos, ev.amount > 0 ? `-${ev.amount}` : 'bloqueado', 'blocked');
        this.hitstop.freeze(0.03);
        this.audio.play('block');
        break;
      }
      case 'leveledUp': {
        const p = this.sim.player;
        const v = this.views.get(p.id);
        // fanfarria: fuente dorada + flash + estirón del personaje
        this.particles.burst(this.tmp.set(p.x, p.y + 0.4, p.z), {
          count: 40,
          color: 0xffd35c,
          speed: 5.5,
          life: 0.9,
          gravity: 4,
          up: 1.2,
          size: 0.18,
        });
        if (v) {
          this.flash.flash(v.meshes, 0xffd35c, 0.25);
          this.squash.squash(v.visual, -0.22, 0.4);
          if (v.has('Cheer')) v.play('Cheer', { once: true, fade: 0.1 });
        }
        this.damageNumbers.spawn(this.tmp.set(p.x, p.y + 2.2, p.z), `¡Nivel ${ev.level}!`, 'ding');
        this.rig.punch(5);
        this.audio.play('levelup');
        break;
      }
      case 'fellInMist':
        break;
    }
  }

  // Selección de animación de locomoción por estado (si una animación one-shot
  // está sonando, el mixer la respeta hasta que crossfadeamos).
  private updateLocomotion(e: Entity, v: CharacterView): void {
    if (!e.alive) return; // la muerte se queda clavada
    const oneShots = [
      '1H_Melee_Attack_Slice_Diagonal',
      'Attack',
      'Hit_A',
      'Idle_HitReact_Left',
    ];
    // deja terminar los one-shot cortos: los interrumpe solo el movimiento
    const speed = Math.hypot(e.vx, e.vz);
    const playing = v.playing();
    if (oneShots.includes(playing) && speed < 1 && e.grounded) return;

    if (e.kind === 'player') {
      // un gesto en curso (beber, recoger, aterrizar) manda sobre la marcha
      // en el aire solo se respeta el impulso del salto; los demás gestos son
      // de suelo y no deben congelar la pose al caerte
      if (this.elapsed < this.gestoHasta && (e.grounded || v.playing() === 'Jump_Start')) {
        v.visual.rotation.z = 0;
        return;
      }
      // el quiebro manda: mantiene su animación e inclina el cuerpo
      v.visual.rotation.z = e.dodgeTime > 0 ? this.dodgeLean : 0;
      if (e.dodgeTime > 0) return;
      // sentado: manda sobre todo lo demás hasta que se levante. Primero el
      // gesto de sentarse (una vez) y, cuando termina, el respirar sentado.
      if (e.sitting) {
        const sentado = v.has('Sit_Floor_Idle') ? 'Sit_Floor_Idle' : 'Idle';
        const bajando = v.playing() === 'Sit_Floor_Down' && v.has('Sit_Floor_Down');
        if (!bajando || this.elapsed - this.sitStartedAt > 1.1) {
          v.play(sentado, { fade: 0.25 });
        }
        return;
      }
      const oneShotsPlayer = [this.activeDef.attackAnim, 'Hit_A'];
      if (oneShotsPlayer.includes(v.playing()) && speed < 1 && e.grounded) return;
      if (e.blocking) {
        v.play('Block', { fade: 0.08 });
        return;
      }
      // La animación se elige por la dirección REAL de la marcha respecto a
      // donde mira: andando de lado con Q/E se ve el paso lateral, y yendo
      // hacia atrás con S se anda hacia atrás, en vez de correr de espaldas.
      const rel = Math.atan2(e.vx, e.vz) - e.yaw;
      const haciaDelante = Math.cos(rel);
      const haciaElLado = Math.sin(rel);
      // OJO: en este juego la derecha de la cámara es (-cos, sin), así que un
      // seno NEGATIVO del ángulo relativo es moverse hacia la derecha. Con el
      // signo al revés el muñeco andaba de lado mirando al lado contrario.
      const lateral =
        haciaElLado < -0.5
          ? 'Running_Strafe_Right'
          : haciaElLado > 0.5
            ? 'Running_Strafe_Left'
            : null;
      if (!e.grounded) v.play('Jump_Idle', { fade: 0.12 });
      else if (speed > 5) {
        const ts = e.sprinting ? 1.3 : 1;
        if (haciaDelante < -0.4 && v.has('Walking_Backwards')) {
          v.play('Walking_Backwards', { fade: 0.12, timeScale: 1.7 });
        } else if (lateral && v.has(lateral)) v.play(lateral, { fade: 0.12, timeScale: ts });
        else v.play('Running_A', { fade: 0.12, timeScale: ts });
      } else if (speed > 0.4) {
        if (haciaDelante < -0.4 && v.has('Walking_Backwards')) {
          v.play('Walking_Backwards', { fade: 0.12 });
        } else if (lateral && v.has(lateral)) v.play(lateral, { fade: 0.14, timeScale: 0.75 });
        else v.play('Walking_A', { fade: 0.12 });
      } else v.play('Idle', { fade: 0.18 });
    } else {
      const t = BESTIARY[e.templateId];
      if (!t) return;
      // deja terminar el mordisco/reacción propios de la criatura
      if ([t.anims.attack, t.anims.hit].includes(v.playing()) && speed < 1) return;
      if (speed > e.moveSpeed * 0.75)
        v.play(t.anims.run, { fade: 0.12, timeScale: t.anims.runTimeScale ?? 1 });
      else if (speed > 0.3) v.play(t.anims.walk, { fade: 0.15 });
      else if (e.aiState === 'attack' && t.anims.alert) v.play(t.anims.alert, { fade: 0.2 });
      else v.play(t.anims.idle, { fade: 0.2 });
    }
  }

  // dt ya viene escalado por el hitstop; alpha = fracción de tick para interpolar
  update(dt: number, alpha: number): void {
    this.elapsed += dt;

    // entidades -> vistas (interpolando la pose entre ticks del sim)
    for (const e of this.sim.entities) {
      const v = this.views.get(e.id);
      if (!v) continue;
      v.group.position.set(
        e.px + (e.x - e.px) * alpha,
        e.py + (e.y - e.py) * alpha,
        e.pz + (e.z - e.pz) * alpha,
      );
      let dyaw = e.yaw - e.pyaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      v.group.rotation.y = e.pyaw + dyaw * alpha + v.yawOffset;
      this.updateLocomotion(e, v);
      v.update(dt);
    }

    // día/noche + niebla + estrellas
    const t = this.sim.timeOfDay;
    const p = this.sim.player;
    const focus = this.tmp.set(p.x, p.y, p.z);
    this.dayNight.apply(t, this.scene, focus);
    this.starMat.opacity = this.dayNight.starAlpha(t);
    this.stars.position.copy(focus);
    const mistC = this.dayNight.mistColor(t, this.tmpColor);
    for (let i = 0; i < this.mistMats.length; i++) {
      this.mistMats[i].color.copy(mistC);
      const plane = this.mistPlanes[i];
      plane.position.x = focus.x + Math.sin(this.elapsed * 0.02 + i * 2) * 18;
      plane.position.z = focus.z + Math.cos(this.elapsed * 0.016 + i) * 18;
    }

    // wisps: flotan, y de noche brillan
    const dark = darkness(t);
    for (const w of this.wisps) {
      w.group.position.y = w.baseY + Math.sin(this.elapsed * 0.9 + w.phase) * 0.7;
      w.group.rotation.y += dt * 0.3;
      for (const m of w.mats) m.emissiveIntensity = 0.4 + dark * 2.2;
    }

    // proyectiles en vuelo: interpola contra el estado del sim + estela
    for (const pr of this.sim.projectiles) {
      const mesh = this.projMeshes.get(pr.id);
      if (!mesh) continue;
      mesh.position.set(pr.px + (pr.x - pr.px) * alpha, pr.y, pr.pz + (pr.z - pr.pz) * alpha);
      const trail = projStyle(pr.kind).trail;
      if (trail !== undefined && Math.random() < 0.5) {
        this.particles.burst(mesh.position, {
          count: 1,
          color: trail,
          speed: 0.6,
          life: 0.35,
          gravity: -1,
          size: 0.1,
          up: 0.1,
        });
      }
    }

    // polvo de esprint: pasos que levantan tierra
    if (p.sprinting && p.grounded && Math.random() < 0.2) {
      this.particles.burst(this.tmp.set(p.x, p.y + 0.1, p.z), {
        count: 3,
        color: 0xcbb794,
        speed: 1.2,
        life: 0.3,
        gravity: 3,
        size: 0.1,
        up: 0.3,
      });
    }

    // rastro de la acometida del Cordelero
    if (p.dashTime > 0 && Math.random() < 0.8) {
      this.particles.burst(this.tmp.set(p.x, p.y + 0.5, p.z), {
        count: 3,
        color: 0xd8d0b8,
        speed: 1.5,
        life: 0.3,
        gravity: 2,
        size: 0.12,
        up: 0.2,
      });
    }

    // armas con doble orientación: en pose de combate usan la de combate
    const pv = this.views.get(p.id);
    if (pv) {
      const playing = pv.playing();
      const inCombatPose =
        playing.includes('Attack') || playing.includes('Shoot') || playing.includes('Spellcast');
      for (const m of pv.mounts) {
        const target = inCombatPose ? (m.rot ?? m.restRot) : (m.restRot ?? m.rot);
        if (target) m.obj.rotation.set(...target);
      }
    }

    // drops de armas: giran, flotan y palpitan
    for (const vis of this.dropVisuals.values()) {
      vis.weapon.rotation.y += dt * 2.2;
      vis.weapon.position.y = 1.0 + Math.sin(this.elapsed * 2.4) * 0.15;
    }

    // juice
    this.flash.update(dt);
    this.squash.update(dt);
    this.particles.update(dt);

    // cámara (el yaw/pitch los pone main desde el input)
    const shakeOff = this.shake.update(dt);
    this.tmpVel.set(p.vx, p.vy, p.vz);
    const interp = this.tmp.set(
      p.px + (p.x - p.px) * alpha,
      p.py + (p.y - p.py) * alpha,
      p.pz + (p.z - p.pz) * alpha,
    );
    this.rig.update(
      dt,
      interp,
      this.tmpVel,
      this.camYaw,
      this.camPitch,
      this.camDist,
      this.sim.seed,
      shakeOff,
    );

    this.damageNumbers.update(dt, this.rig.camera);
    this.renderer.render(this.scene, this.rig.camera);
  }

  camYaw = Math.PI;
  camPitch = 0.42;
  camDist = 7.2;
}
