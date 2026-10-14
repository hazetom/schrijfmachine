// Personages herkennen en koppelen, zonder AI.
//
// 1. Namen vinden: woorden woorden met een hoofdletter die niet aan het begin van een zin
//    staan (of vaak terugkomen), die nergens in het boek met een kleine letter voorkomen.
//    "Frank Philips" wordt één voorstel, met "Frank" en "Philips" als andere namen.
// 2. Koppelen: elk bevestigd personage heeft een vaste id. Zijn naam, de losse delen daarvan
//    ("Frank", "Philips") en de aliassen die jij toevoegt ("mevrouw Ashworth") wijzen allemaal
//    naar die ene id. Zo is elke "Frank" in het boek dezelfde Frank.
// 3. Terugzien: per personage alle plekken waar hij of zij genoemd wordt.
// De tekst zelf verandert hierdoor niet: de koppelingen worden steeds opnieuw berekend.

import { store } from './store.js';
import { mdToBlocks } from './markdown.js';

const TITELS = new Set(['mevrouw', 'meneer', 'mevr', 'dhr', 'mr', 'mrs', 'ms', 'miss', 'dokter', 'dr', 'inspecteur', 'hoofdinspecteur',
  'rechercheur', 'agent', 'brigadier', 'commissaris', 'officier', 'oom', 'tante', 'opa', 'oma', 'professor', 'prof', 'pastoor', 'dominee',
  'zuster', 'broeder', 'juffrouw', 'meester', 'sir', 'lady', 'lord', 'di', 'dci', 'ds', 'sergeant', 'kapitein', 'majoor']);
const TUSSEN = new Set(['van', 'de', 'der', 'den', 'ter', 'ten', 'te', 'von', 'du', 'la', 'le', 'di', 'da', 'del', 'dos', 'el', "'t"]);
// Woorden die vaak met een hoofdletter een zin beginnen maar nooit een naam zijn
const STOP = new Set(('de het een hij zij ze ik je jij u wij we jullie zij hun hem haar mijn jouw zijn ons onze dat dit die deze daar hier toen nu ' +
  'en maar of want dus als wat wie waar hoe waarom wanneer welke niet geen nog ook alleen misschien natuurlijk ja nee oké ok goed ' +
  'mam pap mama papa oma opa schat lieverd god jezus hé hè hoi hallo dag dank bedankt sorry kom ga zeg kijk wacht luister stop ' +
  'er al toch zelfs pas net wel even eerst later daarna dan omdat terwijl hoewel zodra totdat voordat nadat sinds tot met zonder ' +
  'over onder boven naast achter voor na bij in op uit aan om door tegen tussen langs rond binnen buiten iemand niemand iets niets ' +
  'alles allemaal elke ieder geen veel weinig meer minder één een twee drie vier vijf zes zeven acht negen tien honderd duizend ' +
  'eerste tweede derde laatste andere ander zo zoals heel erg echt zeker vast weer steeds altijd nooit soms vaak ooit ' +
  'maandag dinsdag woensdag donderdag vrijdag zaterdag zondag januari februari maart april mei juni juli augustus september ' +
  'oktober november december proloog epiloog hoofdstuk act deel datum tijd verzonden ontvangen gelezen eerste the a an and of ' +
  'hoofdstuk mevrouw meneer dokter oh ah eh au nou hm hmm wow jee tja ach och o yes no st sint').split(/\s+/));

