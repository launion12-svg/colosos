// Pantalla de selección de personaje, homenaje al campamento de Diablo II:
// los cuatro errantes quietos alrededor de una hoguera, de noche sobre una
// vértebra del coloso. Click: paso al frente, foco de luz y su gesto.

import * as THREE from 'three';
import { CLASSES, type ClassDef } from '../game/classes';
import { CharacterView, loadGLB } from '../render/characters';

interface Slot {
  def: ClassDef;
  view: CharacterView;
  baseX: number;
  baseZ: number;
  targetZ: number;
  label: HTMLDivElement;
}

const CAM_POS = new THREE.Vector3(0, 2.6, 7.8);
const LOOK_AT = new THREE.Vector3(0, 1.15, 0);
const STEP_FORWARD = 1.1;

export class SelectScreen {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private slots: Slot[] = [];
  private primary: Slot | null = null;
  private spotlight: THREE.SpotLight;
  private fireLight: THREE.PointLight;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private elapsed = 0;
  private running = true;
  private ui: HTMLElement;
  private flame: THREE.Mesh | null = null;
  private nameEl: HTMLElement;
  private descEl: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private nameInput: HTMLInputElement;
  private resolve!: (out: { defA: ClassDef; name: string }) => void;

  constructor(
    private gl: THREE.WebGLRenderer,
    uiRoot: HTMLElement,
  ) {
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.copy(CAM_POS);
    this.camera.lookAt(LOOK_AT);

    this.scene.fog = new THREE.Fog(0x0a0f24, 14, 60);
    this.scene.background = new THREE.Color(0x070b1c);

    // luz de campamento: hoguera + luna tenue + foco para el elegido
    this.fireLight = new THREE.PointLight(0xff8c3a, 30, 26, 1.6);
    this.fireLight.position.set(0, 1.4, 1.6);
    this.fireLight.castShadow = true;
    this.scene.add(this.fireLight);
    const moon = new THREE.DirectionalLight(0x8ea8e8, 0.5);
    moon.position.set(-14, 20, -10);
    this.scene.add(moon);
    this.scene.add(new THREE.HemisphereLight(0x36466e, 0x1a1410, 0.4));
    // cono cerrado: un círculo de luz ajustado al héroe, no un baño de escenario
    this.spotlight = new THREE.SpotLight(0xcfe0ff, 0, 30, 0.165, 0.5, 1.2);
    this.spotlight.position.set(0, 9, 4);
    this.scene.add(this.spotlight, this.spotlight.target);

    // suelo: la corona de una vértebra (disco de hueso) rodeada de oscuridad
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(16, 48),
      new THREE.MeshStandardMaterial({ color: 0xcabfa4, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(15.5, 30, 48),
      new THREE.MeshBasicMaterial({ color: 0x05070f, side: THREE.DoubleSide }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    this.scene.add(rim);

    // estrellas
    const N = 500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = Math.asin(Math.random() * 0.9 + 0.05);
      pos[i * 3] = Math.cos(a) * Math.cos(el) * 120;
      pos[i * 3 + 1] = Math.sin(el) * 120;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * 120;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: 0xdde8ff,
          size: 1.4,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.85,
          fog: false,
        }),
      ),
    );

