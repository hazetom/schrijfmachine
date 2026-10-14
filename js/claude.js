// "Klaar voor Claude": zet een stuk tekst met precies jouw vraag op het klembord,
// om te plakken in je Claude-project. Geen API, geen kosten buiten je abonnement.

import { store } from './store.js';
import { mdToBlocks, runsToMd, countWords } from './markdown.js';
import { el } from './ui.js';
import { lees, zet } from './instellingen.js';
import { aanwezig, tijdlijn } from './personages.js';

export const CHECKS = [
  { key: 'correctie', titel: 'Correctie', uitleg: 'Spelling, grammatica, interpunctie. Alleen echte fouten.',
    prompt: 'Correctie: wijs echte fouten aan in spelling, grammatica en interpunctie. Geen stijlkeuzes.' },
  { key: 'stijl', titel: 'Stijl en ritme', uitleg: 'Actief, vlot, strak. Herhaling, zinslengte, dialogen die klinken als echte spraak.',
    prompt: 'Stijl en ritme: waar kan het actiever, vlotter of strakker? Let op herhaling, overbodige woorden en zinslengte, en of dialogen klinken als echte spraak met een eigen stem per personage.' },
  { key: 'scene', titel: 'De scène', uitleg: 'Doet dit stuk zijn werk? Doel, spanning, tempo, laten zien, perspectief.',
    prompt: 'De scène: doet dit stuk zijn werk? Kijk naar het scènedoel, spanning en tempo, laten zien in plaats van vertellen, en of het perspectief zuiver blijft.' },
  { key: 'verhaal', titel: 'Verhaal en samenhang', uitleg: 'Logica, plot, continuïteit, personages consistent. Vanaf een heel hoofdstuk.',
    prompt: 'Verhaal en samenhang: klopt de logica, loopt de plot, kloppen feiten, tijden en namen met wat eerder gebeurde, en gedragen personages zich consistent?' },
  { key: 'lezer', titel: 'Als lezer', uitleg: 'Wat voel je, waar haak je af, wat verwacht je, geef ik te veel weg?',
    prompt: 'Als lezer: lees dit als eerste lezer van een thriller. Wat voel je, waar haak je af, wat denk je dat er gaat gebeuren, wat is onduidelijk, en geef ik te veel of juist te weinig weg?' },
];

export const INGRIJPEN = [
  { key: 'aanwijzen', titel: 'Aanwijzen: ik herschrijf zelf',
    prompt: 'Wijs aan wat er schuurt en waarom, met het alineanummer. Geef geen herschreven tekst; ik herschrijf zelf.' },
  { key: 'voorstellen', titel: 'Voorstellen per zin',
    prompt: 'Geef per punt het alineanummer, wat er schuurt en waarom, en een concreet alternatief voor alleen die zin of dat zinsdeel (citaat, dan je voorstel). Herschrijf niet het hele stuk.' },
  { key: 'herschrijven', titel: 'Herschrijven met uitleg',
    prompt: 'Geef een bewerkte versie van het hele stuk, met dezelfde alineanummers. Zet daaronder kort wat je veranderde en waarom.' },
];

export const PROJECT_INSTRUCTIES = `Je bent mijn redacteur en eerste lezer voor mijn Nederlandstalige thriller. Ik stuur je stukken vanuit mijn schrijfapp, steeds met een lijstje van wat ik wil weten en hoe ver je mag ingrijpen. Houd je daaraan.

Hoe je werkt:
- Eerlijk en direct. Geen complimenten om het complimenteren. Noem wat goed werkt alleen als ik moet weten dat ik het moet houden.
- Belangrijkste eerst. Liever vijf punten die ertoe doen dan twintig kleine.
- Bewaak mijn stem. Korte fragmenten, herhaling als stijlmiddel en spreektaal in dialogen zijn vaak bewuste keuzes. Laat die staan of benoem ze hooguit als vraag. Trek mijn tekst niet glad.
- Blijf bij wat ik vraag. Vraag ik alleen om correctie, geef dan geen plotadvies.
- Verwijs altijd met de alineanummers uit de tekst (A12), zodat ik het terugvind. In mijn app springt Ctrl+F met "A12" naar die alinea.
- Verzin geen feiten over mijn verhaal. Blijkt iets niet uit de tekst of de context, vraag het of zeg dat je het niet weet.
- Schrijf in het Nederlands. Gebruik geen gedachtestreepjes (lange streepjes); die passen niet bij mijn stijl.
- Houd je antwoord compact: korte kopjes en punten, geen inleiding of afsluitend praatje.

Wat je krijgt: de tekst met alineanummers, soms context (scènedoel, personagekaarten, samenvatting van het vorige hoofdstuk) en per keer wat ik wil weten. Vraag ik om een samenvatting of een personagekaart, geef die dan zonder inleiding, zodat ik hem zo in mijn app kan plakken.`;

