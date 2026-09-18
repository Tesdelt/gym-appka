// IndexedDB: otevření databáze, migrace schématu a jednoduché operace.
//
// Každá změna schématu = nová položka v MIGRATIONS. Verze databáze je délka
// tohoto pole, migrace se spouštějí postupně od verze, kterou má uživatel.
// Data uživatele se nikdy nemažou, jen se doplňují nové sklady a indexy.

const DB_NAME = 'gym';

const MIGRATIONS = [
  // v1: základní sklady
  (db) => {
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('gyms', { keyPath: 'id' });
    db.createObjectStore('exercises', { keyPath: 'id' });
    db.createObjectStore('templates', { keyPath: 'id' });
    const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
    workouts.createIndex('startedAt', 'startedAt');
    workouts.createIndex('status', 'status');
    const measurements = db.createObjectStore('measurements', { keyPath: 'id' });
    measurements.createIndex('kind', 'kind');
    db.createObjectStore('goals', { keyPath: 'id' });
    db.createObjectStore('images', { keyPath: 'id' });
  },
];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, MIGRATIONS.length);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      for (let v = event.oldVersion; v < MIGRATIONS.length; v++) {
        MIGRATIONS[v](db, req.transaction);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Databáze je blokovaná jiným oknem appky.'));
  });
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transakce zrušena'));
  });
}

export async function get(store, key) {
  const db = await openDB();
  return promisify(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store, indexName = null, query = null) {
  const db = await openDB();
  let source = db.transaction(store).objectStore(store);
  if (indexName) source = source.index(indexName);
  return promisify(source.getAll(query));
}

export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await done(tx);
  return value;
}

export async function putAll(store, values) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  values.forEach((v) => os.put(v));
  await done(tx);
}

export async function remove(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

export async function count(store) {
  const db = await openDB();
  return promisify(db.transaction(store).objectStore(store).count());
}

// Hodnoty ve skladu meta: { key, value }
export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await put('meta', { key, value });
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Trvalé úložiště: iOS jinak může data smazat při nedostatku místa.
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
