// Automatische tests in een headless Chromium.
// Starten: python3 -m http.server 8123 (in de repo-map) en dan: node tests/app.test.mjs
// Optioneel: IMPORT_DOCX=/pad/naar/tekst.docx voor de importtest met echte tekst.

import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASIS = process.env.BASIS || 'http://127.0.0.1:8123/';
const UIT = new URL('../test-output/', import.meta.url).pathname;
fs.mkdirSync(UIT, { recursive: true });

const browser = await chromium.launch();
let geslaagd = 0, mislukt = 0;
const fouten = [];

async function test(naam, fn) {
  if (process.env.ALLEEN && !naam.includes(process.env.ALLEEN)) return;
  const t0 = Date.now();
  try {
    await fn();
    geslaagd++;
    console.log('  ok  ' + naam + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  } catch (e) {
    mislukt++;
    fouten.push(naam);
    console.log('  FOUT ' + naam + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, process.env.ALLEEN ? 60 : 6).join('\n       '));
  }
}

async function nieuweContext(viewport = { width: 1280, height: 720 }) {
  return browser.newContext({ viewport, acceptDownloads: true });
}

async function open(ctx, mapnaam, extra = '') {
  const p = await ctx.newPage();
  p.fouten = [];
  p.on('pageerror', (e) => p.fouten.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.fouten.push('console: ' + m.text()); });
  await p.goto(BASIS + 'index.html?geenwelkom=1' + (mapnaam ? '&testmap=opfs&mapnaam=' + mapnaam : '') + extra);
  await p.waitForFunction(() => window.__schrijfmachine && document.getElementById('status-tekst').textContent.startsWith('Opgeslagen'), null, { timeout: 10000 });
  await p.waitForTimeout(150);
  return p;
}

const caret = (p) => p.evaluate(async () => {
  // meten zoals het op het scherm komt: na het volgende frame
  await new Promise((r) => requestAnimationFrame(() => r()));
  const e = window.__schrijfmachine.editor;
  const sel = getSelection();
  if (!sel.rangeCount) return { geen: true };
  const r = document.createRange();
  r.setStart(sel.focusNode, sel.focusOffset);
  let rects = [...r.getClientRects()];
  let rect = rects[rects.length - 1];
  if (!rect || (rect.width === 0 && rect.height === 0 && rect.left === 0)) {
    let n = sel.focusNode.nodeType === 3 ? sel.focusNode.parentElement : sel.focusNode;
    if (n === e.el) n = e.el.childNodes[Math.min(sel.focusOffset, e.el.childNodes.length - 1)];
    const rs = n.getClientRects();
    rect = sel.focusOffset > 0 && rs.length ? rs[rs.length - 1] : rs[0];
  }
  const er = e.kader.getBoundingClientRect();
  const zichtbaar = rect.left >= er.left - 2 && rect.left <= er.right + 2 && rect.top >= er.top - 2 && rect.bottom <= er.bottom + 2;
  const tx = new DOMMatrixReadOnly(getComputedStyle(e.el).transform).m41;
  const scrolls = [e.kader.scrollLeft, document.scrollingElement.scrollLeft, document.getElementById('app').scrollLeft, document.querySelector('.blad').scrollLeft];
  return { pagina: e.pagina, aantal: e.aantal, tx, stap: e.stap(), zichtbaar, x: rect.left, y: rect.top, opRaster: Math.abs(tx + e.pagina * e.stap()) < 1 && scrolls.every((x) => x === 0) };
});

async function verwachtZichtbaar(p, wat) {
  const c = await caret(p);
  assert.ok(c.zichtbaar, wat + ': cursor niet zichtbaar ' + JSON.stringify(c));
  assert.ok(c.opRaster, wat + ': pagina staat niet recht ' + JSON.stringify(c));
  return c;
}

const opfsLees = (p, mapnaam, pad) => p.evaluate(async ([mapnaam, pad]) => {
  let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(mapnaam);
  const delen = pad.split('/');
  try {
    for (const x of delen.slice(0, -1)) d = await d.getDirectoryHandle(x);
    return await (await (await d.getFileHandle(delen[delen.length - 1])).getFile()).text();
  } catch (e) { return null; }
}, [mapnaam, pad]);

const opfsSchrijf = (p, mapnaam, pad, tekst) => p.evaluate(async ([mapnaam, pad, tekst]) => {
  let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(mapnaam, { create: true });
  const delen = pad.split('/');
  for (const x of delen.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true });
  const w = await (await d.getFileHandle(delen[delen.length - 1], { create: true })).createWritable();
  await w.write(tekst); await w.close();
}, [mapnaam, pad, tekst]);

const opfsLijst = (p, mapnaam, sub) => p.evaluate(async ([mapnaam, sub]) => {
  try {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(mapnaam);
    if (sub) d = await d.getDirectoryHandle(sub);
    const n = [];
    for await (const [k] of d.entries()) n.push(k);
    return n.sort();
  } catch (e) { return []; }
}, [mapnaam, sub]);

const wachtOpslag = async (p) => {
  await p.waitForTimeout(400);
  await p.evaluate(async () => { const s = window.__schrijfmachine; s.editor.bewaar(); s.notities.bewaar(); await s.store.bewaarLokaal(); await s.map.syncNu(); });
};

const md = (p) => p.evaluate(() => window.__schrijfmachine.store.huidig().md);

const ZIN = 'De trap naar beneden telde dertien treden en hij telde ze opnieuw, alsof het getal deze keer anders kon uitvallen. ';

console.log('Schrijfmachine tests');

