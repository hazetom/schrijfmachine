// Het project in het geheugen, plus automatisch bewaren in IndexedDB.
// Elke wijziging wordt gemarkeerd; na een korte pauze gaat het naar IndexedDB
// (het vangnet) en daarna naar de gekozen map.

import { db } from './db.js';
import { countWords, chapterToMd, mdToChapter, slugify, blocksToMd, mdToBlocks } from './markdown.js';

export const TABS = [
  { key: 'personages', label: 'Personages', bestand: 'Notities/Personages.md', enkel: 'personage', sub: 'Rol' },
  { key: 'verhaallijnen', label: 'Verhaallijnen', bestand: 'Notities/Verhaallijnen.md', enkel: 'verhaallijn', sub: 'Omschrijving' },
  { key: 'ideeen', label: 'Ideeën', bestand: 'Notities/Ideeen.md', enkel: 'idee', sub: null },
];

export const KLEUREN = [
  { naam: 'Blauw', waarde: '#4F6A7E' },
  { naam: 'Rood', waarde: '#A35F55' },
  { naam: 'Oker', waarde: '#A88A4E' },
  { naam: 'Groen', waarde: '#6E7F5E' },
  { naam: 'Pruim', waarde: '#7D6878' },
  { naam: 'Grijs', waarde: '#8E8A81' },
];

export const STATUSSEN = ['Idee', 'Concept', 'Herschrijven', 'Klaar'];

export const PROJECTBESTAND = 'schrijfmachine.json';
export const HOOFDSTUKMAP = 'Hoofdstukken';

export function nieuwId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((x) => (x % 36).toString(36)).join('');
}

const IDB_PAUZE = 400;   // ms na laatste toetsaanslag naar IndexedDB
const MAP_PAUZE = 1500;  // ms na laatste toetsaanslag naar de map

function leegProject() {
  const id = nieuwId();
  return {
    meta: {
      projectId: nieuwId() + nieuwId(),
      titel: '',
      volgorde: [id],
      vergrendeld: [],
      vergrendelPagina: null,
      huidig: id,
      aangemaakt: Date.now(),
    },
    hoofdstukken: { [id]: maakHoofdstuk(id, 'Hoofdstuk 1') },
    notities: { personages: [], verhaallijnen: [], ideeen: [] },
  };
}

export function maakHoofdstuk(id, titel, velden = {}) {
  return {
    id,
    titel,
    bestand: slugify(titel) + '-' + id.slice(0, 4) + '.md',
    lijn: null,
    status: 'Concept',
    doel: '',
    md: '',
    woorden: 0,
    gewijzigd: Date.now(),
    ...velden,
  };
}

class Store extends EventTarget {
  constructor() {
    super();
    this.project = null;
    this.idbVuil = { meta: false, hoofdstukken: new Set(), notities: false, verwijderd: new Set() };
    this.mapVuil = { meta: false, hoofdstukken: new Set(), notities: new Set(), prullenbak: [] };
    this.idbTimer = null;
    this.mapTimer = null;
    this.laatsteWijziging = 0;
    this.versieTeller = 0; // telt wijzigingen, voor snapshots
    this.onMapSync = null; // wordt gezet door de map-module
    this.lokaalOpgeslagen = 0;
  }

  async laad() {
    const meta = await db.get('meta', 'project');
    if (!meta) {
      this.project = leegProject();
      this.markeerAlles();
      await this.bewaarLokaal();
      return { nieuw: true };
    }
    const lijst = await db.getAll('hoofdstukken');
    const notities = (await db.get('notities', 'alle')) || { personages: [], verhaallijnen: [], ideeen: [] };
    const hoofdstukken = {};
    for (const h of lijst) hoofdstukken[h.id] = h;
    // volgorde repareren als er iets mist
    meta.volgorde = meta.volgorde.filter((id) => hoofdstukken[id]);
    for (const id of Object.keys(hoofdstukken)) if (!meta.volgorde.includes(id)) meta.volgorde.push(id);
    if (!meta.volgorde.length) {
      const id = nieuwId();
      hoofdstukken[id] = maakHoofdstuk(id, 'Hoofdstuk 1');
      meta.volgorde.push(id);
    }
    if (!hoofdstukken[meta.huidig]) meta.huidig = meta.volgorde[0];
    meta.vergrendeld = (meta.vergrendeld || []).filter((id) => hoofdstukken[id]);
    for (const t of TABS) if (!notities[t.key]) notities[t.key] = [];
    this.project = { meta, hoofdstukken, notities };
    return { nieuw: false };
  }

