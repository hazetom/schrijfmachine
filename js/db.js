// Kleine IndexedDB-laag. Dit is het vangnet: alles wat je typt staat hier
// binnen een seconde, ook als de map in Drive (even) niet bereikbaar is.

const DB_NAAM = 'schrijfmachine';
const DB_VERSIE = 1;
let dbPromise = null;

export function openDb(naam = DB_NAAM) {
  if (dbPromise && naam === DB_NAAM) return dbPromise;
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(naam, DB_VERSIE);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('hoofdstukken')) db.createObjectStore('hoofdstukken', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('notities')) db.createObjectStore('notities');
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'tijd' });
      if (!db.objectStoreNames.contains('bestanden')) db.createObjectStore('bestanden');
      if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      if (!db.objectStoreNames.contains('prullenbak')) db.createObjectStore('prullenbak', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB geblokkeerd'));
  });
  if (naam === DB_NAAM) dbPromise = p;
  return p;
}

function tx(storeNames, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transactie afgebroken'));
    const stores = Array.isArray(storeNames) ? storeNames.map((n) => t.objectStore(n)) : [t.objectStore(storeNames)];
    const r = fn(...stores);
    if (r && typeof r.then !== 'function' && 'onsuccess' in r) {
      r.onsuccess = () => { result = r.result; };
    } else result = r;
  }));
}

export const db = {
  get(store, key) { return tx(store, 'readonly', (s) => s.get(key)); },
  getAll(store) { return tx(store, 'readonly', (s) => s.getAll()); },
  getAllKeys(store) { return tx(store, 'readonly', (s) => s.getAllKeys()); },
  put(store, value, key) { return tx(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))); },
  del(store, key) { return tx(store, 'readwrite', (s) => s.delete(key)); },
  clear(store) { return tx(store, 'readwrite', (s) => s.clear()); },
  // Meerdere schrijfacties in één keer: alles of niets.
  batch(storeNames, fn) { return tx(storeNames, 'readwrite', (...stores) => { fn(...stores); return undefined; }); },
};

export async function vraagBlijvendeOpslag() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* niet erg */ }
  return false;
}