// ---------- tekst met alineanummers ----------
function genummerd(md, alleen = null) {
  const regels = [];
  let a = 0;
  for (const b of mdToBlocks(md)) {
    if (b.type === 'scene') { if (!alleen) regels.push('* * *'); continue; }
    a++;
    if (alleen && !alleen.has(a)) continue;
    const tekst = runsToMd(b.runs);
    regels.push(`[A${a}] ` + (b.type === 'h' ? '(kopje) ' : '') + tekst);
  }
  return regels.join('\n\n');
}

// alineanummer (A-nummer, vanaf 1) bij blok-index in een hoofdstuk
export function alineaVanBlok(md, blok) {
  let a = 0;
  const blocks = mdToBlocks(md);
  for (let i = 0; i <= blok && i < blocks.length; i++) if (blocks[i].type !== 'scene') a++;
  return a;
}
export function blokVanAlinea(md, alinea) {
  let a = 0;
  const blocks = mdToBlocks(md);
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === 'scene') continue;
    a++;
    if (a === alinea) return i;
  }
  return null;
}

function kop(h) {
  const deel = store.deelVan(h.id);
  return [deel ? deel.titel : null, store.label(h.id), h.titel || 'Zonder titel'].filter(Boolean).join(' · ');
}

function personageKaartKort(p) {
  const tekst = (p.md || '').replace(/\s+/g, ' ').trim();
  return `- ${p.naam}${p.sub ? ' (' + p.sub + ')' : ''}${tekst ? ': ' + (tekst.length > 400 ? tekst.slice(0, 400) + '…' : tekst) : ''}`;
}

async function naarKlembord(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch (e) {
    const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } });
    t.value = tekst;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

const STANDAARD = { checks: ['correctie', 'stijl'], ingrijpen: 'voorstellen', bereik: 'hoofdstuk', bron: 'volledig', context: ['doel', 'personages'], samenvatting: false };

export class Claude {
  constructor({ huidigeSelectie, voorKlaar }) {
    this.paneel = document.getElementById('claudepaneel');
    this.huidigeSelectie = huidigeSelectie; // () => { blokken:[{blok,start,eind,heel}] } | null
    this.voorKlaar = voorKlaar;             // editor bewaren
    this.selectie = null;
  }

  get open() { return !this.paneel.hidden; }

  keuzes() { return { ...STANDAARD, ...(lees('claude') || {}) }; }
  bewaarKeuzes(k) { zet('claude', k); }

  toon() {
    this.voorKlaar();
    this.selectie = this.huidigeSelectie();
    const k = this.keuzes();
    if (this.selectie) k.bereik = 'selectie';
    else if (k.bereik === 'selectie') k.bereik = 'hoofdstuk';
    this.render(k);
    this.paneel.hidden = false;
    const eerste = this.paneel.querySelector('select, input');
    if (eerste) eerste.focus();
  }

  sluit() {
    this.paneel.hidden = true;
    document.getElementById('tekst').focus({ preventScroll: true });
  }

