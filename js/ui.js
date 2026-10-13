// Kleine hulpjes voor de interface: dialogen en opmaak van tijd en getallen.

export function el(tag, attrs = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kinderen.flat()) {
    if (k == null || k === false) continue;
    e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return e;
}

let open = null;

// knoppen: [{ tekst, waarde, hoofd: true }]. Geeft de waarde terug, of null bij Esc.
export function dialoog({ titel, inhoud = [], knoppen = [{ tekst: 'Sluiten', waarde: null }], breed = false, opOpen = null }) {
  const d = document.getElementById('dialoog');
  if (open) { open(null); }
  d.innerHTML = '';
  d.style.width = breed ? 'min(760px, 92vw)' : '';
  if (titel) d.appendChild(el('h2', { text: titel }));
  for (const x of [].concat(inhoud)) if (x) d.appendChild(typeof x === 'string' ? el('p', { text: x }) : x);
  const rij = el('div', { class: 'dlg-knoppen' });
  return new Promise((resolve) => {
    const klaar = (waarde) => {
      open = null;
      if (d.open) d.close();
      resolve(waarde);
    };
    open = klaar;
    for (const k of knoppen) {
      const b = el('button', { class: 'knop' + (k.hoofd ? ' omlijnd' : ''), text: k.tekst, type: 'button' });
      b.addEventListener('click', async () => {
        if (k.check) { const ok = await k.check(); if (!ok) return; }
        klaar(typeof k.waarde === 'function' ? k.waarde() : k.waarde);
      });
      rij.appendChild(b);
    }
    d.appendChild(rij);
    d.oncancel = (e) => { e.preventDefault(); klaar(null); };
    d.showModal();
    const hoofd = rij.querySelector('.omlijnd');
    const eersteVeld = d.querySelector('input, select, textarea');
    (eersteVeld || hoofd || rij.lastChild)?.focus();
    if (opOpen) opOpen(d, klaar);
  });
}

export function dialoogOpen() {
  return !!open;
}

export function sluitDialoog() {
  if (open) open(null);
}

export function tijd(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

export function datumTijd(ms) {
  const d = new Date(ms);
  const vandaag = new Date();
  const gisteren = new Date(Date.now() - 864e5);
  const t = tijd(ms);
  if (d.toDateString() === vandaag.toDateString()) return 'vandaag ' + t;
  if (d.toDateString() === gisteren.toDateString()) return 'gisteren ' + t;
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' }) + ' ' + t;
}

export function getal(n) {
  return (n || 0).toLocaleString('nl-NL');
}

export function woorden(n) {
  return getal(n) + (n === 1 ? ' woord' : ' woorden');
}
