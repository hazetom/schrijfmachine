// Het schrijfscherm: tekst die je per pagina doorbladert, zoals op een e-reader.
// Technisch: één bewerkbaar vlak met CSS-kolommen. Elke kolom is één pagina;
// we laten er steeds precies één zien en schuiven mee met de cursor.

import { mdToHtml, domToMd } from './markdown.js';
import { store } from './store.js';
import { maakRijk, blokVan } from './richtext.js';

const BEWAAR_PAUZE = 250;

export class Editor extends EventTarget {
  constructor() {
    super();
    this.el = document.getElementById('tekst');
    this.kader = document.getElementById('tekstkader');
    this.waaslaag = document.getElementById('waaslaag');
    this.pagina = 0;
    this.aantal = 1;
    this.id = null;
    this.bewaarTimer = null;
    this.onthoudPagina = new Map();
    this.huidigBlokIndex = -1;
    this.wielTotaal = 0;
    this.wielTijd = 0;
    this.stijl = document.createElement('style');
    document.head.appendChild(this.stijl);

    maakRijk(this.el, { scene: true });

    this.el.addEventListener('rijk-wijziging', () => {
      this.planBewaren();
      this.naOpmaak();
    });
    document.addEventListener('selectionchange', () => {
      const sel = document.getSelection();
      if (sel && sel.rangeCount && this.el.contains(sel.focusNode)) this.naOpmaak();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'PageDown') { e.preventDefault(); this.blader(1); }
      else if (e.key === 'PageUp') { e.preventDefault(); this.blader(-1); }
      // na de standaardactie (cursor verplaatst) maar vóór het tekenen: pagina bijstellen
      else requestAnimationFrame(() => this.naOpmaak());
    });
    // Het kader knipt af (overflow: clip) en is dus niet scrollbaar: de browser kan niet
    // zelf gaan schuiven. Wij verschuiven de tekst per hele pagina met een transform.
    this.kader.addEventListener('scroll', () => { this.kader.scrollLeft = 0; this.kader.scrollTop = 0; });
    this.kader.addEventListener('wheel', (e) => this.wiel(e), { passive: false });
    new ResizeObserver(() => this.herbereken()).observe(this.kader);
    document.getElementById('zone-vorige').addEventListener('click', () => this.blader(-1));
    document.getElementById('zone-volgende').addEventListener('click', () => this.blader(1));
    document.getElementById('knop-vorige').addEventListener('click', () => this.blader(-1));
    document.getElementById('knop-volgende').addEventListener('click', () => this.blader(1));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.herbereken());
  }

  // ---------- laden en bewaren ----------
  laad(id, { naarEinde = true } = {}) {
    this.bewaar();
    if (this.id) this.onthoudPagina.set(this.id, this.pagina);
    const h = store.hoofdstuk(id);
    if (!h) return;
    this.id = id;
    this.el.innerHTML = mdToHtml(h.md);
    this.huidigBlokIndex = -1;
    this.stijl.textContent = '';
    this.el.style.transform = '';
    this.pagina = 0;
    this.pasVergrendelingToe();
    requestAnimationFrame(() => {
      this.telPaginas();
      const onthouden = this.onthoudPagina.get(id);
      if (onthouden != null && !naarEinde) {
        this.zetPagina(onthouden);
        this.caretBovenaan();
      } else {
        this.caretAanEinde();
      }
      this.dispatchEvent(new CustomEvent('geladen'));
    });
  }

  // Na het vervangen van het hele project: wat nu in beeld staat niet meer bewaren.
  verwerp() {
    clearTimeout(this.bewaarTimer);
    this.id = null;
  }

  herlaad() {
    if (!this.id) return;
    const id = this.id;
    this.id = null;
    this.laad(id, { naarEinde: false });
  }

  planBewaren() {
    clearTimeout(this.bewaarTimer);
    this.bewaarTimer = setTimeout(() => this.bewaar(), BEWAAR_PAUZE);
  }

  bewaar() {
    clearTimeout(this.bewaarTimer);
    if (!this.id || !store.hoofdstuk(this.id)) return;
    if (this.el.getAttribute('contenteditable') !== 'true') return;
    store.zetTekst(this.id, domToMd(this.el));
  }

  // ---------- pagina's ----------
  gat() { return parseFloat(getComputedStyle(this.el).columnGap) || 0; }

  // Breedte van één pagina plus de ruimte tussen twee pagina's (niet afgerond).
  stap() {
    return this.el.getBoundingClientRect().width + this.gat();
  }

  // Inhoudspositie x (vanaf de linkerkant van pagina 1) naar paginanummer.
  paginaVanX(x) {
    return Math.max(0, Math.floor((x + this.gat() / 2) / this.stap()));
  }

  // Aantal pagina's: in welke kolom staat het laatste stukje tekst?
  telPaginas() {
    const er = this.el.getBoundingClientRect();
    let rechts = 0;
    const laatste = this.el.lastElementChild;
    if (laatste) {
      const rs = laatste.getClientRects();
      if (rs.length) rechts = rs[rs.length - 1].left - er.left;
    }
    this.aantal = this.paginaVanX(rechts) + 1;
    return this.aantal;
  }

  verschuiving() { return this.pagina * this.stap(); }

  zetPagina(n) {
    this.telPaginas();
    n = Math.max(0, Math.min(this.aantal - 1, n));
    this.pagina = n;
    const t = n ? `translateX(${-n * this.stap()}px)` : '';
    if (this.el.style.transform !== t) this.el.style.transform = t;
    this.pasVergrendelingToe();
    this.dispatchEvent(new CustomEvent('pagina', { detail: { pagina: n, aantal: this.aantal } }));
  }

  // Op welke pagina staat de cursor?
  caretPagina() {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !this.el.contains(sel.focusNode)) return null;
    const r = document.createRange();
    try { r.setStart(sel.focusNode, sel.focusOffset); r.collapse(true); } catch (e) { return null; }
    let rect = null;
    const rects = r.getClientRects();
    if (rects.length) rect = rects[rects.length - 1];
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.left === 0)) {
      let n = sel.focusNode;
      if (n.nodeType === 3) n = n.parentElement;
      if (n === this.el) n = this.el.childNodes[Math.min(sel.focusOffset, this.el.childNodes.length - 1)];
      if (n && n.nodeType === 1) {
        const rs = n.getClientRects();
        rect = sel.focusOffset > 0 && rs.length ? rs[rs.length - 1] : rs[0];
      }
    }
    if (!rect) return null;
    const er = this.el.getBoundingClientRect(); // verschoven mee met de transform, dus dit is de inhoudspositie
    return this.paginaVanX(rect.left - er.left);
  }

  volgCaret(forceer = false) {
    const p = this.caretPagina();
    if (p === null) {
      if (forceer) this.zetPagina(this.pagina);
      return;
    }
    if (p !== this.pagina || forceer) this.zetPagina(p);
  }

  naOpmaak() {
    this.volgCaret();
    this.verbleek();
  }

  herbereken() {
    if (!this.id) return;
    const p = this.caretPagina();
    this.telPaginas();
    this.zetPagina(p !== null ? p : Math.min(this.pagina, this.aantal - 1));
  }

  blader(delta) {
    if (!this.id) return;
    this.telPaginas();
    const doel = Math.max(0, Math.min(this.aantal - 1, this.pagina + delta));
    if (doel === this.pagina) return;
    this.zetPagina(doel);
    this.caretBovenaan();
  }

  wiel(e) {
    if (e.ctrlKey) return;
    e.preventDefault();
    const nu = Date.now();
    if (nu - this.wielTijd > 400) this.wielTotaal = 0;
    this.wielTijd = nu;
    this.wielTotaal += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(this.wielTotaal) >= 150) {
      this.blader(this.wielTotaal > 0 ? 1 : -1);
      this.wielTotaal = 0;
      this.wielTijd = nu + 250; // even rust na het omslaan
    }
  }

  caretBovenaan() {
    if (this.el.getAttribute('contenteditable') !== 'true') return;
    const er = this.kader.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(this.el).lineHeight) || 30;
    let range = null;
    for (const dy of [lh * 0.5, lh * 1.5, lh * 2.5, lh * 4]) {
      range = document.caretRangeFromPoint(er.left + 2, er.top + dy);
      if (range && this.el.contains(range.startContainer)) break;
      range = null;
    }
    if (!range) return;
    this.el.focus({ preventScroll: true });
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    this.zetPagina(this.pagina);
    this.verbleek();
  }

  caretAanEinde() {
    const laatste = this.el.lastChild;
    if (!laatste) return;
    if (this.el.getAttribute('contenteditable') === 'true') this.el.focus({ preventScroll: true });
    const sel = document.getSelection();
    const r = document.createRange();
    if (laatste.nodeType === 1 && laatste.tagName === 'HR') { r.setStartAfter(laatste); }
    else { r.selectNodeContents(laatste); r.collapse(false); }
    r.collapse(r.collapsed ? true : false);
    sel.removeAllRanges();
    sel.addRange(r);
    this.telPaginas();
    const p = this.caretPagina();
    this.zetPagina(p !== null ? p : this.aantal - 1);
    this.verbleek();
  }

  // Eerdere alinea's iets verbleekt, de huidige in vol inkt.
  verbleek() {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !this.el.contains(sel.focusNode)) return;
    let n = sel.focusNode;
    if (n === this.el) n = this.el.childNodes[Math.min(sel.focusOffset, this.el.childNodes.length - 1)];
    const blok = blokVan(this.el, n);
    const idx = blok ? [...this.el.children].indexOf(blok) : -1;
    if (idx === this.huidigBlokIndex) return;
    this.huidigBlokIndex = idx;
    this.stijl.textContent = idx > 0 ? `#tekst > :nth-child(-n+${idx}) { opacity: 0.55; }` : '';
  }

  // ---------- vergrendelen ----------
  isOpVergrendeldePagina() {
    if (!this.id) return false;
    if (store.isVergrendeld(this.id)) return true;
    const vp = store.meta.vergrendelPagina;
    return !!(vp && vp.id === this.id && this.pagina < vp.blz);
  }

  pasVergrendelingToe() {
    if (!this.id) return;
    const heelHoofdstuk = store.isVergrendeld(this.id);
    const waas = this.isOpVergrendeldePagina();
    this.el.classList.toggle('waas', waas);
    this.waaslaag.hidden = !waas;
    const bewerkbaar = heelHoofdstuk ? 'false' : 'true';
    if (this.el.getAttribute('contenteditable') !== bewerkbaar) this.el.setAttribute('contenteditable', bewerkbaar);
  }

  focus() {
    if (this.el.getAttribute('contenteditable') === 'true') this.el.focus({ preventScroll: true });
  }
}
