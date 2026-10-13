// De gekozen map (bijvoorbeeld je Google Drive-schrijfmap).
// Regels:
//  - Alles staat altijd eerst in IndexedDB; de map is de tweede plek.
//  - Voor elk bestand onthouden we een vingerafdruk van wat we er zelf het laatst in schreven.
//    Is het bestand sindsdien buiten de app veranderd, dan maken we eerst een kopie in Back-ups/
//    voordat we het overschrijven. Er gaat dus nooit iets stilletjes verloren.

import { db } from './db.js';
import { store, PROJECTBESTAND, HOOFDSTUKMAP, TABS, bestandenNaarProject, nieuwId } from './store.js';
import { maakSnapshot } from './snapshots.js';

export const mapEvents = new EventTarget();

let map = null;        // FileSystemDirectoryHandle
let mapId = null;      // eigen sleutel per gekoppelde map
let status = 'geen';   // geen | toestemming | wacht (op jouw keuze) | verbonden | bezig | fout
let laatsteSync = 0;
let laatsteFout = null;
let bezig = null;
let nogEens = false;
let herhaalTimer = null;
let laatsteDagversie = 0;
const staatCache = new Map();

export function mapInfo() {
  return { status, naam: map ? map.name : null, laatsteSync, laatsteFout };
}

function meld(nieuweStatus, extra = {}) {
  if (nieuweStatus) status = nieuweStatus;
  mapEvents.dispatchEvent(new CustomEvent('status', { detail: { ...mapInfo(), ...extra } }));
}

// ---------- vingerafdruk ----------
export function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + str.length;
}
// In het projectbestand verandert "bijgewerkt" bij elke keer opslaan; dat telt niet als wijziging.
function inhoudHash(pad, tekst) {
  if (pad === PROJECTBESTAND) tekst = tekst.replace(/^\s*"bijgewerkt":\s*"[^"]*",?\s*$/m, '');
  return hash(tekst.replace(/\r\n?/g, '\n'));
}

async function staat(pad, id = mapId) {
  const k = id + '|' + pad;
  if (staatCache.has(k)) return staatCache.get(k);
  const v = (await db.get('bestanden', k)) || null;
  staatCache.set(k, v);
  return v;
}
async function zetStaat(pad, h, id = mapId) {
  const k = id + '|' + pad;
  const v = h ? { hash: h, tijd: Date.now() } : null;
  staatCache.set(k, v);
  if (v) await db.put('bestanden', v, k); else await db.del('bestanden', k);
}

// ---------- bestanden lezen en schrijven ----------
async function dirVoor(root, delen, maken) {
  let d = root;
  for (const naam of delen) d = await d.getDirectoryHandle(naam, { create: maken });
  return d;
}
function splits(pad) {
  const delen = pad.split('/').filter(Boolean);
  return { mappen: delen.slice(0, -1), naam: delen[delen.length - 1] };
}

export async function leesTekst(root, pad) {
  const { mappen, naam } = splits(pad);
  try {
    const d = await dirVoor(root, mappen, false);
    const fh = await d.getFileHandle(naam);
    const f = await fh.getFile();
    return await f.text();
  } catch (e) {
    if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null;
    throw e;
  }
}

export async function schrijfBestand(root, pad, inhoud) {
  const { mappen, naam } = splits(pad);
  const d = await dirVoor(root, mappen, true);
  const fh = await d.getFileHandle(naam, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(inhoud);
    await w.close();
  } catch (e) {
    try { await w.abort(); } catch (e2) { /* */ }
    throw e;
  }
}

export async function verwijderBestand(root, pad) {
  const { mappen, naam } = splits(pad);
  try {
    const d = await dirVoor(root, mappen, false);
    await d.removeEntry(naam);
    return true;
  } catch (e) {
    if (e && e.name === 'NotFoundError') return false;
    throw e;
  }
}

export async function lijstBestanden(root, mapPad) {
  try {
    const d = await dirVoor(root, mapPad.split('/').filter(Boolean), false);
    const namen = [];
    for await (const [naam, h] of d.entries()) if (h.kind === 'file') namen.push(naam);
    return namen;
  } catch (e) {
    if (e && e.name === 'NotFoundError') return [];
    throw e;
  }
}