  // Een project is "leeg" als er nog niets in geschreven is.
  isLeeg() {
    const p = this.project;
    if (!p) return true;
    const geenTekst = p.meta.volgorde.every((id) => !p.hoofdstukken[id].md.trim() && !p.hoofdstukken[id].doel.trim());
    const geenNotities = TABS.every((t) => !p.notities[t.key].length);
    return geenTekst && geenNotities && p.meta.volgorde.length <= 1;
  }

  // ---------- lezen ----------
  get meta() { return this.project.meta; }
  hoofdstuk(id) { return this.project.hoofdstukken[id]; }
  lijst() { return this.project.meta.volgorde.map((id) => this.project.hoofdstukken[id]); }
  nummer(id) { return this.project.meta.volgorde.indexOf(id) + 1; }
  huidig() { return this.hoofdstuk(this.project.meta.huidig); }
  notities(tab) { return this.project.notities[tab]; }
  verhaallijn(id) { return this.project.notities.verhaallijnen.find((v) => v.id === id) || null; }
  totaalWoorden() { return this.lijst().reduce((s, h) => s + (h.woorden || 0), 0); }
  isVergrendeld(id) { return this.project.meta.vergrendeld.includes(id); }

  // ---------- wijzigen ----------
  _gewijzigd() {
    this.laatsteWijziging = Date.now();
    this.versieTeller++;
    clearTimeout(this.idbTimer);
    this.idbTimer = setTimeout(() => this.bewaarLokaal(), IDB_PAUZE);
    clearTimeout(this.mapTimer);
    this.mapTimer = setTimeout(() => this.syncMap(), MAP_PAUZE);
    this.dispatchEvent(new CustomEvent('gewijzigd'));
  }

  _meta() { this.idbVuil.meta = true; this.mapVuil.meta = true; }
  _hoofdstuk(id) { this.idbVuil.hoofdstukken.add(id); this.mapVuil.hoofdstukken.add(id); }
  _notities(tab) { this.idbVuil.notities = true; this.mapVuil.notities.add(tab); }

  markeerAlles() {
    this._meta();
    for (const id of this.project.meta.volgorde) this._hoofdstuk(id);
    for (const t of TABS) this._notities(t.key);
  }

  zetTekst(id, md) {
    const h = this.hoofdstuk(id);
    if (!h || h.md === md) return;
    h.md = md;
    h.woorden = countWords(md);
    h.gewijzigd = Date.now();
    this._hoofdstuk(id);
    this._gewijzigd();
  }

  wijzigHoofdstuk(id, velden) {
    const h = this.hoofdstuk(id);
    if (!h) return;
    let iets = false;
    for (const [k, v] of Object.entries(velden)) if (h[k] !== v) { h[k] = v; iets = true; }
    if (!iets) return;
    h.gewijzigd = Date.now();
    this._hoofdstuk(id);
    this._meta();
    this._gewijzigd();
  }

  nieuwHoofdstuk(naId = null, titel = null, velden = {}) {
    const id = nieuwId();
    const v = this.project.meta.volgorde;
    const pos = naId ? v.indexOf(naId) + 1 : v.length;
    const t = titel || 'Hoofdstuk ' + (v.length + 1);
    this.project.hoofdstukken[id] = maakHoofdstuk(id, t, velden);
    if (velden.md) this.project.hoofdstukken[id].woorden = countWords(velden.md);
    v.splice(pos, 0, id);
    this._hoofdstuk(id);
    this._meta();
    this._gewijzigd();
    return id;
  }

