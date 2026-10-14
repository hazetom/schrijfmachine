// Opstarten en alles aan elkaar knopen.

import { store, TABS } from './store.js';
import { vraagBlijvendeOpslag, db } from './db.js';
import { Editor } from './editor.js';
import { Hoofdstukken, vraagTekst } from './chapters.js';
import { Notities } from './notes.js';
import { initRijkeTekst } from './richtext.js';
import * as map from './folder.js';
import { maakSnapshot, lijstSnapshots, zetSnapshotTerug, startAutomatisch } from './snapshots.js';
import { exporteer, importeerBestand } from './importexport.js';
import { el, dialoog, dialoogOpen, tijd, datumTijd, woorden } from './ui.js';
import { Kantlijn } from './kantlijn.js';
import { Zoeken } from './zoeken.js';
import { lees, zet, pasThemaToe, instellingen, VERSIE } from './instellingen.js';
import { Claude } from './claude.js';
import { blokVan } from './richtext.js';

const app = document.getElementById('app');
let editor, hoofdstukken, notities, kantlijn, zoeken, claude;
let swRegistratie = null;
let updateKlaar = false;
let bijwerkenGevraagd = false;
let melding = null;
let meldingTimer = null;

// ---------- weergave ----------
function zetView(view, { focus = true } = {}) {
  if (view === 'hoofdstukken') {
    editor.bewaar();
    notitiesBewaar();
    app.dataset.view = 'hoofdstukken';
    document.getElementById('view-schrijven').hidden = true;
    document.getElementById('view-hoofdstukken').hidden = false;
    hoofdstukken.toon();
    hoofdstukken.focusRij();
  } else {
    app.dataset.view = 'schrijven';
    document.getElementById('view-hoofdstukken').hidden = true;
    document.getElementById('view-schrijven').hidden = false;
    editor.herbereken();
    if (focus) editor.focus();
    if (kantlijn) kantlijn.werkBij();
  }
  werkKicker();
}

function notitiesBewaar() { if (notities) notities.bewaar(); }

function werkKicker() {
  const k = document.getElementById('kicker');
  k.innerHTML = '';
  if (app.dataset.view === 'hoofdstukken') {
    k.textContent = (store.meta.titel || 'Manuscript') + ' · Hoofdstukken';
  } else {
    const h = store.huidig();
    if (h) {
      const lijn = h.lijn ? store.verhaallijn(h.lijn) : null;
      if (lijn && lijn.kleur) k.append(el('span', { class: 'vlak', 'aria-hidden': 'true', style: { backgroundColor: lijn.kleur } }));
      const deel = store.deelVan(h.id);
      const delen = [deel ? (deel.titel || 'Deel') : null, store.label(h.id), h.titel || 'Zonder titel'].filter(Boolean);
      k.append(el('span', { text: delen.join(' · ') }));
    }
  }
  const iets = store.meta.vergrendeld.length || store.meta.vergrendelPagina;
  document.getElementById('knop-vergrendel-tekst').textContent = iets ? 'Ontgrendel' : 'Vergrendel';
  document.getElementById('knop-vergrendel').title = iets ? 'Alles weer zichtbaar maken' : 'Alles vóór deze pagina achter een waas zetten';
}

function werkPaginanummer() {
  document.getElementById('paginanummer').textContent = 'blz. ' + (editor.pagina + 1) + ' van ' + editor.aantal;
  document.getElementById('knop-vorige').disabled = editor.pagina === 0;
  document.getElementById('knop-volgende').disabled = editor.pagina >= editor.aantal - 1;
}

