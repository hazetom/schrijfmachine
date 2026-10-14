// Opstarten en alles aan elkaar knopen.

import { store, TABS } from './store.js';
import { vraagBlijvendeOpslag, db } from './db.js';
import { Editor } from './editor.js';
import { Hoofdstukken, vraagTekst } from './chapters.js';
import { Notities } from './notes.js';
import { Spiek } from './spiek.js';
import { plaatsIn, plaatsInHoofdstuk, woordRond } from './aantekeningen.js';
import { initRijkeTekst } from './richtext.js';
import * as map from './folder.js';
import { maakSnapshot, lijstSnapshots, zetSnapshotTerug, startAutomatisch } from './snapshots.js';
import { exporteer, importeerBestand } from './importexport.js';
import { el, dialoog, dialoogOpen, tijd, datumTijd, woorden } from './ui.js';
import { Kantlijn } from './kantlijn.js';
import { Zoeken } from './zoeken.js';
import { lees, zet, pasThemaToe, instellingen, VERSIE } from './instellingen.js';
import { Claude } from './claude.js';
import { Boek } from './boek.js';
import { blokVan } from './richtext.js';

const app = document.getElementById('app');
let editor, hoofdstukken, spiek, kantlijn, zoeken, claude, boek;
let swRegistratie = null;
let updateKlaar = false;
let bijwerkenGevraagd = false;
let melding = null;
let meldingTimer = null;

// ---------- weergave ----------
// Er zijn twee plekken: Schrijven en Boek. Eén knop rechtsboven (en Esc) wisselt ertussen.
function zetView(view, { focus = true, tab = null } = {}) {
  if (view === 'hoofdstukken' || view === 'boek') {
    editor.bewaar();
    editor.onthoudPlek();
    notitiesBewaar();
    if (zoeken && zoeken.open) zoeken.sluit();
    if (claude && claude.open) claude.sluit();
    verbergNootBel();
    app.dataset.view = 'hoofdstukken';
    document.getElementById('view-schrijven').hidden = true;
    document.getElementById('view-hoofdstukken').hidden = false;
    boek.kies(tab || 'overzicht');
    if (focus && boek.tab === 'overzicht') { const v = document.getElementById('ov-verder'); if (v) v.focus(); }
  } else {
    notitiesBewaar();
    app.dataset.view = 'schrijven';
    document.getElementById('view-hoofdstukken').hidden = true;
    document.getElementById('view-schrijven').hidden = false;
    editor.herbereken();
    if (focus) editor.focus();
    if (kantlijn) kantlijn.werkBij();
    if (spiek && spiek.open) spiek.werkBij();
  }
  document.getElementById('knop-wissel-tekst').textContent = app.dataset.view === 'schrijven' ? 'Boek' : 'Schrijven';
  werkKicker();
}

function notitiesBewaar() { Notities.bewaarAlle(); }

// Naar Boek (overzicht), eventueel met een hoofdstuk of deel opengeklapt
function naarBoek(gekozen = null) {
  navigeer(() => {
    zetView('boek', { tab: 'overzicht', focus: !gekozen });
    if (gekozen) { hoofdstukken.toon(gekozen, { open: true }); hoofdstukken.focusRij(); }
  });
}
function naarSchrijven() { navigeer(() => zetView('schrijven')); }
function wissel() { if (app.dataset.view === 'schrijven') naarBoek(); else naarSchrijven(); }

// Het pad bovenin: De Gevangen Observator › Act 1 › Hoofdstuk 1 · De moeder. Elk stukje is klikbaar.
function werkKicker() {
  const k = document.getElementById('kicker');
  k.innerHTML = '';
  const titel = store.meta.titel || 'Je boek';
  const kruim = (tekst, fn, uitleg) => (fn ? el('button', { class: 'kruim', text: tekst, title: uitleg, onclick: fn }) : el('span', { class: 'kruim', text: tekst }));
  const pijl = () => el('span', { class: 'kruim-pijl', 'aria-hidden': 'true', text: '›' });
  if (app.dataset.view === 'hoofdstukken') {
    const sub = { personages: 'Personages', aantekeningen: 'Aantekeningen' }[boek.tab];
    if (sub) k.append(kruim(titel, () => navigeer(() => boek.kies('overzicht')), 'Naar de inhoud'), pijl(), kruim(sub));
    else k.append(kruim(titel));
  } else {
    const h = store.huidig();
    k.append(kruim(titel, () => naarBoek(), 'Naar het overzicht van je boek'));
    if (h) {
      const deel = store.deelVan(h.id);
      if (deel) k.append(pijl(), kruim(deel.titel || 'Deel', () => naarBoek(deel.id), 'Dit deel in het overzicht'));
      const lijn = h.lijn ? store.verhaallijn(h.lijn) : null;
      k.append(pijl());
      if (lijn && lijn.kleur) k.append(el('span', { class: 'vlak', 'aria-hidden': 'true', style: { backgroundColor: lijn.kleur } }));
      k.append(kruim([store.label(h.id), h.titel || 'Zonder titel'].filter(Boolean).join(' · '), () => naarBoek(h.id), 'Gegevens van dit hoofdstuk'));
    }
  }
  const iets = store.meta.vergrendeld.length || store.meta.vergrendelPagina;
  document.getElementById('knop-vergrendel-tekst').textContent = iets ? 'Ontgrendel' : 'Vergrendel';
  document.getElementById('knop-vergrendel').title = iets ? 'Alles weer zichtbaar maken' : 'Alles vóór deze pagina achter een waas zetten';
}

// ---------- terug ----------
// Elke sprong (hoofdstuk, zoektreffer, personage, Boek) wordt een stap in de geschiedenis van het venster.
// Zo werkt de terugtoets van de Chromebook (en Alt+←): je komt terug waar je was, op dezelfde plek.
let herstellen = false;
let navBezig = false;
let verversTimer = null;
let chipTimer = null;

function staat() {
  const schrijven = app.dataset.view === 'schrijven';
  const s = { view: schrijven ? 'schrijven' : 'boek', id: store.meta.huidig };
  if (schrijven) {
    s.plek = (editor.id === store.meta.huidig && editor.plekNu()) || editor.plekken[store.meta.huidig] || null;
    s.pagina = editor.pagina;
  } else {
    s.tab = boek.tab;
    s.persoon = boek.persoon;
    s.gekozen = hoofdstukken.gekozen;
  }
  return s;
}

function zelfde(a, b) {
  if (!a || !b || a.view !== b.view) return false;
  if (a.view === 'boek') return a.tab === b.tab && (a.persoon || null) === (b.persoon || null);
  return a.id === b.id;
}

// opties: sprong (ook binnen hetzelfde hoofdstuk een stap), plek (waar de cursor heen gaat), stil (geen terug-knopje)
function navigeer(fn, { sprong = false, plek = null, stil = false } = {}) {
  if (herstellen || navBezig) return fn();
  navBezig = true;
  try {
    const oud = staat();
    history.replaceState(oud, '');
    const r = fn();
    const nieuw = staat();
    if (plek) nieuw.plek = plek;
    if (sprong || !zelfde(oud, nieuw)) {
      history.pushState(nieuw, '');
      if (!stil && nieuw.view === 'schrijven' && (oud.view === 'schrijven' || oud.tab !== 'overzicht')) toonTerugChip(oud);
    }
    return r;
  } finally {
    navBezig = false;
  }
}

