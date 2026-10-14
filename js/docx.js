// .docx maken (export) en lezen (import), zonder externe library.

import { maakZip, leesZip } from './zip.js';
import { mdToBlocks, normalizeRuns, cleanText } from './markdown.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function xml(s) {
  return s
    .replace(/[^\u0009\u000a\u000d -퟿-�\u{10000}-\u{10ffff}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function runXml(r) {
  const props = (r.b ? '<w:b/><w:bCs/>' : '') + (r.i ? '<w:i/><w:iCs/>' : '');
  return '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + xml(r.t) + '</w:t></w:r>';
}

function paraXml(runs, { stijl = null, pagina = false, midden = false } = {}) {
  let ppr = '';
  if (stijl) ppr += '<w:pStyle w:val="' + stijl + '"/>';
  if (pagina) ppr += '<w:pageBreakBefore/>';
  if (midden) ppr += '<w:jc w:val="center"/>';
  return '<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + normalizeRuns(runs).map(runXml).join('') + '</w:p>';
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Literata" w:hAnsi="Literata" w:eastAsia="Literata" w:cs="Literata"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="nl-NL"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:before="2400" w:after="480"/></w:pPr><w:rPr><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="480"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="200"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:caps/><w:spacing w:val="20"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="200"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:caps/><w:spacing w:val="20"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
</w:styles>`;

const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

function core(titel) {
  const nu = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(titel || 'Manuscript')}</dc:title><dc:creator>Schrijfmachine</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${nu}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${nu}</dcterms:modified></cp:coreProperties>`;
}

// rijen: [{ soort: 'deel', titel } | { soort: 'hoofdstuk', titel, md }]
// (of oud: hoofdstukken: [{ titel, md }])
// Zonder delen: hoofdstuk = Kop 1, kopje = Kop 2.
// Met delen: deel = Kop 1 op een eigen pagina, hoofdstuk = Kop 2, kopje = Kop 3.
export async function maakDocx({ titel, hoofdstukken, rijen }) {
  if (!rijen) rijen = (hoofdstukken || []).map((h) => ({ soort: 'hoofdstuk', ...h }));
  const metDelen = rijen.some((r) => r.soort === 'deel');
  const body = [];
  let eerste = true;
  if (titel && titel.trim()) {
    body.push(paraXml([{ t: titel.trim() }], { stijl: 'Title' }));
    eerste = false;
  }
  for (const r of rijen) {
    if (r.soort === 'deel') {
      body.push(paraXml([{ t: r.titel || 'Zonder titel' }], { stijl: 'Heading1', pagina: !eerste }));
      eerste = false;
      continue;
    }
    body.push(paraXml([{ t: r.titel || 'Zonder titel' }], { stijl: metDelen ? 'Heading2' : 'Heading1', pagina: !eerste }));
    eerste = false;
    for (const bl of mdToBlocks(r.md)) {
      if (bl.type === 'scene') body.push(paraXml([{ t: '*   *   *' }], { midden: true }));
      else if (bl.type === 'h') body.push(paraXml(bl.runs, { stijl: metDelen ? 'Heading3' : 'Heading2' }));
      else body.push(paraXml(bl.runs));
    }
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const zip = await maakZip([
    { naam: '[Content_Types].xml', data: CONTENT_TYPES },
    { naam: '_rels/.rels', data: RELS },
    { naam: 'word/document.xml', data: doc },
    { naam: 'word/_rels/document.xml.rels', data: DOC_RELS },
    { naam: 'word/styles.xml', data: STYLES },
    { naam: 'word/settings.xml', data: SETTINGS },
    { naam: 'docProps/core.xml', data: core(titel) },
  ]);
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- lezen ----------

function aan(el, naam) {
  const x = el.getElementsByTagNameNS(W, naam)[0];
  if (!x) return null;
  const v = x.getAttributeNS(W, 'val') ?? x.getAttribute('w:val');
  return !(v === '0' || v === 'false' || v === 'off');
}

// Geeft alinea's: [{ niveau: 0 (titel) | 1..9 (kop) | null, runs }]
export async function leesDocx(buffer) {
  const bestanden = await leesZip(buffer);
  const dec = new TextDecoder();
  const docData = bestanden.get('word/document.xml');
  if (!docData) throw new Error('Dit .docx-bestand heeft geen tekst');
  const parser = new DOMParser();
  const doc = parser.parseFromString(dec.decode(docData), 'application/xml');
  const stijlNiveau = new Map();
  const stijlVet = new Map();
  const stijlCursief = new Map();
  const st = bestanden.get('word/styles.xml');
  if (st) {
    const sd = parser.parseFromString(dec.decode(st), 'application/xml');
    for (const s of sd.getElementsByTagNameNS(W, 'style')) {
      const id = s.getAttributeNS(W, 'styleId') || s.getAttribute('w:styleId');
      const nameEl = s.getElementsByTagNameNS(W, 'name')[0];
      const naam = ((nameEl && (nameEl.getAttributeNS(W, 'val') || nameEl.getAttribute('w:val'))) || '').toLowerCase();
      let niveau = null;
      const m = /^(heading|kop)\s*(\d)$/.exec(naam);
      if (m) niveau = +m[2];
      else if (naam === 'title' || naam === 'titel') niveau = 0;
      else {
        const ol = s.getElementsByTagNameNS(W, 'outlineLvl')[0];
        if (ol) niveau = +(ol.getAttributeNS(W, 'val') || ol.getAttribute('w:val')) + 1;
      }
      if (niveau !== null) stijlNiveau.set(id, niveau);
      const rpr = [...s.children].find((c) => c.localName === 'rPr');
      if (rpr) {
        const b = aan(rpr, 'b'); if (b !== null) stijlVet.set(id, b);
        const i = aan(rpr, 'i'); if (i !== null) stijlCursief.set(id, i);
      }
    }
  }
  const uit = [];
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) return uit;
  for (const p of body.getElementsByTagNameNS(W, 'p')) {
    // alinea's in tabellen of tekstvakken nemen we gewoon mee
    const ppr = [...p.children].find((c) => c.localName === 'pPr');
    let niveau = null, pVet = false, pCursief = false;
    if (ppr) {
      const ps = ppr.getElementsByTagNameNS(W, 'pStyle')[0];
      const id = ps && (ps.getAttributeNS(W, 'val') || ps.getAttribute('w:val'));
      if (id && stijlNiveau.has(id)) niveau = stijlNiveau.get(id);
      if (id && stijlVet.get(id)) pVet = true;
      if (id && stijlCursief.get(id)) pCursief = true;
      const ol = [...ppr.children].find((c) => c.localName === 'outlineLvl');
      if (ol && niveau === null) niveau = +(ol.getAttributeNS(W, 'val') || ol.getAttribute('w:val')) + 1;
    }
    let runs = [];
    const klaar = () => { uit.push({ niveau, runs: normalizeRuns(runs) }); runs = []; };
    for (const r of p.getElementsByTagNameNS(W, 'r')) {
      // verwijderde tekst (wijzigingen bijhouden) overslaan
      if (r.parentElement && r.parentElement.localName === 'del') continue;
      const rpr = [...r.children].find((c) => c.localName === 'rPr');
      let b = pVet, i = pCursief;
      if (rpr) {
        const rs = rpr.getElementsByTagNameNS(W, 'rStyle')[0];
        const rid = rs && (rs.getAttributeNS(W, 'val') || rs.getAttribute('w:val'));
        if (rid && stijlVet.has(rid)) b = stijlVet.get(rid);
        if (rid && stijlCursief.has(rid)) i = stijlCursief.get(rid);
        const bb = [...rpr.children].find((c) => c.localName === 'b');
        if (bb) { const v = bb.getAttributeNS(W, 'val') ?? bb.getAttribute('w:val'); b = !(v === '0' || v === 'false'); }
        const ii = [...rpr.children].find((c) => c.localName === 'i');
        if (ii) { const v = ii.getAttributeNS(W, 'val') ?? ii.getAttribute('w:val'); i = !(v === '0' || v === 'false'); }
      }
      for (const c of r.children) {
        if (c.localName === 't') runs.push({ t: c.textContent, b, i });
        else if (c.localName === 'tab') runs.push({ t: ' ', b, i });
        else if (c.localName === 'noBreakHyphen') runs.push({ t: '-', b, i });
        else if (c.localName === 'br' || c.localName === 'cr') klaar();
      }
    }
    klaar();
  }
  return uit.filter((a) => a.runs.length);
}

// ---------- voorstel voor het indelen in hoofdstukken ----------

const DEEL_RE = /^(act|akte|deel|boek)\s*\d/i;
const HOOFDSTUK_RE = /^(proloog|epiloog|intermezzo|interludium|voorwoord|nawoord|act|akte|deel|hoofdstuk|boek)\b/i;
const NUMMER_RE = /^\d{1,3}[.)]?(\s|$)/;
const SCENE_RE = /^(\*\s*){1,5}$|^(#\s*){1,3}$|^⁂$|^(~\s*){1,3}$|^(-\s*){3,}$|^(o\s*){3}$/i;

export function tekstVan(runs) { return runs.map((r) => r.t).join(''); }

// soort: 'deel' | 'hoofdstuk' | 'kop' | 'tekst' | 'scene'
export function stelIndelingVoor(alineas) {
  // Drie kopniveaus (zoals onze eigen export met delen): 1 = deel, 2 = hoofdstuk, 3 = kopje.
  const niveaus = new Set(alineas.map((a) => a.niveau).filter((n) => n));
  const drieLagen = niveaus.has(1) && niveaus.has(2) && niveaus.has(3);
  return alineas.map((a) => {
    const t = cleanText(tekstVan(a.runs)).trim();
    let soort = 'tekst';
    if (SCENE_RE.test(t)) soort = 'scene';
    else if (drieLagen && a.niveau === 1) soort = 'deel';
    else if (drieLagen && a.niveau === 2) soort = 'hoofdstuk';
    else if (drieLagen && a.niveau >= 3) soort = 'kop';
    else if (a.niveau === 0 || a.niveau === 1) soort = DEEL_RE.test(t) ? 'deel' : 'hoofdstuk';
    else if (a.niveau && a.niveau >= 2) soort = 'kop';
    else if (t.length <= 60 && DEEL_RE.test(t)) soort = 'deel';
    else if (t.length <= 60 && (HOOFDSTUK_RE.test(t) || NUMMER_RE.test(t))) soort = 'hoofdstuk';
    else if (t.length <= 60 && !/[.!?…:;,"”’'»)\]]$/.test(t) && !/^["“‘'«(\[-]/.test(t) && t.split(/\s+/).length <= 9) soort = 'kop';
    return { runs: a.runs, tekst: t, soort };
  });
}

// Zet de (eventueel aangepaste) indeling om in rijen:
// [{ soort: 'deel', titel } | { soort: 'hoofdstuk', titel, md }]
export function bouwHoofdstukken(rijen, blocksToMd) {
  const uit = [];
  let huidig = null;
  for (const r of rijen) {
    if (r.soort === 'overslaan') continue;
    if (r.soort === 'deel') {
      uit.push({ soort: 'deel', titel: r.tekst || 'Zonder titel' });
      huidig = null;
      continue;
    }
    if (r.soort === 'hoofdstuk') {
      huidig = { soort: 'hoofdstuk', titel: r.tekst || 'Zonder titel', blocks: [] };
      uit.push(huidig);
      continue;
    }
    if (!huidig) {
      huidig = { soort: 'hoofdstuk', titel: 'Zonder titel', blocks: [] };
      uit.push(huidig);
    }
    if (r.soort === 'scene') huidig.blocks.push({ type: 'scene' });
    else if (r.soort === 'kop') huidig.blocks.push({ type: 'h', runs: r.runs.map((x) => ({ ...x, b: false })) });
    else huidig.blocks.push({ type: 'p', runs: r.runs });
  }
  return uit.map((x) => (x.soort === 'deel' ? x : { soort: 'hoofdstuk', titel: x.titel, md: blocksToMd(x.blocks) }));
}