// ---------------------------------------------------------------- bladeren
await test('bladeren: typen over paginagrenzen, cursor blijft zichtbaar', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'blad1');
  for (let a = 0; a < 7; a++) {
    for (let z = 0; z < 3; z++) {
      await p.keyboard.type(ZIN);
      await verwachtZichtbaar(p, `alinea ${a} zin ${z}`);
    }
    await p.keyboard.press('Enter');
    await verwachtZichtbaar(p, `na Enter ${a}`);
  }
  const c = await caret(p);
  assert.ok(c.aantal >= 3, 'verwacht minstens 3 pagina\'s, kreeg ' + c.aantal);
  assert.equal(c.pagina, c.aantal - 1, 'cursor op laatste pagina');
  // teken voor teken over een grens heen
  let vorige = c.pagina, grensGezien = false, extra = 0;
  for (let k = 0; k < 2500 && extra < 60; k++) {
    await p.keyboard.type(k % 11 === 10 ? ' ' : 'a');
    const s = await verwachtZichtbaar(p, 'teken ' + k);
    if (s.pagina !== vorige) { grensGezien = true; vorige = s.pagina; }
    if (grensGezien) extra++;
  }
  assert.ok(grensGezien, 'tijdens typen is geen nieuwe pagina begonnen');
  // terugwissen teken voor teken over de grens
  grensGezien = false; extra = 0;
  for (let k = 0; k < 2500 && extra < 60; k++) {
    await p.keyboard.press('Backspace');
    const s = await verwachtZichtbaar(p, 'backspace ' + k);
    if (s.pagina !== vorige) { grensGezien = true; vorige = s.pagina; }
    if (grensGezien) extra++;
  }
  assert.ok(grensGezien, 'tijdens terugwissen geen pagina terug');
  assert.deepEqual(p.fouten, []);
  await ctx.close();
});

await test('bladeren: PageUp/PageDown, klikken in de rand, typen na omslaan', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'blad2');
  for (let a = 0; a < 8; a++) { await p.keyboard.type(ZIN.repeat(3)); await p.keyboard.press('Enter'); }
  await p.keyboard.type('EINDE');
  let c = await caret(p);
  const laatste = c.pagina;
  assert.ok(laatste >= 2);
  await p.keyboard.press('PageUp');
  c = await verwachtZichtbaar(p, 'na PageUp');
  assert.equal(c.pagina, laatste - 1);
  assert.equal(await p.textContent('#paginanummer'), `blz. ${laatste} van ${c.aantal}`);
  await p.keyboard.type('XYZ');
  c = await verwachtZichtbaar(p, 'typen na PageUp');
  assert.equal(c.pagina, laatste - 1, 'typen na omslaan blijft op die pagina');
  const tekst = await p.evaluate(() => window.__schrijfmachine.editor.el.textContent);
  assert.ok(tekst.includes('XYZ'));
  await p.keyboard.press('PageUp');
  await p.keyboard.press('PageUp');
  c = await verwachtZichtbaar(p, 'twee keer PageUp');
  assert.equal(c.pagina, Math.max(0, laatste - 3));
  await p.click('#zone-volgende', { position: { x: 30, y: 200 } });
  c = await verwachtZichtbaar(p, 'klik rechterrand');
  assert.equal(c.pagina, Math.max(0, laatste - 2));
  await p.click('#knop-vorige');
  c = await verwachtZichtbaar(p, 'knop vorige');
  assert.equal(c.pagina, Math.max(0, laatste - 3));
  await p.keyboard.press('Control+End');
  await p.waitForTimeout(50);
  c = await verwachtZichtbaar(p, 'Ctrl+End');
  assert.equal(c.pagina, c.aantal - 1);
  // pijltjes over de grens
  await p.keyboard.press('PageUp');
  for (let k = 0; k < 40; k++) { await p.keyboard.press('ArrowUp'); await verwachtZichtbaar(p, 'pijl omhoog ' + k); }
  for (let k = 0; k < 80; k++) { await p.keyboard.press('ArrowDown'); await verwachtZichtbaar(p, 'pijl omlaag ' + k); }
  // ander schermformaat: pagina's opnieuw indelen, cursor blijft zichtbaar
  await p.setViewportSize({ width: 1536, height: 864 });
  await p.waitForTimeout(200);
  await verwachtZichtbaar(p, 'na 1536x864');
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.waitForTimeout(200);
  await verwachtZichtbaar(p, 'terug naar 1280x720');
  // notities open: smallere kolom, cursor nog zichtbaar
  await p.click('#knop-notities');
  await p.waitForTimeout(150);
  await p.evaluate(() => window.__schrijfmachine.editor.focus());
  await verwachtZichtbaar(p, 'notities open');
  assert.deepEqual(p.fouten, []);
  await ctx.close();
});

