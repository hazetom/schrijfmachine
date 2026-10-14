// De hoofdstukkenlijst op het overzicht van Boek: delen en hoofdstukken, met ··· per rij.
// Klik je een hoofdstuk aan, dan klappen de gegevens (scènedoel, samenvatting, status) eronder open.

import { store, STATUSSEN } from './store.js';
import { el, dialoog, woorden } from './ui.js';
import { mdToBlocks } from './markdown.js';
import { aanwezig } from './personages.js';

export class Hoofdstukken {
  constructor({ openSchrijven, openPersoon, verwijder }) {
    this.verwijderCb = verwijder;
    this.lijstEl = document.getElementById('hs-lijst');
    this.detailEl = el('section', { class: 'hs-detail', id: 'hs-detail', 'aria-label': 'Gegevens' });
    this.ingeklapt = true; // gegevens alleen als je erom vraagt (··· > Gegevens)
    this.filterLijn = null;
    this.naRender = null;
    this.slotEl = el('div', { class: 'hs-slotbalk', id: 'hs-slotbalk' }); // staat in Meer > Vergrendelen
    this.gekozen = null;
    this.openSchrijven = openSchrijven;
    this.openPersoon = openPersoon;
    this.sleepId = null;
    document.getElementById('hs-nieuw').addEventListener('click', () => {
      const id = store.nieuwHoofdstuk(null);
      this.gekozen = id;
      this.render();
      this.focusTitel();
    });
    document.getElementById('hs-nieuw-deel').addEventListener('click', () => {
      const d = store.nieuwDeel(null, 'Nieuw deel');
      this.gekozen = d.id;
      this.render();
      this.focusTitel();
    });
    this.lijstEl.addEventListener('keydown', (e) => {
      if (e.target.closest('.hs-uitklap')) return; // typen in de gegevens
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        this.verschuif(this.gekozen, e.key === 'ArrowUp' ? -1 : 1, true);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const ids = store.rijen().map((r) => (r.soort === 'deel' ? r.deel.id : r.h.id));
        const k = ids.indexOf(this.gekozen) + (e.key === 'ArrowUp' ? -1 : 1);
        if (k >= 0 && k < ids.length) { this.gekozen = ids[k]; this.render(); this.focusRij(); }
      } else if (e.key === 'Delete' && e.target.closest('.hs-rij')) {
        e.preventDefault();
        this.verwijderSnel(this.gekozen);
      } else if (e.key === 'Enter' && e.target.closest('.hs-rij')) {
        e.preventDefault();
        if (store.hoofdstuk(this.gekozen)) this.openSchrijven(this.gekozen);
        else { this.ingeklapt = !this.ingeklapt; this.render(); this.focusRij(); }
      }
    });
  }

  toon(id = null, { open = false } = {}) {
    this.gekozen = id || store.meta.huidig;
    this.ingeklapt = !open;
    this.render();
    const rij = this.lijstEl.querySelector('[aria-current="true"]');
    if (rij) rij.scrollIntoView({ block: 'nearest' });
  }

  focusRij() {
    const rij = this.lijstEl.querySelector('[aria-current="true"]');
    if (rij) { rij.focus(); rij.scrollIntoView({ block: 'nearest' }); }
  }

  focusTitel() {
    if (!this.detailEl.isConnected) { this.ingeklapt = false; this.render(); }
    const t = this.detailEl.querySelector('.titelveld');
    if (t) { t.focus(); t.select(); }
  }

  render() {
    if (!store.hoofdstuk(this.gekozen) && !store.deel(this.gekozen)) this.gekozen = store.meta.volgorde[0];
    this.renderSlot();
    this.renderLijst();
    if (this.naRender) this.naRender();
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
      const posities = lijst.map((h, k) => (slot.includes(h.id) ? k : null)).filter((x) => x !== null);
      const naam = (k) => { const h = lijst[k]; const n = store.nummer(h.id); return n == null ? (h.titel || 'Zonder titel') : 'hoofdstuk ' + n; };
      let tekst;
      const aaneen = posities.length && posities[posities.length - 1] - posities[0] + 1 === posities.length;
      if (!posities.length) tekst = 'Eerdere pagina\'s vergrendeld';
      else if (posities.length === 1) tekst = naam(posities[0]) + ' vergrendeld';
      else if (aaneen) {
        const na = store.nummer(lijst[posities[0]].id), nb = store.nummer(lijst[posities[posities.length - 1]].id);
        tekst = (na != null && nb != null ? 'hoofdstuk ' + na + ' t/m ' + nb : naam(posities[0]) + ' t/m ' + naam(posities[posities.length - 1])) + ' vergrendeld';
      }
      else tekst = posities.length + ' hoofdstukken vergrendeld';
      tekst = tekst[0].toUpperCase() + tekst.slice(1);
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
    const kort = (h) => { const n = store.nummer(h.id); const t = (h.titel || 'Zonder titel').slice(0, 18); return n == null ? t : n + ' ' + t; };
    lijst.forEach((h, k) => {
      van.append(el('option', { value: k, text: kort(h) }));
      tot.append(el('option', { value: k, text: kort(h) }));
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
    const nummers = store.nummers();
    for (const r of store.rijen()) {
      if (r.soort === 'deel') {
        const d = r.deel;
        const rij = el('li', {
          class: 'hs-rij hs-deel',
          'aria-current': d.id === this.gekozen ? 'true' : 'false',
          tabindex: d.id === this.gekozen ? '0' : '-1',
          draggable: 'true',
          'data-id': d.id,
        }, el('span', { class: 'hs-deel-titel', text: d.titel || 'Zonder titel' }));
        this.koppelRij(rij, d.id);
        ol.appendChild(rij);
        if (d.id === this.gekozen) this.uitklap(ol);
        continue;
      }
      const h = r.h;
      const nr = nummers[h.id];
      const lijn = h.lijn ? store.verhaallijn(h.lijn) : null;
      const kleur = lijn && lijn.kleur;
      const gekozen = h.id === this.gekozen;
      const rij = el('li', {
        class: 'hs-rij' + (store.isVergrendeld(h.id) ? ' slot' : ''),
        'aria-current': gekozen ? 'true' : 'false',
        'aria-expanded': gekozen ? String(!this.ingeklapt) : null,
        tabindex: gekozen ? '0' : '-1',
        draggable: 'true',
        'data-id': h.id,
        style: gekozen && kleur ? { boxShadow: 'inset 3px 0 0 ' + kleur } : null,
      },
      el('span', { class: 'hs-nr', text: nr == null ? '' : String(nr) }),
      el('span', { class: 'hs-titel', text: h.titel || 'Zonder titel' }),
      el('span', { class: 'hs-lijn' },
        lijn ? el('span', { class: 'vlak', style: { backgroundColor: kleur || 'transparent' }, 'aria-hidden': 'true' }) : null,
        lijn ? (lijn.naam || 'Verhaallijn') : ''),
      el('span', { class: 'hs-meta', text: (h.status || '') + ' · ' + (h.woorden || 0).toLocaleString('nl-NL') }),
      );
      if (this.filterLijn && h.lijn !== this.filterLijn) rij.classList.add('gedimd');
      if (h.id === store.meta.huidig) rij.classList.add('huidig');
      rij.addEventListener('dblclick', () => this.openSchrijven(h.id));
      this.koppelRij(rij, h.id);
      ol.appendChild(rij);
      if (gekozen) this.uitklap(ol);
    }
  }

  // de gegevens van het gekozen hoofdstuk of deel, direct onder de rij
  uitklap(ol) {
    if (this.ingeklapt) return;
    const li = el('li', { class: 'hs-uitklap' }, this.detailEl);
    ol.appendChild(li);
    this.renderDetail();
  }

  // Klikken en slepen, voor hoofdstukken en delen.
  koppelRij(rij, id) {
    const isDeel = !!store.deel(id);
    const menuKnop = el('button', { class: 'rij-menu-knop', 'aria-label': 'Meer acties', title: 'Meer acties', text: '···' });
    menuKnop.addEventListener('click', (e) => { e.stopPropagation(); this.rijMenu(id, menuKnop); });
    rij.appendChild(menuKnop);
    rij.addEventListener('click', (e) => {
      if (e.target.closest('.rij-menu-knop')) return;
      // een hoofdstuk aanklikken = erin schrijven, zoals in een inhoudsopgave; een deel klapt open
      if (store.hoofdstuk(id)) { this.gekozen = id; this.openSchrijven(id); return; }
      if (this.gekozen === id) this.ingeklapt = !this.ingeklapt; else { this.gekozen = id; this.ingeklapt = false; }
      this.render();
      this.focusRij();
    });
    rij.addEventListener('dragstart', (e) => { this.sleepId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); });
    rij.addEventListener('dragover', (e) => {
      if (!this.sleepId || this.sleepId === id) return;
      e.preventDefault();
      const r = rij.getBoundingClientRect();
      const boven = isDeel && store.hoofdstuk(this.sleepId) ? false : e.clientY < r.top + r.height / 2;
      rij.classList.toggle('sleep-boven', boven);
      rij.classList.toggle('sleep-onder', !boven);
    });
    rij.addEventListener('dragleave', () => rij.classList.remove('sleep-boven', 'sleep-onder'));
    rij.addEventListener('drop', (e) => {
      e.preventDefault();
      const boven = rij.classList.contains('sleep-boven');
      rij.classList.remove('sleep-boven', 'sleep-onder');
      const sleep = this.sleepId;
      this.sleepId = null;
      if (!sleep || sleep === id) return;
      this.verplaatsNaar(sleep, id, boven);
      this.gekozen = sleep;
      this.render();
    });
    rij.addEventListener('dragend', () => { this.sleepId = null; });
  }

  verplaatsNaar(sleep, doelId, boven) {
    const v = store.meta.volgorde;
    const doelDeel = store.deel(doelId);
    if (store.hoofdstuk(sleep)) {
      if (doelDeel) { store.zetAanBeginVanDeel(sleep, doelDeel.id); return; }
      // boven een hoofdstuk dat een deel opent: eerste hoofdstuk van dat deel worden
      const delenErvoor = store.delen().filter((d) => d.voor === doelId);
      if (boven && delenErvoor.length) { store.zetAanBeginVanDeel(sleep, delenErvoor[delenErvoor.length - 1].id); return; }
      let doel = v.indexOf(doelId) + (boven ? 0 : 1);
      if (v.indexOf(sleep) < doel) doel--;
      store.verplaatsHoofdstuk(sleep, doel);
      return;
    }
    // een deel verslepen
    const d = store.deel(sleep);
    if (!d) return;
    if (doelDeel) {
      const lijst = store.delen().filter((x) => x.id !== d.id);
      const k = lijst.indexOf(doelDeel);
      lijst.splice(boven ? k : k + 1, 0, d);
      store.project.meta.delen = lijst;
      store.wijzigDeel(d.id, { voor: doelDeel.voor });
      return;
    }
    const voor = boven ? doelId : (v[v.indexOf(doelId) + 1] || null);
    // achteraan in de lijst van delen zodat het direct boven het hoofdstuk komt
    store.project.meta.delen = store.delen().filter((x) => x.id !== d.id).concat([d]);
    store.wijzigDeel(d.id, { voor });
  }

  // Het menuutje achter de drie puntjes van een rij
  rijMenu(id, knop) {
    document.querySelectorAll('.rij-menu').forEach((m) => m.remove());
    const h = store.hoofdstuk(id);
    const dl = store.deel(id);
    const menu = el('div', { class: 'menu rij-menu', role: 'menu' });
    const item = (tekst, fn, uit = false) => { const b = el('button', { role: 'menuitem', text: tekst, disabled: uit }); b.addEventListener('click', () => { menu.remove(); fn(); }); menu.append(b); };
    const v = store.meta.volgorde;
    if (h) {
      item('Openen en schrijven', () => this.openSchrijven(id));
      item('Gegevens', () => this.toonGegevens(id));
      item('Hernoemen', () => { this.gekozen = id; this.render(); this.focusTitel(); });
      item('Nieuw hoofdstuk hierna', () => { this.gekozen = store.nieuwHoofdstuk(id); this.render(); this.focusTitel(); });
      item('Nieuw deel vanaf hier', () => { const nd = store.nieuwDeel(id, 'Nieuw deel'); this.gekozen = nd.id; this.render(); this.focusTitel(); });
      item('Omhoog', () => this.verschuif(id, -1), v.indexOf(id) === 0);
      item('Omlaag', () => this.verschuif(id, 1), v.indexOf(id) === v.length - 1);
      const slot = store.isVergrendeld(id);
      item(slot ? 'Ontgrendelen' : 'Vergrendelen', () => { const ids = store.meta.vergrendeld.filter((x) => x !== id); if (!slot) ids.push(id); store.zetVergrendeld(ids, store.meta.vergrendelPagina); this.render(); });
      menu.append(el('hr'));
      item('Verwijderen', () => this.verwijderSnel(id), v.length <= 1);
    } else if (dl) {
      item('Hernoemen', () => { this.gekozen = id; this.render(); this.focusTitel(); });
      item('Nieuw hoofdstuk in dit deel', () => { this.gekozen = id; this.render(); const b = [...this.detailEl.querySelectorAll('button')].find((x) => x.textContent === 'Nieuw hoofdstuk in dit deel'); if (b) b.click(); });
      menu.append(el('hr'));
      item('Deel verwijderen (hoofdstukken blijven)', () => this.verwijderSnel(id));
    }
    document.body.append(menu);
    const r = knop.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(window.innerWidth - 280, r.right - 270)) + 'px';
    menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 4) + 'px';
    const weg = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', weg, true); } };
    setTimeout(() => document.addEventListener('pointerdown', weg, true), 0);
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); menu.remove(); knop.focus(); } });
    const eerste = menu.querySelector('button:not([disabled])');
    if (eerste) eerste.focus();
  }

  toonGegevens(id) {
    this.gekozen = id;
    this.ingeklapt = false;
    this.render();
    const r = this.lijstEl.querySelector('.hs-uitklap');
    if (r) r.scrollIntoView({ block: 'nearest' });
  }

  verwijderSnel(id) {
    const v = store.meta.volgorde;
    const k = Math.max(0, v.indexOf(id));
    this.verwijderCb(id);
    this.gekozen = store.hoofdstuk(id) || store.deel(id) ? id : v[Math.max(0, k - 1)];
    this.render();
    this.focusRij();
  }

  verschuif(id, delta, focus = false) {
    const v = store.meta.volgorde;
    store.verplaatsHoofdstuk(id, v.indexOf(id) + delta);
    this.render();
    if (focus) this.focusRij();
  }

  renderDeel(dl) {
    const d = this.detailEl;
    const titel = el('input', { class: 'titelveld', type: 'text', value: dl.titel, 'aria-label': 'Naam van het deel', placeholder: 'Bijvoorbeeld: Act 1 · De verhoren' });
    titel.addEventListener('input', () => {
      store.wijzigDeel(dl.id, { titel: titel.value });
      const r = this.lijstEl.querySelector(`[data-id="${dl.id}"] .hs-deel-titel`);
      if (r) r.textContent = titel.value || 'Zonder titel';
    });
    // hoofdstukken in dit deel
    const inDeel = [];
    let binnen = false;
    for (const r of store.rijen()) {
      if (r.soort === 'deel') { binnen = r.deel.id === dl.id; continue; }
      if (binnen) inDeel.push(r.h);
    }
    const totaal = inDeel.reduce((n, h) => n + (h.woorden || 0), 0);
    const lijst = el('div', { class: 'hs-scenes' });
    for (const h of inDeel) { const n = store.nummer(h.id); lijst.append(el('button', { class: 'knop hs-scene', text: (n == null ? '' : n + '. ') + (h.titel || 'Zonder titel'), onclick: () => { this.gekozen = h.id; this.render(); } })); }
    const telling = el('select', { 'aria-label': 'Hoofdstuknummers in dit deel' },
      el('option', { value: 'door', text: 'Hoofdstuknummers tellen door' }),
      el('option', { value: 'opnieuw', text: 'Hoofdstuknummers beginnen opnieuw bij 1' }));
    telling.value = dl.nummering === 'opnieuw' ? 'opnieuw' : 'door';
    telling.addEventListener('change', () => { store.wijzigDeel(dl.id, { nummering: telling.value }); this.render(); });
    d.append(
      el('span', { class: 'label', text: 'Deel' }),
      titel,
      el('div', { class: 'hs-gegevens' }, el('span', { text: inDeel.length + (inDeel.length === 1 ? ' hoofdstuk' : ' hoofdstukken') + ' · ' + woorden(totaal) }), telling),
      inDeel.length ? el('div', { class: 'hs-doel' }, el('span', { class: 'label', text: 'Hoofdstukken in dit deel' }), lijst) : el('p', { class: 'leeg-hint', text: 'Nog geen hoofdstukken. Sleep een hoofdstuk op dit deel, of maak er hieronder een.' }),
      el('div', { class: 'hs-klein' },
        el('button', { class: 'knop', text: 'Nieuw hoofdstuk in dit deel', onclick: () => {
          const laatste = inDeel[inDeel.length - 1];
          let id;
          if (laatste) id = store.nieuwHoofdstuk(laatste.id);
          else {
            id = store.nieuwHoofdstuk(null);
            store.zetAanBeginVanDeel(id, dl.id);
          }
          this.gekozen = id;
          this.render();
          this.focusTitel();
        } }),
        el('button', { class: 'knop', text: 'Verwijder dit deel', onclick: async () => {
          const ok = await dialoog({
            titel: 'Deel verwijderen?',
            inhoud: [`Het kopje "${dl.titel || 'Zonder titel'}" verdwijnt. De hoofdstukken zelf blijven gewoon staan.`],
            knoppen: [{ tekst: 'Annuleer', waarde: false }, { tekst: 'Verwijder', waarde: true, hoofd: true }],
          });
          if (!ok) return;
          store.verwijderDeel(dl.id);
          this.gekozen = inDeel[0] ? inDeel[0].id : store.meta.huidig;
          this.render();
        } }),
      ),
    );
  }

  renderDetail() {
    const d = this.detailEl;
    d.innerHTML = '';
    const dl = store.deel(this.gekozen);
    if (dl) { this.renderDeel(dl); return; }
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

    const telt = el('select', { 'aria-label': 'Nummering' },
      el('option', { value: 'ja', text: 'Telt mee' }),
      el('option', { value: 'nee', text: 'Telt niet mee' }));
    telt.value = store.isLos(h) ? 'nee' : 'ja';
    telt.title = 'Een proloog of epiloog krijgt geen hoofdstuknummer';
    telt.addEventListener('change', () => { store.wijzigHoofdstuk(h.id, { los: telt.value === 'nee' }); this.render(); });

    const samen = el('textarea', { rows: '2', 'aria-label': 'Samenvatting', placeholder: 'Een paar zinnen: wat gebeurt er? Claude kan dit voor je maken (vinkje "Samenvatting maken").' });
    samen.value = h.samenvatting || '';
    const groeiSamen = () => { samen.style.height = 'auto'; samen.style.height = samen.scrollHeight + 'px'; };
    samen.addEventListener('input', () => { store.wijzigHoofdstuk(h.id, { samenvatting: samen.value }); groeiSamen(); });

    const doel = el('textarea', { rows: '2', 'aria-label': 'Scènedoel', placeholder: 'Wat moet dit hoofdstuk doen? Wie wil wat, wat staat er op het spel?' });
    doel.value = h.doel || '';
    const groei = () => { doel.style.height = 'auto'; doel.style.height = doel.scrollHeight + 'px'; };
    doel.addEventListener('input', () => { store.wijzigHoofdstuk(h.id, { doel: doel.value }); groei(); });

    const slot = store.isVergrendeld(h.id);
    const deel = store.deelVan(h.id);
    // kopjes in het hoofdstuk = scènes; klik springt erheen
    const kopjes = [];
    mdToBlocks(h.md).forEach((b, k) => { if (b.type === 'h') kopjes.push({ k, t: b.runs.map((r) => r.t).join('') }); });
    const scenes = kopjes.length ? el('div', { class: 'hs-doel' }, el('span', { class: 'label', text: 'Scènes' }),
      el('div', { class: 'hs-scenes' }, ...kopjes.map((x) => el('button', { class: 'knop hs-scene', text: x.t, title: 'Ga naar deze scène', onclick: () => this.openSchrijven(h.id, { blok: x.k }) })))) : null;
    d.append(...[
      el('span', { class: 'label', text: [deel ? (deel.titel || 'Deel') : null, nr == null ? 'Los, zonder nummer' : 'Hoofdstuk ' + nr, slot ? 'vergrendeld' : null].filter(Boolean).join(' · ') }),
      titel,
      el('div', { class: 'hs-gegevens' },
        el('span', { class: 'met-vlak' }, vlak, lijnKeuze),
        el('span', { text: woorden(h.woorden) }),
        status,
        telt),
      this.veldOfLink('Scènedoel', doel, h.doel),
      this.veldOfLink('Samenvatting', samen, h.samenvatting),
      scenes,
      this.personagesBlok ? this.personagesBlok(h) : null,
      el('div', { class: 'hs-knoppen' },
        el('button', { class: 'knop omlijnd', text: 'Verder schrijven', onclick: () => this.openSchrijven(h.id) })),
      el('div', { class: 'hs-klein' },
        el('button', { class: 'knop', text: 'Inklappen', onclick: () => { this.ingeklapt = true; this.render(); this.focusRij(); } }),
      ),
    ].filter(Boolean));
    requestAnimationFrame(() => { groei(); groeiSamen(); });
  }

  // Een leeg veld is geen vak met een vraag erin, maar één stille regel: "+ Scènedoel"
  veldOfLink(label, veld, waarde) {
    const blok = el('div', { class: 'hs-doel' }, el('span', { class: 'label', text: label }), veld);
    if ((waarde || '').trim()) return blok;
    const link = el('button', { class: 'knop hs-plus', text: '+ ' + label });
    link.addEventListener('click', () => { link.replaceWith(blok); veld.focus(); });
    return link;
  }

  // Wie komt er in dit hoofdstuk voor? Een klik opent de kaart bij Personages.
  personagesBlok(h) {
    const aanw = aanwezig(h);
    if (!aanw.length) return null;
    return el('div', { class: 'hs-doel' }, el('span', { class: 'label', text: 'Wie komt erin voor' }),
      el('div', { class: 'hs-personen' }, ...aanw.map(({ persoon, aantal }) => el('button', {
        class: 'hs-persoon', title: 'Open de kaart van ' + persoon.naam, onclick: () => this.openPersoon(persoon.id),
      }, persoon.kleur ? el('span', { class: 'vlak', style: { backgroundColor: persoon.kleur } }) : null, el('span', { class: 'naam', text: persoon.naam }), el('span', { class: 'aantal', text: String(aantal) })))));
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
