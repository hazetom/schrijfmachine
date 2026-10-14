// Het scherm "Boek". Je komt binnen op de inhoudsopgave: titel, Verder schrijven en je hoofdstukken.
// Personages en Aantekeningen zijn twee rustige knoppen rechtsboven; Esc of terug brengt je weer hier.
// Personages: wie komt waar voor, de kaarten, schrijfwijze en namen in je tekst.
// Aantekeningen: wat je in de tekst noteerde, plus Ideeën en Verhaallijnen.

import { store } from './store.js';
import { el } from './ui.js';
import { vermeldingen, tijdlijn, maakPersonage, voegAliasToe, markeerAls, namenInBoek, lijktOp, naamControle } from './personages.js';
import { openAantekeningen, fragment } from './aantekeningen.js';
import { Notities } from './notes.js';

export const BOEK_TABS = ['overzicht', 'personages', 'aantekeningen'];

export class Boek {
  constructor({ hoofdstukken, navigeer, openSchrijven, openMoment, openAantekening, actie, zoek, naKies }) {
    this.tab = 'overzicht';
    this.hs = hoofdstukken;
    this.cb = { navigeer, openSchrijven, openMoment, openAantekening, actie, zoek, naKies };
    this.toonKlaar = false;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) this.cb.navigeer(() => this.kies(b.dataset.tab));
    });
    this.kaarten = new Notities({ root: document.getElementById('pers-kaarten'), tabs: ['personages'], openMoment, opWijziging: () => this.rasterBijwerken() });
    this.werkNotities = new Notities({ root: document.getElementById('ant-notities'), tabs: ['ideeen', 'verhaallijnen'], opWijziging: () => {} });
    this.hs.naRender = () => this.werkKop();
    store.addEventListener('aantekeningen', () => this.werkKnoppen());
  }

  get persoon() { return this.tab === 'personages' ? this.kaarten.gekozen.personages || null : null; }

  kies(tab) {
    if (!BOEK_TABS.includes(tab)) tab = 'overzicht';
    Notities.bewaarAlle();
    this.tab = tab;
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-pressed', b.dataset.tab === tab ? 'true' : 'false');
    for (const p of document.querySelectorAll('#view-hoofdstukken [data-paneel]')) p.hidden = p.dataset.paneel !== tab;
    document.getElementById('app').dataset.boektab = tab;
    this.werkKnoppen();
    this.render();
    if (this.cb.naKies) this.cb.naKies();
  }

  // "Aantekeningen 3" en een stipje bij Personages als er een naam anders gespeld is
  werkKnoppen() {
    const n = openAantekeningen().length;
    const a = document.getElementById('knop-aantekeningen-tal');
    if (a) a.textContent = n ? String(n) : '';
    const p = document.getElementById('knop-personages');
    if (p) p.classList.toggle('let-op', naamControle().length > 0);
  }

  render() {
    if (this.tab === 'overzicht') this.overzicht();
    else if (this.tab === 'personages') this.personages();
    else if (this.tab === 'aantekeningen') this.aantekeningen();
  }

  kop(h) {
    const deel = store.deelVan(h.id);
    return [deel ? deel.titel : null, store.label(h.id), h.titel || 'Zonder titel'].filter(Boolean).join(' · ');
  }

  // ---------- inhoudsopgave ----------
  overzicht() {
    this.hs.toon();
  }

  // titel, Verder schrijven en (één keer) een korte uitleg; de lijst zelf tekent chapters.js
  werkKop() {
    if (this.tab !== 'overzicht') return;
    const kop = document.getElementById('ov-kop');
    kop.innerHTML = '';
    const h = store.huidig();
    const lijst = store.lijst();
    const titel = store.meta.titel;
    const woordenTotaal = lijst.reduce((n, x) => n + (x.woorden || 0), 0);
    kop.append(
      el('h1', {}, el('button', { class: 'ov-titel' + (titel ? '' : ' leeg'), text: titel || 'Naamloos boek', title: 'Titel van het boek wijzigen', onclick: () => this.cb.actie('titel') })),
      el('p', { class: 'klein', text: `${lijst.length} ${lijst.length === 1 ? 'hoofdstuk' : 'hoofdstukken'} · ${woordenTotaal.toLocaleString('nl-NL')} woorden` }),
      el('button', { class: 'ov-verder', id: 'ov-verder', onclick: () => this.cb.openSchrijven(h.id) },
        el('span', { class: 'label', text: 'Verder schrijven' }),
        el('span', { class: 'wat', text: this.kop(h) + '  →' })));
    let gezien = false;
    try { gezien = localStorage.getItem('schrijfmachine-uitleg') === '1'; } catch (e) { /* */ }
    if (!gezien) {
      const uitleg = el('p', { class: 'ov-uitleg' }, 'Klik op een hoofdstuk om erin te schrijven. Esc brengt je hier terug. Alle sneltoetsen staan onder Meer > Handig om te weten. ',
        el('button', { class: 'knop link', text: 'Begrepen', onclick: () => { try { localStorage.setItem('schrijfmachine-uitleg', '1'); } catch (e) { /* */ } uitleg.remove(); } }));
      kop.append(uitleg);
    }
  }

  // ---------- personages ----------
  kolommen() {
    const uit = [];
    let grens = false;
    const nummers = store.nummers();
    for (const r of store.rijen()) {
      if (r.soort === 'deel') { grens = true; continue; }
      uit.push({ h: r.h, label: nummers[r.h.id] == null ? (r.h.titel || '').slice(0, 14) : nummers[r.h.id] + ' ' + (r.h.titel || '').slice(0, 12), grens });
      grens = false;
    }
    return uit;
  }

  openKaart(id) {
    this.kies('personages');
    this.kaarten.kies(id);
    this.rasterBijwerken();
    requestAnimationFrame(() => this.kaarten.root.scrollIntoView({ block: 'start' }));
  }

  personages() {
    this.rasterBijwerken();
    const personen = store.notities('personages');
    this.kaarten.render();
    this.namenBijwerken();
  }

  rasterBijwerken() {
    const p = document.getElementById('pers-raster');
    if (!p) return;
    p.innerHTML = '';
    const personen = store.notities('personages');
    const kols = this.kolommen();
    if (!personen.length) {
      p.append(el('p', { class: 'leeg-hint', text: 'Nog geen personages. Maak hieronder een kaart, of kies uit de namen die de app in je tekst vond. Dan zie je hier wie in welk hoofdstuk voorkomt.' }));
      return;
    }
    const tel = new Map();
    for (const k of kols) {
      const m = new Map();
      for (const v of vermeldingen(k.h)) m.set(v.id, (m.get(v.id) || 0) + 1);
      tel.set(k.h.id, m);
    }
    const detail = el('div', { class: 'raster-detail', id: 'raster-detail' });
    const toonDetail = (persoon, h) => {
      detail.innerHTML = '';
      const lijn = tijdlijn(persoon.id).find((x) => x.h.id === h.id);
      if (!lijn) return;
      detail.append(el('h3', { text: persoon.naam + ' in ' + this.kop(h) + ' (' + lijn.momenten.length + '×)' }));
      const gezien = new Set();
      for (const mo of lijn.momenten) {
        if (gezien.has(mo.zin)) continue;
        gezien.add(mo.zin);
        detail.append(el('button', { class: 'tl-moment', text: mo.zin, onclick: () => this.cb.openMoment(h.id, mo) }));
      }
    };
    const gekozen = this.kaarten.gekozen.personages;
    const body = el('tbody', {});
    for (const pers of personen) {
      const kleur = pers.kleur || 'var(--inkt)';
      let laatste = null;
      for (const k of kols) if (tel.get(k.h.id).get(pers.id)) laatste = k;
      body.append(el('tr', { class: pers.id === gekozen ? 'gekozen' : null },
        el('th', {}, el('button', { title: 'Kaart van ' + (pers.naam || 'Zonder naam'), onclick: () => { this.kaarten.kies(pers.id); this.rasterBijwerken(); } },
          el('span', { class: 'vlak' + (pers.kleur ? '' : ' leeg'), style: { backgroundColor: pers.kleur || 'transparent' } }), pers.naam || 'Zonder naam')),
        ...kols.map((k) => {
          const n = tel.get(k.h.id).get(pers.id) || 0;
          const td = el('td', { class: k.grens ? 'deelgrens' : null });
          if (n) {
            const maat = Math.round(6 + Math.min(14, Math.sqrt(n) * 3));
            td.append(el('button', { title: pers.naam + ': ' + n + '× in ' + this.kop(k.h), onclick: () => toonDetail(pers, k.h) },
              el('span', { class: 'stip-r', style: { width: maat + 'px', height: maat + 'px', backgroundColor: kleur } })));
          }
          return td;
        }),
        el('td', { class: 'laatst', title: 'Laatst genoemd' }, laatste ? el('span', { text: laatste.label }) : el('span', { class: 'leeg-hint', text: 'nergens' }))));
    }
    const kopRij = el('thead', {}, el('tr', {}, el('th', {}),
      ...kols.map((k) => el('th', { class: k.grens ? 'deelgrens' : null, title: this.kop(k.h) }, el('span', { text: k.label }))),
      el('th', { class: 'laatst' }, el('span', { text: 'Laatst genoemd' }))));
    p.append(el('p', { class: 'ov-blok-titel', text: 'Wie komt waar voor' }),
      el('div', { class: 'raster-wrap' }, el('table', { class: 'raster' }, kopRij, body)), detail);
  }

  namenBijwerken() {
    const vak = document.getElementById('pers-namen');
    vak.innerHTML = '';
    const opnieuw = () => { this.rasterBijwerken(); this.kaarten.render(); this.namenBijwerken(); };

    // schrijfwijze
    const sw = naamControle();
    if (sw.length) {
      const blok = el('div', { class: 'pers-blok' }, el('p', { class: 'ov-blok-titel', text: 'Schrijfwijze' }),
        el('p', { class: 'uitleg', text: 'Deze namen lijken op een personage maar zijn anders gespeld. Een tikfout, of iemand anders?' }));
      for (const s of sw) {
        blok.append(el('div', { class: 'voorstel' },
          el('span', { class: 'wie' }, s.variant + ' ', el('span', { class: 'aantal', text: '(' + s.aantal + '×, eerst in ' + (s.eerste.titel || 'Zonder titel') + ') lijkt op ' + s.juist + ' (' + s.juistAantal + '×)' })),
          el('button', { class: 'knop', text: 'Zoek en vervang', title: 'Opent zoeken met deze naam', onclick: () => this.cb.zoek(s.variant) }),
          el('button', { class: 'knop', text: 'Is ook ' + s.persoon.naam, onclick: () => { voegAliasToe(s.persoon.id, { naam: s.variant }); opnieuw(); } }),
          el('button', { class: 'knop', text: 'Klopt zo', title: 'Niet meer melden', onclick: () => { markeerAls(s.variant, 'negeer'); opnieuw(); } })));
      }
      vak.append(blok);
    }

    // namen in je tekst die nog geen personage zijn
    const namen = namenInBoek();
    const personen = store.notities('personages');
    const blok = el('details', { class: 'pers-blok namen', open: (this.namenOpen ?? !personen.length) || null },
      el('summary', { class: 'ov-blok-titel', text: 'Namen in je tekst die nog geen personage zijn (' + namen.length + ')' }));
    blok.addEventListener('toggle', () => { this.namenOpen = blok.open; });
    if (!namen.length) {
      blok.append(el('p', { class: 'leeg-hint', text: 'Geen. Alleen namen die minstens twee keer voorkomen staan hier.' }));
      vak.append(blok);
      return;
    }
    blok.append(el('p', { class: 'uitleg', text: 'Alleen namen die minstens twee keer voorkomen. Vink er een paar aan en zet ze in één keer op "Geen personage"; ze komen niet meer terug.' }));
    const alleNamen = [...personen.map((x) => x.naam).filter(Boolean), ...namen.map((x) => x.naam)];
    const lijstId = 'namenlijst-' + Math.random().toString(36).slice(2, 7);
    const datalist = el('datalist', { id: lijstId }, ...[...new Set(alleNamen)].map((n) => el('option', { value: n })));
    const vinkjes = [];
    const bulk = el('div', { class: 'namen-bulk' },
      el('label', {}, el('input', { type: 'checkbox', 'aria-label': 'Alles aanvinken', onchange: (e) => vinkjes.forEach((v) => { v.checked = e.target.checked; }) }), ' Alles'),
      el('button', { class: 'knop link', text: 'Aangevinkt: geen personage', onclick: () => {
        const weg = vinkjes.filter((v) => v.checked).map((v) => v.value);
        if (!weg.length) return;
        const n = store.namen();
        store.zetNamen({ plaatsen: [...(n.plaatsen || [])], genegeerd: [...new Set([...(n.genegeerd || []), ...weg])] });
        opnieuw();
      } }));
    blok.append(datalist, bulk);
    for (const v of namen.slice(0, 60)) {
      const vink = el('input', { type: 'checkbox', value: v.naam, 'aria-label': v.naam });
      vinkjes.push(vink);
      // koppelen aan iemand anders: typ of kies een naam (ook een naam die nog geen personage is)
      const hoortBij = el('input', { type: 'text', class: 'hoortbij', list: lijstId, placeholder: 'Hoort bij…', 'aria-label': 'Hoort bij' });
      const koppel = (naar) => {
        naar = (naar || '').trim();
        if (!naar || naar === v.naam) return;
        let p = store.notities('personages').find((x) => x.naam === naar);
        if (!p) {
          const andere = namen.find((x) => x.naam === naar);
          p = maakPersonage(andere || { naam: naar, aliassen: [] });
        }
        voegAliasToe(p.id, v);
        opnieuw();
      };
      hoortBij.addEventListener('change', () => koppel(hoortBij.value));
      hoortBij.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); koppel(hoortBij.value); } });
      const gok = lijktOp(v.naam, alleNamen);
      blok.append(el('div', { class: 'voorstel' },
        vink,
        el('span', { class: 'wie' }, v.naam + ' ', el('span', { class: 'aantal', text: '(' + v.aantal + '×, eerst in ' + (v.eerste ? v.eerste.titel : '') + ')' }), v.aliassen.length ? el('span', { class: 'ook', text: 'ook: ' + v.aliassen.join(', ') }) : null),
        gok ? el('button', { class: 'knop gok', text: 'Hoort bij ' + gok + '?', onclick: () => koppel(gok) }) : null,
        el('button', { class: 'knop', text: 'Personage', onclick: () => { const p = maakPersonage(v); this.kaarten.kies(p.id); opnieuw(); } }),
        hoortBij,
        el('button', { class: 'knop', text: 'Geen personage', onclick: () => { markeerAls(v.naam, 'negeer'); opnieuw(); } })));
    }
    vak.append(blok);
  }

  // ---------- aantekeningen ----------
  aantekeningen() {
    const p = document.getElementById('ant-lijst');
    p.innerHTML = '';
    const alle = store.alleAantekeningen();
    const open = alle.filter((x) => !x.a.klaar);
    const klaar = alle.filter((x) => x.a.klaar);
    p.append(el('p', { class: 'ov-blok-titel', text: 'In de tekst (' + open.length + ' open)' }));
    if (!alle.length) {
      p.append(el('p', { class: 'leeg-hint', text: 'Nog geen aantekeningen. Zet tijdens het schrijven je cursor bij een woord (of selecteer iets) en druk Ctrl+Alt+A, of kies NOOT in het balkje. Ze gaan niet mee in de export.' }));
    }
    const rij = ({ h, a }) => el('div', { class: 'ant-rij' + (a.klaar ? ' klaar' : '') },
      el('input', { type: 'checkbox', checked: a.klaar || null, 'aria-label': 'Afgerond', onchange: (e) => { store.wijzigAantekening(h.id, a.id, { klaar: e.target.checked }); this.aantekeningen(); } }),
      el('button', { class: 'ant-tekst', onclick: () => this.cb.openAantekening(h.id, a) },
        el('span', { text: a.tekst }), el('span', { class: 'ant-waar', text: fragment(h, a) })),
      el('button', { class: 'knop link', text: 'Verwijder', onclick: () => { store.verwijderAantekening(h.id, a.id); this.aantekeningen(); } }));
    let vorige = null;
    for (const x of open) {
      if (x.h !== vorige) { p.append(el('p', { class: 'ant-hoofdstuk', text: this.kop(x.h) })); vorige = x.h; }
      p.append(rij(x));
    }
    if (klaar.length) {
      const d = el('details', { class: 'ant-klaar', open: this.toonKlaar || null }, el('summary', { text: 'Afgerond (' + klaar.length + ')' }), ...klaar.map(rij));
      d.addEventListener('toggle', () => { this.toonKlaar = d.open; });
      p.append(d);
    }
    this.werkNotities.render();
  }
}