// ---------------------------------------------------------------- opmaak en opslaan
await test('opmaak: vet, cursief, kopje, scène, en Markdown heen en terug', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'opmaak');
  await p.keyboard.type('Twee uur \'s nachts');
  await p.keyboard.press('Control+Alt+2');
  await p.keyboard.press('Enter');
  await p.keyboard.type('Hij bleef staan en luisterde. Ergens tikte iets, ');
  await p.keyboard.press('Control+i');
  await p.keyboard.type('regelmatig en geduldig');
  await p.keyboard.press('Control+i');
  await p.keyboard.type(', zoals een klok. De deur stond ');
  await p.keyboard.press('Control+b');
  await p.keyboard.type('open');
  await p.keyboard.press('Control+b');
  await p.keyboard.type('.');
  await p.keyboard.press('Enter');
  await p.keyboard.type('***');
  await p.keyboard.press('Enter');
  await p.keyboard.type('Volgende scène met een *sterretje* en een \\ en #hashtag.');
  await p.keyboard.press('Enter');
  await p.keyboard.type('Woord');
  // selecteren met het toetsenbord: balkje verschijnt, cursief via het balkje
  await p.keyboard.press('Shift+Home');
  await p.waitForTimeout(100);
  assert.equal(await p.isVisible('#opmaakbalk'), true, 'opmaakbalk zichtbaar bij selectie');
  await p.click('#opmaakbalk [data-opmaak="cursief"]');
  await p.click('#opmaakbalk [data-opmaak="vet"]');
  await p.keyboard.press('End');
  await p.keyboard.type(' en nog meer.');
  await p.keyboard.press('Control+Shift+Enter');
  await p.keyboard.type('Na een scènescheiding via de sneltoets.');
  await wachtOpslag(p);
  const verwacht = '## Twee uur \'s nachts\n\n' +
    'Hij bleef staan en luisterde. Ergens tikte iets, *regelmatig en geduldig*, zoals een klok. De deur stond **open**.\n\n' +
    '* * *\n\n' +
    'Volgende scène met een \\*sterretje\\* en een \\\\ en #hashtag.\n\n' +
    '***Woord en nog meer.***\n\n' +
    '* * *\n\n' +
    'Na een scènescheiding via de sneltoets.\n';
  assert.equal(await md(p), verwacht);
  const bestand = await p.evaluate(() => window.__schrijfmachine.store.hoofdstukBestand(window.__schrijfmachine.store.meta.huidig));
  assert.equal(await opfsLees(p, 'opmaak', bestand.pad), '# Hoofdstuk 1\n\n' + verwacht);
  // herladen: zelfde tekst en zelfde opmaak in de editor
  const html1 = await p.evaluate(() => window.__schrijfmachine.editor.el.innerHTML);
  await p.reload();
  await p.waitForFunction(() => window.__schrijfmachine && document.getElementById('status-tekst').textContent.startsWith('Opgeslagen'));
  assert.equal(await md(p), verwacht);
  const herlezen = await p.evaluate(async () => {
    const { domToMd } = await import('./js/markdown.js');
    return domToMd(window.__schrijfmachine.editor.el);
  });
  assert.equal(herlezen, verwacht, 'editor na herladen geeft dezelfde Markdown');
  const html2 = await p.evaluate(() => window.__schrijfmachine.editor.el.innerHTML);
  assert.ok(html2.includes('<h2>') && html2.includes('<hr>') && html2.includes('<em>regelmatig en geduldig</em>') && html2.includes('<strong>open</strong>'), html2);
  fs.writeFileSync(UIT + 'opmaak-html.txt', html1 + '\n\n' + html2);
  assert.deepEqual(p.fouten, []);
  await ctx.close();
});

await test('opmaak: plakken wordt platte tekst, opmaak ongedaan maken werkt', async () => {
  const ctx = await nieuweContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await open(ctx, 'plak');
  await p.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Eerste geplakte regel.\n\nTweede geplakte regel.');
    dt.setData('text/html', '<p style="color:red;font-size:40px">Eerste <a href="x">geplakte</a> regel.</p><p>Tweede</p>');
    const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    window.__schrijfmachine.editor.el.dispatchEvent(e);
  });
  await p.keyboard.type(' Getypt.');
  await wachtOpslag(p);
  assert.equal(await md(p), 'Eerste geplakte regel.\n\nTweede geplakte regel. Getypt.\n');
  const html = await p.evaluate(() => window.__schrijfmachine.editor.el.innerHTML);
  assert.ok(!/style=|<a |<span/.test(html), 'geen stijlen of links overgebleven: ' + html);
  // vet aan en uit
  await p.keyboard.press('Shift+Control+ArrowLeft');
  await p.keyboard.press('Control+b');
  await p.keyboard.press('Control+b');
  await wachtOpslag(p);
  assert.equal(await md(p), 'Eerste geplakte regel.\n\nTweede geplakte regel. Getypt.\n');
  await p.keyboard.press('Control+z');
  await p.keyboard.press('Control+z');
  await wachtOpslag(p);
  assert.ok((await md(p)).startsWith('Eerste geplakte regel.'), 'ongedaan maken laat tekst heel');
  assert.deepEqual(p.fouten, []);
  await ctx.close();
});

// ---------------------------------------------------------------- vangnet en herstel
await test('vangnet: map kwijt, dan schrijft de app alles opnieuw uit IndexedDB', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'vangnet1');
  await p.keyboard.type('Dit mag nooit verloren gaan. ');
  await p.keyboard.press('Control+b');
  await p.keyboard.type('Echt niet.');
  await wachtOpslag(p);
  const voor = await md(p);
  // de hele map weg (alsof Drive leeg is)
  await p.evaluate(async () => { const r = await navigator.storage.getDirectory(); await r.removeEntry('vangnet1', { recursive: true }); });
  await p.reload();
  await p.waitForFunction(() => window.__schrijfmachine && document.getElementById('status-tekst').textContent.startsWith('Opgeslagen'));
  await wachtOpslag(p);
  assert.equal(await md(p), voor);
  const pad = await p.evaluate(() => window.__schrijfmachine.store.hoofdstukBestand(window.__schrijfmachine.store.meta.huidig).pad);
  assert.equal(await opfsLees(p, 'vangnet1', pad), '# Hoofdstuk 1\n\n' + voor);
  await ctx.close();
});

await test('vangnet: IndexedDB kwijt, dan opent de app het manuscript uit de map', async () => {
  const ctx = await nieuweContext();
  let p = await open(ctx, 'vangnet2');
  await p.keyboard.type('Eerste hoofdstuk, ');
  await p.keyboard.press('Control+i');
  await p.keyboard.type('schuin');
  await p.keyboard.press('Control+i');
  await p.evaluate(() => {
    const s = window.__schrijfmachine.store;
    const id = s.nieuwHoofdstuk(null, 'Het tweede', { md: 'Tweede **hoofdstuk**.\n' });
    s.wijzigHoofdstuk(id, { doel: 'Spanning opbouwen', status: 'Herschrijven' });
    s.nieuweNotitie('personages', { naam: 'Ruben', sub: 'hoofdpersoon', kleur: '#4F6A7E', md: '**Wil:** weten wat er gebeurd is.\n' });
  });
  await wachtOpslag(p);
  const voor = await p.evaluate(() => JSON.stringify({ l: window.__schrijfmachine.store.lijst().map((h) => [h.titel, h.md, h.doel, h.status]), n: window.__schrijfmachine.store.notities('personages').map((n) => [n.naam, n.sub, n.kleur, n.md]) }));
  await p.goto(BASIS + 'test.html');
  await p.evaluate(() => new Promise((res, rej) => { const r = indexedDB.deleteDatabase('schrijfmachine'); r.onsuccess = res; r.onerror = rej; r.onblocked = res; }));
  p = await open(ctx, 'vangnet2');
  await p.waitForTimeout(300);
  const na = await p.evaluate(() => JSON.stringify({ l: window.__schrijfmachine.store.lijst().map((h) => [h.titel, h.md, h.doel, h.status]), n: window.__schrijfmachine.store.notities('personages').map((n) => [n.naam, n.sub, n.kleur, n.md]) }));
  assert.equal(na, voor);
  await ctx.close();
});

