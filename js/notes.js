// Zijpaneel met notities: Personages, Verhaallijnen en Ideeën.

import { store, TABS, KLEUREN } from './store.js';
import { el, dialoog } from './ui.js';
import { maakRijk } from './richtext.js';
import { mdToHtml, domToMd } from './markdown.js';

export class Notities {
  constructor({ opWijziging }) {
    this.paneel = document.getElementById('notities');
    this.tabsEl = document.getElementById('notitie-tabs');
    this.lijstEl = document.getElementById('notitie-lijst');
    this.detailEl = document.getElementById('notitie-detail');
    this.tab = 'personages';
    this.gekozen = {};
    this.bewaarTimer = null;
    this.tekstVeld = null;
    this.opWijziging = opWijziging || (() => {});
    this.renderTabs();
  }

  get open() { return !this.paneel.hidden; }

  toon(tab = null) {
    if (tab) this.tab = tab;
    this.paneel.hidden = false;
    this.paneel.closest('.schrijfvlak').classList.add('met-notities');
    this.render();
  }

  verberg() {
    this.bewaar();
    this.paneel.hidden = true;
    this.paneel.closest('.schrijfvlak').classList.remove('met-notities');
  }

  renderTabs() {
    this.tabsEl.innerHTML = '';
    this.tabsEl.setAttribute('role', 'tablist');
    for (const t of TABS) {
      const b = el('button', { class: 'knop', role: 'tab', 'aria-selected': t.key === this.tab ? 'true' : 'false', text: t.label });
      b.addEventListener('click', () => { this.bewaar(); this.tab = t.key; this.render(); });
      this.tabsEl.appendChild(b);
    }
  }

  verwerp() {
    clearTimeout(this.bewaarTimer);
    this.tekstVeld = null;
  }

  render() {
    this.bewaar();
    this.renderTabs();
    const items = store.notities(this.tab);
    if (!items.find((n) => n.id === this.gekozen[this.tab])) this.gekozen[this.tab] = items.length ? items[0].id : null;
    this.renderLijst();
    this.renderDetail();
  }

  renderLijst() {
    const t = TABS.find((x) => x.key === this.tab);
    const items = store.notities(this.tab);
    this.lijstEl.innerHTML = '';
    for (const it of items) {
      const rij = el('button', { class: 'notitie-rij', 'aria-current': it.id === this.gekozen[this.tab] ? 'true' : 'false', 'data-id': it.id },
        this.tab !== 'ideeen' ? el('span', { class: 'vlak' + (it.kleur ? '' : ' leeg'), 'aria-hidden': 'true', style: { backgroundColor: it.kleur || 'transparent' } }) : null,
        el('span', { class: 'naam', text: it.naam || 'Zonder naam' }),
        it.sub ? el('span', { class: 'sub', text: it.sub }) : null);
      rij.addEventListener('click', () => { this.bewaar(); this.gekozen[this.tab] = it.id; this.renderLijst(); this.renderDetail(); });
      this.lijstEl.appendChild(rij);
    }
    const nieuw = el('button', { class: 'knop notitie-nieuw', text: '+ Nieuw ' + t.enkel });
    nieuw.addEventListener('click', () => {
      this.bewaar();
      const velden = {};
      if (this.tab === 'verhaallijnen') velden.kleur = KLEUREN[store.notities('verhaallijnen').length % KLEUREN.length].waarde;
      const item = store.nieuweNotitie(this.tab, velden);
      this.gekozen[this.tab] = item.id;
      this.render();
      const n = this.detailEl.querySelector('.naamveld');
      if (n) n.focus();
    });
    this.lijstEl.appendChild(nieuw);
  }