  render(k) {
    const p = this.paneel;
    p.innerHTML = '';
    const h = store.huidig();
    const deel = store.deelVan(h.id);
    const opslaan = () => { const c = { ...k }; if (c.bereik === 'selectie') c.bereik = 'hoofdstuk'; this.bewaarKeuzes(c); this.werkInfo(k); };

    // bereik
    const bereik = el('select', { 'aria-label': 'Wat moet er mee' });
    if (this.selectie) bereik.append(el('option', { value: 'selectie', text: 'Mijn selectie' }));
    bereik.append(el('option', { value: 'hoofdstuk', text: 'Dit hoofdstuk' }));
    if (deel) bereik.append(el('option', { value: 'deel', text: 'Dit deel: ' + (deel.titel || 'Zonder titel') }));
    bereik.append(el('option', { value: 'boek', text: 'Het hele boek' }));
    if (![...bereik.options].some((o) => o.value === k.bereik)) k.bereik = 'hoofdstuk';
    bereik.value = k.bereik;
    const bron = el('select', { 'aria-label': 'Volledige tekst of samenvattingen' },
      el('option', { value: 'volledig', text: 'Volledige tekst' }),
      el('option', { value: 'samenvattingen', text: 'Samenvattingen en scènedoelen' }));
    bron.value = k.bron;
    const bronRij = el('div', { class: 'cl-rij' }, bron);

    // vinkjes
    const vinkjes = CHECKS.map((c) => {
      const v = el('input', { type: 'checkbox', value: c.key });
      v.checked = k.checks.includes(c.key);
      v.addEventListener('change', () => { k.checks = CHECKS.map((x) => x.key).filter((key) => p.querySelector(`input[value="${key}"]`).checked); opslaan(); });
      return el('label', { class: 'cl-vink', 'data-key': c.key }, v, el('span', {}, el('span', { class: 'cl-vink-titel', text: c.titel }), el('span', { class: 'cl-uitleg', text: c.uitleg })));
    });
    const samen = el('input', { type: 'checkbox' });
    samen.checked = !!k.samenvatting;
    samen.addEventListener('change', () => { k.samenvatting = samen.checked; opslaan(); });
    const samenLabel = el('label', { class: 'cl-vink' }, samen, el('span', {}, el('span', { class: 'cl-vink-titel', text: 'Samenvatting maken' }), el('span', { class: 'cl-uitleg', text: 'Claude sluit af met 3 tot 5 zinnen die je in het veld Samenvatting plakt.' })));

    const vraag = el('textarea', { rows: '2', placeholder: 'Eigen vraag (mag leeg)', 'aria-label': 'Eigen vraag', class: 'cl-vraag' });
    vraag.addEventListener('input', () => this.werkInfo(k));

    const ingrijpen = el('select', { 'aria-label': 'Hoe ver mag Claude ingrijpen' }, ...INGRIJPEN.map((x) => el('option', { value: x.key, text: x.titel })));
    ingrijpen.value = k.ingrijpen;
    ingrijpen.addEventListener('change', () => { k.ingrijpen = ingrijpen.value; opslaan(); });

    const ctxVink = (key, tekst) => {
      const v = el('input', { type: 'checkbox' });
      v.checked = k.context.includes(key);
      v.addEventListener('change', () => { k.context = k.context.filter((x) => x !== key).concat(v.checked ? [key] : []); opslaan(); });
      return el('label', { class: 'cl-ctx' }, v, ' ' + tekst);
    };

    this.info = el('p', { class: 'cl-info' });
    this.melding = el('p', { class: 'cl-melding', role: 'status' });
    const knop = el('button', { class: 'knop omlijnd', text: 'Klaar voor Claude', onclick: async () => {
      k.vraag = vraag.value.trim();
      const tekst = this.bouw(k);
      const ok = await naarKlembord(tekst);
      this.melding.textContent = ok ? 'Gekopieerd. Plak het in je Claude-project.' : 'Kopiëren lukte niet; probeer het nog eens.';
    } });
    const instr = el('button', { class: 'knop link', text: 'Projectinstructies kopiëren', onclick: async () => {
      const ok = await naarKlembord(PROJECT_INSTRUCTIES);
      this.melding.textContent = ok ? 'Projectinstructies gekopieerd. Plak ze in je Claude-project bij Instructies.' : 'Kopiëren lukte niet.';
    } });

    bereik.addEventListener('change', () => { k.bereik = bereik.value; opslaan(); this.pasAan(k); });
    bron.addEventListener('change', () => { k.bron = bron.value; opslaan(); this.pasAan(k); });

    p.append(
      el('div', { class: 'cl-kop' }, el('h2', { text: 'Klaar voor Claude' }), el('button', { class: 'knop', 'aria-label': 'Sluiten', title: 'Sluiten (Esc)', text: '×', style: { fontSize: '20px' }, onclick: () => this.sluit() })),
      el('div', { class: 'cl-blok' }, el('span', { class: 'cl-label', text: 'Wat moet er mee' }), el('div', { class: 'cl-rij' }, bereik), bronRij,
        el('div', { class: 'cl-ctx-rij' }, ctxVink('doel', 'Scènedoel'), ctxVink('personages', 'Personages die erin voorkomen'), ctxVink('vorige', 'Samenvatting vorig hoofdstuk'))),
      el('div', { class: 'cl-blok' }, el('span', { class: 'cl-label', text: 'Wat wil je weten' }), ...vinkjes, samenLabel, vraag),
      el('div', { class: 'cl-blok' }, el('span', { class: 'cl-label', text: 'Hoe ver mag Claude gaan' }), el('div', { class: 'cl-rij' }, ingrijpen)),
      el('div', { class: 'cl-voet' }, this.info, knop, this.melding, instr),
    );
    this.bronRij = bronRij;
    this.samenLabel = samenLabel;
    this.pasAan(k);
    p.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.sluit(); } };
  }

  // wat kan bij welk bereik
  pasAan(k) {
    const groot = k.bereik === 'deel' || k.bereik === 'boek';
    this.bronRij.hidden = !groot;
    const samenvattingen = groot && k.bron === 'samenvattingen';
    for (const lab of this.paneel.querySelectorAll('.cl-vink[data-key]')) {
      const key = lab.dataset.key;
      let uit = false;
      if (key === 'verhaal' && k.bereik === 'selectie') uit = true;
      if (samenvattingen && (key === 'correctie' || key === 'stijl' || key === 'scene')) uit = true;
      lab.classList.toggle('uit', uit);
      lab.querySelector('input').disabled = uit;
    }
    this.samenLabel.hidden = k.bereik !== 'hoofdstuk';
    this.werkInfo(k);
  }

  werkInfo(k) {
    if (!this.info) return;
    const vraag = this.paneel.querySelector('.cl-vraag');
    const tekst = this.bouw({ ...k, vraag: vraag ? vraag.value.trim() : '' });
    const w = countWords(tekst);
    this.info.textContent = `Ongeveer ${w.toLocaleString('nl-NL')} woorden (± ${Math.round(w * 1.6 / 100) * 100 || 100} tokens).`;
    if (this.melding) this.melding.textContent = '';
  }

  // ---------- het verzoek opbouwen ----------
  bouw(k) {
    const h = store.huidig();
    const deel = store.deelVan(h.id);
    const groot = k.bereik === 'deel' || k.bereik === 'boek';
    const samenvattingen = groot && k.bron === 'samenvattingen';
    const actief = CHECKS.filter((c) => k.checks.includes(c.key))
      .filter((c) => !(c.key === 'verhaal' && k.bereik === 'selectie'))
      .filter((c) => !(samenvattingen && ['correctie', 'stijl', 'scene'].includes(c.key)));
    const titel = store.meta.titel || 'mijn thriller';
    const delen = [];

    // welke hoofdstukken
    let hoofdstukken = [h];
    if (k.bereik === 'deel' && deel) {
      hoofdstukken = [];
      let binnen = false;
      for (const r of store.rijen()) {
        if (r.soort === 'deel') { binnen = r.deel.id === deel.id; continue; }
        if (binnen) hoofdstukken.push(r.h);
      }
    } else if (k.bereik === 'boek') hoofdstukken = store.lijst();

    const wat = k.bereik === 'selectie' ? 'een stuk uit ' + kop(h)
      : k.bereik === 'hoofdstuk' ? kop(h)
        : k.bereik === 'deel' ? 'het deel ' + (deel ? deel.titel : '') + (samenvattingen ? ' (samenvattingen per hoofdstuk)' : '')
          : 'het hele boek' + (samenvattingen ? ' (samenvattingen per hoofdstuk)' : '');
    delen.push(`# Verzoek uit mijn schrijfapp\nBoek: ${titel}\nWat je krijgt: ${wat}`);

    const vragen = actief.map((c) => '- ' + c.prompt);
    if (k.samenvatting && k.bereik === 'hoofdstuk') vragen.push('- Samenvatting: sluit af met 3 tot 5 zinnen onder het kopje "Samenvatting voor de app". Alleen wat er gebeurt, geen oordeel.');
    if (k.vraag) vragen.push('- Mijn eigen vraag: ' + k.vraag);
    if (!vragen.length) vragen.push('- Geef je belangrijkste indrukken.');
    delen.push('## Wat ik wil weten\n' + vragen.join('\n'));
    if (actief.length) {
      const ing = INGRIJPEN.find((x) => x.key === k.ingrijpen) || INGRIJPEN[1];
      delen.push('## Hoe ver je mag ingrijpen\n' + ing.prompt + '\nBegin met de drie belangrijkste punten, daarna de rest op volgorde van de tekst.');
    }

    // context
    const ctx = [];
    if (k.context.includes('doel') && !groot && h.doel && h.doel.trim()) ctx.push('Scènedoel: ' + h.doel.trim());
    if (k.context.includes('vorige') && !groot) {
      const v = store.meta.volgorde;
      const vorige = store.hoofdstuk(v[v.indexOf(h.id) - 1]);
      if (vorige && vorige.samenvatting && vorige.samenvatting.trim()) ctx.push('Samenvatting vorig hoofdstuk (' + kop(vorige) + '): ' + vorige.samenvatting.trim());
    }
    if (k.context.includes('personages')) {
      const gezien = new Map();
      for (const x of hoofdstukken) for (const a of aanwezig(x)) gezien.set(a.persoon.id, a.persoon);
      if (gezien.size) ctx.push('Personages die erin voorkomen:\n' + [...gezien.values()].map(personageKaartKort).join('\n'));
    }
    if (ctx.length) delen.push('## Context\n' + ctx.join('\n\n'));

    // de tekst
    if (k.bereik === 'selectie' && this.selectie) {
      const nummers = new Set(this.selectie.alineas);
      let tekst;
      if (this.selectie.deel) tekst = `[A${this.selectie.alineas[0]}, een deel ervan] ` + this.selectie.deel;
      else tekst = genummerd(h.md, nummers);
      delen.push('## De tekst\n### ' + kop(h) + '\n\n' + tekst);
    } else if (samenvattingen) {
      const regels = [];
      for (const r of store.rijen()) {
        if (r.soort === 'deel') { if (k.bereik === 'boek') regels.push('## ' + (r.deel.titel || 'Deel')); continue; }
        if (!hoofdstukken.includes(r.h)) continue;
        const x = r.h;
        regels.push('### ' + kop(x) + '\n' + (x.samenvatting && x.samenvatting.trim() ? x.samenvatting.trim() : '(nog geen samenvatting)') + (x.doel && x.doel.trim() ? '\nScènedoel: ' + x.doel.trim() : ''));
      }
      delen.push('## Samenvattingen\n' + regels.join('\n\n'));
    } else {
      const stukken = hoofdstukken.map((x) => '### ' + kop(x) + '\n\n' + genummerd(x.md));
      delen.push('## De tekst\n' + stukken.join('\n\n'));
    }
    return delen.join('\n\n') + '\n';
  }
}