await test('vangnet: versie terugzetten', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'versie');
  await p.keyboard.type('Oorspronkelijke tekst die goed was.');
  await wachtOpslag(p);
  await p.evaluate(() => window.__schrijfmachine.maakSnapshot('test'));
  await p.keyboard.press('Control+a');
  await p.keyboard.type('Per ongeluk alles weg.');
  await wachtOpslag(p);
  assert.equal(await md(p), 'Per ongeluk alles weg.\n');
  // via het menu
  await p.click('#knop-meer');
  await p.click('[data-actie="versies"]');
  await p.waitForSelector('dialog[open] input[type="radio"]');
  const radios = await p.$$('dialog[open] input[type="radio"]');
  // de lijst staat nieuwste eerst; zoek de testversie
  const labels = await p.$$eval('dialog[open] .lijst-rij', (r) => r.map((x) => x.textContent));
  const k = labels.findIndex((t) => t.includes('test'));
  assert.ok(k >= 0, 'testversie in de lijst: ' + labels.join(' | '));
  await radios[k].check();
  await p.click('dialog[open] .omlijnd');
  await p.waitForTimeout(400);
  await wachtOpslag(p);
  assert.equal(await md(p), 'Oorspronkelijke tekst die goed was.\n');
  assert.equal(await p.evaluate(() => window.__schrijfmachine.editor.el.textContent), 'Oorspronkelijke tekst die goed was.');
  // en de versie van vlak voor terugzetten bestaat ook
  const redenen = await p.evaluate(async () => (await (await import('./js/snapshots.js')).lijstSnapshots()).map((s) => s.reden));
  assert.ok(redenen.includes('vlak voor terugzetten'), redenen.join(','));
  await ctx.close();
});

await test('map: bestand buiten de app gewijzigd, eerst back-up dan overschrijven', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'extern1');
  await p.keyboard.type('Versie uit de app.');
  await wachtOpslag(p);
  const pad = await p.evaluate(() => window.__schrijfmachine.store.hoofdstukBestand(window.__schrijfmachine.store.meta.huidig).pad);
  await opfsSchrijf(p, 'extern1', pad, '# Hoofdstuk 1\n\nIemand heeft dit buiten de app aangepast.\n');
  await p.evaluate(() => window.__schrijfmachine.editor.focus());
  await p.keyboard.type(' Meer tekst.');
  await wachtOpslag(p);
  const backups = await opfsLijst(p, 'extern1', 'Back-ups');
  assert.equal(backups.length, 1, 'precies één back-up: ' + backups.join(','));
  assert.equal(await opfsLees(p, 'extern1', 'Back-ups/' + backups[0]), '# Hoofdstuk 1\n\nIemand heeft dit buiten de app aangepast.\n');
  assert.equal(await opfsLees(p, 'extern1', pad), '# Hoofdstuk 1\n\nVersie uit de app. Meer tekst.\n');
  assert.ok((await p.textContent('#status-tekst')).includes('Back-ups'));
  // nog een keer opslaan: geen extra back-up meer
  await p.keyboard.type(' En nog.');
  await wachtOpslag(p);
  assert.equal((await opfsLijst(p, 'extern1', 'Back-ups')).length, 1);
  await ctx.close();
});

await test('map: buiten de app gewijzigd terwijl de app dicht was, keuze bij opstarten', async () => {
  const ctx = await nieuweContext();
  let p = await open(ctx, 'extern2');
  await p.keyboard.type('Wat in de app stond.');
  await wachtOpslag(p);
  const pad = await p.evaluate(() => window.__schrijfmachine.store.hoofdstukBestand(window.__schrijfmachine.store.meta.huidig).pad);
  await p.goto(BASIS + 'test.html');
  await opfsSchrijf(p, 'extern2', pad, '# Hoofdstuk 1\n\nOp de telefoon *verbeterd*.\n');
  p = await ctx.newPage();
  await p.goto(BASIS + 'index.html?geenwelkom=1&testmap=opfs&mapnaam=extern2');
  await p.waitForSelector('dialog[open]');
  assert.ok((await p.textContent('dialog[open] h2')).includes('buiten de app'), await p.textContent('dialog[open]'));
  await p.click('dialog[open] .omlijnd'); // versie uit de map
  await p.waitForTimeout(500);
  assert.equal(await md(p), 'Op de telefoon *verbeterd*.\n');
  const redenen = await p.evaluate(async () => (await (await import('./js/snapshots.js')).lijstSnapshots()).map((s) => s.reden));
  assert.ok(redenen.some((r) => r.includes('overnemen')), 'versie van de app-tekst bewaard: ' + redenen.join(','));
  const oud = await p.evaluate(async () => {
    const m = await import('./js/snapshots.js');
    const l = await m.lijstSnapshots();
    const s = l.find((x) => x.reden.includes('overnemen'));
    const proj = await m.leesSnapshot(s.tijd);
    return Object.values(proj.hoofdstukken)[0].md;
  });
  assert.equal(oud, 'Wat in de app stond.\n');
  await ctx.close();
});

await test('map: andere app-versie houden bij opstarten maakt back-up van de mapversie', async () => {
  const ctx = await nieuweContext();
  let p = await open(ctx, 'extern3');
  await p.keyboard.type('App wint.');
  await wachtOpslag(p);
  const pad = await p.evaluate(() => window.__schrijfmachine.store.hoofdstukBestand(window.__schrijfmachine.store.meta.huidig).pad);
  await p.goto(BASIS + 'test.html');
  await opfsSchrijf(p, 'extern3', pad, '# Hoofdstuk 1\n\nMap verliest.\n');
  p = await ctx.newPage();
  await p.goto(BASIS + 'index.html?geenwelkom=1&testmap=opfs&mapnaam=extern3');
  await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] .dlg-knoppen .knop:not(.omlijnd)'); // versie uit de app
  await p.waitForTimeout(600);
  assert.equal(await md(p), 'App wint.\n');
  assert.equal(await opfsLees(p, 'extern3', pad), '# Hoofdstuk 1\n\nApp wint.\n');
  const b = await opfsLijst(p, 'extern3', 'Back-ups');
  assert.equal(b.length, 1);
  assert.equal(await opfsLees(p, 'extern3', 'Back-ups/' + b[0]), '# Hoofdstuk 1\n\nMap verliest.\n');
  await ctx.close();
});

