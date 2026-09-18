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
