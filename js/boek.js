// Het scherm "Boek": alles over je boek op één plek, in drie tabbladen.
// Overzicht: titel, Verder schrijven, de hoofdstukkenlijst (zie chapters.js) en wat er nog te bekijken is.
// Personages: wie komt waar voor, de kaarten, schrijfwijze en namen in je tekst.
// Aantekeningen: wat je in de tekst noteerde, plus Ideeën en Verhaallijnen.

import { store } from './store.js';
import { el } from './ui.js';
import { vermeldingen, tijdlijn, maakPersonage, voegAliasToe, markeerAls, namenInBoek, lijktOp, naamControle } from './personages.js';
import { openAantekeningen, fragment } from './aantekeningen.js';
import { Notities } from './notes.js';
import { mapInfo } from './folder.js';

export const BOEK_TABS = ['overzicht', 'personages', 'aantekeningen'];

export class Boek {
  constructor({ hoofdstukken, navigeer, openSchrijven, openMoment, openAantekening, actie, zoek }) {
    this.tabsEl = document.getElementById('boek-tabs');
    this.tab = 'overzicht';
    this.hs = hoofdstukken;
    this.cb = { navigeer, openSchrijven, openMoment, openAantekening, actie, zoek };
    this.toonKlaar = false;
    this.tabsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) this.cb.navigeer(() => this.kies(b.dataset.tab));
    });
    this.kaarten = new Notities({ root: document.getElementById('pers-kaarten'), tabs: ['personages'], openMoment, opWijziging: () => this.rasterBijwerken() });
    this.werkNotities = new Notities({ root: document.getElementById('ant-notities'), tabs: ['ideeen', 'verhaallijnen'], opWijziging: () => {} });
    this.hs.naRender = () => this.kopEnZij();
  }

  get persoon() { return this.tab === 'personages' ? this.kaarten.gekozen.personages || null : null; }

  kies(tab) {
    if (!BOEK_TABS.includes(tab)) tab = 'overzicht';
    Notities.bewaarAlle();
    this.tab = tab;
    for (const b of this.tabsEl.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    for (const p of document.querySelectorAll('#view-hoofdstukken [data-paneel]')) p.hidden = p.dataset.paneel !== tab;
    this.render();
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

  // ---------- overzicht ----------
  overzicht() {
    this.hs.toon();
  }

  // titel, Verder schrijven en de rechterkolom; de lijst zelf tekent chapters.js
  kopEnZij() {
    if (this.tab !== 'overzicht') return;
    const kop = document.getElementById('ov-kop');
    kop.innerHTML = '';
    const h = store.huidig();
    const lijst = store.lijst();
    const delen = store.delen();
    const titel = store.meta.titel;
    const woordenTotaal = lijst.reduce((n, x) => n + (x.woorden || 0), 0);
    kop.append(
      el('h1', { text: titel || 'Je boek' }),
      el('p', { class: 'klein' }, `${lijst.length} ${lijst.length === 1 ? 'hoofdstuk' : 'hoofdstukken'}${delen.length ? ' in ' + delen.length + (delen.length === 1 ? ' deel' : ' delen') : ''} · ${woordenTotaal.toLocaleString('nl-NL')} woorden`,
        titel ? null : el('button', { class: 'knop link', text: 'Titel geven', onclick: () => this.cb.actie('titel') })),
      el('button', { class: 'ov-verder', id: 'ov-verder', onclick: () => this.cb.openSchrijven(h.id) },
        el('span', { class: 'label', text: 'Verder schrijven' }),
        el('span', { class: 'wat', text: this.kop(h) }),
        el('span', { class: 'hint', text: 'Enter, of klik. Je komt terug op de plek waar je was.' })));
    // filter op verhaallijn
    const lijnen = store.notities('verhaallijnen');
    const balk = el('div', { class: 'ov-lijstkop' }, el('span', { class: 'ov-blok-titel', text: 'Hoofdstukken' }));
    if (lijnen.length) {
      const f = el('select', { 'aria-label': 'Toon verhaallijn', class: 'ov-filter' }, el('option', { value: '', text: 'Alle verhaallijnen' }),
        ...lijnen.map((l) => el('option', { value: l.id, text: 'Alleen ' + (l.naam || 'zonder naam') })));
      f.value = this.hs.filterLijn || '';
      f.addEventListener('change', () => { this.hs.filterLijn = f.value || null; this.hs.renderLijst(); });
      balk.append(f);
    }
    kop.append(balk);

    // rechterkolom: wat er nog te doen is
    const zij = document.getElementById('ov-zij-boven');
    zij.innerHTML = '';
    const m = mapInfo();
    if (m.status !== 'verbonden' && m.status !== 'bezig') {
      zij.append(el('p', { class: 'ov-blok-titel', text: 'Opslag' }),
        el('p', { text: m.naam ? 'Je map "' + m.naam + '" is niet gekoppeld; je tekst staat wel veilig op dit apparaat.' : 'Er is nog geen map gekozen; je tekst staat op dit apparaat.' }),
        el('p', {}, el('button', { class: 'knop link', text: m.naam ? 'Map opnieuw koppelen' : 'Kies je Drive-map', onclick: () => this.cb.actie(m.naam ? 'koppel' : 'map') })));
    }
    const open = openAantekeningen();
    const schrijfwijze = naamControle();
    zij.append(el('p', { class: 'ov-blok-titel', text: 'Nog te bekijken' }));
    if (!open.length && !schrijfwijze.length) zij.append(el('p', { class: 'leeg-hint', text: 'Niets. Aantekeningen die je in de tekst maakt (Ctrl+Alt+A) komen hier te staan.' }));
    if (open.length) {
      const ul = el('ul', { class: 'ov-ant' });
      for (const { h: x, a } of open.slice(0, 5)) {
        ul.append(el('li', {}, el('button', { class: 'ant-tekst', onclick: () => this.cb.openAantekening(x.id, a) },
          el('span', { text: a.tekst }), el('span', { class: 'ant-waar', text: (x.titel || 'Zonder titel') + ': ' + fragment(x, a) }))));
      }
      zij.append(ul);
      if (open.length > 5) zij.append(el('p', {}, el('button', { class: 'knop link', text: 'Alle ' + open.length + ' aantekeningen', onclick: () => this.cb.navigeer(() => this.kies('aantekeningen')) })));
    }
    for (const s of schrijfwijze.slice(0, 3)) {
      zij.append(el('p', {}, el('button', { class: 'knop link', text: s.variant + ' (' + s.aantal + '×) of ' + s.juist + '?', title: 'Bekijk bij Personages', onclick: () => this.cb.navigeer(() => this.kies('personages')) })));
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