const LETTER = /[\p{L}]/u;
const WOORD_RE = /[\p{L}][\p{L}'’\-]*/gu;

function tekstVanBlok(b) { return b.runs.map((r) => r.t).join(''); }

function blokkenVan(h) {
  return mdToBlocks(h.md).map((b, i) => ({ i, type: b.type, tekst: b.type === 'scene' ? '' : tekstVanBlok(b) }));
}

function isHoofdletter(w) { return /^\p{Lu}/u.test(w); }

// Staat dit woord aan het begin van een zin?
function aanZinsbegin(tekst, pos) {
  let k = pos - 1;
  while (k >= 0 && /[\s“”"‘’'«»(\[\-–]/.test(tekst[k])) k--;
  if (k < 0) return true;
  return /[.!?…:;]/.test(tekst[k]);
}

// ---------- woorden die in het boek klein voorkomen (dus geen naam) ----------
let kleinCache = { sleutel: null, set: null };
function kleineWoorden() {
  const lijst = store.lijst();
  const sleutel = lijst.map((h) => h.id + ':' + h.md.length).join('|');
  if (kleinCache.sleutel === sleutel) return kleinCache.set;
  const set = new Set();
  for (const h of lijst) {
    for (const m of h.md.matchAll(WOORD_RE)) if (!isHoofdletter(m[0])) set.add(m[0]);
  }
  kleinCache = { sleutel, set };
  return set;
}

// ---------- bekende personages ----------
function delenVanNaam(naam) {
  return (naam || '').split(/\s+/).map((w) => w.replace(/[.,]$/, '')).filter((w) => w && isHoofdletter(w) && !TITELS.has(w.toLowerCase()) && !TUSSEN.has(w.toLowerCase()));
}

// alias (zoals geschreven) -> persoon-id
export function aliasKaart() {
  const personen = store.notities('personages');
  const kaart = new Map();
  const deelTelling = new Map();
  for (const p of personen) for (const d of delenVanNaam(p.naam)) deelTelling.set(d, (deelTelling.get(d) || 0) + 1);
  for (const p of personen) {
    const namen = [p.naam, ...(p.aliassen || [])].map((n) => (n || '').trim()).filter(Boolean);
    for (const n of namen) kaart.set(n, p.id);
    // losse delen van de naam ("Frank" uit "Frank Philips"), tenzij twee personages dat deel delen
    for (const d of delenVanNaam(p.naam)) if (deelTelling.get(d) === 1 && !kaart.has(d)) kaart.set(d, p.id);
  }
  return kaart;
}

function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let regexCache = { sleutel: null, hoofd: null, klein: null, kaart: null };
function zoekers() {
  const kaart = aliasKaart();
  const sleutel = [...kaart.entries()].map((e) => e.join('=')).join('|');
  if (regexCache.sleutel === sleutel) return regexCache;
  const hoofd = [], klein = [];
  for (const a of kaart.keys()) (isHoofdletter(a) ? hoofd : klein).push(a);
  const maak = (lijst, vlaggen) => (lijst.length ? new RegExp('(?<![\\p{L}\\p{N}\\-])(' + lijst.sort((x, y) => y.length - x.length).map(escRegex).join('|') + ')(?![\\p{L}\\p{N}\\-])', vlaggen) : null);
  const kleinKaart = new Map([...kaart.entries()].filter(([a]) => !isHoofdletter(a)).map(([a, id]) => [a.toLowerCase(), id]));
  regexCache = { sleutel, hoofd: maak(hoofd, 'gu'), klein: maak(klein, 'giu'), kaart, kleinKaart };
  return regexCache;
}

// Alle vermeldingen van bekende personages in een hoofdstuk: [{ id, blok, start, lengte, tekst }]
export function vermeldingen(h) {
  const z = zoekers();
  const uit = [];
  for (const b of blokkenVan(h)) {
    if (!b.tekst) continue;
    const gevonden = [];
    if (z.hoofd) for (const m of b.tekst.matchAll(z.hoofd)) gevonden.push({ id: z.kaart.get(m[1]), start: m.index, lengte: m[1].length, tekst: m[1] });
    if (z.klein) for (const m of b.tekst.matchAll(z.klein)) gevonden.push({ id: z.kleinKaart.get(m[1].toLowerCase()), start: m.index, lengte: m[1].length, tekst: m[1] });
    // overlap: de langste wint
    gevonden.sort((x, y) => x.start - y.start || y.lengte - x.lengte);
    let eind = -1;
    for (const g of gevonden) {
      if (g.start < eind || !g.id) continue;
      uit.push({ ...g, blok: b.i });
      eind = g.start + g.lengte;
    }
  }
  return uit;
}

// ---------- voorstellen voor nieuwe namen ----------
// Bijvoeglijke naamwoorden als "Griekse" of "Londense" en samenstellingen als "TL-licht" zijn geen namen.
function lijktGeenNaam(w) {
  if (w.length >= 6 && /[^aeiouy]se$/.test(w)) return true;
  if (/-\p{Ll}/u.test(w)) return true;
  return false;
}

export function voorstellen(h) {
  const klein = kleineWoorden();
  const bekend = aliasKaart();
  const namen = store.namen();
  const weg = new Set([...(namen.plaatsen || []), ...(namen.genegeerd || [])]);
  const isNaamWoord = (w) => isHoofdletter(w) && w.length > 1 && !STOP.has(w.toLowerCase()) && !klein.has(w.toLowerCase()) && !klein.has(w) && LETTER.test(w) && !lijktGeenNaam(w);
  const blokken = blokkenVan(h).filter((b) => b.tekst && b.type !== 'h');
  const woordenVan = (b) => [...b.tekst.matchAll(WOORD_RE)].map((m) => ({ w: m[0].replace(/['’]s$/, ''), start: m.index, eind: m.index + m[0].length }));
  // welke woorden staan ergens midden in een zin met een hoofdletter?
  const midden = new Set();
  const hoeVaak = new Map();
  for (const b of blokken) for (const x of woordenVan(b)) {
    if (!isHoofdletter(x.w)) continue;
    hoeVaak.set(x.w, (hoeVaak.get(x.w) || 0) + 1);
    if (!aanZinsbegin(b.tekst, x.start)) midden.add(x.w);
  }

  const tel = new Map(); // naam -> { n, midden, titels:Set }
  const telOp = (naam, inMidden, titel) => {
    const t = tel.get(naam) || { n: 0, midden: 0, titels: new Set() };
    t.n++; if (inMidden) t.midden++;
    if (titel) t.titels.add(titel.toLowerCase() + ' ' + naam.split(' ').slice(-1)[0]);
    tel.set(naam, t);
  };
  for (const b of blokken) {
    const woorden = woordenVan(b);
    for (let k = 0; k < woorden.length; k++) {
      const eerste = woorden[k];
      if (!isNaamWoord(eerste.w)) continue;
      const reeks = [eerste.w];
      let j = k + 1, laatste = eerste;
      while (j < woorden.length && reeks.length < 4) {
        const tussen = [];
        let m = j, vorigEind = laatste.eind;
        while (m < woorden.length && TUSSEN.has(woorden[m].w) && woorden[m].start === vorigEind + 1) { tussen.push(woorden[m].w); vorigEind = woorden[m].eind; m++; }
        const volgende = woorden[m];
        if (!volgende || volgende.start !== vorigEind + 1 || !isNaamWoord(volgende.w)) break;
        reeks.push(...tussen, volgende.w);
        laatste = volgende;
        j = m + 1;
      }
      const opZinsbegin = aanZinsbegin(b.tekst, eerste.start);
      // "Vermissing Sarah": het eerste woord heeft alleen een hoofdletter omdat de zin ermee begint
      if (reeks.length > 1 && opZinsbegin && !midden.has(reeks[0]) && (hoeVaak.get(reeks[0]) || 0) <= 1) reeks.shift();
      while (reeks.length && TUSSEN.has(reeks[0])) reeks.shift();
      const vorige = k > 0 ? woorden[k - 1] : null;
      const titel = vorige && vorige.eind === eerste.start - 1 && TITELS.has(vorige.w.toLowerCase().replace(/\.$/, '')) ? vorige.w : null;
      if (reeks.length) telOp(reeks.join(' '), !opZinsbegin || !!titel || reeks[0] !== eerste.w, titel);
      k = j - 1;
    }
  }
  // bezitsvorm: "Franks" hoort bij "Frank"
  for (const [naam, t] of [...tel]) {
    if (!naam.includes(' ') && naam.endsWith('s') && tel.has(naam.slice(0, -1))) {
      const basis = tel.get(naam.slice(0, -1));
      basis.n += t.n; basis.midden += t.midden;
      tel.delete(naam);
    }
  }
  // namen van meer woorden die elkaar overlappen samenvoegen ("Eleanor Ashworth" en "Eleanor Maria Ashworth")
  const lang = [...tel.keys()].filter((n) => n.includes(' '));
  const groepVan = new Map(lang.map((n) => [n, n]));
  const wortel = (n) => { while (groepVan.get(n) !== n) n = groepVan.get(n); return n; };
  for (const a of lang) for (const b of lang) {
    if (a === b) continue;
    const da = delenVanNaam(a), db = delenVanNaam(b);
    if (da.length && da.every((x) => db.includes(x))) groepVan.set(wortel(a), wortel(b));
  }
  const groepen = new Map();
  for (const n of lang) {
    const w = wortel(n);
    const t = tel.get(n);
    const g = groepen.get(w) || { leden: [], aantal: 0, midden: 0, aliassen: new Set() };
    g.leden.push(n); g.aantal += t.n; g.midden += t.midden; t.titels.forEach((x) => g.aliassen.add(x));
    groepen.set(w, g);
  }
  // losse namen bij de groep waar ze in voorkomen ("Frank" bij "Frank Philips")
  for (const [naam, t] of tel) {
    if (naam.includes(' ')) continue;
    const ouders = [...groepen.entries()].filter(([, g]) => g.leden.some((l) => delenVanNaam(l).includes(naam)));
    if (ouders.length >= 1) {
      ouders.sort((x, y) => y[1].aantal - x[1].aantal);
      const g = ouders[0][1];
      g.aantal += t.n; g.midden += t.midden; g.leden.push(naam); t.titels.forEach((x) => g.aliassen.add(x));
    } else {
      groepen.set(naam, { leden: [naam], aantal: t.n, midden: t.midden, aliassen: new Set(t.titels) });
    }
  }
  const uit = [];
  for (const g of groepen.values()) {
    if (!(g.midden >= 1 || g.aantal >= 3)) continue;
    // de naam: de vaakst gebruikte variant van meer woorden, anders de losse naam
    const varianten = g.leden.filter((l) => l.includes(' ')).sort((a, b) => tel.get(b).n - tel.get(a).n || a.length - b.length);
    const naam = varianten[0] || g.leden[0];
    if (bekend.has(naam) || weg.has(naam)) continue;
    const delen = delenVanNaam(naam);
    if (delen.length && delen.every((d) => bekend.has(d))) continue;
    const aliassen = new Map();
    for (const a of [...g.leden, ...g.aliassen]) if (a !== naam && !bekend.has(a)) aliassen.set(a.toLowerCase(), a);
    uit.push({ naam, aantal: g.aantal, aliassen: [...aliassen.values()] });
  }
  return uit.sort((a, b) => b.aantal - a.aantal);
}

// ---------- overzicht per hoofdstuk en per personage ----------
export function aanwezig(h) {
  const tel = new Map();
  for (const v of vermeldingen(h)) tel.set(v.id, (tel.get(v.id) || 0) + 1);
  const personen = store.notities('personages');
  return [...tel.entries()].map(([id, aantal]) => ({ persoon: personen.find((p) => p.id === id), aantal }))
    .filter((x) => x.persoon).sort((a, b) => b.aantal - a.aantal);
}

function zinRond(tekst, start, lengte) {
  let a = start, b = start + lengte;
  while (a > 0 && !/[.!?…]/.test(tekst[a - 1])) a--;
  while (b < tekst.length && !/[.!?…]/.test(tekst[b])) b++;
  while (b < tekst.length && /[.!?…”"’]/.test(tekst[b])) b++;
  return tekst.slice(a, b).trim();
}

// Waar komt dit personage voor? [{ h, momenten: [{ blok, start, lengte, zin, scene }] }]
export function tijdlijn(persoonId) {
  const uit = [];
  for (const h of store.lijst()) {
    const blokken = blokkenVan(h);
    let scene = null;
    const sceneVan = [];
    for (const b of blokken) { if (b.type === 'h') scene = b.tekst; sceneVan[b.i] = scene; }
    const momenten = vermeldingen(h).filter((v) => v.id === persoonId).map((v) => ({
      blok: v.blok, start: v.start, lengte: v.lengte, zin: zinRond(blokken[v.blok].tekst, v.start, v.lengte), scene: sceneVan[v.blok],
    }));
    if (momenten.length) uit.push({ h, momenten });
  }
  return uit;
}

// ---------- acties ----------
export function maakPersonage(voorstel) {
  return store.nieuweNotitie('personages', { naam: voorstel.naam, aliassen: voorstel.aliassen || [] });
}

export function voegAliasToe(persoonId, voorstel) {
  const p = store.notities('personages').find((x) => x.id === persoonId);
  if (!p) return;
  const nieuw = new Set(p.aliassen || []);
  for (const n of [voorstel.naam, ...(voorstel.aliassen || [])]) if (n && n !== p.naam) nieuw.add(n);
  store.wijzigNotitie('personages', persoonId, { aliassen: [...nieuw] });
}

export function markeerAls(naam, soort) {
  const n = store.namen();
  const kopie = { plaatsen: [...(n.plaatsen || [])], genegeerd: [...(n.genegeerd || [])] };
  (soort === 'plaats' ? kopie.plaatsen : kopie.genegeerd).push(naam);
  store.zetNamen(kopie);
}

// ---------- voor het hele boek ----------
// Namen in de tekst die nog geen personage zijn. Alleen namen die minstens twee keer voorkomen:
// een merk of land dat één keer langskomt, hoeft je aandacht niet.
export function namenInBoek(minimaal = 2) {
  const samen = new Map();
  for (const h of store.lijst()) {
    for (const v of voorstellen(h)) {
      const x = samen.get(v.naam) || { naam: v.naam, aantal: 0, aliassen: new Set(), eerste: h };
      x.aantal += v.aantal;
      v.aliassen.forEach((a) => x.aliassen.add(a));
      samen.set(v.naam, x);
    }
  }
  return [...samen.values()].filter((x) => x.aantal >= minimaal)
    .map((x) => ({ ...x, aliassen: [...x.aliassen].filter((a) => a !== x.naam) }))
    .sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam));
}

// "Isa" is waarschijnlijk "Isabelle": een losse naam waarmee een langere naam begint.
export function lijktOp(naam, kandidaten) {
  if (naam.includes(' ') || naam.length < 2) return null;
  const n = naam.toLowerCase();
  for (const k of kandidaten) {
    if (k === naam) continue;
    for (const d of delenVanNaam(k)) if (d.length > naam.length && d.toLowerCase().startsWith(n)) return k;
  }
  return null;
}

function afstand(a, b) {
  const m = a.length, n = b.length;
  let vorige = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const rij = [i];
    for (let j = 1; j <= n; j++) rij[j] = Math.min(vorige[j] + 1, rij[j - 1] + 1, vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    vorige = rij;
  }
  return vorige[n];
}

const zonderAccent = (w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Schrijfwijze controleren: staat er ergens "Phillips" terwijl het personage "Philips" heet?
export function naamControle() {
  const personen = store.notities('personages');
  const bekend = new Map(); // woord -> persoon
  for (const p of personen) {
    for (const n of [p.naam, ...(p.aliassen || [])]) for (const d of delenVanNaam(n)) if (!bekend.has(d)) bekend.set(d, p);
  }
  if (!bekend.size) return [];
  const genegeerd = new Set(store.namen().genegeerd || []);
  const tel = new Map();
  for (const h of store.lijst()) {
    for (const b of blokkenVan(h)) {
      for (const m of b.tekst.matchAll(WOORD_RE)) {
        const w = m[0].replace(/['’]s$/, '');
        if (!isHoofdletter(w) || w.length < 4) continue;
        const x = tel.get(w) || { aantal: 0, eerste: h };
        x.aantal++;
        tel.set(w, x);
      }
    }
  }
  const klein = kleineWoorden();
  const uit = [];
  for (const [w, x] of tel) {
    if (zonderAccent(w) !== w && bekend.has(zonderAccent(w))) continue; // "Fránk" is klemtoon, geen tikfout
    if (bekend.has(w) || genegeerd.has(w) || klein.has(w.toLowerCase()) || STOP.has(w.toLowerCase())) continue;
    for (const [d, p] of bekend) {
      if (d[0] !== w[0] || Math.abs(d.length - w.length) > 2) continue;
      if (w === d + 's' || d === w + 's' || w === d + 'e') continue;
      const af = afstand(w.toLowerCase(), d.toLowerCase());
      const kort = Math.min(w.length, d.length);
      if ((af === 1 && kort >= 4) || (af === 2 && kort >= 7)) {
        uit.push({ variant: w, aantal: x.aantal, eerste: x.eerste, juist: d, persoon: p, juistAantal: (tel.get(d) || { aantal: 0 }).aantal });
        break;
      }
    }
  }
  return uit.sort((a, b) => a.aantal - b.aantal);
}
