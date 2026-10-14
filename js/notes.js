// Notities: personagekaarten, verhaallijnen en ideeën, als lijst met een kaart ernaast.

import { store, TABS, KLEUREN } from './store.js';
import { el, dialoog } from './ui.js';
import { maakRijk } from './richtext.js';
import { mdToHtml, domToMd } from './markdown.js';
import { tijdlijn } from './personages.js';
import { personageVerzoek, naarKlembord } from './claude.js';

// Een notitieblok (lijst + kaart) in een eigen vak. Wordt gebruikt voor de personagekaarten
// in Boek, voor Ideeën en Verhaallijnen bij Aantekeningen, en voor een kaart in het spiekbriefje.
export class Notities {
  static alle = [];
  static bewaarAlle() { for (const n of Notities.alle) n.bewaar(); }
  static verwerpAlle() { for (const n of Notities.alle) n.verwerp(); }

  constructor({ root, tabs = ['personages', 'verhaallijnen', 'ideeen'], opWijziging, openMoment, zonderLijst = false }) {
    Notities.alle.push(this);
    this.openMoment = openMoment || (() => {});
    this.tabs = TABS.filter((t) => tabs.includes(t.key));
    this.root = root;
    root.classList.add('notitieblok');
    if (zonderLijst) root.classList.add('zonder-lijst');
    this.tabsEl = el('nav', { class: 'tabs', 'aria-label': 'Soort notitie' });
    this.lijstEl = el('div', { class: 'notitie-lijst' });
    this.detailEl = el('div', { class: 'notitie-detail' });
    if (this.tabs.length < 2) this.tabsEl.hidden = true;
    root.append(this.tabsEl, this.lijstEl, this.detailEl);
    this.tab = this.tabs[0].key;
    this.gekozen = {};
    this.bewaarTimer = null;
    this.tekstVeld = null;
    this.opWijziging = opWijziging || (() => {});
  }

  get open() { return this.root.isConnected && !!this.root.offsetParent; }

  toon(tab = null, id = null) {
    if (tab && this.tabs.some((t) => t.key === tab)) this.tab = tab;
    if (tab && id) this.gekozen[tab] = id;
    this.render();
  }

  kies(id) { this.toon(this.tab, id); }

  renderTabs() {
    this.tabsEl.innerHTML = '';
    this.tabsEl.setAttribute('role', 'tablist');
    for (const t of this.tabs) {
      const b = el('button', { class: 'knop', role: 'tab', 'data-notitietab': t.key, 'aria-selected': t.key === this.tab ? 'true' : 'false', text: t.label });
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
      rij.addEventListener('click', () => { this.bewaar(); this.gekozen[this.tab] = it.id; this.renderLijst(); this.renderDetail(); this.opWijziging('gekozen'); });
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
    if (this.tab === 'personages') {
      const alias = el('input', { class: 'aliasveld', type: 'text', value: (it.aliassen || []).join(', '), placeholder: 'Ook genoemd als (bijvoorbeeld: Frank, meneer Philips)', 'aria-label': 'Ook genoemd als' });
      alias.addEventListener('change', () => {
        const lijst = alias.value.split(',').map((x) => x.trim()).filter(Boolean);
        store.wijzigNotitie('personages', it.id, { aliassen: lijst });
        this.render();
      });
      d.append(alias);
    }
    if (this.tab !== 'ideeen') {
      const kleuren = el('div', { class: 'kleuren', role: 'group', 'aria-label': 'Kleur' });
      const geen = el('button', { class: 'kleur-keuze', 'aria-pressed': !it.kleur ? 'true' : 'false', title: 'Geen kleur', 'aria-label': 'Geen kleur' }, el('span', { style: { outline: '1px solid var(--lijn)', outlineOffset: '-1px' } }));
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
    if (this.tab === 'personages') d.append(this.tijdlijnBlok(it));
    const items = store.notities(this.tab);
    const k = items.indexOf(it);
    d.append(el('div', { class: 'notitie-acties' },
      el('div', {},
        el('button', { class: 'knop', text: 'Omhoog', disabled: k === 0, onclick: () => { this.bewaar(); store.verplaatsNotitie(this.tab, it.id, -1); this.render(); } }),
        el('button', { class: 'knop', text: 'Omlaag', disabled: k === items.length - 1, onclick: () => { this.bewaar(); store.verplaatsNotitie(this.tab, it.id, 1); this.render(); } })),
      el('div', {},
        this.tab === 'personages' ? el('button', { class: 'knop', text: 'Klaar voor Claude', title: 'Kopieer een verzoek om deze kaart bij te werken, met alle passages waarin dit personage voorkomt', onclick: async (e) => {
          this.bewaar();
          const ok = await naarKlembord(personageVerzoek(store.notities('personages').find((x) => x.id === it.id)));
          e.target.textContent = ok ? 'Gekopieerd' : 'Kopiëren lukte niet';
          setTimeout(() => { e.target.textContent = 'Klaar voor Claude'; }, 3000);
        } }) : null,
        el('button', { class: 'knop', text: 'Verwijder', onclick: () => this.verwijder(it) }))));
  }

  // Waar komt dit personage voor? Per hoofdstuk de zinnen, klikbaar.
  tijdlijnBlok(it) {
    const lijn = tijdlijn(it.id);
    const totaal = lijn.reduce((n, x) => n + x.momenten.length, 0);
    const details = el('details', { class: 'tijdlijn' }, el('summary', { text: totaal ? `Komt voor in ${lijn.length} ${lijn.length === 1 ? 'hoofdstuk' : 'hoofdstukken'} (${totaal}×)` : 'Nog nergens in de tekst gevonden' }));
    for (const { h, momenten } of lijn) {
      const n = store.nummer(h.id);
      details.append(el('div', { class: 'tl-hoofdstuk', text: (n == null ? '' : n + '. ') + (h.titel || 'Zonder titel') + ' · ' + momenten.length + '×' }));
      const gezien = new Set();
      for (const m of momenten) {
        if (gezien.has(m.blok + ':' + m.zin)) continue;
        gezien.add(m.blok + ':' + m.zin);
        if (gezien.size > 30) break;
        details.append(el('button', { class: 'tl-moment', text: m.zin.length > 160 ? m.zin.slice(0, 160) + '…' : m.zin, onclick: () => this.openMoment(h.id, m) }));
      }
    }
    return details;
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