await test('zonder map: app werkt gewoon op IndexedDB', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, null);
  assert.ok((await p.textContent('#status-tekst')).startsWith('Opgeslagen op dit apparaat'));
  await p.keyboard.type('Zonder map geschreven.');
  await wachtOpslag(p);
  await p.reload();
  await p.waitForFunction(() => window.__schrijfmachine && document.getElementById('status-tekst').textContent.startsWith('Opgeslagen'));
  assert.equal(await md(p), 'Zonder map geschreven.\n');
  await ctx.close();
});

await test('twee vensters: het tweede vraagt eerst, het eerste gaat op slot', async () => {
  const ctx = await nieuweContext();
  const a = await open(ctx, 'twee');
  await a.keyboard.type('Geschreven in venster A.');
  const b = await ctx.newPage();
  await b.goto(BASIS + 'index.html?geenwelkom=1&testmap=opfs&mapnaam=twee');
  await b.waitForSelector('dialog[open]');
  assert.ok((await b.textContent('dialog[open] h2')).includes('al open'));
  await b.click('dialog[open] .omlijnd');
  await a.waitForSelector('dialog[open]');
  assert.ok((await a.textContent('dialog[open] h2')).includes('ander venster'));
  assert.equal(await a.getAttribute('#tekst', 'contenteditable'), 'false');
  await b.waitForFunction(() => window.__schrijfmachine && document.getElementById('status-tekst').textContent.startsWith('Opgeslagen') && !document.querySelector('dialog[open]'), null, { timeout: 10000 });
  assert.equal(await md(b), 'Geschreven in venster A.\n');
  await b.keyboard.type(' En verder in B.');
  await wachtOpslag(b);
  assert.equal(await md(b), 'Geschreven in venster A. En verder in B.\n');
  await ctx.close();
});

// ---------------------------------------------------------------- hoofdstukken, notities, vergrendelen
await test('hoofdstukken: aanmaken, labels, status, doel, volgorde, projectbestand', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'hs');
  await p.keyboard.type('Tekst van het eerste hoofdstuk.');
  await p.click('#knop-hoofdstukken');
  await p.fill('.titelveld', 'Het slot');
  await p.click('#hs-nieuw');
  await p.fill('.titelveld', 'De kelder');
  await p.selectOption('.hs-gegevens select[aria-label="Status"]', 'Herschrijven');
  await p.fill('.hs-doel textarea', 'Ruben ontdekt dat iemand voor hem in de kelder is geweest.');
  // nieuwe verhaallijn via de keuzelijst
  await p.selectOption('.hs-gegevens select[aria-label="Verhaallijn"]', '__nieuw');
  await p.waitForSelector('dialog[open] input');
  await p.fill('dialog[open] input', 'Ruben');
  await p.click('dialog[open] .omlijnd');
  await p.waitForTimeout(100);
  assert.ok((await p.textContent('.hs-rij[aria-current="true"] .hs-lijn')).includes('Ruben'));
  await p.click('.hs-klein >> text=Omhoog');
  await wachtOpslag(p);
  const json = JSON.parse(await opfsLees(p, 'hs', 'schrijfmachine.json'));
  assert.deepEqual(json.hoofdstukken.map((h) => h.titel), ['De kelder', 'Het slot']);
  assert.equal(json.hoofdstukken[0].status, 'Herschrijven');
  assert.equal(json.hoofdstukken[0].doel, 'Ruben ontdekt dat iemand voor hem in de kelder is geweest.');
  const lijnen = await opfsLees(p, 'hs', 'Notities/Verhaallijnen.md');
  assert.ok(lijnen.includes('# Ruben'), lijnen);
  assert.ok(lijnen.includes(json.hoofdstukken[0].lijn), 'verhaallijn-id in notities');
  // terug naar schrijven in gekozen hoofdstuk
  await p.click('text=Verder schrijven');
  assert.equal(await p.textContent('#kicker'), 'Hoofdstuk 1 · De kelder');
  await p.keyboard.type('Kelder.');
  await wachtOpslag(p);
  const lijst = await p.evaluate(() => window.__schrijfmachine.store.lijst().map((h) => [h.titel, h.md]));
  assert.deepEqual(lijst, [['De kelder', 'Kelder.\n'], ['Het slot', 'Tekst van het eerste hoofdstuk.\n']]);
  // verwijderen gaat naar de prullenbak
  await p.click('#knop-hoofdstukken');
  await p.click('.hs-rij >> nth=1');
  await p.click('.hs-klein >> text=Verwijder');
  await p.click('dialog[open] .omlijnd');
  await wachtOpslag(p);
  const prul = await opfsLijst(p, 'hs', 'Prullenbak');
  assert.equal(prul.length, 1);
  assert.equal((await opfsLijst(p, 'hs', 'Hoofdstukken')).length, 1);
  assert.deepEqual(p.fouten, []);
  await ctx.close();
});

await test('hoofdstukken: slepen om de volgorde te veranderen', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'sleep');
  await p.evaluate(() => { const s = window.__schrijfmachine.store; s.wijzigHoofdstuk(s.meta.huidig, { titel: 'A' }); s.nieuwHoofdstuk(null, 'B'); s.nieuwHoofdstuk(null, 'C'); });
  await p.click('#knop-hoofdstukken');
  await p.dragAndDrop('.hs-rij >> nth=2', '.hs-rij >> nth=0', { targetPosition: { x: 50, y: 5 } });
  await p.waitForTimeout(100);
  const titels = await p.evaluate(() => window.__schrijfmachine.store.lijst().map((h) => h.titel));
  assert.deepEqual(titels, ['C', 'A', 'B']);
  await ctx.close();
});