function stempel(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

async function maakBackup(root, pad, tekst, backupMap = 'Back-ups') {
  let doel = backupMap + '/' + stempel() + ' ' + pad.replace(/\//g, ' - ');
  // nooit een eerdere back-up overschrijven
  let n = 2;
  while ((await leesTekst(root, doel)) !== null) {
    doel = backupMap + '/' + stempel() + ' (' + n++ + ') ' + pad.replace(/\//g, ' - ');
  }
  await schrijfBestand(root, doel, tekst);
  return doel;
}

// Het hart van het opslaan in de map. Ook los te gebruiken (testpagina).
export async function schrijfVeiligIn(root, id, pad, tekst, meldingen = [], backupMap = 'Back-ups') {
  const nieuw = inhoudHash(pad, tekst);
  const huidig = await leesTekst(root, pad);
  if (huidig !== null) {
    const hh = inhoudHash(pad, huidig);
    if (hh === nieuw) { await zetStaat(pad, nieuw, id); return 'gelijk'; }
    const bekend = await staat(pad, id);
    if (!bekend || bekend.hash !== hh) {
      const waar = await maakBackup(root, pad, huidig, backupMap);
      meldingen.push(waar);
    }
  }
  await schrijfBestand(root, pad, tekst);
  await zetStaat(pad, nieuw, id);
  return 'geschreven';
}

function schrijfVeilig(pad, tekst, meldingen) {
  return schrijfVeiligIn(map, mapId, pad, tekst, meldingen);
}

export async function vergeetStaat(id, pad) { await zetStaat(pad, null, id); }

// ---------- toestemming ----------
async function heeftToestemming(handle, vraag) {
  if (!handle.queryPermission) return true; // bijvoorbeeld de interne testmap
  const opts = { mode: 'readwrite' };
  let p = await handle.queryPermission(opts);
  if (p === 'granted') return true;
  if (vraag && handle.requestPermission) {
    p = await handle.requestPermission(opts);
    return p === 'granted';
  }
  return false;
}

export function kanMapKiezen() {
  return typeof window.showDirectoryPicker === 'function';
}

export async function bewaardeMap() {
  const rec = await db.get('handles', 'map');
  return rec || null;
}

// Bij het opstarten: is er een map en mogen we erbij zonder te vragen?
export async function probeerBewaardeMap() {
  const rec = await bewaardeMap();
  if (!rec) { meld('geen'); return { soort: 'geen' }; }
  map = rec.handle; mapId = rec.id;
  let ok = false;
  try { ok = await heeftToestemming(map, false); } catch (e) { ok = false; }
  if (!ok) { meld('toestemming'); return { soort: 'toestemming', naam: map.name }; }
  return await verbind();
}

// Moet vanuit een klik worden aangeroepen.
export async function vraagToestemmingOpnieuw() {
  if (!map) return { soort: 'geen' };
  const ok = await heeftToestemming(map, true);
  if (!ok) { meld('toestemming'); return { soort: 'toestemming', naam: map.name }; }
  return await verbind();
}

export async function kiesMap() {
  const handle = await window.showDirectoryPicker({ id: 'schrijfmachine', mode: 'readwrite' });
  return await gebruikMap(handle);
}

export async function gebruikMap(handle) {
  const ok = await heeftToestemming(handle, true);
  if (!ok) throw new Error('Geen toestemming om in deze map te schrijven');
  const vorige = await bewaardeMap();
  let id = nieuwId();
  if (vorige && vorige.handle && vorige.handle.isSameEntry) {
    try { if (await vorige.handle.isSameEntry(handle)) id = vorige.id; } catch (e) { /* */ }
  }
  await db.put('handles', { handle, id, naam: handle.name, gekozen: Date.now() }, 'map');
  map = handle; mapId = id;
  staatCache.clear();
  return await verbind();
}

export async function ontkoppelMap() {
  await db.del('handles', 'map');
  map = null; mapId = null;
  meld('geen');
}

// ---------- koppelen aan het project ----------
async function verbind() {
  try {
    return await verbindIntern();
  } catch (e) {
    console.warn('koppelen mislukt', e);
    laatsteFout = e;
    meld('fout', { melding: e && e.message });
    return { soort: 'fout', fout: e };
  }
}

async function verbindIntern() {
  meld('bezig');
  let json;
  try {
    json = await leesTekst(map, PROJECTBESTAND);
  } catch (e) {
    laatsteFout = e;
    meld('fout', { melding: 'Map niet bereikbaar' });
    return { soort: 'fout', fout: e };
  }
  if (json === null) {
    store.markeerAlles();
    await syncNu();
    return { soort: 'nieuw' };
  }
  let j = null;
  try { j = JSON.parse(json); } catch (e) { j = null; }
  if (!j || j.app !== 'schrijfmachine') {
    // geen projectbestand van ons: gewoon schrijven, het oude bestand gaat eerst naar Back-ups
    store.markeerAlles();
    await syncNu();
    return { soort: 'nieuw' };
  }
  if (j.projectId !== store.meta.projectId) {
    if (store.isLeeg()) {
      await neemOverUitMap('openen uit map');
      return { soort: 'uit-map' };
    }
    meld('wacht'); // niets schrijven tot je gekozen hebt
    return { soort: 'ander-project', titel: j.titel, aantal: (j.hoofdstukken || []).length };
  }
  const gewijzigd = await zoekExterneWijzigingen(j);
  if (gewijzigd.length) {
    meld('wacht'); // niets schrijven tot je gekozen hebt
    return { soort: 'extern', bestanden: gewijzigd };
  }
  store.markeerAlles();
  await syncNu();
  return { soort: 'zelfde' };
}

function projectPaden(j) {
  const paden = [PROJECTBESTAND];
  for (const h of j.hoofdstukken || []) paden.push(HOOFDSTUKMAP + '/' + h.bestand);
  for (const t of TABS) paden.push(t.bestand);
  return paden;
}

async function zoekExterneWijzigingen(j) {
  const uit = [];
  const paden = new Set(projectPaden(j));
  for (const h of store.lijst()) paden.add(HOOFDSTUKMAP + '/' + h.bestand);
  for (const pad of paden) {
    const tekst = await leesTekst(map, pad);
    if (tekst === null) continue;
    const st = await staat(pad);
    const hh = inhoudHash(pad, tekst);
    if (st && st.hash === hh) continue;
    // bestand dat we nog nooit schreven maar dat precies gelijk is aan wat wij hebben: geen probleem
    const eigen = eigenTekst(pad);
    if (eigen !== null && inhoudHash(pad, eigen) === hh) { await zetStaat(pad, hh); continue; }
    uit.push(pad);
  }
  return uit;
}

function eigenTekst(pad) {
  if (pad === PROJECTBESTAND) return store.projectJson();
  for (const h of store.lijst()) if (HOOFDSTUKMAP + '/' + h.bestand === pad) return store.hoofdstukBestand(h.id).tekst;
  for (const t of TABS) if (t.bestand === pad) return store.notitieBestand(t.key).tekst;
  return null;
}

// Leest het project uit de map en vervangt de inhoud van de app (na een versie als vangnet).
export async function neemOverUitMap(reden = 'overnemen uit map') {
  meld('verbonden');
  await store.bewaarLokaal();
  await maakSnapshot('vlak voor ' + reden);
  const json = await leesTekst(map, PROJECTBESTAND);
  const j = JSON.parse(json);
  const teksten = {};
  for (const h of j.hoofdstukken || []) {
    const pad = HOOFDSTUKMAP + '/' + h.bestand;
    const t = await leesTekst(map, pad);
    if (t !== null) { teksten[h.id] = t; await zetStaat(pad, inhoudHash(pad, t)); }
  }
  const notities = {};
  for (const t of TABS) {
    const tekst = await leesTekst(map, t.bestand);
    if (tekst !== null) { notities[t.key] = tekst; await zetStaat(t.bestand, inhoudHash(t.bestand, tekst)); }
  }
  await zetStaat(PROJECTBESTAND, inhoudHash(PROJECTBESTAND, json));
  const zelfde = j.projectId === store.meta.projectId;
  const project = bestandenNaarProject(json, teksten, notities, zelfde ? store.project : null);
  store.vervang(project);
  await store.bewaarLokaal();
  await syncNu();
}

// De app-versie houden: alles opnieuw wegschrijven. Wat buiten de app veranderd was gaat eerst naar Back-ups.
export async function houdAppVersie() {
  meld('verbonden');
  store.markeerAlles();
  await syncNu();
}

// ---------- synchroniseren ----------
export async function syncNu() {
  if (!map || status === 'toestemming' || status === 'geen' || status === 'wacht') return;
  if (bezig) { nogEens = true; return bezig; }
  bezig = (async () => {
    clearTimeout(herhaalTimer);
    await store.bewaarLokaal();
    const werk = store.pakMapWerk();
    const meldingen = [];
    meld('bezig');
    try {
      for (const bestand of werk.prullenbak) {
        const pad = HOOFDSTUKMAP + '/' + bestand;
        const t = await leesTekst(map, pad);
        if (t !== null) {
          await schrijfBestand(map, 'Prullenbak/' + stempel() + ' ' + bestand, t);
          await verwijderBestand(map, pad);
          await zetStaat(pad, null);
        }
      }
      werk.prullenbak = [];
      for (const id of [...werk.hoofdstukken]) {
        if (!store.hoofdstuk(id)) { werk.hoofdstukken.delete(id); continue; }
        const { pad, tekst } = store.hoofdstukBestand(id);
        await schrijfVeilig(pad, tekst, meldingen);
        werk.hoofdstukken.delete(id);
      }
      for (const tab of [...werk.notities]) {
        const { pad, tekst } = store.notitieBestand(tab);
        await schrijfVeilig(pad, tekst, meldingen);
        werk.notities.delete(tab);
      }
      if (werk.meta) {
        await schrijfVeilig(PROJECTBESTAND, store.projectJson(), meldingen);
        werk.meta = false;
      }
      await dagversie();
      laatsteSync = Date.now();
      laatsteFout = null;
      meld('verbonden', meldingen.length ? { backups: meldingen } : {});
    } catch (e) {
      console.warn('opslaan in map mislukt', e);
      store.zetMapWerkTerug(werk);
      laatsteFout = e;
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        meld('toestemming');
      } else {
        meld('fout', { melding: e && e.message });
        herhaalTimer = setTimeout(() => syncNu(), 20000);
      }
    }
  })();
  try { await bezig; } finally {
    bezig = null;
    if (nogEens || store.heeftMapWerk()) {
      nogEens = false;
      if (store.heeftMapWerk() && status === 'verbonden') setTimeout(() => syncNu(), 50);
    }
  }
}

// Eén leesbaar bestand per dag met het hele manuscript, hooguit eens per uur bijgewerkt.
async function dagversie() {
  if (Date.now() - laatsteDagversie < 3600e3) return;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const naam = `Versies/${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} manuscript.md`;
  await schrijfBestand(map, naam, store.manuscriptMd());
  laatsteDagversie = Date.now();
  // ouder dan 30 dagen: weg
  const namen = await lijstBestanden(map, 'Versies');
  const grens = Date.now() - 30 * 24 * 3600e3;
  for (const n of namen) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) manuscript\.md$/.exec(n);
    if (m && new Date(+m[1], +m[2] - 1, +m[3]).getTime() < grens) {
      try { await verwijderBestand(map, 'Versies/' + n); } catch (e) { /* niet erg */ }
    }
  }
}

// Voor de export.
export async function schrijfInMap(naam, blob) {
  if (!map || status !== 'verbonden') return false;
  await schrijfBestand(map, naam, blob);
  return true;
}

export function huidigeMap() { return map; }

store.onMapSync = () => syncNu();

// Na een fout of een tijdje offline: bij terugkomen opnieuw proberen.
window.addEventListener('focus', () => { if (status === 'fout') syncNu(); });
window.addEventListener('online', () => { if (status === 'fout') syncNu(); });
