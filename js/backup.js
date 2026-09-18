// Export a import všech dat (včetně vlastních fotek) do souboru JSON.

import { openDB, DB_VERSION } from './db.js';
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