  verwijderHoofdstuk(id) {
    const v = this.project.meta.volgorde;
    if (v.length <= 1) return false;
    const h = this.hoofdstuk(id);
    v.splice(v.indexOf(id), 1);
    delete this.project.hoofdstukken[id];
    this.project.meta.vergrendeld = this.project.meta.vergrendeld.filter((x) => x !== id);
    if (this.project.meta.huidig === id) this.project.meta.huidig = v[0];
    this.idbVuil.verwijderd.add(id);
    this.idbVuil.hoofdstukken.delete(id);
    this.mapVuil.hoofdstukken.delete(id);
    this.mapVuil.prullenbak.push(h.bestand);
    db.put('prullenbak', { ...h, verwijderdOp: Date.now() }).catch(() => {});
    this._meta();
    this._gewijzigd();
    return true;
  }

  verplaatsHoofdstuk(id, naarIndex) {
    const v = this.project.meta.volgorde;
    const van = v.indexOf(id);
    naarIndex = Math.max(0, Math.min(v.length - 1, naarIndex));
    if (van < 0 || van === naarIndex) return;
    v.splice(van, 1);
    v.splice(naarIndex, 0, id);
    this._meta();
    this._gewijzigd();
  }

  zetHuidig(id) {
    if (this.project.meta.huidig === id || !this.hoofdstuk(id)) return;
    this.project.meta.huidig = id;
    this._meta();
    this._gewijzigd();
  }

  zetVergrendeld(ids, pagina = null) {
    this.project.meta.vergrendeld = [...ids];
    this.project.meta.vergrendelPagina = pagina;
    this._meta();
    this._gewijzigd();
    this.dispatchEvent(new CustomEvent('vergrendeling'));
  }

  zetTitel(titel) {
    if (this.project.meta.titel === titel) return;
    this.project.meta.titel = titel;
    this._meta();
    this._gewijzigd();
  }

  nieuweNotitie(tab, velden = {}) {
    const item = { id: nieuwId(), naam: '', sub: '', kleur: null, md: '', ...velden };
    this.project.notities[tab].push(item);
    this._notities(tab);
    this._gewijzigd();
    return item;
  }

  wijzigNotitie(tab, id, velden) {
    const item = this.project.notities[tab].find((n) => n.id === id);
    if (!item) return;
    let iets = false;
    for (const [k, v] of Object.entries(velden)) if (item[k] !== v) { item[k] = v; iets = true; }
    if (!iets) return;
    this._notities(tab);
    if (tab === 'verhaallijnen') this._meta();
    this._gewijzigd();
  }

  verwijderNotitie(tab, id) {
    const arr = this.project.notities[tab];
    const k = arr.findIndex((n) => n.id === id);
    if (k < 0) return;
    const [item] = arr.splice(k, 1);
    db.put('prullenbak', { id: 'notitie-' + item.id, soort: tab, ...item, verwijderdOp: Date.now() }).catch(() => {});
    if (tab === 'verhaallijnen') {
      for (const h of this.lijst()) if (h.lijn === id) { h.lijn = null; this._hoofdstuk(h.id); }
      this._meta();
    }
    this._notities(tab);
    this._gewijzigd();
  }

  verplaatsNotitie(tab, id, delta) {
    const arr = this.project.notities[tab];
    const k = arr.findIndex((n) => n.id === id);
    const n = k + delta;
    if (k < 0 || n < 0 || n >= arr.length) return;
    const [item] = arr.splice(k, 1);
    arr.splice(n, 0, item);
    this._notities(tab);
    this._gewijzigd();
  }

  // Vervangt het hele project (terugzetten van een versie of overnemen uit de map).
  vervang(project) {
    for (const t of TABS) if (!project.notities[t.key]) project.notities[t.key] = [];
    for (const h of Object.values(project.hoofdstukken)) h.woorden = countWords(h.md);
    const oudeIds = Object.keys(this.project.hoofdstukken);
    this.project = project;
    for (const id of oudeIds) if (!project.hoofdstukken[id]) this.idbVuil.verwijderd.add(id);
    this.markeerAlles();
    this._gewijzigd();
    this.dispatchEvent(new CustomEvent('vervangen'));
  }

