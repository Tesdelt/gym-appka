// Export a import všech dat (včetně vlastních fotek) do souboru JSON.

import { openDB, DB_VERSION, getMeta, setMeta, getAll } from './db.js';
import { BUILTIN_IMAGES } from './builtinImages.js';
import { t } from './i18n.js';

const STORES = ['meta', 'gyms', 'exercises', 'templates', 'workouts', 'measurements', 'goals', 'images'];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function readAll(db, store) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function exportData() {
  const db = await openDB();
  const stores = {};
  for (const name of STORES) {
    const rows = await readAll(db, name);
    if (name === 'images') {
      stores[name] = await Promise.all(rows.map(async (r) => ({ ...r, blob: undefined, dataUrl: await blobToDataUrl(r.blob) })));
    } else {
      stores[name] = rows;
    }
  }
  return { app: 'gym-appka', format: 1, schema: DB_VERSION, exportedAt: new Date().toISOString(), stores };
}

export function backupFileName() {
  return `gym-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
}

// Sdílení přes iOS (Uložit do Souborů), jinak stažení souboru
export async function shareBackup() {
  const data = await exportData();
  const file = new File([JSON.stringify(data)], backupFileName(), { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('Záloha Gym') });
      await markBackedUp();
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await markBackedUp();
  return 'downloaded';
}

// Kontrola souboru před importem. Vrací shrnutí, nebo vyhodí chybu.
export function inspectBackup(data) {
  if (!data || data.app !== 'gym-appka' || !data.stores) throw new Error(t('Soubor není záloha této appky.'));
  if (data.schema > DB_VERSION) throw new Error(t('Záloha je z novější verze appky. Nejdřív appku aktualizuj.'));
  const s = data.stores;
  return {
    exportedAt: data.exportedAt,
    workouts: (s.workouts ?? []).length,
    exercises: (s.exercises ?? []).length,
    templates: (s.templates ?? []).length,
    photos: (s.images ?? []).length,
  };
}

// Přepíše všechna data obsahem zálohy (v jedné transakci).
export async function importData(data) {
  inspectBackup(data);
  const stores = { ...data.stores };
  stores.images = await Promise.all((stores.images ?? []).map(async (r) => {
    const blob = await (await fetch(r.dataUrl)).blob();
    const { dataUrl, ...rest } = r;
    return { ...rest, blob };
  }));
  // doplnění dat ze starších verzí (stejně jako migrace)
  for (const ex of stores.exercises ?? []) {
    if (!ex.images && BUILTIN_IMAGES[ex.id]) ex.images = BUILTIN_IMAGES[ex.id];
  }
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      const os = tx.objectStore(name);
      os.clear();
      for (const row of stores[name] ?? []) os.put(row);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error(t('Import zrušen')));
  });
}

export function pickBackupFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        resolve(JSON.parse(await file.text()));
      } catch {
        resolve({ error: t('Soubor nejde přečíst jako JSON.') });
      }
    });
    input.click();
  });
}

// ---------- Sledování záloh ----------
async function markBackedUp() {
  await setMeta('lastBackupAt', new Date().toISOString());
  await setMeta('backupSnoozeUntil', null);
}

// Stav zálohy: kdy naposledy, kolik dní a tréninků od té doby
export async function backupStatus() {
  const lastAt = await getMeta('lastBackupAt');
  const done = (await getAll('workouts', 'status', 'done')).length;
  const since = lastAt
    ? (await getAll('workouts', 'status', 'done')).filter((w) => (w.endedAt ?? w.startedAt) > lastAt).length
    : done;
  const days = lastAt ? Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400000) : null;
  return { lastAt, days, since, done };
}

// Připomenout zálohu? Až je co ztratit: nikdy nezálohováno a aspoň 2 tréninky,
// nebo týden od zálohy s novým tréninkem, nebo 5 tréninků bez zálohy.
export async function shouldRemindBackup() {
  const snooze = await getMeta('backupSnoozeUntil');
  if (snooze && snooze > new Date().toISOString()) return null;
  const st = await backupStatus();
  const remind = st.lastAt ? (st.days >= 7 && st.since >= 1) || st.since >= 5 : st.done >= 2;
  return remind ? st : null;
}

export async function snoozeBackupReminder(days = 3) {
  await setMeta('backupSnoozeUntil', new Date(Date.now() + days * 86400000).toISOString());
}

// ---------- Import historie (sloučení) ----------
// Soubor: { app: 'gym-appka', kind: 'history', exercises: [...], workouts: [...] }
// Přidá tréninky a chybějící cviky. Trénink se stejným id (z dřívějšího importu
// téhož souboru) přeskočí, s replace: true ho nahradí verzí ze souboru.
export function isHistoryFile(data) {
  return data?.app === 'gym-appka' && data?.kind === 'history' && Array.isArray(data.workouts);
}

// Kolik tréninků ze souboru už v appce je
export async function historyOverlap(data) {
  const ids = new Set((await getAll('workouts')).map((w) => w.id));
  const existing = data.workouts.filter((w) => ids.has(w.id)).length;
  return { total: data.workouts.length, existing, fresh: data.workouts.length - existing };
}

export async function importHistory(data, { replace = false } = {}) {
  const db = await openDB();
  const [existingEx, existingW, gyms] = await Promise.all([getAll('exercises'), getAll('workouts'), getAll('gyms')]);
  const norm = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const byId = new Map(existingEx.map((e) => [e.id, e]));
  const byDb = new Map(existingEx.filter((e) => e.dbId).map((e) => [e.dbId, e]));
  const byName = new Map(existingEx.map((e) => [norm(e.name), e]));
  const wIds = new Set(existingW.map((w) => w.id));

  // cvik, který už v appce je (stejné id, stejný cvik z katalogu nebo stejný název), se nepřidává znovu
  const remap = new Map();
  const newExercises = [];
  for (const ex of data.exercises ?? []) {
    const same = byId.get(ex.id) ?? (ex.dbId && byDb.get(ex.dbId)) ?? byName.get(norm(ex.name));
    if (same) remap.set(ex.id, same);
    else newExercises.push(ex);
  }
  const workouts = data.workouts.filter((w) => replace || !wIds.has(w.id)).map((w) => {
    const gym = gyms.find((g) => g.id === w.gymId);
    return {
      ...w,
      gymName: gym && w.gymName === data.defaultGymName ? gym.name : w.gymName,
      exercises: w.exercises.map((e) => {
        const target = remap.get(e.exerciseId);
        return target ? { ...e, exerciseId: target.id, name: target.name } : e;
      }),
    };
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['exercises', 'workouts'], 'readwrite');
    newExercises.forEach((e) => tx.objectStore('exercises').put(e));
    workouts.forEach((w) => tx.objectStore('workouts').put(w));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Import zrušen'));
  });
  const replaced = workouts.filter((w) => wIds.has(w.id)).length;
  return { exercises: newExercises.length, workouts: workouts.length - replaced, replaced, skipped: data.workouts.length - workouts.length };
}
