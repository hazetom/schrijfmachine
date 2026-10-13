// Exporteren naar .docx en importeren van bestaande tekst.

import { store } from './store.js';
import { maakDocx, leesDocx, stelIndelingVoor, bouwHoofdstukken } from './docx.js';
import { blocksToMd, parseInline } from './markdown.js';
import { schrijfInMap, mapInfo } from './folder.js';
import { maakSnapshot } from './snapshots.js';
import { el, dialoog, getal } from './ui.js';

function stempel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

function veiligeNaam(s) {
  return (s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export async function exporteer() {
  await store.bewaarLokaal();
  const titel = store.meta.titel;
  const blob = await maakDocx({ titel, hoofdstukken: store.lijst().map((h) => ({ titel: h.titel, md: h.md })) });
  const naam = (veiligeNaam(titel) || 'Manuscript') + ' ' + stempel() + '.docx';
  let inMap = false;
  try { inMap = await schrijfInMap(naam, blob); } catch (e) { inMap = false; }
  if (!inMap) {
    const a = el('a', { href: URL.createObjectURL(blob), download: naam });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const m = mapInfo();
  await dialoog({
    titel: 'Manuscript geëxporteerd',
    inhoud: [
      inMap
        ? `"${naam}" staat in je map ${m.naam}.`
        : `"${naam}" is gedownload (er is nu geen map gekoppeld).`,
      el('p', { class: 'klein', text: `${store.lijst().length} hoofdstukken, ${getal(store.totaalWoorden())} woorden. Open het in Google Drive met "Openen met > Google Documenten".` }),
    ],
    knoppen: [{ tekst: 'Klaar', waarde: true, hoofd: true }],
  });
  return naam;
}

// ---------- importeren ----------

// Markdown of platte tekst omzetten naar dezelfde alinea-lijst als een .docx.
function tekstNaarAlineas(tekst, isMarkdown) {
  const uit = [];
  const regels = tekst.replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  const klaar = () => {
    if (!para.length) return;
    const t = para.join(' ').trim();
    para = [];
    if (!t) return;
    uit.push({ niveau: null, runs: isMarkdown ? parseInline(t) : [{ t, b: false, i: false }] });
  };
  for (const r of regels) {
    const regel = r.trim();
    if (!regel) { klaar(); continue; }
    if (isMarkdown) {
      const m = /^(#{1,6})\s+(.*)$/.exec(regel);
      if (m) { klaar(); uit.push({ niveau: m[1].length, runs: parseInline(m[2]) }); continue; }
      if (/^<!--.*-->$/.test(regel)) continue;
    }
    if (!isMarkdown) { para.push(regel); klaar(); continue; }
    para.push(regel);
  }
  klaar();
  return uit;
}

export async function importeerBestand(bestand) {
  const naam = bestand.name.toLowerCase();
  let alineas;
  try {
    if (naam.endsWith('.docx')) alineas = await leesDocx(await bestand.arrayBuffer());
    else alineas = tekstNaarAlineas(await bestand.text(), /\.(md|markdown)$/.test(naam));
  } catch (e) {
    await dialoog({ titel: 'Dit bestand kan ik niet lezen', inhoud: [String(e && e.message || e)], knoppen: [{ tekst: 'Jammer', waarde: null, hoofd: true }] });
    return null;
  }
  if (!alineas.length) {
    await dialoog({ titel: 'Geen tekst gevonden', inhoud: ['In dit bestand staat geen tekst die ik kan importeren.'], knoppen: [{ tekst: 'Oké', waarde: null, hoofd: true }] });
    return null;
  }
  const rijen = stelIndelingVoor(alineas);
  const samenvatting = el('p', { class: 'klein' });
  const werkSamenvatting = () => {
    const h = bouwHoofdstukken(rijen, blocksToMd);
    samenvatting.textContent = `Dit worden ${h.length} ${h.length === 1 ? 'hoofdstuk' : 'hoofdstukken'}: ` + h.map((x) => x.titel).slice(0, 8).join(', ') + (h.length > 8 ? ', …' : '') + '.';
  };
  const lijst = el('div', { class: 'lijst' });
  const opties = [['hoofdstuk', 'Hoofdstuk'], ['kop', 'Kopje'], ['tekst', 'Tekst'], ['scene', 'Scène'], ['overslaan', 'Overslaan']];
  rijen.forEach((r) => {
    const sel = el('select', { 'aria-label': 'Soort' });
    for (const [v, t] of opties) sel.append(el('option', { value: v, text: t }));
    sel.value = r.soort;
    const rij = el('div', { class: 'lijst-rij soort-' + r.soort }, sel, el('span', { class: 'groei', text: r.tekst.slice(0, 110) }));
    sel.addEventListener('change', () => { r.soort = sel.value; rij.className = 'lijst-rij soort-' + r.soort; werkSamenvatting(); });
    lijst.appendChild(rij);
  });
  werkSamenvatting();
  const leeg = store.isLeeg();
  const ok = await dialoog({
    titel: 'Tekst importeren',
    breed: true,
    inhoud: [
      el('p', { text: 'Ik heb een voorstel gemaakt voor de indeling. Controleer vooral welke regels een nieuw hoofdstuk beginnen en welke een kopje binnen een hoofdstuk zijn. Vet en cursief blijven behouden.' }),
      lijst,
      samenvatting,
      el('p', { class: 'klein', text: leeg ? 'De hoofdstukken komen in je (nog lege) manuscript.' : 'De hoofdstukken komen achter je bestaande hoofdstukken. Er wordt eerst een versie gemaakt, zodat je terug kunt.' }),
    ],
    knoppen: [{ tekst: 'Annuleer', waarde: false }, { tekst: 'Importeer', waarde: true, hoofd: true }],
  });
  if (!ok) return null;
  const hoofdstukken = bouwHoofdstukken(rijen, blocksToMd);
  await store.bewaarLokaal();
  await maakSnapshot('vlak voor importeren van ' + bestand.name);
  const oudeIds = [...store.meta.volgorde];
  let eersteId = null;
  for (const h of hoofdstukken) {
    const id = store.nieuwHoofdstuk(null, h.titel, { md: h.md, status: 'Concept' });
    if (!eersteId) eersteId = id;
  }
  // het lege beginhoofdstuk is niet meer nodig
  if (leeg) for (const id of oudeIds) store.verwijderHoofdstuk(id);
  store.zetHuidig(eersteId);
  await store.bewaarLokaal();
  return { aantal: hoofdstukken.length, eersteId };
}
