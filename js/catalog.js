// Katalog cviků: databáze free-exercise-db roztříděná podle partií
// a seřazená podle oblíbenosti (nejběžnější základní cviky nahoře).
//
// Položka (data/free-exercise-db.json):
//   { id, n (anglický název), nc (český), eq, p/s (hlavní/vedlejší svaly – klíče
//     z muscles.js), pop (1–100), t ('weight'|'reps'|'time'), bw, i (počet fotek),
//     th (1 = je náhled v img/db) }

import { loadDbIndex, downloadDbImages, EQUIPMENT_FROM_DB } from './images.js';
import { saveExercise, newExerciseId } from './data.js';
import { lang } from './i18n.js';
import { DEFAULT_WEIGHT_STEP } from './seed.js';

export const loadCatalog = loadDbIndex;

const texts = {};
function loadTexts(which) {
  texts[which] ??= fetch(`data/free-exercise-db-${which}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => {
    texts[which] = null;
    return {};
  });
  return texts[which];
}

export async function dbInstructions(dbId, which = lang) {
  const steps = (await loadTexts(which))[dbId];
  return steps?.length ? steps.join('\n') : '';
}

export function dbName(meta) {
  return (lang === 'en' ? meta.n : meta.nc) || meta.n;
}

export function thumbUrl(meta) {
  return meta.th ? `img/db/${encodeURIComponent(meta.id)}.jpg` : null;
}

// Cvik pro „moje cviky“ vytvořený z položky katalogu (oba jazyky)
export async function exerciseFromDb(meta) {
  const equipment = EQUIPMENT_FROM_DB[meta.eq] ?? 'other';
  const [cs, en] = await Promise.all([dbInstructions(meta.id, 'cs'), dbInstructions(meta.id, 'en')]);
  return {
    id: newExerciseId(meta.nc || meta.n),
    name: meta.nc || meta.n,
    nameEn: meta.n,
    aliases: [],
    type: meta.t ?? 'weight',
    mechanic: meta.m ?? 'c',
    bodyweight: meta.t === 'weight' && Boolean(meta.bw),
    equipment,
    perGym: equipment === 'cable',
    weightStep: DEFAULT_WEIGHT_STEP,
    gymSteps: {},
    muscles: { primary: [...meta.p], secondary: [...meta.s] },
    instructions: cs,
    instructionsEn: en,
    tips: '',
    images: [],
    photoId: null,
    source: 'free-exercise-db',
    dbId: meta.id,
    createdAt: new Date().toISOString(),
  };
}

// Přidá cvik z katalogu mezi moje cviky (stáhne fotky, když je internet)
export async function addFromCatalog(meta) {
  const ex = await exerciseFromDb(meta);
  try {
    ex.images = await downloadDbImages(meta.id, meta.i || 2);
  } catch {
    ex.images = [];
  }
  await saveExercise(ex);
  return ex;
}

// Cviky z katalogu přidané bez internetu nemají fotky. Při spuštění appky
// a po připojení k internetu se je pokusí dotáhnout.
let filling = false;
export async function fillMissingImages() {
  if (filling || !navigator.onLine) return 0;
  filling = true;
  let fixed = 0;
  try {
    const { listExercises } = await import('./data.js');
    const catalog = await loadCatalog().catch(() => []);
    for (const ex of await listExercises()) {
      if (ex.source !== 'free-exercise-db' || !ex.dbId || ex.images?.length) continue;
      const meta = catalog.find((m) => m.id === ex.dbId);
      try {
        const images = await downloadDbImages(ex.dbId, meta?.i || 2);
        if (images.length) { ex.images = images; await saveExercise(ex); fixed++; }
      } catch { /* zkusí se příště */ }
    }
  } finally {
    filling = false;
  }
  return fixed;
}
