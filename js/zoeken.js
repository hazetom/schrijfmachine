// Zoeken (en vervangen) door het hele manuscript. Ctrl+F.

import { store } from './store.js';
import { mdToBlocks, blocksToMd, normalizeRuns } from './markdown.js';
import { el, dialoog } from './ui.js';
import { maakSnapshot } from './snapshots.js';

function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export class Zoeken {
  constructor({ openTreffer, voorZoeken, naVervangen }) {
    this.paneel = document.getElementById('zoekpaneel');
    this.openTreffer = openTreffer;   // (id, { blok, start, lengte })
    this.voorZoeken = voorZoeken;     // editor eerst bewaren
    this.naVervangen = naVervangen;   // editor opnieuw laden
    this.treffers = [];
    this.actief = -1;
    this.bouw();
  }

  get open() { return !this.paneel.hidden; }

  bouw() {
    this.veld = el('input', { type: 'search', placeholder: 'Zoek in je manuscript', 'aria-label': 'Zoeken', class: 'zoekveld' });
    this.hoofdletters = el('input', { type: 'checkbox', 'aria-label': 'Hoofdlettergevoelig' });
    this.vervangVeld = el('input', { type: 'text', placeholder: 'Vervang door', 'aria-label': 'Vervang door', class: 'zoekveld' });
    this.info = el('p', { class: 'zoek-info' });
    this.lijst = el('div', { class: 'zoek-lijst', role: 'listbox' });
    const vervangKnop = el('button', { class: 'knop link', text: 'Vervang alles', onclick: () => this.vervangAlles() });
    const sluit = el('button', { class: 'knop', 'aria-label': 'Zoeken sluiten', title: 'Sluiten (Esc)', text: '×', style: { fontSize: '20px' }, onclick: () => this.sluit() });
    this.paneel.append(
      el('div', { class: 'zoek-kop' }, this.veld, sluit),
      el('label', { class: 'zoek-optie' }, this.hoofdletters, ' Hoofdlettergevoelig'),
      this.info,
      this.lijst,
      el('div', { class: 'zoek-vervang' }, this.vervangVeld, vervangKnop),
    );
    let t = null;
    this.veld.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.zoek(), 150); });
    this.hoofdletters.addEventListener('change', () => this.zoek());
    this.paneel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.sluit(); }
      else if (e.key === 'Enter' && e.target === this.veld) { e.preventDefault(); this.ga(e.shiftKey ? -1 : 1); }
      else if (e.key === 'ArrowDown' && e.target === this.veld) { e.preventDefault(); this.ga(1); }
      else if (e.key === 'ArrowUp' && e.target === this.veld) { e.preventDefault(); this.ga(-1); }
    });
  }

  toon(beginTekst = '') {
    this.paneel.hidden = false;
    if (beginTekst) this.veld.value = beginTekst;
    this.veld.focus();
    this.veld.select();
    this.zoek();
  }

  sluit() {
    this.paneel.hidden = true;
    // verder typen op de plek van de laatste treffer
    const t = this.treffers[this.actief];
    if (t) this.openTreffer(t.id, { blok: t.blok, start: t.start + t.lengte, lengte: 0 });
    else document.getElementById('tekst').focus({ preventScroll: true });
    if (window.CSS && CSS.highlights) CSS.highlights.delete('zoektreffer');
  }

  regex() {
    const q = this.veld.value;
    if (!q) return null;
    return new RegExp(escRegex(q), this.hoofdletters.checked ? 'g' : 'gi');
  }

  zoek() {
    this.voorZoeken();
    this.treffers = [];
    this.actief = -1;
    this.lijst.innerHTML = '';
    const re = this.regex();
    if (!re) { this.info.textContent = ''; return; }
    let nr = 0;
    for (const h of store.lijst()) {
      nr++;
      mdToBlocks(h.md).forEach((b, blok) => {
        if (b.type === 'scene') return;
        const tekst = b.runs.map((r) => r.t).join('');
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(tekst))) {
          this.treffers.push({ id: h.id, titel: h.titel, nr, blok, start: m.index, lengte: m[0].length, tekst });
          if (!m[0].length) re.lastIndex++;
        }
      });
    }
    const n = this.treffers.length;
    this.info.textContent = n ? n + (n === 1 ? ' keer gevonden' : ' keer gevonden') + (n > 200 ? ', de eerste 200 staan hieronder' : '') : 'Niets gevonden';
    this.treffers.slice(0, 200).forEach((t, k) => {
      const voor = t.tekst.slice(Math.max(0, t.start - 40), t.start);
      const na = t.tekst.slice(t.start + t.lengte, t.start + t.lengte + 60);
      const knop = el('button', { class: 'zoek-treffer', role: 'option', 'data-k': k },
        el('span', { class: 'zoek-waar', text: t.nr + ' · ' + (t.titel || 'Zonder titel') }),
        el('span', { class: 'zoek-stuk' }, (t.start > 40 ? '…' : '') + voor, el('mark', { text: t.tekst.substr(t.start, t.lengte) }), na + '…'));
      knop.addEventListener('click', () => this.kies(k));
      this.lijst.append(knop);
    });
  }

  ga(delta) {
    if (!this.treffers.length) return;
    const n = Math.min(this.treffers.length, 200);
    this.kies((this.actief + delta + n) % n, true);
  }

  kies(k, focusVeld = false) {
    const t = this.treffers[k];
    if (!t) return;
    this.actief = k;
    this.lijst.querySelectorAll('.zoek-treffer').forEach((b) => b.setAttribute('aria-selected', b.dataset.k === String(k) ? 'true' : 'false'));
    const knop = this.lijst.querySelector(`[data-k="${k}"]`);
    if (knop) knop.scrollIntoView({ block: 'nearest' });
    this.openTreffer(t.id, { blok: t.blok, start: t.start, lengte: t.lengte, focus: false });
    if (focusVeld) this.veld.focus();
  }

  async vervangAlles() {
    this.voorZoeken();
    const re = this.regex();
    if (!re) return;
    const door = this.vervangVeld.value;
    // tellen wat er echt vervangen kan worden (binnen één stuk opmaak)
    const plan = [];
    let aantal = 0, overgeslagen = 0;
    for (const h of store.lijst()) {
      let veranderd = false;
      const blocks = mdToBlocks(h.md).map((b) => {
        if (b.type === 'scene') return b;
        const geheel = (b.runs.map((r) => r.t).join('').match(re) || []).length;
        let hier = 0;
        const runs = b.runs.map((r) => {
          const n = (r.t.match(re) || []).length;
          if (!n) return r;
          hier += n;
          veranderd = true;
          return { ...r, t: r.t.replace(re, () => door) };
        });
        aantal += hier;
        overgeslagen += Math.max(0, geheel - hier);
        return { type: b.type, runs: normalizeRuns(runs) };
      });
      if (veranderd) plan.push({ id: h.id, md: blocksToMd(blocks) });
    }
    if (!aantal) {
      await dialoog({ titel: 'Niets te vervangen', inhoud: [overgeslagen ? 'De treffers lopen over vet of cursief heen; die kun je beter met de hand aanpassen.' : 'Er is niets gevonden.'], knoppen: [{ tekst: 'Oké', waarde: null, hoofd: true }] });
      return;
    }
    const ok = await dialoog({
      titel: 'Alles vervangen?',
      inhoud: [
        `"${this.veld.value}" wordt ${aantal} keer vervangen door "${door}", in ${plan.length} ${plan.length === 1 ? 'hoofdstuk' : 'hoofdstukken'}.`,
        overgeslagen ? el('p', { class: 'klein', text: overgeslagen + ' treffer(s) lopen over vet of cursief heen en worden overgeslagen.' }) : null,
        el('p', { class: 'klein', text: 'Er wordt eerst een versie bewaard, dus dit is altijd terug te draaien via Meer > Versies terugzetten.' }),
      ],
      knoppen: [{ tekst: 'Annuleer', waarde: false }, { tekst: 'Vervang', waarde: true, hoofd: true }],
    });
    if (!ok) return;
    await store.bewaarLokaal();
    await maakSnapshot('vlak voor vervangen van "' + this.veld.value + '"');
    for (const p of plan) store.zetTekst(p.id, p.md);
    this.naVervangen();
    this.zoek();
  }
}
