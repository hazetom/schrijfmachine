// Aantekeningen in de tekst: "checken: was dit dinsdag?" op een plek in een hoofdstuk.
// Ze staan los van de tekst zelf (in schrijfmachine.json), dus ze gaan nooit mee in de export
// en tellen niet mee in het aantal woorden. Een aantekening onthoudt het woord of stukje tekst
// waar hij bij hoort (het anker); schuift de tekst op, dan zoekt de app dat stukje weer terug.

import { store } from './store.js';
import { mdToBlocks } from './markdown.js';

const tekstVan = (b) => (b.type === 'scene' ? '' : b.runs.map((r) => r.t).join(''));

// Waar staat deze aantekening nu? Krijgt de teksten van de blokken; geeft { blok, start, lengte } of null.
export function plaatsIn(teksten, a) {
  if (!teksten.length) return null;
  if (!a.anker) {
    const blok = Math.max(0, Math.min(a.blok, teksten.length - 1));
    return { blok, start: 0, lengte: 0 };
  }
  let beste = null;
  teksten.forEach((t, i) => {
    let k = t.indexOf(a.anker);
    while (k >= 0) {
      const afstand = Math.abs(i - a.blok) * 100000 + (i === a.blok ? Math.abs(k - a.teken) : 0);
      if (!beste || afstand < beste.afstand) beste = { blok: i, start: k, lengte: a.anker.length, afstand };
      k = t.indexOf(a.anker, k + 1);
    }
  });
  if (!beste) return null;
  // stilletjes bijwerken, zodat de volgende keer meteen de goede plek gevonden wordt
  a.blok = beste.blok;
  a.teken = beste.start;
  return { blok: beste.blok, start: beste.start, lengte: beste.lengte };
}

export function plaatsInHoofdstuk(h, a) {
  return plaatsIn(mdToBlocks(h.md).map(tekstVan), a);
}

// Een kort stukje tekst rond de aantekening, voor in lijsten.
export function fragment(h, a) {
  const teksten = mdToBlocks(h.md).map(tekstVan);
  const p = plaatsIn(teksten, a);
  if (!p) return a.anker ? '"' + a.anker + '" (staat niet meer in de tekst)' : '';
  const t = teksten[p.blok];
  const van = Math.max(0, p.start - 40), tot = Math.min(t.length, p.start + p.lengte + 40);
  return (van > 0 ? '…' : '') + t.slice(van, tot).trim() + (tot < t.length ? '…' : '');
}

export function openAantekeningen() {
  return store.alleAantekeningen().filter((x) => !x.a.klaar);
}

// Het woord rond een positie, als er niets geselecteerd is.
export function woordRond(tekst, pos) {
  const isL = (c) => c && /[\p{L}\p{N}'’-]/u.test(c);
  let a = pos, b = pos;
  if (!isL(tekst[a]) && isL(tekst[a - 1])) a = b = pos - 1;
  if (!isL(tekst[a])) {
    // naar het volgende woord
    while (a < tekst.length && !isL(tekst[a])) a++;
    b = a;
  }
  while (a > 0 && isL(tekst[a - 1])) a--;
  while (b < tekst.length && isL(tekst[b])) b++;
  return { start: a, anker: tekst.slice(a, b) };
}
