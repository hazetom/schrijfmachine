// Controlepagina voor de opslag. Raakt het manuscript niet aan.

import { db, vraagBlijvendeOpslag } from './db.js';
import { leesTekst, schrijfBestand, schrijfVeiligIn, lijstBestanden, vergeetStaat } from './folder.js';
import { nieuwId, PROJECTBESTAND, HOOFDSTUKMAP } from './store.js';

const lijst = document.getElementById('stappen');
const samenvatting = document.getElementById('samenvatting');
const TESTMAP = '.schrijfmachine-controle';
let resultaten = [];

function stap(titel) {
  const li = document.createElement('li');
  li.className = 'stap';
  li.innerHTML = '<span class="teken" aria-hidden="true">·</span><div><div class="titel"></div><div class="uitleg"></div></div>';
  li.querySelector('.titel').textContent = titel;
  lijst.appendChild(li);
  const zet = (soort, uitleg) => {
    li.className = 'stap ' + soort;
    li.querySelector('.teken').textContent = soort === 'goed' ? '✓' : soort === 'fout' ? '✗' : '!';
    li.querySelector('.uitleg').textContent = uitleg || '';
    resultaten.push({ titel, soort, uitleg });
  };
  return { goed: (u) => zet('goed', u), fout: (u) => zet('fout', u), letop: (u) => zet('let-op', u) };
}

async function bewaardeMap() {
  try { return await db.get('handles', 'map'); } catch (e) { return null; }
}

async function kiesMap() {
  if (!window.showDirectoryPicker) return null;
  const handle = await window.showDirectoryPicker({ id: 'schrijfmachine', mode: 'readwrite' });
  const p = await handle.requestPermission({ mode: 'readwrite' });
  if (p !== 'granted') throw new Error('Geen toestemming gekregen');
  const vorige = await bewaardeMap();
  let id = nieuwId();
  if (vorige && vorige.handle) {
    try { if (await vorige.handle.isSameEntry(handle)) id = vorige.id; } catch (e) { /* */ }
  }
  await db.put('handles', { handle, id, naam: handle.name, gekozen: Date.now() }, 'map');
  return { handle, id, naam: handle.name };
}

function tijd(ms) { return new Date(ms).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }); }