  renderDetail() {
    this.bewaar();
    const d = this.detailEl;
    d.innerHTML = '';
    this.tekstVeld = null;
    const t = TABS.find((x) => x.key === this.tab);
    const it = store.notities(this.tab).find((n) => n.id === this.gekozen[this.tab]);
    if (!it) {
      d.append(el('p', { class: 'leeg-hint', text: 'Nog geen ' + t.label.toLowerCase() + '.' }));
      return;
    }
    const naam = el('input', { class: 'naamveld', type: 'text', value: it.naam, placeholder: 'Naam', 'aria-label': 'Naam' });
    naam.addEventListener('input', () => {
      store.wijzigNotitie(this.tab, it.id, { naam: naam.value });
      const r = this.lijstEl.querySelector(`[data-id="${it.id}"] .naam`);
      if (r) r.textContent = naam.value || 'Zonder naam';
      this.opWijziging();
    });
    naam.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (sub || tekst).focus(); } });
    d.append(naam);
    let sub = null;
    if (t.sub) {
      sub = el('input', { class: 'subveld', type: 'text', value: it.sub || '', placeholder: t.sub, 'aria-label': t.sub });
      sub.addEventListener('input', () => { store.wijzigNotitie(this.tab, it.id, { sub: sub.value }); this.renderLijstStil(); });
      sub.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tekst.focus(); } });
      d.append(sub);
    }
    if (this.tab !== 'ideeen') {
      const kleuren = el('div', { class: 'kleuren', role: 'group', 'aria-label': 'Kleur' });
      const geen = el('button', { class: 'kleur-keuze', 'aria-pressed': !it.kleur ? 'true' : 'false', title: 'Geen kleur', 'aria-label': 'Geen kleur' }, el('span', { style: { outline: '1px solid #C9C4B8', outlineOffset: '-1px' } }));
      geen.addEventListener('click', () => { store.wijzigNotitie(this.tab, it.id, { kleur: null }); this.render(); this.opWijziging(); });
      kleuren.append(geen);
      for (const k of KLEUREN) {
        const b = el('button', { class: 'kleur-keuze', 'aria-pressed': it.kleur === k.waarde ? 'true' : 'false', title: k.naam, 'aria-label': k.naam }, el('span', { style: { backgroundColor: k.waarde } }));
        b.addEventListener('click', () => { store.wijzigNotitie(this.tab, it.id, { kleur: k.waarde }); this.render(); this.opWijziging(); });
        kleuren.append(b);
      }
      d.append(kleuren);
    }
    const tekst = el('div', { class: 'notitie-tekst', contenteditable: 'true', spellcheck: 'true', lang: 'nl', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Notitie', 'data-placeholder': 'Schrijf hier…' });
    tekst.innerHTML = it.md ? mdToHtml(it.md) : '<p><br></p>';
    maakRijk(tekst, { scene: false });
    const leegCheck = () => tekst.classList.toggle('leeg', !tekst.textContent.trim() && tekst.querySelectorAll('hr').length === 0);
    leegCheck();
    tekst.addEventListener('rijk-wijziging', () => {
      leegCheck();
      clearTimeout(this.bewaarTimer);
      this.bewaarTimer = setTimeout(() => this.bewaar(), 300);
    });
    tekst.dataset.tab = this.tab;
    tekst.dataset.id = it.id;
    this.tekstVeld = tekst;
    d.append(tekst);
    const items = store.notities(this.tab);
    const k = items.indexOf(it);
    d.append(el('div', { class: 'notitie-acties' },
      el('div', {},
        el('button', { class: 'knop', text: 'Omhoog', disabled: k === 0, onclick: () => { this.bewaar(); store.verplaatsNotitie(this.tab, it.id, -1); this.render(); } }),
        el('button', { class: 'knop', text: 'Omlaag', disabled: k === items.length - 1, onclick: () => { this.bewaar(); store.verplaatsNotitie(this.tab, it.id, 1); this.render(); } })),
      el('button', { class: 'knop', text: 'Verwijder', onclick: () => this.verwijder(it) })));
  }

  renderLijstStil() {
    const it = store.notities(this.tab).find((n) => n.id === this.gekozen[this.tab]);
    if (!it) return;
    const r = this.lijstEl.querySelector(`[data-id="${it.id}"]`);
    if (!r) return;
    let s = r.querySelector('.sub');
    if (!s && it.sub) { s = el('span', { class: 'sub' }); r.appendChild(s); }
    if (s) s.textContent = it.sub || '';
  }

  bewaar() {
    clearTimeout(this.bewaarTimer);
    const v = this.tekstVeld;
    if (!v || !v.isConnected) return;
    store.wijzigNotitie(v.dataset.tab, v.dataset.id, { md: domToMd(v) });
  }

  async verwijder(it) {
    const t = TABS.find((x) => x.key === this.tab);
    const ok = await dialoog({
      titel: t.enkel[0].toUpperCase() + t.enkel.slice(1) + ' verwijderen?',
      inhoud: [`"${it.naam || 'Zonder naam'}" wordt verwijderd. Via Meer > Versies terugzetten kun je het terughalen.`],
      knoppen: [{ tekst: 'Annuleer', waarde: false }, { tekst: 'Verwijder', waarde: true, hoofd: true }],
    });
    if (!ok) return;
    const { maakSnapshot } = await import('./snapshots.js');
    this.bewaar();
    await store.bewaarLokaal();
    await maakSnapshot('vlak voor verwijderen van notitie "' + (it.naam || 'Zonder naam') + '"');
    store.verwijderNotitie(this.tab, it.id);
    this.render();
    this.opWijziging();
  }
}