    // interfaz superpuesta
    uiRoot.innerHTML = `
      <div id="select-ui">
        <h1>C O L O S O S</h1>
        <h2>Elige tu arma inicial — la segunda te la ganarás en el mundo</h2>
        <div id="select-info" class="hidden ornate">
          <div id="select-name"></div>
          <div id="select-desc"></div>
          <input id="select-name-input" maxlength="16" placeholder="Escribe tu nombre..." autocomplete="off" spellcheck="false" />
          <button id="select-confirm" disabled>Despertar</button>
        </div>
        <div id="select-labels"></div>
      </div>`;
    this.ui = uiRoot.querySelector('#select-ui')!;
    this.nameEl = uiRoot.querySelector('#select-name')!;
    this.descEl = uiRoot.querySelector('#select-desc')!;
    this.confirmBtn = uiRoot.querySelector('#select-confirm')!;
    this.nameInput = uiRoot.querySelector('#select-name-input')!;
    this.confirmBtn.addEventListener('click', () => this.confirm());
    // el nombre desbloquea el Despertar; Enter confirma directamente
    this.nameInput.addEventListener('input', () => this.updateConfirm());
    this.nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // que teclear no dispare atajos del juego
      if (e.key === 'Enter' && !this.confirmBtn.disabled) this.confirm();
    });

    this.gl.domElement.addEventListener('click', this.onClick);
    this.gl.domElement.addEventListener('mousemove', this.onMove);
    window.addEventListener('resize', this.onResize);
  }

  async load(): Promise<void> {
    const labelBox = this.ui.querySelector('#select-labels') as HTMLElement;
    const arcX = [-3.6, -1.25, 1.25, 3.6];
    for (let i = 0; i < CLASSES.length; i++) {
      const def = CLASSES[i];
      const gltf = await loadGLB(def.model);
      const view = new CharacterView(gltf, { height: 1.85 });
      for (const w of def.weapons) {
        const weapon = await loadGLB(w.model);
        const obj = new THREE.Group();
        obj.add(weapon.scene.clone(true));
        if (w.offset) obj.position.set(...w.offset);
        const rr = w.restRot ?? w.rot;
        if (rr) obj.rotation.set(...rr);
        view.attach(w.bone, obj);
      }
      const baseX = arcX[i];
      const baseZ = -0.4 - Math.abs(baseX) * 0.22; // arco suave
      view.group.position.set(baseX, 0, baseZ);
      view.group.rotation.y = Math.atan2(CAM_POS.x - baseX, CAM_POS.z - baseZ);
      view.play('Idle');
      // desincroniza los idles para que no respiren a la vez
      view.mixer.update(i * 0.7);
      this.scene.add(view.group);

      const label = document.createElement('div');
      label.className = 'select-label';
      label.textContent = def.nombre;
      labelBox.appendChild(label);
      this.slots.push({ def, view, baseX, baseZ, targetZ: baseZ, label });
    }
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(window.innerWidth, window.innerHeight);
  };

  private slotAt(ev: MouseEvent): Slot | null {
    this.pointer.set(
      (ev.clientX / window.innerWidth) * 2 - 1,
      -(ev.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    for (const slot of this.slots) {
      const hits = this.raycaster.intersectObject(slot.view.group, true);
      if (hits.length > 0) return slot;
    }
    return null;
  }

  private onMove = (ev: MouseEvent): void => {
    if (!this.running) return;
    this.gl.domElement.style.cursor = this.slotAt(ev) ? 'pointer' : 'default';
  };

  private onClick = (ev: MouseEvent): void => {
    if (!this.running) return;
    const slot = this.slotAt(ev);
    if (slot) this.pick(slot.def.id);
  };

  // expuesto también como hook para capturas/automatización
  pick(id: string): void {
    const slot = this.slots.find((s) => s.def.id === id);
    if (!slot) return;
    if (slot === this.primary) {
      slot.view.play(slot.def.gesture, { once: true, fade: 0.15 }); // re-saluda
      return;
    }
    if (this.primary) {
      this.primary.targetZ = this.primary.baseZ;
      this.primary.view.play('Idle', { fade: 0.25 });
      this.primary.label.classList.remove('chosen');
    }
    this.primary = slot;
    slot.targetZ = slot.baseZ + STEP_FORWARD;
    slot.label.classList.add('chosen');
    slot.view.play(slot.def.gesture, { once: true, fade: 0.15 });
    this.nameEl.textContent = `${slot.def.nombre} — ${slot.def.rol}`;
    this.descEl.textContent = `${slot.def.desc} La segunda arma caerá de las criaturas del lomo.`;
    this.ui.querySelector('#select-info')!.classList.remove('hidden');
    this.nameInput.focus();
    this.updateConfirm();
  }

  private updateConfirm(): void {
    this.confirmBtn.disabled = !this.primary || this.nameInput.value.trim().length < 2;
  }

  private confirm(): void {
    if (!this.primary || this.confirmBtn.disabled) return;
    const defA = this.primary.def;
    const name = this.nameInput.value.trim();
    this.running = false;
    this.ui.classList.add('fade-out');
    setTimeout(() => {
      this.dispose();
      this.resolve({ defA, name });
    }, 650);
  }

  private dispose(): void {
    this.gl.domElement.removeEventListener('click', this.onClick);
    this.gl.domElement.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('resize', this.onResize);
    this.ui.remove();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
  }

  paused = false; // para capturas: congela el render dejando el bucle vivo

  private frame = (now: number): void => {
    if (!this.running && this.ui.classList.contains('fade-out') === false) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.paused) {
      if (this.running || this.ui.isConnected) requestAnimationFrame(this.frame);
      return;
    }
    this.elapsed += dt;

    // la hoguera respira
    this.fireLight.intensity = 26 + Math.sin(this.elapsed * 9) * 4 + Math.sin(this.elapsed * 23) * 2;
    if (this.flame) {
      const s = 1 + Math.sin(this.elapsed * 11) * 0.09 + Math.sin(this.elapsed * 27) * 0.05;
      this.flame.scale.set(s, 1.05 - (s - 1) * 1.6, s);
      this.flame.rotation.y += dt * 1.5;
    }

    for (const slot of this.slots) {
      const g = slot.view.group;
      g.position.z += (slot.targetZ - g.position.z) * (1 - Math.exp(-8 * dt));
      slot.view.update(dt);
      // vuelve a Idle cuando termina el gesto
      if (
        slot === this.primary &&
        slot.view.playing() === slot.def.gesture &&
        !slot.view.isRunning()
      ) {
        slot.view.play('Idle', { fade: 0.3 });
      }
      // etiqueta proyectada sobre la cabeza
      const p = new THREE.Vector3(g.position.x, 2.35, g.position.z).project(this.camera);
      slot.label.style.transform = `translate(${((p.x * 0.5 + 0.5) * window.innerWidth).toFixed(0)}px, ${((-p.y * 0.5 + 0.5) * window.innerHeight).toFixed(0)}px) translate(-50%, -50%)`;
    }

    // el foco sigue al arma principal
    if (this.primary) {
      const g = this.primary.view.group;
      this.spotlight.intensity += (110 - this.spotlight.intensity) * (1 - Math.exp(-5 * dt));
      this.spotlight.target.position.set(g.position.x, 0.9, g.position.z);
      this.spotlight.position.set(g.position.x, 8.5, g.position.z + 1.6);
    } else {
      this.spotlight.intensity *= Math.exp(-5 * dt);
    }

    // leve deriva de cámara para que la escena respire
    this.camera.position.x = CAM_POS.x + Math.sin(this.elapsed * 0.25) * 0.35;
    this.camera.position.y = CAM_POS.y + Math.sin(this.elapsed * 0.4) * 0.12;
    this.camera.lookAt(LOOK_AT);

    this.gl.render(this.scene, this.camera);
    if (this.running || this.ui.isConnected) requestAnimationFrame(this.frame);
  };

  private last = 0;

  async run(): Promise<{ defA: ClassDef; name: string }> {
    await this.load();
    document.getElementById('loading')?.remove();
    (window as unknown as Record<string, unknown>).__selectReady = true;
    // hoguera: leños + llama emisiva que respira con la luz
    try {
      const fire = await loadGLB('models/bonfire.glb');
      const f = fire.scene.clone(true);
      f.position.set(0, 0, 1.6);
      f.scale.setScalar(2.4);
      this.scene.add(f);
    } catch {
      /* sin leños visibles: la llama y la luz bastan */
    }
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.0, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa844, transparent: true, opacity: 0.9 }),
    );
    this.flame.position.set(0, 0.55, 1.6);
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.6, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe8a0 }),
    );
    core.position.y = -0.12;
    this.flame.add(core);
    this.scene.add(this.flame);
    this.gl.shadowMap.enabled = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    return new Promise<{ defA: ClassDef; name: string }>((res) => {
      this.resolve = res;
    });
  }
}
