// Hook de audio de F0: la interfaz existe y cada mecánica ya la llama con su
// nombre de sonido; los assets llegan en la Fase 2. El silencio nunca es un
// crash, y enchufar audio no tocará una línea de gameplay.

export type SoundName =
  | 'swing'
  | 'hit'
  | 'hit_hard'
  | 'jump'
  | 'land'
  | 'land_hard'
  | 'aggro'
  | 'death_mob'
  | 'death_player'
  | 'respawn'
  | 'xp'
  | 'levelup'
  | 'block'
  | 'ability'
  | 'swap'
  | 'loot_drop'
  | 'loot_pickup'
  | 'bag_full';

export class AudioSink {
  // último sonido pedido (útil para tests y depuración)
  lastPlayed: SoundName | null = null;

  play(name: SoundName): void {
    this.lastPlayed = name;
    // TODO Fase 2: WebAudio con atenuación espacial y pitch aleatorio ±8%
  }
}