  // ---------- bewaren ----------
  async bewaarLokaal() {
    clearTimeout(this.idbTimer);
    const v = this.idbVuil;
    if (!v.meta && !v.hoofdstukken.size && !v.notities && !v.verwijderd.size) return;
    const p = this.project;
    const metaKopie = v.meta ? structuredClone(p.meta) : null;
    const hs = [...v.hoofdstukken].map((id) => p.hoofdstukken[id]).filter(Boolean).map((h) => ({ ...h }));
    const notities = v.notities ? structuredClone(p.notities) : null;
    const weg = [...v.verwijderd];
    this.idbVuil = { meta: false, hoofdstukken: new Set(), notities: false, verwijderd: new Set() };
    try {
      await db.batch(['meta', 'hoofdstukken', 'notities'], (m, h, n) => {
        if (metaKopie) m.put(metaKopie, 'project');
        for (const x of hs) h.put(x);
        for (const id of weg) h.delete(id);
        if (notities) n.put(notities, 'alle');
      });
      this.lokaalOpgeslagen = Date.now();
      this.dispatchEvent(new CustomEvent('lokaal-opgeslagen'));
    } catch (e) {
      // terugzetten zodat de volgende poging het opnieuw probeert
      if (metaKopie) this.idbVuil.meta = true;
      hs.forEach((x) => this.idbVuil.hoofdstukken.add(x.id));
      if (notities) this.idbVuil.notities = true;
      weg.forEach((id) => this.idbVuil.verwijderd.add(id));
      this.dispatchEvent(new CustomEvent('fout', { detail: { waar: 'lokaal', fout: e } }));
      this.idbTimer = setTimeout(() => this.bewaarLokaal(), 3000);
    }
  }

  async syncMap() {
    clearTimeout(this.mapTimer);
    if (this.onMapSync) await this.onMapSync();
  }

  heeftOnopgeslagen() {
    const v = this.idbVuil;
    return v.meta || v.hoofdstukken.size > 0 || v.notities || v.verwijderd.size > 0;
  }

  // Haalt de lijst met bestanden op die naar de map moeten en leegt hem.
  pakMapWerk() {
    const v = this.mapVuil;
    this.mapVuil = { meta: false, hoofdstukken: new Set(), notities: new Set(), prullenbak: [] };
    return v;
  }
  zetMapWerkTerug(w) {
    if (w.meta) this.mapVuil.meta = true;
    w.hoofdstukken.forEach((id) => this.mapVuil.hoofdstukken.add(id));
    w.notities.forEach((t) => this.mapVuil.notities.add(t));
    this.mapVuil.prullenbak.push(...w.prullenbak);
  }
  heeftMapWerk() {
    const v = this.mapVuil;
    return v.meta || v.hoofdstukken.size > 0 || v.notities.size > 0 || v.prullenbak.length > 0;
  }

  // ---------- bestanden ----------
  projectJson() {
    const p = this.project;
    return JSON.stringify({
      app: 'schrijfmachine',
      versie: 1,
      projectId: p.meta.projectId,
      titel: p.meta.titel,
      bijgewerkt: new Date().toISOString(),
      hoofdstukken: this.lijst().map((h) => ({ id: h.id, bestand: h.bestand, titel: h.titel, lijn: h.lijn, status: h.status, doel: h.doel })),
      vergrendeld: p.meta.vergrendeld,
      vergrendelPagina: p.meta.vergrendelPagina,
      huidig: p.meta.huidig,
    }, null, 2) + '\n';
  }

  hoofdstukBestand(id) {
    const h = this.hoofdstuk(id);
    return { pad: HOOFDSTUKMAP + '/' + h.bestand, tekst: chapterToMd(h.titel, h.md) };
  }

  notitieBestand(tab) {
    const t = TABS.find((x) => x.key === tab);
    return { pad: t.bestand, tekst: notitiesNaarMd(t.label, this.project.notities[tab]) };
  }