// de huidige stap bijwerken (waar staat de cursor nu), zodat terug en weer vooruit klopt
function ververs() {
  clearTimeout(verversTimer);
  verversTimer = setTimeout(() => { if (!herstellen && !navBezig) history.replaceState(staat(), ''); }, 800);
}

function beschrijf(s) {
  if (s.view === 'schrijven') {
    const h = store.hoofdstuk(s.id);
    return (h ? h.titel || 'Zonder titel' : 'je tekst') + (s.pagina != null ? ', blz. ' + (s.pagina + 1) : '');
  }
  return { personages: 'Personages', aantekeningen: 'Aantekeningen', overzicht: 'het overzicht' }[s.tab] || 'je boek';
}

function toonTerugChip(oud) {
  const c = document.getElementById('terug-chip');
  c.textContent = '‹ Terug naar ' + beschrijf(oud);
  c.hidden = false;
  clearTimeout(chipTimer);
  chipTimer = setTimeout(verbergTerugChip, 15000);
}
function verbergTerugChip() { document.getElementById('terug-chip').hidden = true; }

function herstel(s) {
  verbergTerugChip();
  if (s.view === 'boek') {
    zetView('boek', { tab: s.tab, focus: false });
    if (s.tab === 'overzicht' && s.gekozen && (store.hoofdstuk(s.gekozen) || store.deel(s.gekozen))) { hoofdstukken.toon(s.gekozen); hoofdstukken.focusRij(); }
    if (s.tab === 'personages' && s.persoon) boek.openKaart(s.persoon);
    return;
  }
  if (!store.hoofdstuk(s.id)) return;
  const t = s.plek ? { blok: s.plek.blok, start: s.plek.teken, lengte: 0 } : null;
  if (s.id === editor.id && s.id === store.meta.huidig && t) {
    zetView('schrijven');
    requestAnimationFrame(() => editor.selecteer(t.blok, t.start, 0));
  } else {
    openSchrijvenDirect(s.id, t ? { treffer: t } : null);
  }
}

function werkPaginanummer() {
  document.getElementById('paginanummer').textContent = 'blz. ' + (editor.pagina + 1) + ' van ' + editor.aantal;
  document.getElementById('knop-vorige').disabled = editor.pagina === 0;
  document.getElementById('knop-volgende').disabled = editor.pagina >= editor.aantal - 1;
}

function openSchrijven(id, opties = null, { stil = false } = {}) {
  const t = opties && opties.treffer;
  const plek = t ? { blok: t.blok, teken: t.start } : (opties && opties.blok != null ? { blok: opties.blok, teken: 0 } : null);
  return navigeer(() => openSchrijvenDirect(id, opties), { sprong: !!plek, plek, stil });
}

function openSchrijvenDirect(id, opties = null) {
  if (id && (id !== store.meta.huidig || opties)) {
    editor.bewaar();
    store.zetHuidig(id);
    editor.laad(id, opties || {});
  }
  zetView('schrijven', { focus: !(opties && opties.treffer && opties.treffer.focus === false) });
}

// Snel verwijderen uit de lijst: meteen weg, tien seconden "Ongedaan maken", en altijd nog in Versies en de Prullenbak.
function verwijderMetOngedaan(id) {
  editor.bewaar();
  const dl = store.deel(id);
  if (dl) {
    const kopie = { ...dl };
    const index = store.delen().indexOf(dl);
    store.verwijderDeel(id);
    toonOngedaan('Deel "' + (dl.titel || 'Zonder titel') + '" verwijderd', () => {
      store.project.meta.delen.splice(index, 0, kopie);
      store.wijzigDeel(kopie.id, {});
      hoofdstukken.render();
    });
    return;
  }
  const h = store.hoofdstuk(id);
  const v = store.meta.volgorde;
  if (!h || v.length <= 1) return;
  maakSnapshot('vlak voor verwijderen van "' + (h.titel || 'Zonder titel') + '"').catch(() => {});
  const index = v.indexOf(id);
  const delenIds = store.delen().filter((d) => d.voor === id).map((d) => d.id);
  const kopie = { ...h };
  const wasHuidig = store.meta.huidig === id;
  store.verwijderHoofdstuk(id);
  if (wasHuidig) { editor.verwerp(); editor.laad(store.meta.huidig); }
  toonOngedaan('"' + (h.titel || 'Zonder titel') + '" verwijderd', () => {
    store.herstelHoofdstuk(kopie, index, delenIds);
    if (app.dataset.view === 'hoofdstukken') { hoofdstukken.gekozen = kopie.id; boek.render(); }
  });
}

// Welke alinea's zijn geselecteerd? Voor "Klaar voor Claude".
function huidigeSelectie() {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed || !editor.el.contains(sel.anchorNode) || !editor.el.contains(sel.focusNode)) return null;
  const r = sel.getRangeAt(0);
  const kinderen = [...editor.el.children];
  const a = kinderen.indexOf(blokVan(editor.el, r.startContainer));
  const b = kinderen.indexOf(blokVan(editor.el, r.endContainer));
  if (a < 0 || b < 0) return null;
  // alineanummers zoals in de opgeslagen tekst: lege alinea's en scènescheidingen tellen niet
  const nummer = (k) => {
    let n = 0;
    for (let i = 0; i <= k; i++) { const c = kinderen[i]; if (c.tagName !== 'HR' && c.textContent.trim()) n++; }
    return n;
  };
  const alineas = [];
  for (let k = a; k <= b; k++) { const c = kinderen[k]; if (c.tagName !== 'HR' && c.textContent.trim()) alineas.push(nummer(k)); }
  if (!alineas.length) return null;
  const tekst = String(sel).trim();
  const geheel = kinderen[a].textContent.trim();
  if (a === b && tekst.length < geheel.length * 0.8) return { alineas, deel: tekst };
  return { alineas };
}

function openClaude() {
  if (app.dataset.view !== 'schrijven') zetView('schrijven');
  if (zoeken.open) zoeken.sluit();
  claude.toon();
}

function anderHoofdstuk(delta) {
  const v = store.meta.volgorde;
  const k = v.indexOf(store.meta.huidig) + delta;
  if (k < 0 || k >= v.length) return;
  openSchrijven(v[k], null, { stil: true });
}

function vergrendelKnop() {
  const iets = store.meta.vergrendeld.length || store.meta.vergrendelPagina;
  if (iets) {
    store.zetVergrendeld([], null);
  } else {
    const v = store.meta.volgorde;
    const k = v.indexOf(store.meta.huidig);
    if (k === 0 && editor.pagina === 0) { toonMelding('Er staat nog niets vóór deze pagina om te vergrendelen', 5000); return; }
    store.zetVergrendeld(v.slice(0, k), editor.pagina > 0 ? { id: store.meta.huidig, blz: editor.pagina } : null);
  }
  editor.pasVergrendelingToe();
  werkKicker();
}

// ---------- aantekeningen ----------
let nootPlekken = []; // in het hoofdstuk dat open staat: [{ a, blok, start, lengte }]

