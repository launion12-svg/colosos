// HUD mínimo de F0: marco del jugador, marco del objetivo, XP, reloj del día
// y overlay de muerte. Escucha al sim; jamás lo muta.

import { MAX_LEVEL, STAMINA_MAX, xpToNext, type Entity } from '../sim/types';

export const GLYPHS: Record<string, string> = {
  medula: '⚔',
  vigia: '➶',
  cordelero: '⇻',
  fumarel: '✦',
};

export interface SetInfo {
  id: string;
  nombre: string; // nombre de la habilidad del set
  cooldown: number;
  desc: string;
  hasShield: boolean;
}

export class Hud {
  private playerHpFill: HTMLElement;
  private playerHpText: HTMLElement;
  private targetFrame: HTMLElement;
  private targetHpFill: HTMLElement;
  private targetName: HTMLElement;
  private xpEl: HTMLElement;
  private xpFill: HTMLElement;
  private levelEl: HTMLElement;
  private clockEl: HTMLElement;
  private deathEl: HTMLElement;
  readonly fctContainer: HTMLElement;
  private targetId = -1;
  private slotCd: HTMLElement | null = null;
  private slotEl: HTMLElement | null = null;
  private abilityCooldownTotal = 1;
  private prevAbilityCd = 0;
  private stamFill: HTMLElement | null = null;
  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private sets: SetInfo[] = [];