await test('vergrendelen: eerdere pagina\'s en hoofdstukken achter een waas, één klik open', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'slot');
  await p.evaluate(() => { const s = window.__schrijfmachine.store; s.wijzigHoofdstuk(s.meta.huidig, { titel: 'Eerste' }); s.zetTekst(s.meta.huidig, 'Eerder hoofdstuk.\n'); const id = s.nieuwHoofdstuk(null, 'Tweede'); s.zetHuidig(id); window.__schrijfmachine.editor.verwerp(); window.__schrijfmachine.editor.laad(id); });
  await p.waitForTimeout(200);
  for (let a = 0; a < 7; a++) { await p.keyboard.type(ZIN.repeat(3)); await p.keyboard.press('Enter'); }
  const c = await caret(p);
  assert.ok(c.pagina >= 2);
  await p.click('#knop-vergrendel');
  assert.equal(await p.textContent('#knop-vergrendel-tekst'), 'Ontgrendel');
  assert.equal(await p.isVisible('#waaslaag'), false, 'huidige pagina blijft leesbaar');
  await p.keyboard.press('PageUp');
  assert.equal(await p.isVisible('#waaslaag'), true, 'vorige pagina achter waas');
  assert.ok(await p.evaluate(() => window.__schrijfmachine.editor.el.classList.contains('waas')));
  await p.screenshot({ path: UIT + 'vergrendeld-pagina.png' });
  await p.click('#knop-hoofdstukken');
  assert.equal(await p.$$eval('.hs-rij.slot', (r) => r.length), 1);
  assert.ok((await p.textContent('#hs-slotbalk')).includes('Hoofdstuk 1 vergrendeld'));
  await p.screenshot({ path: UIT + 'vergrendeld-lijst.png' });
  await p.click('.hs-rij >> nth=0');
  await p.click('text=Verder schrijven');
  assert.equal(await p.isVisible('#waaslaag'), true, 'vergrendeld hoofdstuk wazig');
  assert.equal(await p.getAttribute('#tekst', 'contenteditable'), 'false');
  await p.click('#knop-ontgrendel-hier');
  assert.equal(await p.isVisible('#waaslaag'), false);
  assert.equal(await p.getAttribute('#tekst', 'contenteditable'), 'true');
  assert.equal(await p.textContent('#knop-vergrendel-tekst'), 'Vergrendel');
  // zelfgekozen reeks
  await p.click('#knop-hoofdstukken');
  await p.selectOption('#hs-slotbalk select >> nth=0', { value: '0' });
  await p.selectOption('#hs-slotbalk select >> nth=1', { value: '1' });
  await p.click('#hs-slotbalk button');
  assert.equal(await p.$$eval('.hs-rij.slot', (r) => r.length), 2, await p.evaluate(() => document.getElementById('hs-slotbalk').outerHTML + JSON.stringify(window.__schrijfmachine.store.meta)));
  assert.ok((await p.textContent('#hs-slotbalk')).includes('Hoofdstuk 1 t/m 2 vergrendeld'));
  await p.click('#hs-slotbalk >> text=Ontgrendel');
  assert.equal(await p.$$eval('.hs-rij.slot', (r) => r.length), 0);
  assert.deepEqual(p.fouten, []);
  await ctx.close();
});

await test('notities: personages met opmaak, bewaard als Markdown', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'notities');
  await p.click('#knop-notities');
  await p.click('text=+ Nieuw personage');
  await p.keyboard.type('Ruben');
  await p.keyboard.press('Enter');
  await p.keyboard.type('hoofdpersoon');
  await p.keyboard.press('Enter');
  await p.keyboard.press('Control+b');
  await p.keyboard.type('Wil:');
  await p.keyboard.press('Control+b');
  await p.keyboard.type(' weten wat er met zijn broer is gebeurd.');
  await p.keyboard.press('Enter');
  await p.keyboard.press('Control+i');
  await p.keyboard.type('Telt dingen als hij nerveus is.');
  await p.click('.kleur-keuze[title="Blauw"]');
  await p.click('text=+ Nieuw personage');
  await p.keyboard.type('Mira');
  await p.click('#notitie-tabs >> text=Ideeën');
  await p.click('text=+ Nieuw idee');
  await p.keyboard.type('Klok die tikt');
  await wachtOpslag(p);
  const pers = await opfsLees(p, 'notities', 'Notities/Personages.md');
  assert.ok(pers.includes('# Ruben\n<!-- schrijfmachine {'), pers);
  assert.ok(pers.includes('"sub":"hoofdpersoon"') && pers.includes('"kleur":"#4F6A7E"'), pers);
  assert.ok(pers.includes('**Wil:** weten wat er met zijn broer is gebeurd.\n\n*Telt dingen als hij nerveus is.*'), pers);
  assert.ok(pers.includes('# Mira'), pers);
  assert.ok((await opfsLees(p, 'notities', 'Notities/Ideeen.md')).includes('# Klok die tikt'));
  // leesbaar terug
  const terug = await p.evaluate(async () => {
    const { mdNaarNotities } = await import('./js/store.js');
    const s = window.__schrijfmachine.store;
    return JSON.stringify(mdNaarNotities(s.notitieBestand('personages').tekst)) === JSON.stringify(s.notities('personages'));
  });
  assert.ok(terug, 'notities heen en terug gelijk');
  await p.screenshot({ path: UIT + 'notities.png' });
  assert.deepEqual(p.fouten, []);
  await ctx.close();
});

