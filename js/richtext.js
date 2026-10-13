// Gedeeld gedrag voor alle tekstvelden met opmaak (schrijfscherm en notities):
// Ctrl+B, Ctrl+I, kopjes, scènescheiding, plakken als platte tekst,
// en het kleine balkje dat verschijnt als je tekst selecteert.

let actiefVeld = null;
const balk = () => document.getElementById('opmaakbalk');

export function initRijkeTekst() {
  try {
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand('styleWithCSS', false, false);
  } catch (e) { /* oude browser */ }

  const b = balk();
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    const knop = e.target.closest('[data-opmaak]');
    if (!knop || !actiefVeld) return;
    voerUit(actiefVeld, knop.dataset.opmaak);
    toonBalk();
  });
  document.addEventListener('selectionchange', () => toonBalk());
  window.addEventListener('resize', () => verbergBalk());
}

function verbergBalk() { balk().hidden = true; }

function veldVanSelectie() {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const n = sel.anchorNode;
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  return el ? el.closest('.rijk[contenteditable="true"]') : null;
}

function toonBalk() {
  const sel = document.getSelection();
  const veld = veldVanSelectie();
  if (!veld || !sel || sel.isCollapsed || !sel.rangeCount || !veld.contains(sel.focusNode)) { verbergBalk(); return; }
  actiefVeld = veld;
  const rects = [...sel.getRangeAt(0).getClientRects()].filter((r) => r.width > 0 || r.height > 0);
  if (!rects.length) { verbergBalk(); return; }
  const vr = (veld.closest('.tekstkader') || veld).getBoundingClientRect();
  // alleen de stukken die echt zichtbaar zijn (bij bladeren staan andere pagina's buiten beeld)
  const zichtbaar = rects.filter((r) => r.right > vr.left && r.left < vr.right && r.bottom > vr.top && r.top < vr.bottom);
  const r = (zichtbaar.length ? zichtbaar : rects)[0];
  const b = balk();
  b.hidden = false;
  b.querySelector('[data-opmaak="scene"]').hidden = veld.dataset.scene === 'nee';
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let x = r.left + Math.min(r.width, 200) / 2 - bw / 2;
  let y = r.top - bh - 10;
  if (y < 8) y = r.bottom + 10;
  x = Math.max(8, Math.min(window.innerWidth - bw - 8, x));
  b.style.left = Math.round(x) + 'px';
  b.style.top = Math.round(y) + 'px';
}

export function blokVan(veld, node) {
  let n = node;
  while (n && n.parentNode !== veld) n = n.parentNode;
  return n && n.parentNode === veld ? n : null;
}

function huidigBlok(veld) {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let n = sel.anchorNode;
  if (n === veld) n = veld.childNodes[Math.min(sel.anchorOffset, veld.childNodes.length - 1)];
  return blokVan(veld, n);
}

function caretIn(node, aanEinde = false) {
  const sel = document.getSelection();
  const r = document.createRange();
  r.selectNodeContents(node);
  r.collapse(!aanEinde);
  sel.removeAllRanges();
  sel.addRange(r);
}

export function voerUit(veld, wat) {
  veld.focus({ preventScroll: true });
  if (wat === 'vet') document.execCommand('bold');
  else if (wat === 'cursief') document.execCommand('italic');
  else if (wat === 'kop') {
    const blok = huidigBlok(veld);
    const isKop = blok && blok.nodeType === 1 && /^H\d$/.test(blok.tagName);
    document.execCommand('formatBlock', false, isKop ? 'p' : 'h2');
  } else if (wat === 'scene') {
    if (veld.dataset.scene === 'nee') return;
    sceneNa(veld);
  }
  normaliseer(veld);
  veld.dispatchEvent(new CustomEvent('rijk-wijziging'));
}

function sceneNa(veld) {
  const blok = huidigBlok(veld);
  if (!blok) return;
  const ervoor = blok.previousSibling;
  const leeg = !blok.textContent.trim() && blok.tagName === 'P';
  caretIn(blok, true);
  document.execCommand('insertHorizontalRule');
  // de nieuwe scheiding opzoeken
  let start = blok.isConnected ? blok.nextSibling : (ervoor ? ervoor.nextSibling : veld.firstChild);
  let hr = start;
  while (hr && !(hr.nodeType === 1 && hr.tagName === 'HR')) hr = hr.nextSibling;
  if (!hr) return;
  // een lege alinea vlak voor de scheiding is overbodig
  if (leeg && blok.isConnected && blok.nextSibling === hr && blok.previousSibling) blok.remove();
  // altijd een alinea na de scheiding om in verder te typen
  let volgende = hr.nextElementSibling;
  if (!volgende || volgende.tagName !== 'P') {
    volgende = document.createElement('p');
    volgende.appendChild(document.createElement('br'));
    hr.after(volgende);
  }
  caretIn(volgende, false);
}

