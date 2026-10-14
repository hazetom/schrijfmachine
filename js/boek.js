// Het scherm "Boek": overzicht (startscherm), tijdlijnen van personages en verhaallijnen, instellingen.
// Het tabblad Hoofdstukken staat in chapters.js.

import { store } from './store.js';
import { el } from './ui.js';
import { vermeldingen, voorstellen, tijdlijn, maakPersonage, voegAliasToe, markeerAls } from './personages.js';
import { mapInfo } from './folder.js';
import { VERSIE } from './instellingen.js';

const TABS = ['overzicht', 'hoofdstukken', 'personages', 'lijnen', 'instellingen'];

export class Boek {
  constructor({ openSchrijven, openPersonage, actie, toonHoofdstukken, openMoment, openHoofdstukDetail }) {
    this.tabsEl = document.getElementById('boek-tabs');
    this.tab = 'overzicht';
    this.cb = { openSchrijven, openPersonage, actie, toonHoofdstukken, openMoment, openHoofdstukDetail };
    this.tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) this.kies(b.dataset.tab); });
  }

  kies(tab) {
    if (!TABS.includes(tab)) tab = 'overzicht';
    this.tab = tab;
    for (const b of this.tabsEl.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    for (const p of document.querySelectorAll('#view-hoofdstukken [data-paneel]')) p.hidden = p.dataset.paneel !== tab;
    if (tab === 'hoofdstukken') this.cb.toonHoofdstukken();
    else this.render();
  }

  render() {
    if (this.tab === 'overzicht') this.overzicht();
    else if (this.tab === 'personages') this.personages();
    else if (this.tab === 'lijnen') this.lijnen();
    else if (this.tab === 'instellingen') this.instellingen();
  }

  kop(h) {
    const deel = store.deelVan(h.id);
    return [deel ? deel.titel : null, store.label(h.id), h.titel || 'Zonder titel'].filter(Boolean).join(' · ');
  }

  // ---------- overzicht ----------
  overzicht() {
    const p = document.getElementById('boek-overzicht');
    p.innerHTML = '';
    const h = store.huidig();
    const lijst = store.lijst();
    const delen = store.delen();
    const verder = el('button', { class: 'ov-verder', id: 'ov-verder', onclick: () => this.cb.openSchrijven(h.id) },
      el('span', { class: 'label', text: 'Verder schrijven' }),
      el('span', { class: 'wat', text: this.kop(h) }),
      el('span', { class: 'hint', text: 'Enter, of klik. Je komt terug op de plek waar je was.' }));
    const opbouw = el('ol', { class: 'ov-opbouw' });
    const nummers = store.nummers();
    for (const r of store.rijen()) {
      if (r.soort === 'deel') { opbouw.append(el('li', { class: 'deel', text: r.deel.titel || 'Zonder titel' })); continue; }
      const x = r.h;
      const lijn = x.lijn ? store.verhaallijn(x.lijn) : null;
      opbouw.append(el('li', {}, el('button', { onclick: () => this.cb.openSchrijven(x.id) },
        el('span', { class: 'nr', text: nummers[x.id] == null ? '' : String(nummers[x.id]) }),
        el('span', { class: 'vlak' + (lijn && lijn.kleur ? '' : ' leeg'), style: { backgroundColor: lijn && lijn.kleur ? lijn.kleur : 'transparent' } }),
        el('span', { text: x.titel || 'Zonder titel' }),
        el('span', { class: 'st', text: x.status || '' }))));
    }
    // rechterkolom: wat er nog te doen is, en de weg naar alles
    const zij = el('div', { class: 'ov-zij' });
    const m = mapInfo();
    if (m.status !== 'verbonden' && m.status !== 'bezig') {
      zij.append(el('p', { class: 'ov-blok-titel', text: 'Opslag' }),
        el('p', { text: m.naam ? 'Je map "' + m.naam + '" is niet gekoppeld; je tekst staat wel veilig op dit apparaat.' : 'Er is nog geen map gekozen; je tekst staat op dit apparaat.' }),
        el('button', { class: 'knop link', text: m.naam ? 'Map opnieuw koppelen' : 'Kies je Drive-map', onclick: () => this.cb.actie(m.naam ? 'koppel' : 'map') }));
    }
    const nieuw = this.nieuweNamen();
    if (nieuw.length) {
      zij.append(el('p', { class: 'ov-blok-titel', text: 'Nog te bekijken' }),
        el('p', { text: `De app vond ${nieuw.length} ${nieuw.length === 1 ? 'naam' : 'namen'} in je tekst die nog geen personage of plaats ${nieuw.length === 1 ? 'is' : 'zijn'}: ${nieuw.slice(0, 4).map((v) => v.naam).join(', ')}${nieuw.length > 4 ? '…' : ''}.` }),
        el('button', { class: 'knop link', text: 'Bekijk bij Personages', onclick: () => this.kies('personages') }));
    }
    zij.append(el('p', { class: 'ov-blok-titel', text: 'Handig om te weten' }),
      el('ul', {},
        el('li', {}, 'Muis naar de linkerrand tijdens het schrijven: je hoofdstukken en het scènedoel.'),
        el('li', {}, el('kbd', { text: 'Ctrl+F' }), ' zoeken in het hele boek, of A12 voor alinea 12.'),
        el('li', {}, el('kbd', { text: 'Ctrl+Alt+C' }), ' Klaar voor Claude: je selectie met je vraag naar het klembord.'),
        el('li', {}, el('kbd', { text: 'Ctrl+PageDown' }), ' volgend hoofdstuk, ', el('kbd', { text: 'Esc' }), ' terug naar dit overzicht.'),
        el('li', {}, 'Tekst selecteren geeft een balkje met vet, cursief, kopje, scène en Claude.')));
    const titel = store.meta.titel;
    p.append(el('div', { class: 'ov' },
      el('div', {},
        el('h1', { text: titel || 'Je boek' }),
        el('p', { class: 'klein' }, `${lijst.length} ${lijst.length === 1 ? 'hoofdstuk' : 'hoofdstukken'}${delen.length ? ' in ' + delen.length + (delen.length === 1 ? ' deel' : ' delen') : ''}`,
          titel ? null : el('button', { class: 'knop link', text: 'Titel geven', onclick: () => this.cb.actie('titel') })),
        verder,
        el('p', { class: 'ov-blok-titel', text: 'Opbouw' }),
        opbouw),
      zij));
  }

  // ---------- nieuwe namen in het hele boek ----------
  nieuweNamen() {
    const samen = new Map();
    for (const h of store.lijst()) {
      for (const v of voorstellen(h)) {
        const x = samen.get(v.naam) || { naam: v.naam, aantal: 0, aliassen: new Set(), eerste: h };
        x.aantal += v.aantal;
        v.aliassen.forEach((a) => x.aliassen.add(a));
        samen.set(v.naam, x);
      }
    }
    return [...samen.values()].map((x) => ({ ...x, aliassen: [...x.aliassen] })).sort((a, b) => b.aantal - a.aantal);
  }

  voorstelRij(v, klaar) {
    const personen = store.notities('personages');
    const zelfde = el('select', { 'aria-label': 'Is dezelfde als' }, el('option', { value: '', text: 'Is dezelfde als…' }), ...personen.map((p) => el('option', { value: p.id, text: p.naam || 'Zonder naam' })));
    zelfde.addEventListener('change', () => { if (zelfde.value) { voegAliasToe(zelfde.value, v); klaar(); } });
    return el('div', { class: 'voorstel' },
      el('span', { class: 'wie' }, v.naam + ' ', el('span', { class: 'aantal', text: '(' + v.aantal + '×, eerst in ' + (v.eerste ? v.eerste.titel : '') + ')' }), v.aliassen.length ? el('span', { class: 'ook', text: 'ook: ' + v.aliassen.join(', ') }) : null),
      el('button', { class: 'knop', text: 'Personage', onclick: () => { maakPersonage(v); klaar(); } }),
      personen.length ? zelfde : null,
      el('button', { class: 'knop', text: 'Plaats', onclick: () => { markeerAls(v.naam, 'plaats'); klaar(); } }),
      el('button', { class: 'knop', text: 'Negeren', onclick: () => { markeerAls(v.naam, 'negeer'); klaar(); } }));
  }

  // ---------- tijdlijnen ----------
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

  kopRij(kols, eerste) {
    return el('thead', {}, el('tr', {}, el('th', { text: eerste }),
      ...kols.map((k) => el('th', { class: k.grens ? 'deelgrens' : null, title: this.kop(k.h) }, el('span', { text: k.label })))));
  }

  personages() {
    const p = document.getElementById('boek-personages');
    p.innerHTML = '';
    const personen = store.notities('personages');
    const kols = this.kolommen();
    // tellingen per hoofdstuk
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
    if (!personen.length) {
      p.append(el('p', { class: 'leeg-hint', text: 'Nog geen personages. Hieronder staan de namen die de app in je tekst vond; maak er een personage van en de tijdlijn vult zich vanzelf.' }));
    } else {
      const body = el('tbody', {});
      for (const pers of personen) {
        const kleur = pers.kleur || 'var(--inkt)';
        body.append(el('tr', {},
          el('th', {}, el('button', { title: 'Open de kaart', onclick: () => this.cb.openPersonage(pers.id) },
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
          })));
      }
      p.append(el('p', { class: 'ov-blok-titel', text: 'Wie komt waar voor' }),
        el('div', { class: 'raster-wrap' }, el('table', { class: 'raster' }, this.kopRij(kols, ''), body)), detail);
    }
    const nieuw = this.nieuweNamen();
    if (nieuw.length) {
      const lijst = el('div', { style: { maxWidth: '900px' } });
      for (const v of nieuw.slice(0, 20)) lijst.append(this.voorstelRij(v, () => this.personages()));
      p.append(el('p', { class: 'ov-blok-titel', text: 'Nieuwe namen in het hele boek', style: { marginTop: '28px' } }), lijst);
    }
  }

  lijnen() {
    const p = document.getElementById('boek-lijnen');
    p.innerHTML = '';
    const lijnen = store.notities('verhaallijnen');
    const kols = this.kolommen();
    if (!lijnen.length) {
      p.append(el('p', { class: 'leeg-hint', text: 'Nog geen verhaallijnen. Geef een hoofdstuk een verhaallijn in het tabblad Hoofdstukken ("Nieuwe verhaallijn…"), dan zie je hier welke lijn wanneer aan de beurt is.' }));
      return;
    }
    const rijen = [...lijnen.map((l) => ({ id: l.id, naam: l.naam || 'Zonder naam', kleur: l.kleur || 'var(--inkt)' })), { id: null, naam: 'Zonder verhaallijn', kleur: 'var(--verbleekt)' }];
    const body = el('tbody', {});
    for (const r of rijen) {
      body.append(el('tr', {}, el('th', {}, el('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center', minHeight: '34px' } }, el('span', { class: 'vlak', style: { backgroundColor: r.kleur } }), r.naam)),
        ...kols.map((k) => {
          const td = el('td', { class: k.grens ? 'deelgrens' : null });
          if ((k.h.lijn || null) === r.id) {
            td.append(el('button', { title: this.kop(k.h), onclick: () => this.cb.openHoofdstukDetail(k.h.id) },
              el('span', { class: 'stip-r', style: { width: '16px', height: '16px', borderRadius: '0', backgroundColor: r.kleur } })));
          }
          return td;
        })));
    }
    p.append(el('p', { class: 'ov-blok-titel', text: 'Welke verhaallijn wanneer' }),
      el('div', { class: 'raster-wrap' }, el('table', { class: 'raster' }, this.kopRij(kols, ''), body)),
      el('p', { class: 'leeg-hint', style: { marginTop: '14px' }, text: 'Klik op een vakje om naar dat hoofdstuk te gaan.' }));
  }

  // ---------- instellingen ----------
  instellingen() {
    const p = document.getElementById('boek-instellingen');
    p.innerHTML = '';
    const m = mapInfo();
    const rij = (tekst, actie, uitleg) => [el('button', { class: 'knop', text: tekst, onclick: () => this.cb.actie(actie) }), uitleg ? el('p', { class: 'uitleg', text: uitleg }) : null];
    p.append(el('div', { class: 'instel-lijst' },
      el('p', { class: 'ov-blok-titel', text: 'Opslag' }),
      ...rij(m.naam ? 'Map: ' + m.naam + ' (wijzigen)' : 'Kies je Drive-map', 'map', 'Hier komen je hoofdstukken als Markdown-bestanden te staan.'),
      ...rij('Controleer opslag', 'controle', 'Test in een minuut of opslaan op dit apparaat en in je map goed werkt.'),
      ...rij('Versies terugzetten', 'versies', 'Elke 10 minuten en vóór elke grote actie wordt een versie bewaard. Ook verwijderde hoofdstukken haal je hier terug.'),
      el('p', { class: 'ov-blok-titel', text: 'Bestanden', style: { marginTop: '14px' } }),
      ...rij('Exporteer manuscript (.docx)', 'exporteer', 'Alles in één Word-bestand in je map, te openen in Google Docs.'),
      ...rij('Importeer tekst', 'importeer', '.docx, .md of .txt; je krijgt eerst een voorstel voor de indeling.'),
      el('p', { class: 'ov-blok-titel', text: 'App', style: { marginTop: '14px' } }),
      ...rij('Titel van het boek', 'titel'),
      ...rij('Weergave en schrijven', 'instellingen', 'Avondstand, volledig scherm, kantlijn, slimme aanhalingstekens.'),
      ...rij('Sneltoetsen', 'hulp'),
      ...rij('Zoek naar update', 'update', 'Schrijfmachine versie ' + VERSIE + '.'),
    ));
  }
}