async function controle(rec = null) {
  lijst.innerHTML = '';
  samenvatting.hidden = true;
  resultaten = [];

  // 1. browser
  const s1 = stap('Browser kan een map gebruiken');
  const kan = typeof window.showDirectoryPicker === 'function';
  if (kan) s1.goed('Mappen kiezen en erin schrijven wordt ondersteund.');
  else s1.fout('Deze browser kan geen map kiezen. Gebruik Chrome op de Chromebook. De app werkt dan alleen met de opslag op dit apparaat.');

  // 2. map en toestemming (eerst, want toestemming vragen moet vlak na je klik)
  const s2 = stap('Map gekozen en toestemming');
  let map = null;
  if (!rec) rec = await bewaardeMap();
  if (!rec || !rec.handle) {
    s2.fout('Er is nog geen map gekozen. Klik op "Kies of wijzig de map" en kies je schrijfmap in Google Drive.');
  } else {
    try {
      let p = await rec.handle.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted') p = await rec.handle.requestPermission({ mode: 'readwrite' });
      if (p === 'granted') { map = rec.handle; s2.goed('Map "' + rec.handle.name + '", lezen en schrijven toegestaan.'); }
      else s2.fout('Geen toestemming voor map "' + rec.handle.name + '". Klik nog eens op Start en kies "Toestaan" (bij voorkeur "Bij elk bezoek toestaan").');
    } catch (e) {
      s2.fout('De map is niet bereikbaar: ' + e.message + '. Kies hem opnieuw.');
    }
  }

  // 3. vangnet
  const s3 = stap('Opslag op dit apparaat (het vangnet)');
  try {
    const proef = { t: Date.now(), tekst: 'proef ëéü' };
    await db.put('meta', proef, '__controle');
    const terug = await db.get('meta', '__controle');
    await db.del('meta', '__controle');
    if (!terug || terug.tekst !== proef.tekst) throw new Error('teruggelezen waarde klopt niet');
    const meta = await db.get('meta', 'project');
    const n = meta ? meta.volgorde.length : 0;
    const versies = (await db.getAllKeys('snapshots')).length;
    s3.goed('Schrijven en teruglezen werkt. ' + (meta ? `Op dit apparaat ${n === 1 ? 'staat 1 hoofdstuk' : 'staan ' + n + ' hoofdstukken'} en ${versies === 1 ? '1 versie' : versies + ' versies'}.` : 'Er staat nog geen manuscript op dit apparaat.'));
  } catch (e) {
    s3.fout('IndexedDB werkt niet: ' + e.message + '. Zonder dit vangnet is opslaan niet veilig; staat de browser misschien in incognito?');
  }

  // 4. blijvend
  const s4 = stap('Blijvende opslag');
  try {
    const blijvend = await vraagBlijvendeOpslag();
    let extra = '';
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      extra = ' In gebruik: ' + Math.max(1, Math.round((e.usage || 0) / 1024 / 1024)) + ' MB.';
    }
    if (blijvend) s4.goed('Chrome ruimt deze opslag niet zomaar op.' + extra);
    else s4.letop('Chrome heeft (nog) geen blijvende opslag gegeven. Installeer de app (zie README); daarna gebeurt dit meestal vanzelf. Je map in Drive blijft hoe dan ook de tweede plek.' + extra);
  } catch (e) {
    s4.letop('Kon dit niet nagaan: ' + e.message);
  }

  // 5. offline
  const s5 = stap('Werkt offline');
  try {
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
    const keys = await caches.keys();
    const c = keys.find((k) => k.startsWith('schrijfmachine-'));
    const aantal = c ? (await (await caches.open(c)).keys()).length : 0;
    if (reg && reg.active && aantal >= 20) s5.goed('De app staat in de cache (' + aantal + ' bestanden) en opent ook zonder internet.');
    else if (reg) s5.letop('Bijna: herlaad deze pagina één keer met internet, dan staat alles in de cache.');
    else s5.fout('De offline-functie is niet actief. Open de app via https (GitHub Pages) en herlaad één keer.');
  } catch (e) {
    s5.letop('Kon dit niet nagaan: ' + e.message);
  }

  if (map) {
    // 6. schrijven en teruglezen
    const s6 = stap('Schrijven en teruglezen in de map');
    const proeftekst = '# Proef\n\nEen regel met ëéü, “aanhalingstekens”, *cursief* en **vet**. 😊\n';
    try {
      const t0 = performance.now();
      await schrijfBestand(map, TESTMAP + '/proef.md', proeftekst);
      const terug = await leesTekst(map, TESTMAP + '/proef.md');
      const ms = Math.round(performance.now() - t0);
      if (terug === proeftekst) s6.goed('Bestand geschreven en precies zo teruggelezen (' + ms + ' ms).');
      else s6.fout('Teruggelezen tekst wijkt af. Gelezen: ' + JSON.stringify(terug));
    } catch (e) {
      s6.fout('Schrijven lukte niet: ' + e.message);
    }

    // 7. back-up bij wijziging van buitenaf
    const s7 = stap('Back-up als een bestand buiten de app is gewijzigd');
    try {
      const id = 'controle-' + nieuwId();
      const pad = TESTMAP + '/hoofdstuk.md';
      await schrijfVeiligIn(map, id, pad, 'versie 1 uit de app\n', [], TESTMAP + '/Back-ups');
      await schrijfBestand(map, pad, 'versie van buitenaf\n'); // alsof je het in een ander programma aanpaste
      const meldingen = [];
      await schrijfVeiligIn(map, id, pad, 'versie 2 uit de app\n', meldingen, TESTMAP + '/Back-ups');
      const nu = await leesTekst(map, pad);
      const backup = meldingen[0] ? await leesTekst(map, meldingen[0]) : null;
      await vergeetStaat(id, pad);
      if (meldingen.length === 1 && backup === 'versie van buitenaf\n' && nu === 'versie 2 uit de app\n') {
        s7.goed('De gewijzigde versie werd eerst in Back-ups gezet en pas daarna overschreven.');
      } else {
        s7.fout('Onverwacht resultaat: back-ups ' + meldingen.length + ', back-up bevat ' + JSON.stringify(backup) + ', bestand bevat ' + JSON.stringify(nu));
      }
    } catch (e) {
      s7.fout('Mislukt: ' + e.message);
    }

    // 8. na even wachten nog steeds goed
    const s8 = stap('Na even wachten nog hetzelfde');
    try {
      await new Promise((r) => setTimeout(r, 2000));
      const terug = await leesTekst(map, TESTMAP + '/proef.md');
      if (terug && terug.includes('ëéü')) s8.goed('Na 2 seconden (Drive is ondertussen bezig met synchroniseren) is het bestand nog intact.');
      else s8.fout('Het bestand is na 2 seconden veranderd of weg: ' + JSON.stringify(terug));
    } catch (e) {
      s8.fout('Mislukt: ' + e.message);
    }

    // 9. bestaand manuscript
    const s9 = stap('Manuscript in deze map');
    try {
      const json = await leesTekst(map, PROJECTBESTAND);
      if (json === null) {
        s9.letop('Er staat nog geen manuscript in deze map. Dat komt vanzelf zodra je in de app schrijft (of na "Nu opslaan" in het menu Meer).');
      } else {
        const j = JSON.parse(json);
        const bestanden = new Set(await lijstBestanden(map, HOOFDSTUKMAP));
        const mist = (j.hoofdstukken || []).filter((h) => !bestanden.has(h.bestand));
        const n = (j.hoofdstukken || []).length;
        const tekst = `${n} ${n === 1 ? 'hoofdstuk' : 'hoofdstukken'}${j.titel ? ' van "' + j.titel + '"' : ''}, laatst bijgewerkt ${tijd(j.bijgewerkt)}.`;
        if (mist.length) s9.letop(tekst + ' Nog niet als bestand aanwezig: ' + mist.map((h) => h.titel).join(', ') + '. Open de app even, dan worden ze geschreven.');
        else s9.goed(tekst + ' Elk hoofdstuk staat als Markdown-bestand in de map Hoofdstukken.');
      }
    } catch (e) {
      s9.fout('Het projectbestand is niet te lezen: ' + e.message);
    }

    // 10. opruimen + zichtbaar controlebestand voor Drive
    const s10 = stap('Controle in Google Drive');
    try {
      await map.removeEntry(TESTMAP, { recursive: true });
      const naam = 'Schrijfmachine-controle.txt';
      await schrijfBestand(map, naam, 'Controlebestand van de Schrijfmachine, gemaakt op ' + tijd(Date.now()) + '.\n\nZie je dit bestand op drive.google.com of in de Drive-app op je telefoon, dan synchroniseert je map goed.\nJe mag dit bestand gewoon weggooien.\n');
      s10.letop('Laatste stap doe je zelf: kijk over een minuut op drive.google.com (of in de Drive-app op je telefoon) in de map "' + map.name + '". Staat "' + naam + '" daar met de tijd van nu, dan komt alles goed in Drive terecht. Het testmapje is al opgeruimd.');
    } catch (e) {
      s10.fout('Opruimen of controlebestand mislukte: ' + e.message);
    }
  }

  const fouten = resultaten.filter((r) => r.soort === 'fout');
  samenvatting.hidden = false;
  samenvatting.textContent = fouten.length
    ? 'Niet alles is goed: ' + fouten.map((f) => f.titel.toLowerCase()).join(', ') + '. Je tekst blijft in elk geval op dit apparaat bewaard.'
    : 'Alles werkt. Je tekst wordt op dit apparaat bewaard' + (map ? ' en in je map "' + map.name + '"' : '') + '.';
}

document.getElementById('start').addEventListener('click', () => controle().catch((e) => {
  samenvatting.hidden = false;
  samenvatting.textContent = 'De controle liep vast: ' + e.message;
}));
document.getElementById('kies').addEventListener('click', async () => {
  try {
    const rec = await kiesMap();
    if (rec) await controle(rec);
  } catch (e) {
    if (e.name !== 'AbortError') { samenvatting.hidden = false; samenvatting.textContent = 'Map kiezen lukte niet: ' + e.message; }
  }
});

// voor de automatische tests
window.__controle = controle;