function markeerAantekeningen() {
  nootPlekken = [];
  const kan = window.CSS && CSS.highlights && window.Highlight;
  const h = editor.id && store.hoofdstuk(editor.id);
  if (!h) { if (kan) CSS.highlights.delete('aantekening'); return; }
  const blokken = [...editor.el.children];
  const teksten = blokken.map((b) => (b.tagName === 'HR' ? '' : b.textContent));
  const ranges = [];
  for (const a of store.aantekeningen(h.id)) {
    if (a.klaar) continue;
    const p = plaatsIn(teksten, a);
    if (!p) continue;
    const lengte = p.lengte || teksten[p.blok].length;
    nootPlekken.push({ a, blok: p.blok, start: p.start, lengte });
    if (kan && lengte) ranges.push(editor.bereik(p.blok, p.start, lengte));
  }
  if (kan) { if (ranges.length) CSS.highlights.set('aantekening', new Highlight(...ranges)); else CSS.highlights.delete('aantekening'); }
  werkNootBel();
}

// Staat de cursor in een aantekening? Dan een klein balkje met de tekst ervan.
function werkNootBel() {
  const bel = document.getElementById('noot-bel');
  if (app.dataset.view !== 'schrijven' || !nootPlekken.length) { bel.hidden = true; return; }
  const p = editor.plekNu();
  const x = p && nootPlekken.find((n) => n.blok === p.blok && p.teken >= n.start && p.teken <= n.start + n.lengte);
  if (!x) { bel.hidden = true; return; }
  if (!bel.hidden && bel.dataset.id === x.a.id) return;
  const hId = editor.id;
  bel.innerHTML = '';
  bel.dataset.id = x.a.id;
  bel.append(el('span', { class: 'noot-label', text: 'Aantekening' }), el('span', { class: 'noot-tekst', text: x.a.tekst }),
    el('button', { class: 'knop link', text: 'Klaar', onmousedown: (e) => e.preventDefault(), onclick: () => { store.wijzigAantekening(hId, x.a.id, { klaar: true }); toonMelding('Aantekening afgerond; terug te vinden bij Boek > Aantekeningen', 5000); } }),
    el('button', { class: 'knop link', text: 'Bewerk', onmousedown: (e) => e.preventDefault(), onclick: async () => {
      const t = await vraagTekst('Aantekening', 'Wat wil je later nog doen of checken?', x.a.tekst);
      if (t) store.wijzigAantekening(hId, x.a.id, { tekst: t });
      editor.focus();
    } }),
    el('button', { class: 'knop link', text: 'Verwijder', onmousedown: (e) => e.preventDefault(), onclick: () => {
      const kopie = { ...x.a };
      store.verwijderAantekening(hId, x.a.id);
      toonOngedaan('Aantekening verwijderd', () => store._zetAantekeningen(hId, [...store.aantekeningen(hId), kopie]));
    } }));
  bel.hidden = false;
}
function verbergNootBel() { const b = document.getElementById('noot-bel'); if (b) b.hidden = true; }

// Ctrl+Alt+A: een aantekening op de plek van de cursor (of bij wat je geselecteerd hebt)
async function maakAantekening() {
  if (app.dataset.view !== 'schrijven') naarSchrijven();
  if (!editor.id) return;
  const blokken = [...editor.el.children];
  const sel = document.getSelection();
  let blok = -1, teken = 0, anker = '';
  if (sel && sel.rangeCount && editor.el.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0);
    const b = blokVan(editor.el, r.startContainer);
    blok = blokken.indexOf(b);
    if (blok >= 0) {
      const voor = document.createRange();
      voor.selectNodeContents(b);
      voor.setEnd(r.startContainer, r.startOffset);
      teken = voor.toString().length;
      const tekst = b.tagName === 'HR' ? '' : b.textContent;
      if (!sel.isCollapsed) {
        let eind = tekst.length;
        if (b.contains(r.endContainer)) { const tot = document.createRange(); tot.selectNodeContents(b); tot.setEnd(r.endContainer, r.endOffset); eind = tot.toString().length; }
        const ruw = tekst.slice(teken, Math.min(eind, teken + 120));
        teken += ruw.length - ruw.trimStart().length;
        anker = ruw.trim();
      }
      if (!anker) { const w = woordRond(tekst, teken); anker = w.anker; teken = w.start; }
    }
  }
  if (blok < 0) { const p = editor.plekken[editor.id] || { blok: 0, teken: 0 }; blok = p.blok; teken = p.teken; }
  const hId = editor.id;
  const kort = anker.length > 40 ? anker.slice(0, 38) + '…' : anker;
  const tekst = await vraagTekst(kort ? 'Aantekening bij "' + kort + '"' : 'Aantekening', 'Wat wil je later nog doen of checken?', '');
  editor.focus();
  if (!tekst) return;
  editor.bewaar();
  store.nieuweAantekening(hId, { blok, teken, anker, tekst });
  editor.selecteer(blok, teken + anker.length, 0);
  toonMelding('Aantekening bewaard; je ziet hem ook op het overzicht', 5000);
}

function openAantekening(hId, a) {
  const h = store.hoofdstuk(hId);
  if (!h) return;
  const p = plaatsInHoofdstuk(h, a) || { blok: a.blok, start: 0 };
  openSchrijven(hId, { treffer: { blok: p.blok, start: p.start, lengte: 0 } });
}

// ---------- status ----------
function werkStatus() {
  const m = map.mapInfo();
  const stip = document.getElementById('status-stip');
  const tekst = document.getElementById('status-tekst');
  const knop = document.getElementById('status');
  knop.classList.remove('let-op');
  const lokaal = store.lokaalOpgeslagen ? tijd(store.lokaalOpgeslagen) : null;
  let t, kleur;
  knop.classList.remove('update');
  knop.classList.remove('ongedaan');
  if (melding) {
    t = typeof melding === 'string' ? melding : melding.tekst; kleur = 'oker';
    if (melding.actie) knop.classList.add('ongedaan');
  } else if (updateKlaar && (m.status === 'verbonden' || m.status === 'geen')) {
    t = 'Nieuwe versie klaar · klik om bij te werken';
    kleur = 'groen';
    knop.classList.add('update');
  } else if (m.status === 'verbonden' || m.status === 'bezig') {
    t = 'Opgeslagen in ' + m.naam + (m.laatsteSync ? ' · ' + tijd(m.laatsteSync) : '');
    kleur = 'groen';
  } else if (m.status === 'wacht') {
    t = 'Opgeslagen op dit apparaat · wacht op je keuze voor de map';
    kleur = 'oker';
  } else if (m.status === 'toestemming') {
    t = 'Opgeslagen op dit apparaat · klik om je map weer te koppelen';
    kleur = 'oker';
    knop.classList.add('let-op');
  } else if (m.status === 'fout') {
    t = 'Map niet bereikbaar, wel opgeslagen op dit apparaat' + (lokaal ? ' · ' + lokaal : '');
    kleur = 'rood';
    knop.classList.add('let-op');
  } else {
    t = 'Opgeslagen op dit apparaat' + (lokaal ? ' · ' + lokaal : '');
    kleur = 'oker';
  }
  tekst.textContent = t;
  stip.className = 'stip ' + kleur;
}

