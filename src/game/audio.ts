// Audio sintetizado con WebAudio: ni un fichero de sonido en el proyecto.
// Cada efecto es una receta de osciladores y ruido, así que el juego suena
// sin sumar un byte a la descarga y todo se afina cambiando números.
//
// El sim no sabe que esto existe: llama a play('hit') y ya. Si el navegador
// bloquea el audio hasta el primer clic, el juego sigue igual de jugable.

export type SoundName =
  | 'swing'
  | 'hit'
  | 'hit_hard'
  | 'crit'
  | 'jump'
  | 'land'
  | 'land_hard'
  | 'aggro'
  | 'death_mob'
  | 'death_player'
  | 'respawn'
  | 'xp'
  | 'levelup'
  | 'mastery'
  | 'block'
  | 'ability'
  | 'swap'
  | 'loot_drop'
  | 'loot_pickup'
  | 'bag_full'
  | 'potion'
  | 'talent';

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface Receta {
  tipo: 'tono' | 'ruido';
  wave?: Wave;
  f0: number; // frecuencia inicial
  f1?: number; // frecuencia final (barrido)
  dur: number;
  vol: number;
  // ruido
  filtro?: 'lowpass' | 'highpass' | 'bandpass';
  q?: number;
}

// Una receta por sonido: lista de capas que suenan a la vez.
const RECETAS: Record<SoundName, Receta[]> = {
  swing: [{ tipo: 'ruido', f0: 1800, f1: 600, dur: 0.16, vol: 0.1, filtro: 'bandpass', q: 1.2 }],
  hit: [
    { tipo: 'tono', wave: 'triangle', f0: 220, f1: 90, dur: 0.12, vol: 0.24 },
    { tipo: 'ruido', f0: 2600, f1: 800, dur: 0.1, vol: 0.16, filtro: 'bandpass', q: 0.9 },
  ],
  hit_hard: [
    { tipo: 'tono', wave: 'square', f0: 150, f1: 55, dur: 0.22, vol: 0.3 },
    { tipo: 'ruido', f0: 1400, f1: 300, dur: 0.24, vol: 0.22, filtro: 'lowpass', q: 1 },
  ],
  crit: [
    { tipo: 'tono', wave: 'square', f0: 320, f1: 120, dur: 0.2, vol: 0.28 },
    { tipo: 'tono', wave: 'sine', f0: 1320, f1: 660, dur: 0.26, vol: 0.16 },
    { tipo: 'ruido', f0: 3200, f1: 900, dur: 0.18, vol: 0.18, filtro: 'bandpass', q: 1.4 },
  ],
  jump: [{ tipo: 'tono', wave: 'sine', f0: 300, f1: 620, dur: 0.14, vol: 0.16 }],
  land: [{ tipo: 'ruido', f0: 500, f1: 160, dur: 0.12, vol: 0.14, filtro: 'lowpass' }],
  land_hard: [
    { tipo: 'tono', wave: 'sine', f0: 120, f1: 45, dur: 0.26, vol: 0.3 },
    { tipo: 'ruido', f0: 700, f1: 120, dur: 0.3, vol: 0.2, filtro: 'lowpass' },
  ],
  aggro: [{ tipo: 'tono', wave: 'sawtooth', f0: 180, f1: 260, dur: 0.3, vol: 0.14 }],
  death_mob: [
    { tipo: 'tono', wave: 'sawtooth', f0: 300, f1: 70, dur: 0.45, vol: 0.2 },
    { tipo: 'ruido', f0: 900, f1: 150, dur: 0.4, vol: 0.14, filtro: 'lowpass' },
  ],
  death_player: [{ tipo: 'tono', wave: 'sine', f0: 400, f1: 60, dur: 1.1, vol: 0.3 }],
  respawn: [{ tipo: 'tono', wave: 'sine', f0: 180, f1: 720, dur: 0.6, vol: 0.2 }],
  xp: [{ tipo: 'tono', wave: 'sine', f0: 880, f1: 1180, dur: 0.1, vol: 0.07 }],
  levelup: [
    { tipo: 'tono', wave: 'triangle', f0: 523, dur: 0.16, vol: 0.2 },
    { tipo: 'tono', wave: 'triangle', f0: 659, dur: 0.3, vol: 0.18 },
    { tipo: 'tono', wave: 'triangle', f0: 784, dur: 0.5, vol: 0.16 },
  ],
  mastery: [
    { tipo: 'tono', wave: 'sine', f0: 440, dur: 0.2, vol: 0.16 },
    { tipo: 'tono', wave: 'sine', f0: 660, dur: 0.34, vol: 0.14 },
  ],
  block: [
    { tipo: 'tono', wave: 'square', f0: 900, f1: 420, dur: 0.14, vol: 0.16 },
    { tipo: 'ruido', f0: 4200, f1: 1400, dur: 0.12, vol: 0.14, filtro: 'highpass' },
  ],
  ability: [
    { tipo: 'tono', wave: 'sawtooth', f0: 180, f1: 520, dur: 0.3, vol: 0.18 },
    { tipo: 'ruido', f0: 800, f1: 2400, dur: 0.26, vol: 0.1, filtro: 'bandpass', q: 1.6 },
  ],
  swap: [{ tipo: 'tono', wave: 'square', f0: 620, f1: 880, dur: 0.09, vol: 0.12 }],
  loot_drop: [{ tipo: 'tono', wave: 'sine', f0: 700, f1: 480, dur: 0.16, vol: 0.1 }],
  loot_pickup: [
    { tipo: 'tono', wave: 'sine', f0: 780, dur: 0.1, vol: 0.14 },
    { tipo: 'tono', wave: 'sine', f0: 1180, dur: 0.22, vol: 0.12 },
  ],
  bag_full: [{ tipo: 'tono', wave: 'square', f0: 220, f1: 160, dur: 0.24, vol: 0.14 }],
  potion: [
    { tipo: 'tono', wave: 'sine', f0: 420, f1: 900, dur: 0.34, vol: 0.18 },
    { tipo: 'ruido', f0: 1200, f1: 400, dur: 0.2, vol: 0.08, filtro: 'lowpass' },
  ],
  talent: [{ tipo: 'tono', wave: 'triangle', f0: 660, f1: 990, dur: 0.18, vol: 0.14 }],
};