// Houdt de structuur netjes: alleen p, h2 en hr op het bovenste niveau, geen losse stijlen.
export function normaliseer(veld) {
  const sel = document.getSelection();
  const a = sel && sel.rangeCount ? { n: sel.anchorNode, o: sel.anchorOffset, fn: sel.focusNode, fo: sel.focusOffset } : null;
  let veranderd = false;
  if (!veld.firstChild) {
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    veld.appendChild(p);
    if (a) caretIn(p);
    return true;
  }
  let losse = [];
  const pakLosseIn = () => {
    if (!losse.length) return;
    if (losse.every((n) => n.nodeType === 3 && !n.data.trim()) && losse.every((n) => !(a && (n === a.n)))) {
      losse.forEach((n) => n.remove());
    } else {
      const p = document.createElement('p');
      losse[0].before(p);
      losse.forEach((n) => p.appendChild(n));
    }
    losse = [];
    veranderd = true;
  };
  for (const n of [...veld.childNodes]) {
    if (n.nodeType === 1 && (n.tagName === 'P' || n.tagName === 'H2' || n.tagName === 'HR')) { pakLosseIn(); continue; }
    if (n.nodeType === 1 && (n.tagName === 'DIV' || /^H[13456]$/.test(n.tagName) || n.tagName === 'BLOCKQUOTE' || n.tagName === 'PRE' || n.tagName === 'LI')) {
      pakLosseIn();
      const nieuw = document.createElement(/^H\d$/.test(n.tagName) ? 'h2' : 'p');
      while (n.firstChild) nieuw.appendChild(n.firstChild);
      n.replaceWith(nieuw);
      veranderd = true;
      continue;
    }
    if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) {
      pakLosseIn();
      for (const li of [...n.children]) {
        const p = document.createElement('p');
        while (li.firstChild) p.appendChild(li.firstChild);
        n.before(p);
      }
      n.remove();
      veranderd = true;
      continue;
    }
    if (n.nodeType === 8) { n.remove(); continue; }
    losse.push(n);
  }
  pakLosseIn();
  // stijlen opruimen: alleen vet en cursief tellen
  for (const el of veld.querySelectorAll('[style]')) {
    const fw = el.style.fontWeight, fs = el.style.fontStyle;
    if (el.tagName === 'SPAN' && !fw && !fs) {
      el.replaceWith(...el.childNodes);
      veranderd = true;
      continue;
    }
    const nieuw = (fw ? 'font-weight:' + fw + ';' : '') + (fs ? 'font-style:' + fs + ';' : '');
    if (el.getAttribute('style') !== nieuw) {
      if (nieuw) el.setAttribute('style', nieuw); else el.removeAttribute('style');
      veranderd = true;
    }
  }
  for (const el of veld.querySelectorAll('font, a, u, s, strike, sub, sup, mark, code, small, big')) {
    el.replaceWith(...el.childNodes);
    veranderd = true;
  }
  for (const el of veld.querySelectorAll('img, video, audio, iframe, object, table, svg, script, style')) {
    el.remove();
    veranderd = true;
  }
  // hr die per ongeluk in een alinea terechtkwam: naar buiten halen
  for (const hr of veld.querySelectorAll(':scope > p hr, :scope > h2 hr')) {
    const blok = blokVan(veld, hr);
    const na = blok.cloneNode(false);
    let n = hr.nextSibling;
    while (n) { const v = n.nextSibling; na.appendChild(n); n = v; }
    blok.after(hr);
    if (na.textContent.trim()) hr.after(na);
    veranderd = true;
  }
  if (veranderd && a && a.n && a.n.isConnected) {
    try {
      const r = document.createRange();
      r.setStart(a.n, Math.min(a.o, a.n.nodeType === 3 ? a.n.length : a.n.childNodes.length));
      sel.removeAllRanges();
      sel.addRange(r);
      if (a.fn && a.fn.isConnected && (a.fn !== a.n || a.fo !== a.o)) sel.extend(a.fn, Math.min(a.fo, a.fn.nodeType === 3 ? a.fn.length : a.fn.childNodes.length));
    } catch (e) { /* */ }
  }
  return veranderd;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function maakRijk(veld, { scene = true } = {}) {
  veld.classList.add('rijk');
  veld.dataset.scene = scene ? 'ja' : 'nee';

  veld.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && !e.altKey && !e.shiftKey && k === 'b') { e.preventDefault(); voerUit(veld, 'vet'); return; }
    if (ctrl && !e.altKey && !e.shiftKey && k === 'i') { e.preventDefault(); voerUit(veld, 'cursief'); return; }
    if (ctrl && !e.altKey && k === 'u') { e.preventDefault(); return; }
    if (ctrl && e.altKey && (k === '2' || e.code === 'Digit2')) { e.preventDefault(); voerUit(veld, 'kop'); return; }
    if (ctrl && e.shiftKey && e.key === 'Enter') { e.preventDefault(); voerUit(veld, 'scene'); return; }
    if (e.key === 'Enter' && !ctrl && !e.altKey) {
      e.preventDefault();
      const blok = huidigBlok(veld);
      // "***" of "* * *" en Enter wordt een scènescheiding
      if (scene && blok && blok.tagName === 'P' && /^\s*(\*\s*){3}$/.test(blok.textContent)) {
        const r = document.createRange();
        r.selectNodeContents(blok);
        const sel = document.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand('delete');
        voerUit(veld, 'scene');
        return;
      }
      document.execCommand('insertParagraph');
      normaliseer(veld);
      veld.dispatchEvent(new CustomEvent('rijk-wijziging'));
      return;
    }
  });

  veld.addEventListener('paste', (e) => {
    e.preventDefault();
    const tekst = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (!tekst) return;
    const delen = tekst.replace(/\r\n?/g, '\n').split(/\n\s*\n|\n/).map((s) => s.replace(/\s+/g, ' ').trim());
    if (delen.length <= 1) {
      document.execCommand('insertText', false, delen[0] || '');
    } else {
      document.execCommand('insertHTML', false, delen.filter(Boolean).map((d) => '<p>' + escHtml(d) + '</p>').join(''));
    }
    normaliseer(veld);
    veld.dispatchEvent(new CustomEvent('rijk-wijziging'));
  });

  veld.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) e.preventDefault();
  });

  veld.addEventListener('input', () => {
    normaliseer(veld);
    veld.dispatchEvent(new CustomEvent('rijk-wijziging'));
  });

  veld.addEventListener('blur', () => setTimeout(() => { if (!veldVanSelectie()) verbergBalk(); }, 0));
}