function toonMelding(t, ms = 12000) {
  melding = t;
  werkStatus();
  clearTimeout(meldingTimer);
  meldingTimer = setTimeout(() => { melding = null; werkStatus(); }, ms);
}

function toonOngedaan(tekst, terug) {
  toonMelding({ tekst: tekst + ' · Ongedaan maken', actie: terug }, 10000);
}

async function statusKlik() {
  if (melding && melding.actie) { const a = melding.actie; melding = null; werkStatus(); a(); return; }
  if (updateKlaar && !melding) { await bijwerken(); return; }
  const m = map.mapInfo();
  if (m.status === 'toestemming') { await opnieuwKoppelen(); return; }
  if (m.status === 'fout') { await map.syncNu(); werkStatus(); if (map.mapInfo().status === 'verbonden') return; }
  await opslagInfo();
}

async function opslagInfo() {
  const m = map.mapInfo();
  const regels = [];
  regels.push(el('p', {}, 'Op dit apparaat: ', el('strong', { text: store.lokaalOpgeslagen ? 'opgeslagen om ' + tijd(store.lokaalOpgeslagen) : 'opgeslagen' }), '. Dit is het vangnet; het staat er altijd binnen een seconde.'));
  if (m.naam) {
    const s = { verbonden: 'opgeslagen' + (m.laatsteSync ? ' om ' + tijd(m.laatsteSync) : ''), bezig: 'bezig met opslaan', toestemming: 'wacht op toestemming', fout: 'niet bereikbaar' }[m.status] || m.status;
    regels.push(el('p', {}, 'In de map ', el('strong', { text: m.naam }), ': ' + s + '.'));
  } else {
    regels.push(el('p', { text: 'Er is nog geen map gekozen. Kies je Google Drive-schrijfmap, dan staat alles daar ook als Markdown.' }));
  }
  regels.push(el('p', { class: 'klein', text: 'Elke 10 minuten wordt er een versie bewaard (Meer > Versies terugzetten), en één keer per dag een leesbaar bestand in de map Versies.' }));
  const keuze = await dialoog({
    titel: 'Opslag',
    inhoud: regels,
    knoppen: [
      { tekst: 'Controleer opslag', waarde: 'controle' },
      { tekst: m.naam ? 'Andere map kiezen' : 'Kies map', waarde: 'map' },
      { tekst: 'Klaar', waarde: null, hoofd: true },
    ],
  });
  if (keuze === 'controle') location.href = 'test.html';
  if (keuze === 'map') await kiesMapInteractief();
}

// ---------- map ----------
async function verwerkMapResultaat(res) {
  werkStatus();
  if (!res) return;
  if (res.soort === 'uit-map') {
    editor.laad(store.meta.huidig);
    werkKicker();
    toonMelding('Manuscript geopend uit ' + map.mapInfo().naam, 6000);
  } else if (res.soort === 'ander-project') {
    const keuze = await dialoog({
      titel: 'In deze map staat al een ander manuscript',
      inhoud: [
        `In ${map.mapInfo().naam} staat "${res.titel || 'een manuscript'}" met ${res.aantal} ${res.aantal === 1 ? 'hoofdstuk' : 'hoofdstukken'}. Dat is niet het manuscript dat nu in de app staat.`,
        el('p', { class: 'klein', text: 'Kies je voor openen, dan wordt wat nu in de app staat eerst als versie bewaard. Er gaat niets verloren.' }),
      ],
      knoppen: [{ tekst: 'Andere map kiezen', waarde: 'kies' }, { tekst: 'Open het manuscript uit de map', waarde: 'open', hoofd: true }],
    });
    if (keuze === 'open') {
      await map.neemOverUitMap('openen van ander manuscript');
      editor.laad(store.meta.huidig);
      werkKicker();
    } else {
      await map.ontkoppelMap();
      if (keuze === 'kies') await kiesMapInteractief();
    }
  } else if (res.soort === 'extern') {
    const namen = res.bestanden.map((p) => p.replace(/^Hoofdstukken\//, '').replace(/^Notities\//, ''));
    const keuze = await dialoog({
      titel: 'Er is iets buiten de app veranderd',
      inhoud: [
        'Deze bestanden in je map zijn gewijzigd sinds de app ze voor het laatst opsloeg:',
        el('p', { class: 'klein', text: namen.join(', ') }),
        'Welke versie wil je gebruiken? De andere wordt bewaard: de versie uit de map in Back-ups, de versie uit de app bij Versies.',
      ],
      knoppen: [{ tekst: 'Versie uit de app', waarde: 'app' }, { tekst: 'Versie uit de map', waarde: 'map', hoofd: true }],
    });
    if (keuze === 'map') {
      await map.neemOverUitMap('overnemen van wijzigingen uit de map');
      editor.laad(store.meta.huidig, { naarEinde: false });
      werkKicker();
    } else {
      await map.houdAppVersie();
    }
  } else if (res.soort === 'fout') {
    toonMelding('Map niet bereikbaar; je tekst staat veilig op dit apparaat');
  }
  werkStatus();
}

async function kiesMapInteractief() {
  if (!map.kanMapKiezen()) {
    await dialoog({ titel: 'Map kiezen gaat hier niet', inhoud: ['Deze browser kan geen map kiezen. Gebruik Chrome op de Chromebook. Je tekst blijft gewoon op dit apparaat bewaard.'], knoppen: [{ tekst: 'Oké', waarde: null, hoofd: true }] });
    return;
  }
  editor.bewaar();
  await store.bewaarLokaal();
  let res;
  try {
    res = await map.kiesMap();
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    await dialoog({ titel: 'Die map lukt niet', inhoud: [String(e && e.message || e)], knoppen: [{ tekst: 'Oké', waarde: null, hoofd: true }] });
    return;
  }
  await verwerkMapResultaat(res);
}

async function opnieuwKoppelen() {
  try {
    const res = await map.vraagToestemmingOpnieuw();
    await verwerkMapResultaat(res);
  } catch (e) {
    toonMelding('Koppelen lukte niet: ' + (e && e.message));
  }
}

// ---------- menu ----------
function menu() {
  const knop = document.getElementById('knop-meer');
  const m = document.getElementById('menu');
  const sluit = () => { m.hidden = true; knop.setAttribute('aria-expanded', 'false'); };
  knop.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = m.hidden;
    m.hidden = !open;
    knop.setAttribute('aria-expanded', String(open));
    const info = map.mapInfo();
    document.getElementById('menu-map').textContent = info.naam ? 'Map: ' + info.naam + ' (wijzigen…)' : 'Kies map…';
    document.getElementById('menu-update').textContent = updateKlaar ? 'Bijwerken naar de nieuwe versie' : 'Zoek naar update';
    document.getElementById('menu-versie').textContent = 'Schrijfmachine versie ' + VERSIE;
    if (open) m.querySelector('button').focus();
  });
  document.addEventListener('click', (e) => { if (!m.hidden && !m.contains(e.target)) sluit(); });
  m.addEventListener('keydown', (e) => {
    const knoppen = [...m.querySelectorAll('button')];
    const k = knoppen.indexOf(document.activeElement);
    if (e.key === 'Escape') { sluit(); knop.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); knoppen[(k + 1) % knoppen.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); knoppen[(k - 1 + knoppen.length) % knoppen.length].focus(); }
  });
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-actie]');
    if (!b) return;
    sluit();
    await menuActie(b.dataset.actie);
  });
}

