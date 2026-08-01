// La ventana de talentos (tecla T): un árbol por arma equipada, en columnas.
// Solo lee el sim y gasta puntos por sim.spendTalent, que es quien conoce las
// reglas; aquí no se valida nada a mano para que interfaz y sim no discrepen.

import { CLASSES, weaponName } from '../game/classes';
import type { Sim } from '../sim/sim';
import { TALENT_TREES, TIER_REQ, canSpend, pointsInTree } from '../sim/talents';

export class TalentWindow {
  private el: HTMLElement;
  private visible = false;

  constructor(
    root: HTMLElement,
    private sim: Sim,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'talents';
    this.el.classList.add('ornate', 'hidden');
    root.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const enInput = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (enInput) return;
      if (e.code === 'KeyT') this.toggle();
      if (e.code === 'Escape' && this.visible) this.toggle();
    });
    document.getElementById('talent-btn')?.addEventListener('click', () => this.toggle());
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
    if (this.visible) this.render();
  }

  refresh(): void {
    if (this.visible) this.render();
  }

  private treeHtml(setId: string, enMano: boolean): string {
    const nodes = TALENT_TREES[setId];
    if (!nodes) return '';
    const def = CLASSES.find((c) => c.id === setId);
    const invertidos = pointsInTree(this.sim.player.talents, setId);
    const filas = [1, 2, 3]
      .map((tier) => {
        const req = TIER_REQ[tier - 1] ?? 0;
        const abierto = invertidos >= req;
        const celdas = nodes
          .filter((n) => n.tier === tier)
          .map((n) => {
            const rank = this.sim.player.talents[setId]?.[n.id] ?? 0;
            const lleno = rank >= n.maxRank;
            const puede = canSpend(this.sim.player.talents, setId, n.id) && this.puntos > 0;
            const clases = [
              'talent-node',
              lleno ? 'full' : '',
              !abierto ? 'locked' : '',
              puede ? 'available' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return `<div class="${clases}" data-set="${setId}" data-node="${n.id}">
                <div class="tn-name">${n.nombre}</div>
                <div class="tn-rank">${rank}/${n.maxRank}</div>
                <div class="tn-desc">${n.desc}</div>
              </div>`;
          })
          .join('');
        const aviso = abierto ? '' : `<div class="tier-lock">requiere ${req} puntos aquí</div>`;
        return `<div class="talent-tier${abierto ? '' : ' tier-closed'}">${aviso}<div class="tier-row">${celdas}</div></div>`;
      })
      .join('');
    const rarity = this.sim.player.weaponRarity[setId] ?? 0;
    return `<div class="talent-tree${enMano ? ' in-hand' : ''}">
        <div class="tt-head">${def?.nombre ?? setId}<span>${weaponName(setId, rarity)}</span></div>
        <div class="tt-points">${invertidos} puntos invertidos${enMano ? ' · EN MANO' : ''}</div>
        ${filas}
      </div>`;
  }

  private get puntos(): number {
    return this.sim.player.talentPoints;
  }

  private render(): void {
    const p = this.sim.player;
    const enMano = this.sim.activeSetId;
    const equipadas = [p.setA, p.setB].filter(Boolean);
    this.el.innerHTML = `
      <div class="talent-title">Talentos · ${this.puntos} punto${this.puntos === 1 ? '' : 's'} sin gastar</div>
      <div class="talent-sub">Los puntos son del arma, no tuyos: cada arma tiene su camino. Cambiar de arma cambia el build.</div>
      <div class="talent-cols">
        ${equipadas.map((id) => this.treeHtml(id, id === enMano)).join('')}
      </div>
      <div class="talent-foot">
        <button id="talent-reset" class="ornate ornate-soft">Devolver todos los puntos</button>
        <span class="talent-hint">Click en un talento para meter un punto · T / Esc: cerrar</span>
      </div>`;

    for (const node of this.el.querySelectorAll<HTMLElement>('.talent-node')) {
      node.addEventListener('click', () => {
        const set = node.dataset.set ?? '';
        const id = node.dataset.node ?? '';
        if (this.sim.spendTalent(set, id)) this.render();
        else this.rechazo(node);
      });
    }
    this.el.querySelector('#talent-reset')?.addEventListener('click', () => {
      this.sim.resetTalents();
      this.render();
    });
  }

  private rechazo(el: HTMLElement): void {
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
  }
}