// ---------------------------------------------------------------- export en import
await test('export: .docx in de map met kopjes, vet en cursief', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'export');
  await p.evaluate(() => {
    const s = window.__schrijfmachine.store;
    s.zetTitel('De Proef');
    s.wijzigHoofdstuk(s.meta.huidig, { titel: 'Proloog' });
    s.zetTekst(s.meta.huidig, '## Santorini, 2003\n\nFrank lag **roerloos** op zijn rug.\n\n*Een ober.*\n\n* * *\n\nNa de ***scène***.\n');
    s.nieuwHoofdstuk(null, 'Act 1 – De moeder', { md: 'Het felle licht zoemde.\n' });
    window.__schrijfmachine.editor.verwerp();
    window.__schrijfmachine.editor.laad(s.meta.huidig);
  });
  await p.click('#knop-meer');
  await p.click('[data-actie="exporteer"]');
  await p.waitForSelector('dialog[open]');
  assert.ok((await p.textContent('dialog[open]')).includes('staat in je map'));
  await p.click('dialog[open] .omlijnd');
  const namen = await opfsLijst(p, 'export', '');
  const docx = namen.find((n) => n.endsWith('.docx'));
  assert.ok(docx && docx.startsWith('De Proef '), namen.join(','));
  const terug = await p.evaluate(async (naam) => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('export');
    const f = await (await d.getFileHandle(naam)).getFile();
    const buf = await f.arrayBuffer();
    const { leesDocx } = await import('./js/docx.js');
    const al = await leesDocx(buf);
    return { al, b64: btoa(String.fromCharCode(...new Uint8Array(buf))) };
  }, docx);
  fs.writeFileSync(UIT + 'export.docx', Buffer.from(terug.b64, 'base64'));
  const vorm = terug.al.map((a) => [a.niveau, a.runs.map((r) => (r.b ? 'B' : '') + (r.i ? 'I' : '') + ':' + r.t).join('|')]);
  assert.deepEqual(vorm, [
    [0, ':De Proef'],
    [1, ':Proloog'],
    [2, 'B:Santorini, 2003'],
    [null, ':Frank lag |B:roerloos|: op zijn rug.'],
    [null, 'I:Een ober.'],
    [null, ':*   *   *'],
    [null, ':Na de |BI:scène|:.'],
    [1, ':Act 1 – De moeder'],
    [null, ':Het felle licht zoemde.'],
  ]);
  await ctx.close();
});

const IMPORT = process.env.IMPORT_DOCX;
if (IMPORT && fs.existsSync(IMPORT)) {
  await test('import: echte Tekst.docx met voorstel voor hoofdstukken en kopjes', async () => {
    const ctx = await nieuweContext();
    const p = await open(ctx, 'import');
    await p.click('#knop-meer');
    const [kiezer] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-actie="importeer"]')]);
    await kiezer.setFiles(IMPORT);
    await p.waitForSelector('dialog[open] .lijst-rij');
    const rijen = await p.$$eval('dialog[open] .lijst-rij', (r) => r.map((x) => [x.querySelector('select').value, x.querySelector('.groei').textContent.slice(0, 30)]));
    fs.writeFileSync(UIT + 'import-voorstel.txt', rijen.map((r) => r.join('\t')).join('\n'));
    const soort = (begin) => (rijen.find((r) => r[1].startsWith(begin)) || [])[0];
    assert.equal(soort('Proloog'), 'hoofdstuk');
    assert.equal(soort('Santorini'), 'kop');
    assert.equal(soort('Act 1'), 'hoofdstuk');
    assert.equal(soort('Edinburgh'), 'kop');
    assert.equal(rijen.filter((r) => r[0] === 'hoofdstuk').length, 2, 'twee hoofdstukken');
    assert.equal(rijen.filter((r) => r[0] === 'kop').length, 2, 'twee kopjes');
    await p.screenshot({ path: UIT + 'import-dialoog.png' });
    await p.click('dialog[open] .omlijnd');
    await p.waitForTimeout(500);
    await wachtOpslag(p);
    const lijst = await p.evaluate(() => window.__schrijfmachine.store.lijst().map((h) => ({ titel: h.titel, md: h.md, woorden: h.woorden })));
    assert.deepEqual(lijst.map((h) => h.titel), ['Proloog', 'Act 1 – De moeder']);
    assert.ok(lijst[0].md.startsWith('## Santorini, Griekenland - 2003\n\nFrank Philips lag roerloos op zijn rug.'), lijst[0].md.slice(0, 120));
    assert.ok(lijst[0].md.includes('\n\n*Een ober… geen sluipmoordenaar, Frank. Een ober.*\n\n'));
    assert.ok(lijst[1].md.startsWith('## Edinburgh, 2023, 23 november\n\n'));
    fs.writeFileSync(UIT + 'import-woorden.json', JSON.stringify(lijst.map((h) => [h.titel, h.woorden])));
    const md0 = await opfsLees(p, 'import', 'Hoofdstukken/' + (await p.evaluate(() => window.__schrijfmachine.store.lijst()[0].bestand)));
    assert.ok(md0.startsWith('# Proloog\n\n## Santorini'));
    // de tekst in de editor bladert
    await p.click('text=Verder schrijven');
    const c = await caret(p);
    assert.ok(c.aantal >= 4, 'proloog beslaat meerdere pagina\'s: ' + c.aantal);
    fs.writeFileSync(UIT + 'import-proloog.md', lijst[0].md);
    fs.writeFileSync(UIT + 'import-act1.md', lijst[1].md);
    await ctx.close();
  });
}

// ---------------------------------------------------------------- offline en controlepagina
await test('offline: app opent zonder netwerk via de service worker', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'offline');
  await p.keyboard.type('Offline proef.');
  await wachtOpslag(p);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.waitForTimeout(500);
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForFunction(() => window.__schrijfmachine && document.getElementById('status-tekst').textContent.startsWith('Opgeslagen'));
  assert.equal(await md(p), 'Offline proef.\n');
  const font = await p.evaluate(() => document.fonts.check('21px Literata'));
  assert.ok(font, 'Literata ook offline geladen');
  await p.goto(BASIS + 'test.html');
  assert.ok((await p.textContent('h1')).includes('Controleer opslag'));
  await ctx.setOffline(false);
  await ctx.close();
});