async function menuActie(actie) {
  editor.bewaar();
  notitiesBewaar();
  if (actie === 'exporteer') {
    try { await exporteer(); } catch (e) {
      await dialoog({ titel: 'Exporteren mislukt', inhoud: [String(e && e.message || e)], knoppen: [{ tekst: 'Oké', waarde: null, hoofd: true }] });
    }
  } else if (actie === 'importeer') {
    document.getElementById('bestandkiezer').click();
  } else if (actie === 'versies') {
    await versiesDialoog();
  } else if (actie === 'map') {
    await kiesMapInteractief();
    if (app.dataset.view === 'hoofdstukken') boek.render();
  } else if (actie === 'nu-opslaan') {
    await nuOpslaan();
  } else if (actie === 'controle') {
    await store.bewaarLokaal();
    location.href = 'test.html';
  } else if (actie === 'titel') {
    const t = await vraagTekst('Titel van het boek', 'Titel', store.meta.titel);
    if (t !== null) { store.zetTitel(t); werkKicker(); }
  } else if (actie === 'hulp') {
    hulp();
  } else if (actie === 'koppel') {
    await opnieuwKoppelen();
    if (app.dataset.view === 'hoofdstukken') boek.render();
  } else if (actie === 'claude') {
    openClaude();
  } else if (actie === 'vergrendelen') {
    hoofdstukken.renderSlot();
    await dialoog({
      titel: 'Vergrendelen',
      inhoud: [el('p', { class: 'klein', text: 'Vergrendelde hoofdstukken staan achter een waas en kun je niet per ongeluk bewerken. Tijdens het schrijven zet de knop Vergrendel alles vóór je pagina achter een waas.' }), hoofdstukken.slotEl],
      knoppen: [{ tekst: 'Klaar', waarde: null, hoofd: true }],
    });
    if (app.dataset.view === 'hoofdstukken') hoofdstukken.render();
  } else if (actie === 'aantekening') {
    await maakAantekening();
  } else if (actie === 'zoeken') {
    if (app.dataset.view !== 'schrijven') naarSchrijven();
    zoeken.toon();
  } else if (actie === 'instellingen') {
    await instellingenDialoog();
  } else if (actie === 'update') {
    await zoekUpdate(true);
  }
}

// ---------- instellingen ----------
async function instellingenDialoog() {
  const avond = el('select', { 'aria-label': 'Avondstand' },
    el('option', { value: 'uit', text: 'Uit (licht papier)' }),
    el('option', { value: 'aan', text: 'Aan (donker papier)' }),
    el('option', { value: 'auto', text: 'Automatisch, van 20:00 tot 7:00' }));
  avond.value = lees('avond');
  avond.addEventListener('change', () => { zet('avond', avond.value); pasThemaToe(); });
  const vs = el('input', { type: 'checkbox', 'aria-label': 'Volledig scherm' });
  vs.checked = lees('volledigScherm');
  vs.addEventListener('change', () => {
    zet('volledigScherm', vs.checked);
    if (vs.checked) gaVolledigScherm(); else verlaatVolledigScherm();
  });
  const kl = el('input', { type: 'checkbox', 'aria-label': 'Kantlijn altijd tonen' });
  kl.checked = lees('kantlijnVast');
  kl.addEventListener('change', () => zet('kantlijnVast', kl.checked));
  const ty = el('input', { type: 'checkbox', 'aria-label': 'Slimme aanhalingstekens' });
  ty.checked = lees('typografie');
  ty.addEventListener('change', () => zet('typografie', ty.checked));
  await dialoog({
    titel: 'Instellingen',
    inhoud: [
      el('div', { class: 'instelling' }, el('div', {}, el('div', { text: 'Avondstand' }), el('div', { class: 'uitleg', text: 'Donker, warm papier voor \'s avonds. Voor een warmere kleur van het hele scherm: zet op de Chromebook ook Nachtverlichting aan (klik op de klok rechtsonder).' }), avond)),
      el('label', { class: 'instelling' }, vs, el('div', {}, el('div', { text: 'Volledig scherm' }), el('div', { class: 'uitleg', text: 'Bij de eerste toets of klik verdwijnt alles behalve je tekst. Houd Esc even ingedrukt om eruit te gaan.' }))),
      el('label', { class: 'instelling' }, kl, el('div', {}, el('div', { text: 'Hoofdstukken altijd in de kantlijn' }), el('div', { class: 'uitleg', text: 'Anders verschijnen ze alleen als je met de muis naar links gaat.' }))),
      el('label', { class: 'instelling' }, ty, el('div', {}, el('div', { text: 'Slimme aanhalingstekens' }), el('div', { class: 'uitleg', text: 'Tijdens het typen wordt " een “ of ”, \' een ‘ of ’, \'s een ’s en ... een …' }))),
    ],
    knoppen: [{ tekst: 'Klaar', waarde: null, hoofd: true }],
  });
}

// ---------- volledig scherm ----------
let volledigSchermSessieUit = false;
let doorOnsVolledig = false;
async function gaVolledigScherm() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    doorOnsVolledig = true;
    // Esc blijft dan in de app (terug naar schrijven); lang ingedrukt houden verlaat volledig scherm
    if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {});
  } catch (e) { /* mag niet zonder klik of toets; volgende keer weer */ }
}
function verlaatVolledigScherm() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
function volledigSchermBijStart() {
  const probeer = () => {
    if (!lees('volledigScherm') || volledigSchermSessieUit || document.fullscreenElement || dialoogOpen()) return;
    gaVolledigScherm();
  };
  window.addEventListener('keydown', probeer, true);
  window.addEventListener('pointerdown', probeer, true);
  document.addEventListener('fullscreenchange', () => {
    // zelf uit volledig scherm gegaan? Dan deze sessie niet meer opdringen
    if (!document.fullscreenElement && doorOnsVolledig) volledigSchermSessieUit = true;
    requestAnimationFrame(() => editor.herbereken());
  });
}