const MAX_A_LA_VEZ = 6; // antikaos: cinco lobos pegando no revientan los oídos

export class AudioSink {
  lastPlayed: SoundName | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musica: GainNode | null = null;
  private ruidoBuf: AudioBuffer | null = null;
  private sonando = 0;
  private muted = false;
  private musicaTimer = 0;

  // El navegador no deja sonar nada hasta que el usuario toca algo: el
  // contexto se crea perezosamente y se reanuda al primer gesto.
  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musica = this.ctx.createGain();
      this.musica.gain.value = 0.5;
      this.musica.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // Se llama desde el primer clic/tecla del jugador (política de autoplay)
  unlock(): void {
    this.ensure();
    this.startMusic();
  }

  setMuted(v: boolean): boolean {
    this.muted = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.ruidoBuf) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      this.ruidoBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.ruidoBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.ruidoBuf;
  }

  play(name: SoundName): void {
    this.lastPlayed = name;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (this.sonando >= MAX_A_LA_VEZ) return;
    const recetas = RECETAS[name];
    if (!recetas) return;
    this.sonando++;
    const t0 = ctx.currentTime;
    // ±6% de tono: dos golpes seguidos nunca suenan calcados
    const pitch = 0.94 + Math.random() * 0.12;
    let maxDur = 0;
    for (const r of recetas) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(r.vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + r.dur);
      let salida: AudioNode = g;
      if (r.filtro) {
        const f = ctx.createBiquadFilter();
        f.type = r.filtro;
        f.frequency.setValueAtTime(r.f0 * pitch, t0);
        if (r.f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, r.f1 * pitch), t0 + r.dur);
        if (r.q) f.Q.value = r.q;
        g.connect(f);
        salida = f;
      }
      salida.connect(this.master);
      if (r.tipo === 'ruido') {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx);
        src.connect(g);
        src.start(t0);
        src.stop(t0 + r.dur);
      } else {
        const osc = ctx.createOscillator();
        osc.type = r.wave ?? 'sine';
        osc.frequency.setValueAtTime(r.f0 * pitch, t0);
        if (r.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, r.f1 * pitch), t0 + r.dur);
        osc.connect(g);
        osc.start(t0);
        osc.stop(t0 + r.dur);
      }
      maxDur = Math.max(maxDur, r.dur);
    }
    window.setTimeout(() => (this.sonando = Math.max(0, this.sonando - 1)), maxDur * 1000);
  }

  // --- Música ---
  // Dos temas reales que se cruzan: el de explorar y el de combate. En vez de
  // cortar uno y arrancar el otro, ambos suenan siempre y lo que cambia es el
  // volumen, con rampas suaves. Entrar en combate no interrumpe: sube.
  private explorar: HTMLAudioElement | null = null;
  private combate: HTMLAudioElement | null = null;
  // OJO: esto es el AVANCE de la rampa (0..1), no el volumen. El oído es
  // logarítmico: una subida lineal de volumen suena "ya a tope" en cuanto
  // pasa de 0,2, así que el avance se eleva al cuadrado antes de aplicarlo.
  // Eso es lo que hace que la entrada se oiga de verdad progresiva.
  private avanceExplorar = 0;
  private avanceCombate = 0;
  private enCombate = false;
  private musicaVol = 0.55; // el que mueve el jugador con la barra
  private arrancada = false;
  private primeraEntrada = true; // la primera vez el tema de explorar entra susurrando

  // Rampas, en segundos. La de entrada al principio es larga a propósito:
  // el tema de explorar entra susurrando y crece.
  private static readonly ENTRADA_INICIAL = 11;
  private static readonly ENTRADA_COMBATE = 4;
  private static readonly SALIDA_COMBATE = 3;
  // curva de volumen: cuadrática. A mitad de rampa se oye a un cuarto, que es
  // más o menos "la mitad de fuerte" para el oído.
  private static curva(avance: number): number {
    return avance * avance;
  }

  private startMusic(): void {
    if (this.arrancada) return;
    this.arrancada = true;
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
    const crear = (archivo: string): HTMLAudioElement => {
      const el = new Audio(`${base}music/${archivo}`);
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0;
      void el.play().catch(() => {
        /* el navegador aún no deja: sonará en cuanto el jugador toque algo */
      });
      return el;
    };
    this.explorar = crear('explorar.mp3');
    this.combate = crear('combate.mp3');
  }

  // Llamado por el bucle principal: el sim dice si hay pelea, aquí solo se
  // mueven volúmenes hacia su destino.
  setCombat(v: boolean): void {
    if (v === this.enCombate) return;
    this.enCombate = v;
    // si el tema de combate estaba del todo apagado, empieza por el principio:
    // así cada pelea arranca con su golpe de entrada
    if (v && this.combate && this.avanceCombate < 0.02) {
      try {
        this.combate.currentTime = 0;
      } catch {
        /* algunos navegadores se quejan si aún no ha cargado: da igual */
      }
    }
  }

  setMusicVolume(v: number): number {
    this.musicaVol = Math.max(0, Math.min(1, v));
    return this.musicaVol;
  }

  get musicVolume(): number {
    return this.musicaVol;
  }

  updateMusic(dt: number): void {
    if (!this.arrancada) return;
    const sonando = this.muted ? 0 : 1;
    const objetivoExplorar = this.enCombate ? 0 : sonando;
    const objetivoCombate = this.enCombate ? sonando : 0;
    // cada rampa tiene su prisa: entrar en combate es más rápido que salir
    const subeC = AudioSink.ENTRADA_COMBATE;
    const bajaC = AudioSink.SALIDA_COMBATE;
    // OJO: la rampa larga del arranque tiene que durar TODA la subida, no
    // solo el primer frame (que era el fallo: se apagaba al segundo tick)
    const subeE = this.primeraEntrada && !this.enCombate ? AudioSink.ENTRADA_INICIAL : bajaC;
    this.avanceExplorar = mover(this.avanceExplorar, objetivoExplorar, dt, subeE);
    this.avanceCombate = mover(this.avanceCombate, objetivoCombate, dt, this.enCombate ? subeC : bajaC);
    if (this.primeraEntrada && (this.avanceExplorar >= 0.999 || this.enCombate)) {
      this.primeraEntrada = false;
    }
    if (this.explorar) {
      this.explorar.volume = clamp01(AudioSink.curva(this.avanceExplorar) * this.musicaVol);
    }
    if (this.combate) {
      this.combate.volume = clamp01(AudioSink.curva(this.avanceCombate) * this.musicaVol);
    }
    // los navegadores pausan el audio si la pestaña estuvo oculta
    if (this.explorar?.paused) void this.explorar.play().catch(() => {});
    if (this.combate?.paused) void this.combate.play().catch(() => {});
  }
}

// avance lineal hacia un objetivo en `segundos` para recorrer todo el rango
function mover(actual: number, objetivo: number, dt: number, segundos: number): number {
  const paso = dt / Math.max(0.05, segundos);
  if (actual < objetivo) return Math.min(objetivo, actual + paso);
  if (actual > objetivo) return Math.max(objetivo, actual - paso);
  return actual;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
