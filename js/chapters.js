// Het hoofdstukkenscherm: lijst met kleurlabels, status en woorden, scènedoel,
// volgorde aanpassen en vergrendelen.

import { store, STATUSSEN } from './store.js';
import { el, dialoog, woorden } from './ui.js';

export class Hoofdstukken {
  constructor({ openSchrijven, openNotities }) {
    this.lijstEl = document.getElementById('hs-lijst');
    this.detailEl = document.getElementById('hs-detail');
    this.slotEl = document.getElementById('hs-slotbalk');
    this.gekozen = null;
    this.openSchrijven = openSchrijven;
    this.openNotities = openNotities;
    this.sleepId = null;
    document.getElementById('hs-nieuw').addEventListener('click', () => {
      const id = store.nieuwHoofdstuk(null);
      this.gekozen = id;
      this.render();
      const t = this.detailEl.querySelector('.titelveld');
      if (t) { t.focus(); t.select(); }
    });
    this.lijstEl.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        this.verschuif(this.gekozen, e.key === 'ArrowUp' ? -1 : 1, true);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const v = store.meta.volgorde;
        const k = v.indexOf(this.gekozen) + (e.key === 'ArrowUp' ? -1 : 1);
        if (k >= 0 && k < v.length) { this.gekozen = v[k]; this.render(); this.focusRij(); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.openSchrijven(this.gekozen);
      }
    });
  }

  toon() {
    this.gekozen = store.meta.huidig;
    this.render();
    const rij = this.lijstEl.querySelector('[aria-current="true"]');
    if (rij) rij.scrollIntoView({ block: 'nearest' });
  }

  focusRij() {
    const rij = this.lijstEl.querySelector('[aria-current="true"]');
    if (rij) { rij.focus(); rij.scrollIntoView({ block: 'nearest' }); }
  }

  render() {
    if (!store.hoofdstuk(this.gekozen)) this.gekozen = store.meta.volgorde[0];
    this.renderSlot();
    this.renderLijst();
    this.renderDetail();
  }

  renderSlot() {
    const s = this.slotEl;
    s.innerHTML = '';
    const slotIcoon = () => {
      const span = el('span', {});
      span.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="1.5"></rect><path d="M8 11V7.5a4 4 0 0 1 8 0V11"></path></svg>';
      return span.firstChild;
    };
    const lijst = store.lijst();
    const slot = store.meta.vergrendeld;
    const vp = store.meta.vergrendelPagina;
    if (slot.length || vp) {
      const nrs = lijst.map((h, k) => (slot.includes(h.id) ? k + 1 : null)).filter(Boolean);
      let tekst;
      const aaneen = nrs.length && nrs[nrs.length - 1] - nrs[0] + 1 === nrs.length;
      if (!nrs.length) tekst = 'Eerdere pagina\'s vergrendeld';
      else if (nrs.length === 1) tekst = 'Hoofdstuk ' + nrs[0] + ' vergrendeld';
      else if (aaneen) tekst = 'Hoofdstuk ' + nrs[0] + ' t/m ' + nrs[nrs.length - 1] + ' vergrendeld';
      else tekst = nrs.length + ' hoofdstukken vergrendeld';
      s.append(
        el('span', { class: 'links' }, slotIcoon(), tekst),
        el('button', { class: 'knop link', text: 'Ontgrendel', onclick: () => { store.zetVergrendeld([], null); this.render(); } }),
      );
      return;
    }
    if (lijst.length < 2) {
      s.append(el('span', { class: 'links' }, slotIcoon(), 'Nog niets vergrendeld'));
      return;
    }
    const van = el('select', { 'aria-label': 'Vanaf hoofdstuk' });
    const tot = el('select', { 'aria-label': 'Tot en met hoofdstuk' });
    lijst.forEach((h, k) => {
      van.append(el('option', { value: k, text: String(k + 1) }));
      tot.append(el('option', { value: k, text: String(k + 1) }));
    });
    const huidigeIndex = Math.max(0, store.meta.volgorde.indexOf(store.meta.huidig));
    tot.value = String(Math.max(0, huidigeIndex - 1));
    s.append(
      el('span', { class: 'links' }, slotIcoon(), 'Vergrendel', van, 't/m', tot),
      el('button', {
        class: 'knop link', text: 'Vergrendel', onclick: () => {
          let a = +van.value, b = +tot.value;
          if (a > b) [a, b] = [b, a];
          store.zetVergrendeld(lijst.slice(a, b + 1).map((h) => h.id), null);
          this.render();
        },
      }),
    );
  }

  renderLijst() {
    const ol = this.lijstEl;
    ol.innerHTML = '';
    store.lijst().forEach((h, k) => {
      const lijn = h.lijn ? store.verhaallijn(h.lijn) : null;
      const rij = el('li', {
        class: 'hs-rij' + (store.isVergrendeld(h.id) ? ' slot' : ''),
        'aria-current': h.id === this.gekozen ? 'true' : 'false',
        tabindex: h.id === this.gekozen ? '0' : '-1',
        draggable: 'true',
        'data-id': h.id,
      },
      el('span', { class: 'hs-nr', text: String(k + 1) }),
      el('span', { class: 'hs-titel', text: h.titel || 'Zonder titel' }),
      el('span', { class: 'hs-lijn' },
        lijn ? el('span', { class: 'vlak', style: { backgroundColor: lijn.kleur || 'transparent' }, 'aria-hidden': 'true' }) : null,
        lijn ? (lijn.naam || 'Verhaallijn') : ''),
      el('span', { class: 'hs-meta', text: (h.status || '') + ' · ' + (h.woorden || 0).toLocaleString('nl-NL') }),
      );
      rij.addEventListener('click', () => { this.gekozen = h.id; this.render(); this.focusRij(); });
      rij.addEventListener('dblclick', () => this.openSchrijven(h.id));
      rij.addEventListener('dragstart', (e) => { this.sleepId = h.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', h.id); });
      rij.addEventListener('dragover', (e) => {
        if (!this.sleepId || this.sleepId === h.id) return;
        e.preventDefault();
        const r = rij.getBoundingClientRect();
        const boven = e.clientY < r.top + r.height / 2;
        rij.classList.toggle('sleep-boven', boven);
        rij.classList.toggle('sleep-onder', !boven);
      });
      rij.addEventListener('dragleave', () => rij.classList.remove('sleep-boven', 'sleep-onder'));
      rij.addEventListener('drop', (e) => {
        e.preventDefault();
        const boven = rij.classList.contains('sleep-boven');
        rij.classList.remove('sleep-boven', 'sleep-onder');
        const v = store.meta.volgorde;
        const sleep = this.sleepId;
        this.sleepId = null;
        if (!sleep || sleep === h.id) return;
        let doel = v.indexOf(h.id) + (boven ? 0 : 1);
        if (v.indexOf(sleep) < doel) doel--;
        store.verplaatsHoofdstuk(sleep, doel);
        this.gekozen = sleep;
        this.render();
      });
      rij.addEventListener('dragend', () => { this.sleepId = null; });
      ol.appendChild(rij);
    });
  }

  verschuif(id, delta, focus = false) {
    const v = store.meta.volgorde;
    store.verplaatsHoofdstuk(id, v.indexOf(id) + delta);
    this.render();
    if (focus) this.focusRij();
  }

  renderDetail() {
    const d = this.detailEl;
    d.innerHTML = '';
    const h = store.hoofdstuk(this.gekozen);
    if (!h) return;
    const nr = store.nummer(h.id);
    const titel = el('input', { class: 'titelveld', type: 'text', value: h.titel, 'aria-label': 'Titel van het hoofdstuk', placeholder: 'Titel' });
    titel.addEventListener('input', () => {
      store.wijzigHoofdstuk(h.id, { titel: titel.value });
      const rijTitel = this.lijstEl.querySelector(`[data-id="${h.id}"] .hs-titel`);
      if (rijTitel) rijTitel.textContent = titel.value || 'Zonder titel';
    });
    titel.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doel.focus(); } });

    const lijnen = store.notities('verhaallijnen');
    const lijnKeuze = el('select', { 'aria-label': 'Verhaallijn' });
    lijnKeuze.append(el('option', { value: '', text: 'Geen verhaallijn' }));
    for (const l of lijnen) lijnKeuze.append(el('option', { value: l.id, text: l.naam || 'Zonder naam' }));
    lijnKeuze.append(el('option', { value: '__nieuw', text: 'Nieuwe verhaallijn…' }));
    lijnKeuze.value = h.lijn || '';
    const lijn = h.lijn ? store.verhaallijn(h.lijn) : null;
    const vlak = el('span', { class: 'vlak' + (lijn && lijn.kleur ? '' : ' leeg'), 'aria-hidden': 'true', style: { backgroundColor: lijn && lijn.kleur ? lijn.kleur : 'transparent' } });
    lijnKeuze.addEventListener('change', async () => {
      if (lijnKeuze.value === '__nieuw') {
        const naam = await vraagTekst('Nieuwe verhaallijn', 'Naam van de verhaallijn', '');
        if (naam) {
          const kleuren = ['#4F6A7E', '#A35F55', '#A88A4E', '#6E7F5E', '#7D6878', '#8E8A81'];
          const kleur = kleuren[lijnen.length % kleuren.length];
          const item = store.nieuweNotitie('verhaallijnen', { naam, kleur });
          store.wijzigHoofdstuk(h.id, { lijn: item.id });
        }
        this.render();
        return;
      }
      store.wijzigHoofdstuk(h.id, { lijn: lijnKeuze.value || null });
      this.render();
    });

    const status = el('select', { 'aria-label': 'Status' });
    for (const s of STATUSSEN) status.append(el('option', { value: s, text: s }));
    if (!STATUSSEN.includes(h.status)) status.append(el('option', { value: h.status, text: h.status }));
    status.value = h.status;
    status.addEventListener('change', () => { store.wijzigHoofdstuk(h.id, { status: status.value }); this.renderLijst(); });

    const doel = el('textarea', { rows: '2', 'aria-label': 'Scènedoel', placeholder: 'Wat moet dit hoofdstuk doen? Wie wil wat, wat staat er op het spel?' });
    doel.value = h.doel || '';
    const groei = () => { doel.style.height = 'auto'; doel.style.height = doel.scrollHeight + 'px'; };
    doel.addEventListener('input', () => { store.wijzigHoofdstuk(h.id, { doel: doel.value }); groei(); });

    const slot = store.isVergrendeld(h.id);
    d.append(
      el('span', { class: 'label', text: 'Hoofdstuk ' + nr + (slot ? ' · vergrendeld' : '') }),
      titel,
      el('div', { class: 'hs-gegevens' },
        el('span', { class: 'met-vlak' }, vlak, lijnKeuze),
        el('span', { text: woorden(h.woorden) }),
        status),
      el('div', { class: 'hs-doel' }, el('span', { class: 'label', text: 'Scènedoel' }), doel),
      el('div', { class: 'hs-knoppen' },
        el('button', { class: 'knop omlijnd', text: 'Verder schrijven', onclick: () => this.openSchrijven(h.id) })),
      el('div', { class: 'hs-klein' },
        el('button', { class: 'knop', text: 'Omhoog', title: 'Alt+pijl omhoog', disabled: nr === 1, onclick: () => this.verschuif(h.id, -1) }),
        el('button', { class: 'knop', text: 'Omlaag', title: 'Alt+pijl omlaag', disabled: nr === store.meta.volgorde.length, onclick: () => this.verschuif(h.id, 1) }),
        el('button', { class: 'knop', text: 'Nieuw hoofdstuk hierna', onclick: () => { this.gekozen = store.nieuwHoofdstuk(h.id); this.render(); const t = this.detailEl.querySelector('.titelveld'); t.focus(); t.select(); } }),
        el('button', { class: 'knop', text: slot ? 'Ontgrendel dit hoofdstuk' : 'Vergrendel dit hoofdstuk', onclick: () => {
          const ids = store.meta.vergrendeld.filter((x) => x !== h.id);
          if (!slot) ids.push(h.id);
          store.zetVergrendeld(ids, store.meta.vergrendelPagina);
          this.render();
        } }),
        el('button', { class: 'knop', text: 'Verhaallijnen', onclick: () => this.openNotities('verhaallijnen') }),
        el('button', { class: 'knop', text: 'Verwijder', disabled: store.meta.volgorde.length <= 1, onclick: () => this.verwijder(h) }),
      ),
    );
    requestAnimationFrame(groei);
  }

  async verwijder(h) {
    const ok = await dialoog({
      titel: 'Hoofdstuk verwijderen?',
      inhoud: [
        `"${h.titel || 'Zonder titel'}" (${woorden(h.woorden)}) gaat naar de prullenbak.`,
        el('p', { class: 'klein', text: 'In je map komt het bestand in de map Prullenbak, en je kunt het ook terughalen via Meer > Versies terugzetten.' }),
      ],
      knoppen: [{ tekst: 'Annuleer', waarde: false }, { tekst: 'Verwijder', waarde: true, hoofd: true }],
    });
    if (!ok) return;
    const { maakSnapshot } = await import('./snapshots.js');
    await store.bewaarLokaal();
    await maakSnapshot('vlak voor verwijderen van "' + (h.titel || 'Zonder titel') + '"');
    const v = store.meta.volgorde;
    const k = v.indexOf(h.id);
    store.verwijderHoofdstuk(h.id);
    this.gekozen = v[Math.max(0, k - 1)];
    this.render();
  }
}

export async function vraagTekst(titel, label, waarde) {
  const input = el('input', { type: 'text', value: waarde || '', 'aria-label': label, placeholder: label });
  const res = await dialoog({
    titel,
    inhoud: [input],
    knoppen: [{ tekst: 'Annuleer', waarde: null }, { tekst: 'Bewaar', waarde: () => input.value.trim(), hoofd: true }],
    opOpen: (d, klaar) => {
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); klaar(input.value.trim()); } });
    },
  });
  return res;
}