function openSchrijven(id, opties = null) {
  if (id && (id !== store.meta.huidig || opties)) {
    editor.bewaar();
    store.zetHuidig(id);
    editor.laad(id, opties || {});
  }
  zetView('schrijven', { focus: !(opties && opties.treffer && opties.treffer.focus === false) });
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
  openSchrijven(v[k]);
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
  if (melding) {
    t = melding; kleur = 'oker';
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

async function statusKlik() {
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
  } else if (actie === 'claude') {
    openClaude();
  } else if (actie === 'zoeken') {
    if (app.dataset.view !== 'schrijven') zetView('schrijven');
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
    if (notities.open) notities.render();
    if (app.dataset.view === 'hoofdstukken') hoofdstukken.render();
    await map.syncNu();
    toonMelding('Versie van ' + datumTijd(keuze) + ' teruggezet', 8000);
  }
}

function hulp() {
  const rij = (toets, wat) => el('tr', {}, el('td', {}, ...toets.split(' + ').flatMap((t, i) => (i ? [' + ', el('kbd', { text: t })] : [el('kbd', { text: t })]))), el('td', { text: wat }));
  dialoog({
    titel: 'Sneltoetsen',
    inhoud: [el('table', {},
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
      rij('Ctrl + Alt + N', 'Notities open/dicht'),
      rij('Ctrl + Alt + H', 'Hoofdstukken'),
      rij('Ctrl + S', 'Nu opslaan (gebeurt ook vanzelf)'),
      rij('Esc', 'Terug naar schrijven'),
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
      if (app.dataset.view !== 'schrijven') zetView('schrijven');
      wisselNotities();
      return;
    }
    if (ctrl && e.altKey && (e.key.toLowerCase() === 'c' || e.code === 'KeyC')) {
      e.preventDefault();
      openClaude();
      return;
    }
    if (ctrl && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (app.dataset.view !== 'schrijven') zetView('schrijven');
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
      zetView(app.dataset.view === 'hoofdstukken' ? 'schrijven' : 'hoofdstukken');
      return;
    }
    if (e.key === 'Escape') {
      if (!document.getElementById('menu').hidden) return;
      if (app.dataset.view === 'hoofdstukken') { zetView('schrijven'); return; }
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#notities')) { editor.focus(); return; }
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

function wisselNotities(tab = null, id = null) {
  const knop = document.getElementById('knop-notities');
  if (notities.open && !tab) {
    notities.verberg();
    knop.setAttribute('aria-pressed', 'false');
    editor.focus();
  } else {
    notities.toon(tab, id);
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
  kantlijn = new Kantlijn({ openHoofdstuk: (id) => openSchrijven(id), openOverzicht: () => zetView('hoofdstukken') });
  editor.addEventListener('geladen', () => kantlijn.werkBij());
  editor.addEventListener('typen', () => kantlijn.verberg());
  zoeken = new Zoeken({
    openTreffer: (id, treffer) => openSchrijven(id, { treffer }),
    voorZoeken: () => { editor.bewaar(); },
    naVervangen: () => { editor.verwerp(); editor.laad(store.meta.huidig); },
  });
  hoofdstukken = new Hoofdstukken({
    openSchrijven: (id, opties) => openSchrijven(id, opties),
    openNotities: (tab, id) => { zetView('schrijven'); wisselNotities(tab, id); },
  });
  notities = new Notities({
    opWijziging: () => { if (app.dataset.view === 'hoofdstukken') hoofdstukken.render(); },
    openMoment: (id, m) => openSchrijven(id, { treffer: { blok: m.blok, start: m.start, lengte: m.lengte } }),
  });
  claude = new Claude({ huidigeSelectie, voorKlaar: () => { editor.bewaar(); notitiesBewaar(); } });
  document.addEventListener('klaar-voor-claude', () => openClaude());

  editor.el.setAttribute('contenteditable', 'false');
  // voor de automatische tests en voor wie wil meekijken in de console
  window.__schrijfmachine = { store, editor, map, db, maakSnapshot, notities, hoofdstukken, zetView, zoeken, kantlijn, claude };
  if (!(await eenVenster())) return;
  editor.laad(store.meta.huidig);
  werkKicker();

  document.getElementById('knop-hoofdstukken').addEventListener('click', () => zetView('hoofdstukken'));
  document.getElementById('knop-terug').addEventListener('click', () => zetView('schrijven'));
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
      zetView('hoofdstukken');
      toonMelding(res.aantal + (res.aantal === 1 ? ' hoofdstuk' : ' hoofdstukken') + ' geïmporteerd', 6000);
    }
  });
  menu();
  sneltoetsen();
  volledigSchermBijStart();

  store.addEventListener('lokaal-opgeslagen', werkStatus);
  store.addEventListener('vergrendeling', () => { editor.pasVergrendelingToe(); werkKicker(); });
  store.addEventListener('gewijzigd', () => { if (app.dataset.view === 'schrijven') werkKicker(); });
  store.addEventListener('vervangen', () => {
    editor.verwerp();
    editor.laad(store.meta.huidig, { naarEinde: false });
    notities.verwerp();
    if (notities.open) notities.render();
    if (app.dataset.view === 'hoofdstukken') hoofdstukken.render();
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
  setInterval(werkStatus, 30000);
}

start().catch((e) => {
  console.error(e);
  document.getElementById('status-tekst').textContent = 'Er ging iets mis bij het opstarten: ' + (e && e.message);
});
