// Service worker: de app werkt volledig offline.
// Bij een nieuwe versie verandert VERSIE (en VERSIE in js/instellingen.js). De nieuwe bestanden
// worden op de achtergrond opgehaald; de app meldt rechtsonder "Nieuwe versie klaar" en
// stuurt na jouw klik 'bijwerken', waarna deze versie het overneemt.
const VERSIE = 'schrijfmachine-7';
const BESTANDEN = [
  './',
  'index.html',
  'test.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/store.js',
  'js/db.js',
  'js/editor.js',
  'js/richtext.js',
  'js/markdown.js',
  'js/folder.js',
  'js/snapshots.js',
  'js/chapters.js',
  'js/notes.js',
  'js/ui.js',
  'js/importexport.js',
  'js/docx.js',
  'js/zip.js',
  'js/test-page.js',
  'js/instellingen.js',
  'js/kantlijn.js',
  'js/zoeken.js',
  'js/personages.js',
  'js/claude.js',
  'js/boek.js', 'js/aantekeningen.js', 'js/spiek.js',
  'fonts/literata-latin-opsz-normal.woff2',
  'fonts/literata-latin-opsz-italic.woff2',
  'fonts/literata-latin-ext-opsz-normal.woff2',
  'fonts/literata-latin-ext-opsz-italic.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-48.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIE).then((c) => c.addAll(BESTANDEN.map((b) => new Request(b, { cache: 'reload' })))));
});

self.addEventListener('message', (e) => {
  if (e.data === 'bijwerken') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSIE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSIE);
    const opties = { ignoreSearch: true };
    if (req.mode === 'navigate') {
      const pad = url.pathname.endsWith('test.html') ? 'test.html' : 'index.html';
      const hit = await cache.match(pad, opties);
      if (hit) return hit;
    }
    const hit = await cache.match(req, opties);
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
