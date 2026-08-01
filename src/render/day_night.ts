// Ciclo día/noche: un solo número t (0=medianoche, 0.5=mediodía) gobierna
// sol, luna, cielo, niebla y ambiente. Las curvas hacen el trabajo artístico.

import * as THREE from 'three';

interface ColorKey {
  t: number;
  c: THREE.Color;
}
interface NumKey {
  t: number;
  v: number;
}

function sampleColor(keys: ColorKey[], t: number, out: THREE.Color): THREE.Color {
  // las claves cubren [0,1] con wraparound
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    const b = keys[(i + 1) % keys.length];
    const bt = b.t <= a.t ? b.t + 1 : b.t;
    let tt = t < a.t ? t + 1 : t;
    if (tt >= a.t && tt <= bt) {
      const u = bt === a.t ? 0 : (tt - a.t) / (bt - a.t);
      return out.copy(a.c).lerp(b.c, u);
    }
  }
  return out.copy(keys[0].c);
}

function sampleNum(keys: NumKey[], t: number): number {
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    const b = keys[(i + 1) % keys.length];
    const bt = b.t <= a.t ? b.t + 1 : b.t;
    let tt = t < a.t ? t + 1 : t;
    if (tt >= a.t && tt <= bt) {
      const u = bt === a.t ? 0 : (tt - a.t) / (bt - a.t);
      return a.v + (b.v - a.v) * u;
    }
  }
  return keys[0].v;
}

const C = (hex: number) => new THREE.Color(hex);

// Paleta del ciclo (aventura colorida, noche azul profundo)
const SKY_TOP: ColorKey[] = [
  { t: 0.0, c: C(0x0a1030) },
  { t: 0.2, c: C(0x1a2a55) },
  { t: 0.27, c: C(0x4d6db3) },
  { t: 0.35, c: C(0x4287d6) },
  { t: 0.5, c: C(0x3878cf) },
  { t: 0.68, c: C(0x4a6ab8) },
  { t: 0.75, c: C(0x3d3a75) },
  { t: 0.82, c: C(0x131a3d) },
];
const SKY_HORIZON: ColorKey[] = [
  { t: 0.0, c: C(0x141c38) },
  { t: 0.2, c: C(0x8a5a7a) },
  { t: 0.26, c: C(0xffb377) },
  { t: 0.35, c: C(0xbfe0f7) },
  { t: 0.5, c: C(0xcdeafc) },
  { t: 0.68, c: C(0xf7c98e) },
  { t: 0.74, c: C(0xff8c52) },
  { t: 0.8, c: C(0x6a4a80) },
  { t: 0.86, c: C(0x1a2244) },
];
const SUN_COLOR: ColorKey[] = [
  { t: 0.25, c: C(0xffb070) },
  { t: 0.32, c: C(0xffe8c4) },
  { t: 0.5, c: C(0xfff4e0) },
  { t: 0.68, c: C(0xffcf90) },
  { t: 0.75, c: C(0xff9a55) },
];
const FOG_COLOR: ColorKey[] = [
  { t: 0.0, c: C(0x0e1630) },
  { t: 0.25, c: C(0xc78a74) },
  { t: 0.35, c: C(0xa9c8e8) },
  { t: 0.5, c: C(0xb8d8f0) },
  { t: 0.72, c: C(0xe8a06a) },
  { t: 0.8, c: C(0x2a2c55) },
];
const MIST_COLOR: ColorKey[] = [
  { t: 0.0, c: C(0x1a2444) },
  { t: 0.3, c: C(0x9fb8d8) },
  { t: 0.5, c: C(0xafcce0) },
  { t: 0.72, c: C(0xd8a284) },
  { t: 0.82, c: C(0x232c52) },
];

const SUN_ENERGY: NumKey[] = [
  { t: 0.18, v: 0 },
  { t: 0.24, v: 0.6 },
  { t: 0.32, v: 2.6 },
  { t: 0.5, v: 3.1 },
  { t: 0.68, v: 2.4 },
  { t: 0.76, v: 0.7 },
  { t: 0.81, v: 0 },
];
const MOON_ENERGY: NumKey[] = [
  { t: 0.0, v: 0.75 },
  { t: 0.14, v: 0.75 },
  { t: 0.22, v: 0 },
  { t: 0.78, v: 0 },
  { t: 0.86, v: 0.7 },
];
const AMBIENT_ENERGY: NumKey[] = [
  { t: 0.0, v: 0.48 },
  { t: 0.25, v: 0.6 },
  { t: 0.5, v: 1.1 },
  { t: 0.75, v: 0.6 },
  { t: 0.85, v: 0.48 },
];
const STAR_ALPHA: NumKey[] = [
  { t: 0.0, v: 1 },
  { t: 0.18, v: 0.9 },
  { t: 0.26, v: 0 },
  { t: 0.76, v: 0 },
  { t: 0.84, v: 0.85 },
];

// Cuánto de "noche" es el momento (para wisps, ventanas, bioluminiscencia)
export function darkness(t: number): number {
  return sampleNum(STAR_ALPHA, t);
}

export class DayNight {
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private skyMat: THREE.ShaderMaterial;
  readonly skyDome: THREE.Mesh;
  private tmpA = new THREE.Color();
  private tmpB = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -70;
    cam.right = 70;
    cam.top = 70;
    cam.bottom = -70;
    cam.near = 10;
    cam.far = 320;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x9db8ff, 0);
    scene.add(this.moon, this.moon.target);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 0.8);
    scene.add(this.hemi);

    // Cúpula de cielo con degradado vertical
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x3878cf) },
        bottomColor: { value: new THREE.Color(0xcdeafc) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          float u = smoothstep(-0.08, 0.5, h);
          gl_FragColor = vec4(mix(bottomColor, topColor, u), 1.0);
        }`,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), this.skyMat);
    this.skyDome.frustumCulled = false;
    scene.add(this.skyDome);
  }

  // Aplica el momento del día. focus = punto que siguen las sombras (jugador).
  apply(t: number, scene: THREE.Scene, focus: THREE.Vector3): void {
    // posición del sol en su arco este->oeste
    const theta = (t - 0.25) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(theta) * 0.9, Math.sin(theta), 0.35).normalize();
    this.sun.position.copy(focus).addScaledVector(dir, 160);
    this.sun.target.position.copy(focus);
    this.sun.intensity = sampleNum(SUN_ENERGY, t);
    this.sun.color.copy(sampleColor(SUN_COLOR, t, this.tmpA));

    // la luna recorre el arco opuesto
    this.moon.position.copy(focus).addScaledVector(dir, -160);
    this.moon.position.y = focus.y + Math.abs(this.moon.position.y - focus.y);
    this.moon.target.position.copy(focus);
    this.moon.intensity = sampleNum(MOON_ENERGY, t);

    this.hemi.intensity = sampleNum(AMBIENT_ENERGY, t);

    const top = sampleColor(SKY_TOP, t, this.tmpA);
    (this.skyMat.uniforms.topColor.value as THREE.Color).copy(top);
    const horizon = sampleColor(SKY_HORIZON, t, this.tmpB);
    (this.skyMat.uniforms.bottomColor.value as THREE.Color).copy(horizon);
    this.skyDome.position.copy(focus);

    const fog = scene.fog as THREE.Fog | null;
    if (fog) fog.color.copy(sampleColor(FOG_COLOR, t, this.tmpA));
  }

  mistColor(t: number, out: THREE.Color): THREE.Color {
    return sampleColor(MIST_COLOR, t, out);
  }

  starAlpha(t: number): number {
    return sampleNum(STAR_ALPHA, t);
  }
}