// Verzoek om een personagekaart bij te werken, met alleen de passages waarin hij of zij voorkomt.
export function personageVerzoek(p) {
  const lijn = tijdlijn(p.id);
  const passages = lijn.map(({ h, momenten }) => {
    const gezien = new Set();
    const regels = [];
    for (const m of momenten) {
      if (gezien.has(m.zin)) continue;
      gezien.add(m.zin);
      regels.push(`- [A${alineaVanBlok(h.md, m.blok)}] ${m.zin}`);
    }
    return '### ' + kop(h) + '\n' + regels.join('\n');
  });
  const namen = [p.naam, ...(p.aliassen || [])].join(', ');
  return `# Verzoek uit mijn schrijfapp: personagekaart bijwerken
Personage: ${p.naam}${p.sub ? ' (' + p.sub + ')' : ''}
Ook genoemd als: ${namen}

## Huidige kaart
${(p.md || '').trim() || '(nog leeg)'}

## Wat ik wil
Maak een bijgewerkte personagekaart op basis van de passages hieronder. Gebruik korte punten onder deze kopjes: Wie, Wil, Verbergt, Wat ${p.naam.split(' ')[0]} meemaakt (één regel per hoofdstuk), Relaties, Opvallend (gewoontes, manier van praten). Alleen wat uit de tekst blijkt; zet een vermoeden er als vermoeden bij. Geen inleiding: ik plak je antwoord zo in de kaart.

## Passages (${lijn.reduce((n, x) => n + x.momenten.length, 0)} keer genoemd)
${passages.join('\n\n') || '(nog nergens gevonden)'}
`;
}

export { naarKlembord };