  constructor(
    root: HTMLElement,
    playerName = 'Errante',
    sets?: SetInfo[], // [principal, secundario]
  ) {
    this.sets = sets ?? [];
    const anyShield = this.sets.some((s) => s.hasShield);
    const blockHint = anyShield ? ' · Click dcho: escudo (con espada)' : '';
    const abilityHtml = this.sets.length
      ? `<div id="action-bar">
           <div class="slot-row">
             <div class="slot ornate ornate-slot" id="slot-1">
               <span class="slot-glyph" id="slot-glyph"></span>
               <span class="slot-key">1</span>
               <div id="slot-cd"></div>
             </div>
             <div class="slot slot-small ornate ornate-slot" id="slot-swap" title="Cambiar de arma (X)">
               <span class="slot-glyph" id="swap-glyph"></span>
               <span class="slot-key">X</span>
             </div>
           </div>
           <div class="slot-name" id="slot-name"></div>
         <div id="tooltip" class="hidden ornate ornate-soft">
           <div class="tt-name" id="tt-name"></div>
           <div class="tt-cd" id="tt-cd"></div>
           <div class="tt-desc" id="tt-desc"></div>
         </div></div>`
      : '';
    root.innerHTML = `
      <div id="player-frame" class="frame ornate ornate-soft">
        <div class="frame-name">${playerName} · <span id="plevel">Nv 1</span></div>
        <div class="bar"><div id="php-fill" class="fill hp"></div><span id="php-text" class="bar-text"></span></div>
        <div class="bar stam-bar"><div id="pstam-fill" class="fill stamina"></div></div>
        <div class="bar xp-bar"><div id="pxp-fill" class="fill xp-fill"></div><span id="xp" class="bar-text xp-bar-text"></span></div>
      </div>
      <div id="target-frame" class="frame hidden ornate ornate-soft">
        <div id="tname" class="frame-name"></div>
        <div class="bar"><div id="thp-fill" class="fill hp-enemy"></div></div>
      </div>
      <div id="clock"></div>
      <button id="fullscreen-btn" title="Pantalla completa">⛶</button>
      <div id="death-overlay" class="hidden">Has caído.<br><span>El coloso sigue caminando...</span></div>
      ${abilityHtml}
      <div id="toast" class="hidden"></div>
      <div id="fct-container"></div>
      <div id="help">WASD moverte · Shift esprintar · Espacio saltar · Click izq / J atacar · 1: habilidad${blockHint} · Rueda: zoom · I: inventario · F: pantalla completa</div>
    `;
    this.playerHpFill = root.querySelector('#php-fill')!;
    this.playerHpText = root.querySelector('#php-text')!;
    this.targetFrame = root.querySelector('#target-frame')!;
    this.targetHpFill = root.querySelector('#thp-fill')!;
    this.targetName = root.querySelector('#tname')!;
    this.xpEl = root.querySelector('#xp')!;
    this.xpFill = root.querySelector('#pxp-fill')!;
    this.levelEl = root.querySelector('#plevel')!;
    this.clockEl = root.querySelector('#clock')!;
    this.deathEl = root.querySelector('#death-overlay')!;
    this.fctContainer = root.querySelector('#fct-container')!;
    this.toastEl = root.querySelector('#toast')!;
    this.slotCd = root.querySelector('#slot-cd');
    this.stamFill = root.querySelector('#pstam-fill');

    // tooltip de la habilidad al pasar el ratón por el slot
    const slot = root.querySelector('#slot-1') as HTMLElement | null;
    const tooltip = root.querySelector('#tooltip') as HTMLElement | null;
    if (slot && tooltip) {
      slot.addEventListener('mouseenter', () => tooltip.classList.remove('hidden'));
      slot.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
      // el destello de "lista" se limpia solo al terminar la animación
      slot.addEventListener('animationend', () => slot.classList.remove('ready'));
    }
    this.slotEl = slot;
    if (this.sets.length) this.setActiveSet(this.sets[0].id);

    // pantalla completa: botón + tecla F. El HUD es pointer-events:none,
    // así que el botón reactiva los suyos en CSS.
    const fsBtn = root.querySelector('#fullscreen-btn') as HTMLButtonElement;
    const toggleFs = () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    };
    fsBtn.addEventListener('click', () => {
      toggleFs();
      fsBtn.blur(); // que Espacio no re-dispare el botón al saltar
    });
    document.addEventListener('fullscreenchange', () => {
      fsBtn.textContent = document.fullscreenElement ? '🗗' : '⛶';
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat) toggleFs();
    });
  }

  setTarget(id: number): void {
    this.targetId = id;
  }

  update(player: Entity, mobs: Entity[], timeOfDay: number): void {
    const hpPct = (player.hp / player.maxHp) * 100;
    this.playerHpFill.style.width = `${hpPct}%`;
    this.playerHpText.textContent = `${player.hp} / ${player.maxHp}`;
    this.levelEl.textContent = `Nv ${player.level}`;
    const need = xpToNext(player.level);
    const atCap = player.level >= MAX_LEVEL;
    this.xpFill.style.width = atCap ? '100%' : `${(player.xp / need) * 100}%`;
    this.xpEl.textContent = atCap ? 'máximo' : `${player.xp} / ${need} px`;

    // objetivo: el último mob agrediendo/agredido vivo
    const target = mobs.find((m) => m.id === this.targetId && m.alive);
    const engaged =
      target ?? mobs.find((m) => m.alive && (m.aiState === 'chase' || m.aiState === 'attack'));
    if (engaged) {
      this.targetFrame.classList.remove('hidden');
      this.targetName.textContent = `${engaged.name} · Nv ${engaged.level}`;
      this.targetHpFill.style.width = `${(engaged.hp / engaged.maxHp) * 100}%`;
    } else {
      this.targetFrame.classList.add('hidden');
      this.targetId = -1;
    }

    // reloj: icono según el momento del día
    const icon = timeOfDay > 0.24 && timeOfDay < 0.78 ? '☀' : '☾';
    const hours = Math.floor(timeOfDay * 24);
    const mins = Math.floor((timeOfDay * 24 - hours) * 60);
    this.clockEl.textContent = `${icon} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

    this.deathEl.classList.toggle('hidden', player.alive);
    void 0;

    // energía: la barra ámbar; jadeando se apaga a gris
    if (this.stamFill) {
      this.stamFill.style.width = `${(player.stamina / STAMINA_MAX) * 100}%`;
      this.stamFill.classList.toggle('winded', player.winded);
    }

    // cooldown de la habilidad: cortina que baja hasta despejarse,
    // y destello dorado en el instante en que vuelve a estar lista
    if (this.slotCd) {
      const pct = Math.max(0, player.abilityCooldown / this.abilityCooldownTotal) * 100;
      this.slotCd.style.height = `${pct}%`;
      if (this.prevAbilityCd > 0 && player.abilityCooldown <= 0 && this.slotEl) {
        this.slotEl.classList.remove('ready');
        void this.slotEl.offsetWidth; // reinicia la animación CSS
        this.slotEl.classList.add('ready');
      }
      this.prevAbilityCd = player.abilityCooldown;
    }
  }

  // Aviso breve en el centro de la pantalla (zurrón lleno, etc.)
  toast(text: string, ms = 4000): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  // Sustituye la lista de sets (p. ej. al lootear la segunda arma) y
  // refresca el slot activo. Con un solo set, el botón X se oculta.
  setSets(sets: SetInfo[], activeId: string): void {
    this.sets = sets;
    this.setActiveSet(activeId);
  }

  // Refleja el set activo: slot principal con su habilidad, y el pequeño
  // muestra a qué te cambiará la X.
  setActiveSet(id: string): void {
    const active = this.sets.find((s) => s.id === id);
    const other = this.sets.find((s) => s.id !== id);
    if (!active) return;
    this.abilityCooldownTotal = active.cooldown;
    const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
    const g = q('#slot-glyph');
    if (g) g.textContent = GLYPHS[active.id] ?? '✦';
    const n = q('#slot-name');
    if (n) n.textContent = active.nombre;
    const tn = q('#tt-name');
    if (tn) tn.textContent = active.nombre;
    const tc = q('#tt-cd');
    if (tc) tc.textContent = `Tecla 1 · enfriamiento ${active.cooldown}s`;
    const td = q('#tt-desc');
    if (td) td.textContent = active.desc;
    const sg = q('#swap-glyph');
    if (sg && other) sg.textContent = GLYPHS[other.id] ?? '✦';
    const swapSlot = q('#slot-swap');
    if (swapSlot) swapSlot.style.display = other ? '' : 'none';
  }
}
