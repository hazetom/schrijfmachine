// Lichte automatische versies in IndexedDB, zodat je altijd terug kunt.
// Elke 10 minuten (als er iets veranderd is), plus vóór elke ingrijpende actie.
// Bewaard: alles van de laatste 2 uur, daarna één per uur tot een dag terug,
// daarna één per dag tot 60 dagen terug.

import { db } from './db.js';
import { store } from './store.js';

const INTERVAL = 10 * 60 * 1000;
let laatsteVersieTeller = -1;
let laatsteTijd = 0;

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return { gz: false, data: text };
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { gz: true, data: await new Response(s).arrayBuffer() };
}
async function gunzip(rec) {
  if (!rec.gz) return rec.data;
  const s = new Blob([rec.data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(s).text();
}

export async function maakSnapshot(reden = 'automatisch') {
  const p = store.project;
  const json = JSON.stringify({ meta: p.meta, hoofdstukken: p.hoofdstukken, notities: p.notities });
  const { gz, data } = await gzip(json);
  let tijd = Date.now();
  // nooit twee met dezelfde sleutel
  while (await db.get('snapshots', tijd)) tijd++;
  await db.put('snapshots', {
    tijd,
    reden,
    woorden: store.totaalWoorden(),
    hoofdstukken: p.meta.volgorde.length,
    gz,
    data,
  });
  laatsteVersieTeller = store.versieTeller;
  laatsteTijd = Date.now();
  await opruimen();
  return tijd;
}

export async function lijstSnapshots() {
  const keys = await db.getAllKeys('snapshots');
  const out = [];
  for (const k of keys.sort((a, b) => b - a)) {
    const r = await db.get('snapshots', k);
    out.push({ tijd: r.tijd, reden: r.reden, woorden: r.woorden, hoofdstukken: r.hoofdstukken });
  }
  return out;
}

export async function leesSnapshot(tijd) {
  const r = await db.get('snapshots', tijd);
  if (!r) throw new Error('Versie niet gevonden');
  return JSON.parse(await gunzip(r));
}

export async function zetSnapshotTerug(tijd) {
  const project = await leesSnapshot(tijd);
  await store.bewaarLokaal();
  await maakSnapshot('vlak voor terugzetten');
  // projectId van nu houden, zodat de map gewoon gekoppeld blijft
  project.meta.projectId = store.project.meta.projectId;
  store.vervang(project);
  await store.bewaarLokaal();
}

async function opruimen() {
  const keys = (await db.getAllKeys('snapshots')).sort((a, b) => b - a);
  const nu = Date.now();
  const houden = new Set();
  const uurGezien = new Set();
  const dagGezien = new Set();
  for (const t of keys) {
    const leeftijd = nu - t;
    if (leeftijd < 2 * 3600e3) { houden.add(t); continue; }
    if (leeftijd < 24 * 3600e3) {
      const u = Math.floor(t / 3600e3);
      if (!uurGezien.has(u)) { uurGezien.add(u); houden.add(t); }
      continue;
    }
    if (leeftijd < 60 * 24 * 3600e3) {
      const d = new Date(t).toDateString();
      if (!dagGezien.has(d)) { dagGezien.add(d); houden.add(t); }
    }
  }
  // de nieuwste 5 altijd houden, wat er ook gebeurt
  keys.slice(0, 5).forEach((k) => houden.add(k));
  for (const k of keys) if (!houden.has(k)) await db.del('snapshots', k);
}

export function startAutomatisch() {
  laatsteVersieTeller = store.versieTeller;
  laatsteTijd = Date.now();
  setInterval(async () => {
    if (store.versieTeller === laatsteVersieTeller) return;
    if (Date.now() - laatsteTijd < INTERVAL) return;
    try { await maakSnapshot('automatisch'); } catch (e) { console.warn('snapshot mislukt', e); }
  }, 30 * 1000);
}
