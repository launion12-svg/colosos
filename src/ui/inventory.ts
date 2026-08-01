// La ventana de inventario (tecla I), al estilo clásico de Diablo:
// paper-doll con los slots de equipo alrededor de la silueta y la
// cuadrícula del zurrón debajo, con iconos renderizados de los modelos.
// Lee el sim y solo lo muta a través de sim.equipStored (validado allí).

import { CLASSES, weaponName } from '../game/classes';
import type { Sim } from '../sim/sim';
import { BAG_SLOTS, RARITY_NAMES } from '../sim/abilities';
import { HELMET_NAMES } from '../sim/types';
import { iconFactory } from './icon_factory';

export class InventoryWindow {
  private el: HTMLElement;
  private visible = false;
  private dragging: string | null = null;

  constructor(
    root: HTMLElement,
    private sim: Sim,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'inventory';
    this.el.classList.add('ornate');
    this.el.classList.add('hidden');
    root.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyI') this.toggle();
      if (e.code === 'Escape' && this.visible) this.toggle();
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
    if (this.visible) this.render();
  }

  // Refresca si está abierta (p. ej. al lootear con la ventana abierta)
  refresh(): void {
    if (this.visible) this.render();
  }

  private applyIcon(cell: HTMLElement, modelPath: string, rarity: number): void {
    void iconFactory.icon(modelPath, rarity).then((url) => {
      const img = cell.querySelector('img');
      if (img) (img as HTMLImageElement).src = url;
    });
  }

  private weaponCellHtml(setId: string, cls: string): string {
    const def = CLASSES.find((c) => c.id === setId);
    if (!def) return '';
    const rarity = this.sim.player.weaponRarity[setId] ?? 0;
    const nombre = weaponName(setId, rarity);
    const arrastrable = cls.includes('clickable');
    const pista = arrastrable ? ' · arrástrala a una mano o haz click' : '';
    return `<div class="inv-cell ornate ornate-slot ${cls} r${rarity}" data-id="${setId}" data-model="${def.weapons[0].model}" data-rarity="${rarity}" ${arrastrable ? 'draggable="true"' : ''} title="${nombre} — ${def.rol} · Calidad: ${RARITY_NAMES[rarity]}${pista}">
        <img alt="${nombre}" draggable="false" />
      </div>`;
  }

  // El hueco de la cabeza: con casco muestra su calidad y se puede quitar de
  // un click (para verte la cara); vacío, dice de dónde salen.
  private helmetSlotHtml(): string {
    const p = this.sim.player;
    if (p.helmet < 0) {
      return `<div class="doll-slot locked" style="grid-area: head" title="Casco — cae de las criaturas"><span>⛑</span></div>`;
    }
    const nombre = HELMET_NAMES[p.helmet];
    return `<div class="doll-slot ${p.helmetOn ? 'in-hand' : ''}" style="grid-area: head"
        title="${nombre} · Calidad: ${RARITY_NAMES[p.helmet]} · click para ${p.helmetOn ? 'quitártelo' : 'ponértelo'}">
        <div class="doll-slot-label">${p.helmetOn ? 'PUESTO' : 'Guardado'}</div>
        <div class="inv-cell ornate ornate-slot helmet-cell r${p.helmet}"><span>⛑</span></div>
        <div class="doll-wname r${p.helmet}">${nombre}</div>
      </div>`;
  }