// ---------- updates ----------
function volgUpdates(reg) {
  swRegistratie = reg;
  const markeer = () => { if (reg.waiting && navigator.serviceWorker.controller) { updateKlaar = true; werkStatus(); } };
  markeer();
  reg.addEventListener('updatefound', () => {
    const nieuw = reg.installing;
    if (nieuw) nieuw.addEventListener('statechange', () => { if (nieuw.state === 'installed') markeer(); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (bijwerkenGevraagd) location.reload(); });
  // bij het opstarten en daarna elk uur even kijken
  reg.update().catch(() => {});
  setInterval(() => reg.update().catch(() => {}), 3600e3);
}

async function zoekUpdate(melden) {
  if (!swRegistratie) {
    if (melden) await dialoog({ titel: 'Updates', inhoud: ['Updates werken alleen in de geïnstalleerde app of via de website.'], knoppen: [{ tekst: 'Oké', waarde: null, hoofd: true }] });
    return;
  }
  try { await swRegistratie.update(); } catch (e) { /* offline */ }
  await new Promise((r) => setTimeout(r, 1500));
  if (swRegistratie.waiting) { updateKlaar = true; werkStatus(); }
  if (!melden) return;
  if (updateKlaar) await bijwerken();
  else await dialoog({ titel: 'Je hebt de nieuwste versie', inhoud: ['Schrijfmachine versie ' + VERSIE + '. Komt er een nieuwe, dan staat dat vanzelf rechtsonder.'], knoppen: [{ tekst: 'Oké', waarde: null, hoofd: true }] });
}

async function bijwerken() {
  const ok = await dialoog({
    titel: 'Bijwerken naar de nieuwe versie?',
    inhoud: ['Alles wordt eerst opgeslagen, daarna start de app even opnieuw. Je tekst merkt er niets van.'],
    knoppen: [{ tekst: 'Later', waarde: false }, { tekst: 'Bijwerken', waarde: true, hoofd: true }],
  });
  if (!ok) return;
  editor.bewaar();
  notitiesBewaar();
  await store.bewaarLokaal();
  await map.syncNu();
  bijwerkenGevraagd = true;
  const w = swRegistratie && swRegistratie.waiting;
  if (w) w.postMessage('bijwerken');
  setTimeout(() => location.reload(), 3000); // als het bericht niet aankomt
}

async function nuOpslaan() {
  editor.bewaar();
  notitiesBewaar();
  await store.bewaarLokaal();
  await map.syncNu();
  werkStatus();
}

async function versiesDialoog() {
  await store.bewaarLokaal();
  const lijst = await lijstSnapshots();
  const box = el('div', { class: 'lijst' });
  let gekozen = null;
  const terugKnop = { tekst: 'Zet deze versie terug', waarde: () => gekozen, hoofd: true, check: () => !!gekozen };
  if (!lijst.length) box.append(el('div', { class: 'lijst-rij', text: 'Nog geen versies. De eerste wordt na 10 minuten schrijven gemaakt.' }));
  for (const s of lijst) {
    const radio = el('input', { type: 'radio', name: 'versie', value: String(s.tijd), 'aria-label': datumTijd(s.tijd) });
    radio.addEventListener('change', () => { gekozen = s.tijd; });
    box.append(el('label', { class: 'lijst-rij' }, radio,
      el('span', { class: 'groei', text: datumTijd(s.tijd) + (s.reden && s.reden !== 'automatisch' ? ' · ' + s.reden : '') }),
      el('span', { class: 'klein', text: woorden(s.woorden) })));
  }
  const keuze = await dialoog({
    titel: 'Versies terugzetten',
    breed: true,
    inhoud: [
      el('p', { text: 'Kies een eerder moment. Wat er nu staat wordt eerst zelf als versie bewaard, dus terugzetten is altijd weer ongedaan te maken.' }),
      box,
    ],
    knoppen: [
      { tekst: 'Bewaar nu een versie', waarde: 'nu' },
      { tekst: 'Annuleer', waarde: null },
      terugKnop,
    ],
  });
  if (keuze === 'nu') {
    await maakSnapshot('handmatig');
    toonMelding('Versie bewaard', 4000);
    return;
  }
  if (typeof keuze === 'number') {
    await zetSnapshotTerug(keuze);
    editor.laad(store.meta.huidig, { naarEinde: false });
    werkKicker();
    Notities.verwerpAlle();
    if (spiek.open) spiek.toonOverzicht();
    if (app.dataset.view === 'hoofdstukken') boek.render();
    await map.syncNu();
    toonMelding('Versie van ' + datumTijd(keuze) + ' teruggezet', 8000);
  }
}

function hulp() {
  const rij = (toets, wat) => el('tr', {}, el('td', {}, ...toets.split(' + ').flatMap((t, i) => (i ? [' + ', el('kbd', { text: t })] : [el('kbd', { text: t })]))), el('td', { text: wat }));
  dialoog({
    titel: 'Handig om te weten',
    inhoud: [el('p', { class: 'klein', text: 'Klik in de inhoud op een hoofdstuk om erin te schrijven; achter elk hoofdstuk staat ··· voor gegevens, hernoemen, verplaatsen en meer. Ga tijdens het schrijven met de muis naar de linkerrand voor je hoofdstukken. De terugtoets brengt je altijd één stap terug.' }), el('table', {},
      rij('Ctrl + B', 'Vet'),
      rij('Ctrl + I', 'Cursief'),
      rij('Ctrl + Alt + 2', 'Kopje binnen het hoofdstuk (aan/uit)'),
      rij('Ctrl + Shift + Enter', 'Scènescheiding na deze alinea (of typ *** en Enter)'),
      rij('PageDown', 'Volgende pagina'),
      rij('PageUp', 'Vorige pagina'),
      rij('Ctrl + PageDown', 'Volgend hoofdstuk'),
      rij('Ctrl + PageUp', 'Vorig hoofdstuk'),
      rij('Ctrl + F', 'Zoeken en vervangen in het hele manuscript (of typ A12 om naar alinea 12 te gaan)'),
      rij('Ctrl + Alt + C', 'Klaar voor Claude: je selectie of hoofdstuk met je vraag naar het klembord'),
      rij('Ctrl + Alt + A', 'Aantekening op de plek van je cursor (gaat niet mee in de export)'),
      rij('Ctrl + Alt + N', 'Spiekbriefje: alles over dit hoofdstuk'),
      rij('Ctrl + Alt + H', 'Wisselen tussen schrijven en je boek'),
      rij('Ctrl + S', 'Nu opslaan (gebeurt ook vanzelf)'),
      rij('Esc', 'Wisselen tussen schrijven en het overzicht van je boek'),
      rij('Alt + ←', 'Terug naar waar je was (ook de terugtoets bovenaan het toetsenbord)'),
    ), el('p', { class: 'klein', text: 'Bladeren kan ook door in de lege rand naast de tekst te klikken. Ga je met de muis naar links, dan zie je je hoofdstukken en het scènedoel. In volledig scherm: houd Esc even ingedrukt om eruit te gaan.' })],
    knoppen: [{ tekst: 'Klaar', waarde: null, hoofd: true }],
  });
}

// ---------- welkom ----------
async function welkom() {
  const kan = map.kanMapKiezen();
  const keuze = await dialoog({
    titel: 'Welkom bij de Schrijfmachine',
    inhoud: [
      'Alles wat je schrijft wordt meteen op dit apparaat bewaard.',
      kan
        ? 'Kies daarnaast de map waarin je manuscript moet komen, bijvoorbeeld je schrijfmap in Google Drive (in de Bestanden-app onder Google Drive > Mijn Drive). Dan staat elk hoofdstuk daar ook als Markdown-bestand.'
        : 'Deze browser kan geen map kiezen; de app werkt gewoon op de opslag van dit apparaat.',
      el('p', { class: 'klein', text: 'Heb je al tekst? Na het kiezen van de map kun je via Meer > Importeer tekst een .docx inlezen.' }),
    ],
    knoppen: kan ? [{ tekst: 'Later', waarde: 'later' }, { tekst: 'Kies map', waarde: 'map', hoofd: true }] : [{ tekst: 'Begin', waarde: 'later', hoofd: true }],
  });
  if (keuze === 'map') await kiesMapInteractief();
}

// ---------- toetsen ----------
function sneltoetsen() {
  document.addEventListener('keydown', async (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); await nuOpslaan(); return; }
    if (dialoogOpen()) return;
    if (ctrl && e.altKey && (e.key.toLowerCase() === 'n' || e.code === 'KeyN')) {
      e.preventDefault();
      if (app.dataset.view !== 'schrijven') naarSchrijven();
      wisselNotities();
      return;
    }
    if (ctrl && e.altKey && (e.key.toLowerCase() === 'a' || e.code === 'KeyA')) {
      e.preventDefault();
      await maakAantekening();
      return;
    }
    if (ctrl && e.altKey && (e.key.toLowerCase() === 'c' || e.code === 'KeyC')) {
      e.preventDefault();
      openClaude();
      return;
    }
    if (ctrl && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (app.dataset.view !== 'schrijven') naarSchrijven();
      const sel = String(document.getSelection() || '').trim();
      if (claude.open) claude.sluit();
      zoeken.toon(sel && sel.length < 60 && !sel.includes('\n') ? sel : '');
      return;
    }
    if (ctrl && (e.key === 'PageDown' || e.key === 'PageUp') && app.dataset.view === 'schrijven' && document.activeElement !== editor.el) {
      e.preventDefault();
      anderHoofdstuk(e.key === 'PageDown' ? 1 : -1);
      return;
    }
    if (ctrl && e.altKey && (e.key.toLowerCase() === 'h' || e.code === 'KeyH')) {
      e.preventDefault();
      wissel();
      return;
    }
    if (e.key === 'Escape') {
      if (!document.getElementById('menu').hidden || document.querySelector('.rij-menu')) return;
      if (app.dataset.view === 'hoofdstukken') {
        if (boek.tab !== 'overzicht') navigeer(() => boek.kies('overzicht')); else naarSchrijven();
        return;
      }
      if (zoeken.open) { zoeken.sluit(); return; }
      if (claude.open) { claude.sluit(); return; }
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#notities')) { editor.focus(); return; }
      naarBoek();
      return;
    }
    if (app.dataset.view === 'schrijven' && (e.key === 'PageDown' || e.key === 'PageUp')) {
      const a = document.activeElement;
      if (a && (a.closest('#notities') || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
      if (a === editor.el) return; // de editor doet dit zelf
      e.preventDefault();
      editor.blader(e.key === 'PageDown' ? 1 : -1);
    }
  });
}

// het spiekbriefje naast de tekst open of dicht
function wisselNotities(persoonId = null) {
  const knop = document.getElementById('knop-notities');
  if (spiek.open && !persoonId) {
    spiek.verberg();
    knop.setAttribute('aria-pressed', 'false');
    editor.focus();
  } else {
    spiek.toon(persoonId);
    knop.setAttribute('aria-pressed', 'true');
  }
  requestAnimationFrame(() => editor.herbereken());
}

// ---------- maar één venster tegelijk ----------
// Twee vensters die allebei in hetzelfde manuscript schrijven zouden elkaars werk overschrijven.
// Daarom: is de app al open, dan vraagt dit venster eerst wat je wilt.
let opSlot = false;
// Geeft true als dit het enige venster is. Tot dat vaststaat schrijft dit venster niets weg.
function eenVenster() {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(true);
  const kanaal = new BroadcastChannel('schrijfmachine');
  const ikId = Math.random().toString(36).slice(2);
  let anderGezien = false;
  kanaal.onmessage = async (e) => {
    const m = e.data || {};
    if (m.van === ikId) return;
    if (m.type === 'wie' && !opSlot) kanaal.postMessage({ type: 'ik', van: ikId });
    if (m.type === 'ik') anderGezien = true;
    if (m.type === 'neemover' && !opSlot) await zetOpSlot();
  };
  // weg uit dit venster (ook naar de terug-cache van de browser): niet meer antwoorden
  window.addEventListener('pagehide', () => { try { kanaal.close(); } catch (e) { /* */ } });
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
  kanaal.postMessage({ type: 'wie', van: ikId });
  return new Promise((resolve) => setTimeout(() => {
    if (anderGezien) { anderVensterOpen(kanaal, ikId); resolve(false); } else resolve(true);
  }, 400));
}

async function anderVensterOpen(kanaal, ikId) {
  if (opSlot) return;
  opSlot = true;
  editor.el.setAttribute('contenteditable', 'false');
  const keuze = await dialoog({
    titel: 'De app is al open',
    inhoud: ['De Schrijfmachine is al open in een ander venster. Schrijf in één venster tegelijk, anders kunnen twee versies door elkaar lopen.'],
    knoppen: [{ tekst: 'Hier verder schrijven', waarde: 'hier', hoofd: true }],
  });
  if (keuze === 'hier') {
    kanaal.postMessage({ type: 'neemover', van: ikId });
    await new Promise((r) => setTimeout(r, 1200));
  }
  location.reload();
}

async function zetOpSlot() {
  opSlot = true;
  editor.bewaar();
  notitiesBewaar();
  store.markeerAlles(); // alles opnieuw wegschrijven, wat het andere venster ook deed
  await store.bewaarLokaal();
  await map.syncNu();
  editor.el.setAttribute('contenteditable', 'false');
  await dialoog({
    titel: 'Je schrijft nu in een ander venster',
    inhoud: ['Alles van hier is opgeslagen. Dit venster staat op slot zodat er niets dubbel gebeurt.'],
    knoppen: [{ tekst: 'Hier verder schrijven', waarde: true, hoofd: true }],
  });
  location.reload();
}

// ---------- opstarten ----------
async function start() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(volgUpdates).catch((e) => console.warn('service worker', e));
  }
  pasThemaToe();
  setInterval(pasThemaToe, 60000); // voor de automatische avondstand
  instellingen.addEventListener('gewijzigd', pasThemaToe);
  initRijkeTekst();
  const { nieuw } = await store.laad();

  editor = new Editor();
  editor.addEventListener('pagina', () => { werkPaginanummer(); });
  editor.addEventListener('geladen', () => { werkPaginanummer(); werkKicker(); });
  editor.addEventListener('ander-hoofdstuk', (e) => anderHoofdstuk(e.detail));
  kantlijn = new Kantlijn({ openHoofdstuk: (id) => openSchrijven(id), openOverzicht: () => naarBoek() });
  editor.addEventListener('geladen', () => { kantlijn.werkBij(); markeerAantekeningen(); if (spiek && spiek.open) spiek.werkBij(); });
  editor.addEventListener('typen', () => { kantlijn.verberg(); verbergTerugChip(); });
  // na het typen de aantekeningen opnieuw plaatsen (alinea's kunnen verschoven zijn)
  let nootTimer = null;
  editor.el.addEventListener('rijk-wijziging', () => { clearTimeout(nootTimer); nootTimer = setTimeout(markeerAantekeningen, 500); });
  let zoekSprong = false; // binnen één zoekronde is alleen de eerste treffer een stap terug
  editor.addEventListener('typen', () => { zoekSprong = false; });
  zoeken = new Zoeken({
    openTreffer: (id, treffer) => {
      if (zoekSprong) { herstellen = true; try { openSchrijvenDirect(id, { treffer }); } finally { herstellen = false; } ververs(); return; }
      zoekSprong = true;
      openSchrijven(id, { treffer });
    },
    voorZoeken: () => { editor.bewaar(); },
    naVervangen: () => { editor.verwerp(); editor.laad(store.meta.huidig); },
  });
  hoofdstukken = new Hoofdstukken({
    openSchrijven: (id, opties) => openSchrijven(id, opties),
    openPersoon: (id) => navigeer(() => boek.openKaart(id)),
    verwijder: (id) => verwijderMetOngedaan(id),
  });
  const openMoment = (id, m) => openSchrijven(id, { treffer: { blok: m.blok, start: m.start, lengte: m.lengte } });
  spiek = new Spiek({ openAantekening, openMoment });
  boek = new Boek({
    hoofdstukken,
    navigeer,
    openSchrijven: (id) => openSchrijven(id),
    openMoment,
    openAantekening,
    actie: (a) => menuActie(a),
    naKies: () => werkKicker(),
    zoek: (term) => { naarSchrijven(); if (claude.open) claude.sluit(); zoeken.toon(term); },
  });
  claude = new Claude({ huidigeSelectie, voorKlaar: () => { editor.bewaar(); notitiesBewaar(); } });
  document.addEventListener('klaar-voor-claude', () => openClaude());
  document.addEventListener('aantekening-maken', () => maakAantekening());
  store.addEventListener('aantekeningen', () => {
    markeerAantekeningen();
    if (spiek.open) spiek.werkBij();
    if (app.dataset.view === 'hoofdstukken') { if (boek.tab === 'aantekeningen') boek.aantekeningen(); else if (boek.tab === 'overzicht') boek.werkKop(); }
  });
  document.addEventListener('selectionchange', () => {
    if (app.dataset.view !== 'schrijven') return;
    const sel = document.getSelection();
    if (sel && sel.rangeCount && editor.el.contains(sel.focusNode)) { werkNootBel(); ververs(); }
  });
  window.addEventListener('popstate', (e) => {
    if (!e.state || dialoogOpen()) return;
    herstellen = true;
    try { herstel(e.state); } finally { herstellen = false; }
  });

  editor.el.setAttribute('contenteditable', 'false');
  // voor de automatische tests en voor wie wil meekijken in de console
  window.__schrijfmachine = { store, editor, map, db, maakSnapshot, hoofdstukken, zetView, zoeken, kantlijn, claude, boek, spiek, Notities, navigeer, naarBoek, naarSchrijven };
  if (!(await eenVenster())) return;
  editor.laad(store.meta.huidig);
  werkKicker();
  const startParams = new URLSearchParams(location.search);
  if (startParams.get('start') !== 'schrijven') zetView('boek', { tab: 'overzicht' });
  else zetView('schrijven');
  history.replaceState(staat(), '');

  document.getElementById('knop-wissel').addEventListener('click', wissel);
  document.getElementById('terug-chip').addEventListener('click', () => { verbergTerugChip(); history.back(); });
  document.getElementById('knop-notities').addEventListener('click', () => wisselNotities());
  document.getElementById('knop-vergrendel').addEventListener('click', vergrendelKnop);
  document.getElementById('knop-ontgrendel-hier').addEventListener('click', () => {
    store.zetVergrendeld([], null);
    editor.pasVergrendelingToe();
    werkKicker();
    editor.focus();
  });
  document.getElementById('status').addEventListener('click', statusKlik);
  document.getElementById('bestandkiezer').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const res = await importeerBestand(f);
    if (res) {
      editor.laad(store.meta.huidig, { naarEinde: false });
      naarBoek();
      toonMelding(res.aantal + (res.aantal === 1 ? ' hoofdstuk' : ' hoofdstukken') + ' geïmporteerd', 6000);
    }
  });
  menu();
  sneltoetsen();
  volledigSchermBijStart();
  // map weer koppelen bij je eerste toets of klik (Chrome vraagt dan één keer toestemming)
  const koppelBijGebaar = () => {
    if (map.mapInfo().status !== 'toestemming') return;
    window.removeEventListener('keydown', koppelBijGebaar, true);
    window.removeEventListener('pointerdown', koppelBijGebaar, true);
    opnieuwKoppelen();
  };
  window.addEventListener('keydown', koppelBijGebaar, true);
  window.addEventListener('pointerdown', koppelBijGebaar, true);

  store.addEventListener('lokaal-opgeslagen', werkStatus);
  store.addEventListener('vergrendeling', () => { editor.pasVergrendelingToe(); werkKicker(); });
  store.addEventListener('gewijzigd', () => { if (app.dataset.view === 'schrijven') werkKicker(); });
  store.addEventListener('vervangen', () => {
    editor.verwerp();
    editor.laad(store.meta.huidig, { naarEinde: false });
    Notities.verwerpAlle();
    if (spiek.open) spiek.toonOverzicht();
    if (app.dataset.view === 'hoofdstukken') boek.render();
    werkKicker();
  });
  store.addEventListener('fout', () => toonMelding('Opslaan op dit apparaat lukte even niet; ik probeer het opnieuw'));
  map.mapEvents.addEventListener('status', (e) => {
    if (e.detail.backups && e.detail.backups.length) {
      toonMelding('Een bestand was buiten de app gewijzigd; er staat een kopie in Back-ups');
    }
    werkStatus();
  });

  // vangnet bij weggaan
  const nood = () => {
    editor.bewaar(); notitiesBewaar(); store.bewaarLokaal(); map.syncNu();
    editor.onthoudPlek(); db.put('meta', editor.plekken, 'cursorplekken').catch(() => {});
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') nood(); });
  window.addEventListener('pagehide', nood);
  window.addEventListener('beforeunload', () => { editor.bewaar(); notitiesBewaar(); store.bewaarLokaal(); });

  vraagBlijvendeOpslag();
  // een versie bij het opstarten als het al een tijd geleden is
  try {
    const versies = await lijstSnapshots();
    if (!store.isLeeg() && (!versies.length || Date.now() - versies[0].tijd > 10 * 60 * 1000)) await maakSnapshot('bij opstarten');
  } catch (e) { console.warn(e); }
  startAutomatisch();
  werkStatus();

  // map koppelen
  const params = new URLSearchParams(location.search);
  if (params.get('testmap') === 'opfs' && navigator.storage && navigator.storage.getDirectory) {
    // alleen voor de automatische tests: een interne map in plaats van Drive
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(params.get('mapnaam') || 'testmap', { create: true });
    await verwerkMapResultaat(await map.gebruikMap(dir));
  } else {
    const res = await map.probeerBewaardeMap();
    if (res.soort === 'geen' && nieuw && !params.has('geenwelkom')) await welkom();
    else await verwerkMapResultaat(res);
  }
  werkStatus();
  if (app.dataset.view === 'hoofdstukken') boek.render();
  setInterval(werkStatus, 30000);
}

start().catch((e) => {
  console.error(e);
  document.getElementById('status-tekst').textContent = 'Er ging iets mis bij het opstarten: ' + (e && e.message);
});
