// La ventana de talentos (tecla T): un árbol por arma equipada, en columnas.
// Solo lee el sim y gasta puntos por sim.spendTalent, que es quien conoce las
// reglas; aquí no se valida nada a mano para que interfaz y sim no discrepen.

import { CLASSES, weaponName } from '../game/classes';
import type { Sim } from '../sim/sim';
import { TALENT_TREES, TIER_REQ, canSpend, pointsInTree, treeTotalRanks } from '../sim/talents';
import { WEAPON_MAX_LEVEL, weaponXpToNext } from '../sim/types';

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
            const puede =
              canSpend(this.sim.player.talents, setId, n.id) && this.puntosDe(setId) > 0;
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
    const p = this.sim.player;
    const nivel = p.weaponLevel[setId] ?? 1;
    const xp = p.weaponXp[setId] ?? 0;
    const tope = nivel >= WEAPON_MAX_LEVEL;
    const need = weaponXpToNext(nivel);
    const pct = tope ? 100 : Math.min(100, (xp / need) * 100);
    const sinGastar = this.puntosDe(setId);
    const total = treeTotalRanks(setId);
    return `<div class="talent-tree${enMano ? ' in-hand' : ''}">
        <div class="tt-head">${def?.nombre ?? setId}<span>${weaponName(setId, rarity)}</span></div>
        <div class="tt-mastery">
          <div class="ttm-line">Maestría ${nivel}/${WEAPON_MAX_LEVEL}${enMano ? ' · EN MANO' : ''}</div>
          <div class="ttm-bar"><div class="ttm-fill" style="width:${pct}%"></div></div>
          <div class="ttm-xp">${tope ? 'maestría completa' : `${xp} / ${need} de uso`}</div>
        </div>
        <div class="tt-points">
          <b>${sinGastar}</b> por gastar · ${invertidos}/${total} invertidos
          ${sinGastar > 0 ? '<span class="tt-ping">¡elige!</span>' : ''}
        </div>
        ${filas}
        <button class="tree-reset ornate-soft" data-set="${setId}">Reiniciar este árbol</button>
      </div>`;
  }

  private puntosDe(setId: string): number {
    return this.sim.player.talentPoints[setId] ?? 0;
  }

  private render(): void {
    const p = this.sim.player;
    const enMano = this.sim.activeSetId;
    const equipadas = [p.setA, p.setB].filter(Boolean);
    const total = equipadas.reduce((a, id) => a + this.puntosDe(id), 0);
    this.el.innerHTML = `
      <div class="talent-title">Maestría de armas · ${total} punto${total === 1 ? '' : 's'} sin gastar</div>
      <div class="talent-sub">
        El nivel es del ARMA: sube usándola, y cada nivel de maestría da un punto para su árbol.
        Un arma recién caída empieza de cero. Nunca dan para llenarlo entero, así que el camino lo eliges tú.
      </div>
      <div class="talent-cols">
        ${equipadas.map((id) => this.treeHtml(id, id === enMano)).join('')}
      </div>
      <div class="talent-foot">
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
    for (const btn of this.el.querySelectorAll<HTMLElement>('.tree-reset')) {
      btn.addEventListener('click', () => {
        this.sim.resetTalents(btn.dataset.set ?? '');
        this.render();
      });
    }
  }

  private rechazo(el: HTMLElement): void {
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
  }
}
