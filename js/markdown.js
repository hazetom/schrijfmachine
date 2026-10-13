// Tekstmodel van de Schrijfmachine.
//
// Een stuk tekst is een lijst blokken:
//   { type: 'p', runs: [{ t: 'tekst', b: false, i: false }, ...] }   alinea
//   { type: 'h', runs: [...] }                                       kopje binnen een hoofdstuk
//   { type: 'scene' }                                                scènescheiding
//
// Markdown-variant (bewust klein, zodat heen en terug niets verloren gaat):
//   **vet**   *cursief*   ***vet en cursief***
//   ## Kopje
//   * * *     scènescheiding
//   \*  \\  \#   letterlijke tekens
// Vet en cursief werken als schakelaars: elke ** zet vet om, elke * zet cursief om.
// Daardoor is wat we schrijven altijd precies terug te lezen.

const WS = /^\s+$/;

export function cleanText(s) {
  return s.replace(/ /g, ' ').replace(/[​﻿]/g, '').replace(/[\r\n\t]+/g, ' ');
}

// Voegt aangrenzende stukjes met dezelfde opmaak samen, haalt witruimte
// aan begin en eind van een blok weg en geeft spaties de opmaak van hun buren.
export function normalizeRuns(runs) {
  let pieces = [];
  for (const r of runs) {
    const t = cleanText(r.t || '');
    if (!t) continue;
    // splits in witruimte en niet-witruimte zodat losse spaties hun opmaak kunnen verliezen
    const parts = t.split(/(\s+)/).filter(Boolean);
    for (const p of parts) pieces.push({ t: p, b: !!r.b, i: !!r.i });
  }
  // witruimte krijgt de gemeenschappelijke opmaak van links en rechts
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k];
    if (!WS.test(p.t)) continue;
    let l = null, r = null;
    for (let a = k - 1; a >= 0; a--) if (!WS.test(pieces[a].t)) { l = pieces[a]; break; }
    for (let a = k + 1; a < pieces.length; a++) if (!WS.test(pieces[a].t)) { r = pieces[a]; break; }
    p.b = !!(l && r && l.b && r.b);
    p.i = !!(l && r && l.i && r.i);
  }
  // witruimte aan begin en eind weg
  while (pieces.length && WS.test(pieces[0].t)) pieces.shift();
  while (pieces.length && WS.test(pieces[pieces.length - 1].t)) pieces.pop();
  // samenvoegen
  const out = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.b === p.b && last.i === p.i) last.t += p.t;
    else out.push({ ...p });
  }
  return out;
}

function escapeInline(t) {
  return t.replace(/\\/g, '\\\\').replace(/\*/g, '\\*');
}

export function runsToMd(runs) {
  runs = normalizeRuns(runs);
  let b = false, i = false, out = '';
  const flip = (nb, ni) => {
    const fb = nb !== b, fi = ni !== i;
    if (fb && fi) out += '***';
    else if (fb) out += '**';
    else if (fi) out += '*';
    b = nb; i = ni;
  };
  for (const r of runs) {
    flip(r.b, r.i);
    out += escapeInline(r.t);
  }
  flip(false, false);
  return out;
}

export function parseInline(s) {
  const runs = [];
  let b = false, i = false, buf = '';
  const push = () => { if (buf) { runs.push({ t: buf, b, i }); buf = ''; } };
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && k + 1 < s.length) { buf += s[k + 1]; k++; continue; }
    if (c === '*') {
      let n = 1;
      while (s[k + n] === '*') n++;
      push();
      let m = n;
      while (m >= 3) { b = !b; i = !i; m -= 3; }
      if (m === 2) b = !b;
      if (m === 1) i = !i;
      k += n - 1;
      continue;
    }
    buf += c;
  }
  push();
  return normalizeRuns(runs);
}

const SCENE_RE = /^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$|^⁂$/;

export function blocksToMd(blocks) {
  const parts = [];
  for (const bl of blocks) {
    if (bl.type === 'scene') { parts.push('* * *'); continue; }
    let md = runsToMd(bl.runs);
    if (bl.type === 'h') {
      if (!md) continue;
      parts.push('## ' + md);
    } else {
      if (!md) continue; // lege alinea's bestaan niet in Markdown
      if (/^#/.test(md) || SCENE_RE.test(md)) md = '\\' + md;
      parts.push(md);
    }
  }
  return parts.join('\n\n') + (parts.length ? '\n' : '');
}

export function mdToBlocks(md) {
  const blocks = [];
  const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  const flush = () => {
    if (!para.length) return;
    const text = para.join(' ').trim();
    para = [];
    if (!text) return;
    if (SCENE_RE.test(text)) { blocks.push({ type: 'scene' }); return; }
    blocks.push({ type: 'p', runs: parseInline(text) });
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: 'h', runs: parseInline(h[2]) });
      continue;
    }
    if (SCENE_RE.test(line) && !para.length) { blocks.push({ type: 'scene' }); continue; }
    para.push(line);
  }
  flush();
  return blocks;
}

// Hoofdstukbestand: "# Titel" gevolgd door de tekst.
export function chapterToMd(titel, body) {
  const t = (titel || '').trim() || 'Zonder titel';
  return '# ' + t.replace(/\n/g, ' ') + '\n\n' + (body || '');
}