  private render(): void {
    const p = this.sim.player;
    const activeA = !p.activeSetB;
    const bag = p.ownedWeapons.filter((id) => id !== p.setA && id !== p.setB);
    const defOf = (id: string) => CLASSES.find((c) => c.id === id);
    const handDef = defOf(activeA ? p.setA : p.setB);
    const bagCells = BAG_SLOTS;

    this.el.innerHTML = `
      <div class="inv-title">${p.name} · Nv ${p.level}</div>
      <div class="inv-doll">
        <div class="inv-silhouette"></div>
        ${this.helmetSlotHtml()}
        <div class="doll-slot locked" style="grid-area: amulet" title="Amuleto — llegará con las armaduras"><span>◈</span></div>
        <div class="doll-slot drop-slot ${activeA ? 'in-hand' : ''}" data-slot="A" style="grid-area: main" title="Arma principal — suelta aquí un arma del zurrón">
          <div class="doll-slot-label">${activeA ? 'EN MANO' : 'Guardada'}</div>
          ${this.weaponCellHtml(p.setA, 'equipped')}
          <div class="doll-wname r${p.weaponRarity[p.setA] ?? 0}">${weaponName(p.setA, p.weaponRarity[p.setA] ?? 0)}</div>
        </div>
        <div class="doll-slot locked" style="grid-area: chest" title="Peto — llegará con las armaduras"><span>🛡</span></div>
        <div class="doll-slot drop-slot ${!activeA ? 'in-hand' : ''}" data-slot="B" style="grid-area: off" title="Arma secundaria (X para cambiar) — suelta aquí un arma del zurrón">
          <div class="doll-slot-label">${!activeA ? 'EN MANO' : 'Guardada'}</div>
          ${p.setB ? this.weaponCellHtml(p.setB, 'equipped') : '<div class="inv-cell empty" title="Cae de las criaturas"></div>'}
          <div class="doll-wname r${p.weaponRarity[p.setB] ?? 0}">${p.setB ? weaponName(p.setB, p.weaponRarity[p.setB] ?? 0) : 'vacío'}</div>
        </div>
        <div class="doll-slot locked" style="grid-area: ring1" title="Anillo — llegará con las armaduras"><span>◯</span></div>
        <div class="doll-slot locked" style="grid-area: ring2" title="Anillo — llegará con las armaduras"><span>◯</span></div>
      </div>
      <div class="inv-bagcount">Zurrón ${p.ownedWeapons.length}/${BAG_SLOTS}</div>
      <div class="inv-grid">
        ${bag.map((id) => this.weaponCellHtml(id, 'clickable')).join('')}
        ${Array.from({ length: Math.max(0, bagCells - bag.length) }, () => '<div class="inv-cell empty"></div>').join('')}
      </div>
      <div class="inv-hint">Arrastra un arma sobre cualquiera de las dos manos para equiparla ahí · Click: va al hueco guardado · X en combate: cambiar de mano · I / Esc: cerrar</div>
    `;

    // el retrato de la silueta: el héroe activo renderizado
    if (handDef) {
      void iconFactory.icon(handDef.model).then((url) => {
        const sil = this.el.querySelector('.inv-silhouette') as HTMLElement | null;
        if (sil) sil.style.backgroundImage = `url(${url})`;
      });
    }

    // iconos renderizados de los modelos
    for (const cell of this.el.querySelectorAll<HTMLElement>('.inv-cell[data-model]')) {
      this.applyIcon(cell, cell.dataset.model ?? '', Number(cell.dataset.rarity ?? 0));
    }
    const casco = this.el.querySelector<HTMLElement>('.helmet-cell');
    casco?.addEventListener('click', () => {
      if (this.sim.toggleHelmet()) this.render();
    });
    for (const cell of this.el.querySelectorAll<HTMLElement>('.inv-cell.clickable')) {
      cell.addEventListener('click', () => {
        const id = cell.dataset.id;
        if (id && this.sim.equipStored(id)) this.render();
      });
      cell.addEventListener('dragstart', (e) => {
        const id = cell.dataset.id ?? '';
        (e as DragEvent).dataTransfer?.setData('text/plain', id);
        this.dragging = id;
        this.el.classList.add('dragging');
      });
      cell.addEventListener('dragend', () => {
        this.dragging = null;
        this.el.classList.remove('dragging');
      });
    }

    // las dos manos son destino de arrastre: así se cambia también la principal
    for (const slot of this.el.querySelectorAll<HTMLElement>('.drop-slot')) {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drop-hover');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop-hover'));
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drop-hover');
        const id = (e as DragEvent).dataTransfer?.getData('text/plain') || this.dragging;
        const destino = slot.dataset.slot === 'A' ? 'A' : 'B';
        if (id && this.sim.equipInto(id, destino)) this.render();
        else this.rechazo(slot);
      });
    }
  }

  // sacudida corta: el hueco dice que no sin necesidad de texto
  private rechazo(el: HTMLElement): void {
    el.classList.remove('drop-nope');
    void el.offsetWidth; // reinicia la animación
    el.classList.add('drop-nope');
  }
}
