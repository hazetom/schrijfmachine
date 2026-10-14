// De linkerkantlijn tijdens het schrijven: hoofdstukken (en delen) en het scènedoel.
// Alleen zichtbaar als je met de muis naar links gaat; weg zodra je typt.

import { store } from './store.js';
import { el } from './ui.js';

export class Kantlijn {
  constructor({ openHoofdstuk }) {
    this.el = document.getElementById('kantlijn');
    this.blad = document.getElementById('blad');
    this.kader = document.getElementById('tekstkader');
    this.openHoofdstuk = openHoofdstuk;
    this.zichtbaar = false;
    this.blad.addEventListener('mousemove', (e) => this.muis(e));
    this.blad.addEventListener('mouseleave', () => this.verberg());
    this.el.addEventListener('mouseleave', (e) => { if (e.clientX >= this.kader.getBoundingClientRect().left) this.verberg(); });
  }

  ruimte() {
    return this.kader.getBoundingClientRect().left - this.blad.getBoundingClientRect().left - 72;
  }

  muis(e) {
    const kr = this.kader.getBoundingClientRect();
    if (e.clientX < kr.left - 24) {
      if (!this.zichtbaar) this.toon();
    } else if (e.clientX >= kr.left && this.zichtbaar && !this.el.contains(e.target)) {
      this.verberg();
    }
  }

  toon() {
    const ruimte = this.ruimte();
    if (ruimte < 170 || document.getElementById('app').dataset.view !== 'schrijven') return;
    this.el.style.width = Math.min(300, ruimte) + 'px';
    this.render();
    this.el.hidden = false;
    this.zichtbaar = true;
  }

  verberg() {
    if (!this.zichtbaar) return;
    this.el.hidden = true;
    this.zichtbaar = false;
  }

  render() {
    const huidig = store.meta.huidig;
    const lijst = el('ol', { class: 'kl-lijst' });
    let nr = 0;
    for (const r of store.rijen()) {
      if (r.soort === 'deel') {
        lijst.append(el('li', { class: 'kl-deel', text: r.deel.titel || 'Zonder titel' }));
        continue;
      }
      nr++;
      const h = r.h;
      const lijn = h.lijn ? store.verhaallijn(h.lijn) : null;
      const knop = el('button', { class: 'kl-hoofdstuk' + (h.id === huidig ? ' huidig' : '') + (store.isVergrendeld(h.id) ? ' slot' : ''), title: h.titel },
        el('span', { class: 'kl-nr', text: String(nr) }),
        el('span', { class: 'vlak' + (lijn && lijn.kleur ? '' : ' geen'), 'aria-hidden': 'true', style: { backgroundColor: lijn && lijn.kleur ? lijn.kleur : 'transparent' } }),
        el('span', { class: 'kl-titel', text: h.titel || 'Zonder titel' }));
      knop.addEventListener('click', () => { this.verberg(); this.openHoofdstuk(h.id); });
      lijst.append(el('li', {}, knop));
    }
    const h = store.huidig();
    this.el.innerHTML = '';
    this.el.append(lijst);
    if (h && h.doel && h.doel.trim()) {
      this.el.append(el('div', { class: 'kl-doel' }, el('span', { class: 'kl-label', text: 'Scènedoel' }), el('p', { text: h.doel })));
    }
  }
}
