// InputReader: traduce teclado/ratón crudo a intención de movimiento
// relativa a la cámara. El sim nunca ve teclas, solo MoveInput.

import type { MoveInput } from './sim/types';

export class InputReader {
  private keys = new Set<string>();
  private jumpPressed = false;
  private attackPressed = false;
  private blockHeld = false;
  private abilityPressed = false;
  private ability2Pressed = false;
  private swapPressed = false;
  private drinkPressed = false;
  private sitPressed = false;
  debugBlock = false; // para capturas/depuración: mantiene el bloqueo
  // cámara orbital controlada con el ratón
  camYaw = Math.PI; // mirando hacia +Z (la cabeza del coloso)
  camPitch = 0.42;
  camDist = 7.2;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.jumpPressed = true;
        e.preventDefault();
      }
      if (e.code === 'KeyJ') this.attackPressed = true;
      if (e.code === 'Digit1') this.abilityPressed = true;
      if (e.code === 'Digit2') this.ability2Pressed = true;
      if (e.code === 'KeyX') this.swapPressed = true;
      if (e.code === 'KeyR') this.drinkPressed = true; // la Q pasó a marcha lateral
      if (e.code === 'KeyC') this.sitPressed = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.attackPressed = true;
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
      if (e.button === 2) this.blockHeld = true; // botón derecho: escudo
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.dragging = false;
      if (e.button === 2) this.blockHeld = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.camYaw -= dx * 0.0045;
      this.camPitch = Math.min(1.35, Math.max(0.06, this.camPitch + dy * 0.003));
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camDist = Math.min(13, Math.max(3.2, this.camDist + e.deltaY * 0.008));
      },
      { passive: false },
    );
  }

  // Muestrea la intención para UN tick del sim y limpia los flancos.
  sample(): MoveInput {
    let fwd = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
    // Q y E: lo mismo de lado, pero SIN girarse. Sumadas a A/D para poder
    // combinar (W+E = diagonal adelante-derecha mirando al frente).
    let lateral = 0;
    if (this.keys.has('KeyE')) lateral += 1;
    if (this.keys.has('KeyQ')) lateral -= 1;

    // dirección en mundo relativa al yaw de la cámara
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    // forward de la cámara (aplanado) = (sin, cos); su derecha = (-cos, sin)
    // (cross de forward con el up +Y en mano derecha)
    const moveX = sin * fwd - cos * (strafe + lateral);
    const moveZ = cos * fwd + sin * (strafe + lateral);

    const out: MoveInput = {
      moveX,
      moveZ,
      jump: this.jumpPressed,
      jumpHeld: this.keys.has('Space'),
      attack: this.attackPressed,
      block: this.blockHeld || this.debugBlock, // solo botón derecho (Shift ahora esprinta)
      ability: this.abilityPressed,
      ability2: this.ability2Pressed,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      swap: this.swapPressed,
      drink: this.drinkPressed,
      sit: this.sitPressed,
      // mientras haya marcha lateral, mira a donde mira la cámara
      faceYaw: lateral !== 0 ? this.camYaw : null,
    };
    this.jumpPressed = false;
    this.attackPressed = false;
    this.abilityPressed = false;
    this.ability2Pressed = false;
    this.swapPressed = false;
    this.drinkPressed = false;
    this.sitPressed = false;
    return out;
  }
}