export function mdToChapter(md) {
  const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
  let k = 0;
  while (k < lines.length && !lines[k].trim()) k++;
  let titel = null;
  if (k < lines.length && /^#\s+/.test(lines[k])) {
    titel = lines[k].replace(/^#\s+/, '').trim();
    k++;
  }
  const body = blocksToMd(mdToBlocks(lines.slice(k).join('\n')));
  return { titel, body };
}

// ---------- HTML ----------

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function runsToHtml(runs) {
  return normalizeRuns(runs).map((r) => {
    let h = escHtml(r.t);
    if (r.i) h = '<em>' + h + '</em>';
    if (r.b) h = '<strong>' + h + '</strong>';
    return h;
  }).join('');
}

export function blocksToHtml(blocks) {
  if (!blocks.length) return '<p><br></p>';
  return blocks.map((bl) => {
    if (bl.type === 'scene') return '<hr>';
    const inner = runsToHtml(bl.runs) || '<br>';
    return bl.type === 'h' ? '<h2>' + inner + '</h2>' : '<p>' + inner + '</p>';
  }).join('');
}

export function mdToHtml(md) {
  return blocksToHtml(mdToBlocks(md));
}

function isBoldEl(el) {
  const tag = el.tagName;
  if (tag === 'B' || tag === 'STRONG') return true;
  const fw = el.style && el.style.fontWeight;
  if (fw && (fw === 'bold' || parseInt(fw, 10) >= 600)) return true;
  return false;
}
function isNotBoldEl(el) {
  const fw = el.style && el.style.fontWeight;
  return !!fw && (fw === 'normal' || parseInt(fw, 10) < 600);
}
function isItalicEl(el) {
  const tag = el.tagName;
  if (tag === 'I' || tag === 'EM') return true;
  return !!(el.style && el.style.fontStyle === 'italic');
}
function isNotItalicEl(el) {
  return !!(el.style && el.style.fontStyle === 'normal');
}

function collectRuns(node, b, i, out) {
  for (const ch of node.childNodes) {
    if (ch.nodeType === 3) {
      if (ch.data) out.push({ t: ch.data, b, i });
    } else if (ch.nodeType === 1) {
      if (ch.tagName === 'BR') { out.push({ t: ' ', b, i }); continue; }
      let nb = b, ni = i;
      if (isBoldEl(ch)) nb = true; else if (isNotBoldEl(ch)) nb = false;
      if (isItalicEl(ch)) ni = true; else if (isNotItalicEl(ch)) ni = false;
      collectRuns(ch, nb, ni, out);
    }
  }
  return out;
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE']);

function blockFromEl(el, out) {
  const tag = el.tagName;
  if (tag === 'HR') { out.push({ type: 'scene' }); return; }
  // blok met blokken erin (bijvoorbeeld een div om alinea's heen): plat maken
  const hasBlockChild = [...el.children].some((c) => BLOCK_TAGS.has(c.tagName));
  if (hasBlockChild && tag !== 'P' && !/^H\d$/.test(tag)) {
    domChildrenToBlocks(el, out);
    return;
  }
  if (hasBlockChild) {
    // p of kop met een blok erin: alles tot aan het blok is één alinea
    let inline = [];
    const flushInline = () => {
      if (!inline.length) return;
      const tmp = el.ownerDocument.createElement('span');
      inline.forEach((n) => tmp.appendChild(n.cloneNode(true)));
      const runs = collectRuns(tmp, false, false, []);
      out.push({ type: /^H\d$/.test(tag) ? 'h' : 'p', runs });
      inline = [];
    };
    for (const c of el.childNodes) {
      if (c.nodeType === 1 && BLOCK_TAGS.has(c.tagName)) { flushInline(); blockFromEl(c, out); }
      else inline.push(c);
    }
    flushInline();
    return;
  }
  const runs = collectRuns(el, isBoldEl(el), isItalicEl(el), []);
  out.push({ type: /^H\d$/.test(tag) ? 'h' : 'p', runs });
}

function domChildrenToBlocks(root, out) {
  let inline = [];
  const flushInline = () => {
    if (!inline.length) return;
    const tmp = root.ownerDocument.createElement('span');
    inline.forEach((n) => tmp.appendChild(n.cloneNode(true)));
    const runs = collectRuns(tmp, false, false, []);
    if (normalizeRuns(runs).length) out.push({ type: 'p', runs });
    inline = [];
  };
  for (const c of root.childNodes) {
    if (c.nodeType === 1 && BLOCK_TAGS.has(c.tagName)) { flushInline(); blockFromEl(c, out); }
    else if (c.nodeType === 1 && c.tagName === 'BR') { flushInline(); }
    else inline.push(c);
  }
  flushInline();
  return out;
}

export function domToBlocks(root) {
  const blocks = domChildrenToBlocks(root, []);
  return blocks.map((b) => (b.type === 'scene' ? b : { type: b.type, runs: normalizeRuns(b.runs) }));
}

export function domToMd(root) {
  return blocksToMd(domToBlocks(root));
}

// ---------- tellen ----------

export function blocksText(blocks) {
  return blocks.filter((b) => b.type !== 'scene').map((b) => b.runs.map((r) => r.t).join('')).join('\n');
}

export function countWords(md) {
  const text = blocksText(mdToBlocks(md));
  const m = text.match(/[^\s]+/g);
  return m ? m.filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

export function slugify(s) {
  const base = (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'hoofdstuk';
}