await test('controlepagina: alle stappen met de testmap', async () => {
  const ctx = await nieuweContext();
  const p = await open(ctx, 'controle');
  await p.keyboard.type('Manuscript dat niet aangeraakt mag worden.');
  await wachtOpslag(p);
  const voor = await opfsLijst(p, 'controle', 'Hoofdstukken');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.goto(BASIS + 'test.html');
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.evaluate(() => window.__controle());
  const stappen = await p.$$eval('.stap', (s) => s.map((x) => [x.className.replace('stap ', ''), x.querySelector('.titel').textContent, x.querySelector('.uitleg').textContent]));
  fs.writeFileSync(UIT + 'controlepagina.txt', stappen.map((s) => s.join(' | ')).join('\n'));
  await p.screenshot({ path: UIT + 'controlepagina.png', fullPage: true });
  const fout = stappen.filter((s) => s[0] === 'fout');
  assert.deepEqual(fout, [], 'geen rode stappen');
  assert.ok(stappen.find((s) => s[1].startsWith('Back-up'))[0] === 'goed');
  assert.ok(stappen.find((s) => s[1].startsWith('Manuscript in deze map'))[0] === 'goed');
  const na = await opfsLijst(p, 'controle', '');
  assert.ok(!na.includes('.schrijfmachine-controle'), 'testmapje opgeruimd');
  assert.ok(na.includes('Schrijfmachine-controle.txt'));
  assert.deepEqual(await opfsLijst(p, 'controle', 'Hoofdstukken'), voor);
  await ctx.close();
});

// ---------------------------------------------------------------- schermafbeeldingen
for (const vp of [{ width: 1280, height: 720 }, { width: 1536, height: 864 }]) {
  await test(`schermen op ${vp.width}x${vp.height}`, async () => {
    const ctx = await nieuweContext(vp);
    const p = await open(ctx, 'scherm' + vp.width);
    await p.evaluate(() => {
      const s = window.__schrijfmachine.store;
      const r = s.nieuweNotitie('verhaallijnen', { naam: 'Ruben', kleur: '#4F6A7E' });
      const m = s.nieuweNotitie('verhaallijnen', { naam: 'Mira', kleur: '#A35F55' });
      const t = s.nieuweNotitie('verhaallijnen', { naam: 'Toen', kleur: '#A88A4E' });
      s.nieuweNotitie('personages', { naam: 'Ruben', sub: 'hoofdpersoon', kleur: '#4F6A7E', md: '**Wil:** weten wat er met zijn broer is gebeurd.\n\n**Verbergt:** dat hij die nacht wakker was.\n\n*Telt dingen als hij nerveus is. Treden, tegels, ademhalingen.*\n' });
      s.nieuweNotitie('personages', { naam: 'Mira', sub: 'tweede stem', kleur: '#A35F55' });
      s.nieuweNotitie('personages', { naam: 'De buurvrouw', sub: 'getuige', kleur: '#A88A4E' });
      const titels = [['Het eerste bericht', m], ['Wat de buren zagen', r], ['Zomer van negentig', t], ['Vijf over drie', m], ['Het slot', r]];
      const eerste = s.meta.huidig;
      s.wijzigHoofdstuk(eerste, { titel: 'Het tweede bericht', lijn: m.id, status: 'Klaar' });
      s.zetTekst(eerste, 'Tekst. '.repeat(1800));
      for (const [ti, l] of titels) s.nieuwHoofdstuk(null, ti, { lijn: l.id, status: 'Klaar', md: 'Woord '.repeat(1500 + ti.length * 40) });
      const id = s.nieuwHoofdstuk(null, 'De kelder', { lijn: r.id, status: 'Concept', doel: 'Ruben ontdekt dat iemand vóór hem in de kelder is geweest. Spanning opbouwen, nog niets onthullen.' });
      s.zetHuidig(id);
      s.zetVergrendeld(s.meta.volgorde.slice(0, 3), null);
      window.__schrijfmachine.editor.verwerp();
      window.__schrijfmachine.editor.laad(id);
    });
    await p.waitForTimeout(200);
    await p.keyboard.type('De trap naar beneden telde dertien treden. Ruben had ze geteld toen hij hier voor het eerst kwam, en hij telde ze nu opnieuw, alsof het getal deze keer anders kon uitvallen.');
    await p.keyboard.press('Enter');
    await p.keyboard.type('Onder aan de trap brandde geen licht. Alleen de streep van de keukendeur boven hem, die smaller werd naarmate hij verder afdaalde.');
    await p.keyboard.press('Enter');
    await p.keyboard.type('Hij bleef staan op de laatste tree en luisterde. Ergens in het donker tikte iets, ');
    await p.keyboard.press('Control+i');
    await p.keyboard.type('regelmatig en geduldig');
    await p.keyboard.press('Control+i');
    await p.keyboard.type(', zoals een klok die wacht tot iemand eindelijk komt kijken hoe laat het is');
    await wachtOpslag(p);
    await p.screenshot({ path: UIT + `scherm-schrijven-${vp.width}.png` });
    await p.keyboard.press('Shift+Control+ArrowLeft');
    await p.keyboard.press('Shift+Control+ArrowLeft');
    await p.waitForTimeout(100);
    await p.screenshot({ path: UIT + `scherm-selectie-${vp.width}.png` });
    await p.keyboard.press('End');
    await p.click('#knop-notities');
    await p.waitForTimeout(150);
    await p.screenshot({ path: UIT + `scherm-notities-${vp.width}.png` });
    await p.click('#knop-notities');
    await p.click('#knop-hoofdstukken');
    await p.waitForTimeout(150);
    await p.screenshot({ path: UIT + `scherm-hoofdstukken-${vp.width}.png` });
    await p.click('#knop-meer');
    await p.screenshot({ path: UIT + `scherm-menu-${vp.width}.png` });
    // nergens horizontaal scrollen of overlappen
    const overloop = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || document.body.scrollHeight > window.innerHeight);
    assert.equal(overloop, false);
    assert.deepEqual(p.fouten, []);
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${geslaagd} geslaagd, ${mislukt} mislukt` + (fouten.length ? ': ' + fouten.join('; ') : ''));
process.exit(mislukt ? 1 : 0);
