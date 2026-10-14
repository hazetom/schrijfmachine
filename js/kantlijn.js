// De linkerkantlijn tijdens het schrijven: hoofdstukken (en delen) en het scènedoel.
// Alleen zichtbaar als je met de muis naar links gaat; weg zodra je typt.

import { store } from './store.js';
import { el } from './ui.js';
import { lees, instellingen } from './instellingen.js';

export class Kantlijn {
  constructor({ openHoofdstuk, openOverzicht }) {
    this.openOverzicht = openOverzicht;
    this.el = document.getElementById('kantlijn');
    this.blad = document.getElementById('blad');
    this.kader = document.getElementById('tekstkader');
    this.openHoofdstuk = openHoofdstuk;
    this.zichtbaar = false;
    this.blad.addEventListener('mousemove', (e) => this.muis(e));
    this.blad.addEventListener('mouseleave', () => this.verberg());
    this.el.addEventListener('mouseleave', (e) => { if (e.clientX >= this.kader.getBoundingClientRect().left) this.verberg(); });
    instellingen.addEventListener('gewijzigd', (e) => { if (e.detail.naam === 'kantlijnVast') this.werkBij(); });
    new ResizeObserver(() => this.werkBij()).observe(this.blad);
  }

  get vast() { return !!lees('kantlijnVast'); }

  // Bij vast: altijd tonen als er ruimte is. Anders alleen opnieuw tekenen als hij open staat.
  werkBij() {
    if (this.vast) { this.zichtbaar = false; this.toon(); if (!this.zichtbaar) this.el.hidden = true; }
    else if (this.zichtbaar) this.render();
  }

  ruimte() {
    return this.kader.getBoundingClientRect().left - this.blad.getBoundingClientRect().left - 72;
  }

  muis(e) {
    if (this.vast) return;
    const kr = this.kader.getBoundingClientRect();
    if (e.clientX < kr.left - 24) {
      if (!this.zichtbaar) this.toon();
    } else if (e.clientX >= kr.left && this.zichtbaar && !this.el.contains(e.target)) {
      this.verberg();
    }
  }

  toon() {
    const ruimte = this.ruimte();
    if (ruimte < 170 || document.getElementById('app').dataset.view !== 'schrijven') { if (this.zichtbaar) { this.el.hidden = true; this.zichtbaar = false; } return; }
    this.el.style.width = Math.min(300, ruimte) + 'px';
    this.render();
    this.el.hidden = false;
    this.zichtbaar = true;
  }

  verberg(ookVast = false) {
    if (!this.zichtbaar || (this.vast && !ookVast)) return;
    this.el.hidden = true;
    this.zichtbaar = false;
  }

  render() {
    const huidig = store.meta.huidig;
    const lijst = el('ol', { class: 'kl-lijst' });
    const nummers = store.nummers();
    for (const r of store.rijen()) {
      if (r.soort === 'deel') {
        lijst.append(el('li', { class: 'kl-deel', text: r.deel.titel || 'Zonder titel' }));
        continue;
      }
      const h = r.h;
      const nr = nummers[h.id];
      const lijn = h.lijn ? store.verhaallijn(h.lijn) : null;
      const knop = el('button', { class: 'kl-hoofdstuk' + (h.id === huidig ? ' huidig' : '') + (store.isVergrendeld(h.id) ? ' slot' : ''), title: h.titel },
        el('span', { class: 'kl-nr', text: nr == null ? '' : String(nr) }),
        el('span', { class: 'vlak' + (lijn && lijn.kleur ? '' : ' geen'), 'aria-hidden': 'true', style: { backgroundColor: lijn && lijn.kleur ? lijn.kleur : 'transparent' } }),
        el('span', { class: 'kl-titel', text: h.titel || 'Zonder titel' }));
      knop.addEventListener('click', () => { this.verberg(); this.openHoofdstuk(h.id); if (this.vast) this.werkBij(); });
      lijst.append(el('li', {}, knop));
    }
    const h = store.huidig();
    this.el.innerHTML = '';
    const overzicht = el('button', { class: 'kl-overzicht', text: 'Overzicht' });
    overzicht.addEventListener('click', () => { this.verberg(true); this.openOverzicht(); });
    this.el.append(overzicht, lijst);
    if (h && h.doel && h.doel.trim()) {
      this.el.append(el('div', { class: 'kl-doel' }, el('span', { class: 'kl-label', text: 'Scènedoel' }), el('p', { text: h.doel })));
    }
  }
}