  // Het hele manuscript als één leesbaar Markdown-bestand (voor de dagelijkse versie in de map).
  manuscriptMd() {
    const delen = [];
    if (this.project.meta.titel) delen.push('# ' + this.project.meta.titel + '\n');
    for (const h of this.lijst()) delen.push(chapterToMd(h.titel, h.md));
    for (const t of TABS) {
      const n = this.project.notities[t.key];
      if (n.length) delen.push(notitiesNaarMd(t.label, n));
    }
    return delen.join('\n\n');
  }
}

export function notitiesNaarMd(label, items) {
  const delen = [`<!-- schrijfmachine notities: ${label} -->`];
  for (const it of items) {
    const meta = { id: it.id };
    if (it.sub) meta.sub = it.sub;
    if (it.kleur) meta.kleur = it.kleur;
    delen.push('# ' + ((it.naam || '').replace(/\n/g, ' ').trim() || 'Zonder naam') + '\n<!-- schrijfmachine ' + JSON.stringify(meta) + ' -->' + (it.md ? '\n\n' + it.md.trim() : ''));
  }
  return delen.join('\n\n') + '\n';
}

export function mdNaarNotities(md) {
  const items = [];
  const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
  let cur = null, body = [];
  const klaar = () => {
    if (!cur) return;
    cur.md = blocksToMd(mdToBlocks(body.join('\n')));
    items.push(cur);
    body = [];
  };
  for (const line of lines) {
    const m = /^#\s+(.*)$/.exec(line);
    if (m) {
      klaar();
      cur = { id: nieuwId(), naam: m[1].trim(), sub: '', kleur: null, md: '' };
      continue;
    }
    if (!cur) continue;
    const meta = /^<!--\s*schrijfmachine\s+(\{.*\})\s*-->\s*$/.exec(line.trim());
    if (meta && !body.join('').trim()) {
      try {
        const j = JSON.parse(meta[1]);
        if (j.id) cur.id = String(j.id);
        if (j.sub) cur.sub = String(j.sub);
        if (j.kleur) cur.kleur = String(j.kleur);
      } catch (e) { /* kapotte regel: negeren */ }
      continue;
    }
    body.push(line);
  }
  klaar();
  return items;
}

// Projectbestand + losse bestanden terug naar een project (uit de map lezen).
export function bestandenNaarProject(json, hoofdstukTeksten, notitieTeksten, oudProject = null) {
  const j = JSON.parse(json);
  const hoofdstukken = {};
  const volgorde = [];
  for (const h of j.hoofdstukken || []) {
    const tekst = hoofdstukTeksten[h.id];
    let md = '', titel = h.titel;
    if (tekst != null) {
      const c = mdToChapter(tekst);
      md = c.body;
      if (c.titel) titel = c.titel;
    } else if (oudProject && oudProject.hoofdstukken[h.id]) {
      md = oudProject.hoofdstukken[h.id].md;
    }
    hoofdstukken[h.id] = maakHoofdstuk(h.id, titel, {
      bestand: h.bestand, lijn: h.lijn || null, status: h.status || 'Concept', doel: h.doel || '', md, woorden: countWords(md),
    });
    volgorde.push(h.id);
  }
  if (!volgorde.length) {
    const id = nieuwId();
    hoofdstukken[id] = maakHoofdstuk(id, 'Hoofdstuk 1');
    volgorde.push(id);
  }
  const notities = {};
  for (const t of TABS) {
    const tekst = notitieTeksten[t.key];
    notities[t.key] = tekst != null ? mdNaarNotities(tekst) : (oudProject ? structuredClone(oudProject.notities[t.key] || []) : []);
  }
  return {
    meta: {
      projectId: j.projectId || nieuwId() + nieuwId(),
      titel: j.titel || '',
      volgorde,
      vergrendeld: (j.vergrendeld || []).filter((id) => hoofdstukken[id]),
      vergrendelPagina: j.vergrendelPagina || null,
      huidig: hoofdstukken[j.huidig] ? j.huidig : volgorde[0],
      aangemaakt: Date.now(),
    },
    hoofdstukken,
    notities,
  };
}

export const store = new Store();
