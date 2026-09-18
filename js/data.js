// Přístup k datům appky nad IndexedDB: posilovny, cviky, šablony.

import { getAll, get, put, putAll, remove, getMeta, setMeta, newId } from './db.js';
import { t, lang, exName } from './i18n.js';

// ---------- Posilovny ----------
export async function listGyms() {
  const gyms = await getAll('gyms');
  return gyms.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addGym(name) {
  const gym = { id: newId(), name, createdAt: new Date().toISOString() };
  await put('gyms', gym);
  return gym;
}

export async function renameGym(id, name) {
  const gym = await get('gyms', id);
  if (!gym) return null;
  gym.name = name;
  await put('gyms', gym);
  return gym;
}

export async function deleteGym(id) {
  await remove('gyms', id);
  if ((await getMeta('lastGymId')) === id) {
    const rest = await listGyms();
    await setMeta('lastGymId', rest[0]?.id ?? null);
  }
}

export async function getLastGymId() {
  const id = await getMeta('lastGymId');
  if (id && (await get('gyms', id))) return id;
  const gyms = await listGyms();
  return gyms[0]?.id ?? null;
}

export function setLastGymId(id) {
  return setMeta('lastGymId', id);
}

// ---------- Cviky ----------
export async function listExercises() {
  const list = await getAll('exercises');
  return list.sort((a, b) => exName(a).localeCompare(exName(b), lang));
}

export function getExercise(id) {
  return get('exercises', id);
}

export async function exerciseMap() {
  const map = new Map();
  for (const e of await getAll('exercises')) map.set(e.id, e);
  return map;
}

// Uložení cviku. Při přejmenování se nový název propíše i do uložených
// tréninků, aby historie ukazovala aktuální název.
export async function saveExercise(exercise) {
  const before = await get('exercises', exercise.id);
  exercise.updatedAt = new Date().toISOString();
  await put('exercises', exercise);
  if (before && before.name !== exercise.name) {
    const workouts = await getAll('workouts');
    const changed = workouts.filter((w) => w.exercises.some((e) => e.exerciseId === exercise.id));
    changed.forEach((w) => w.exercises.forEach((e) => { if (e.exerciseId === exercise.id) e.name = exercise.name; }));
    if (changed.length) await putAll('workouts', changed);
  }
  return exercise;
}

export function newExerciseId(name) {
  const slug = String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${slug || 'cvik'}-${newId().slice(0, 6)}`;
}

// Šablony, které cvik používají (cvik v šabloně nejde smazat)
export async function templatesUsing(exerciseId) {
  const templates = await getAll('templates');
  return templates.filter((t) => t.exercises.some((e) => e.exerciseId === exerciseId));
}

export async function deleteExercise(exerciseId) {
  await remove('exercises', exerciseId);
}

// Krok váhy pro cvik v dané posilovně (kladky mají krok zvlášť)
export function weightStepFor(exercise, gymId) {
  if (exercise.perGym && gymId && exercise.gymSteps?.[gymId] != null) return exercise.gymSteps[gymId];
  return exercise.weightStep ?? 2.5;
}

// ---------- Šablony (typy tréninků) ----------
export async function listTemplates() {
  const list = await getAll('templates');
  return list.sort((a, b) => a.order - b.order);
}

export function getTemplate(id) {
  return get('templates', id);
}

export const EXERCISE_TYPE_LABEL = {
  weight: t('Opakování s váhou'),
  time: t('Výdrž na čas'),
  reps: t('Opakování bez váhy'),
};

export const EQUIPMENT_LABEL = {
  cable: t('kladka'),
  dumbbell: t('jednoručky'),
  plate: t('kotouč'),
  body: t('vlastní váha'),
  barbell: t('velká činka'),
  machine: t('stroj'),
  other: t('jiné'),
};

// ---------- Tělesné míry ----------
// Druhy měr (uživatel si další přidá v kroku 7), záznamy { id, kind, value, date, note }
const DEFAULT_MEASURE_KINDS = [
  { key: 'vaha', name: 'Tělesná váha', unit: 'kg' },
  { key: 'biceps', name: 'Obvod bicepsu', unit: 'cm' },
];

// Názvy známých měr (uložené jsou česky), v angličtině se ukazuje překlad
const MEASURE_KIND_NAMES = {
  vaha: 'Tělesná váha', biceps: 'Obvod bicepsu', predlokti: 'Obvod předloktí', hrudnik: 'Obvod hrudníku',
  ramena: 'Obvod ramen', krk: 'Obvod krku', pas: 'Obvod pasu', boky: 'Obvod boků', stehno: 'Obvod stehna',
  lytko: 'Obvod lýtka', tuk: 'Tělesný tuk', svaly: 'Svalová hmota',
};

export function kindName(kind) {
  const cs = MEASURE_KIND_NAMES[kind?.key];
  return lang === 'en' && cs ? t(cs) : kind?.name ?? '';
}

export async function listMeasureKinds() {
  return getMeta('measureKinds', DEFAULT_MEASURE_KINDS);
}

export function saveMeasureKinds(kinds) {
  return setMeta('measureKinds', kinds);
}

export async function listMeasurements() {
  const list = await getAll('measurements');
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

export async function addMeasurement(kind, value, date = new Date().toISOString(), note = '') {
  const row = { id: newId(), kind, value, date, note };
  await put('measurements', row);
  return row;
}

export function deleteMeasurement(id) {
  return remove('measurements', id);
}

// ---------- Úpravy šablon ----------
export async function saveTemplate(template) {
  template.updatedAt = new Date().toISOString();
  await put('templates', template);
  return template;
}

export async function addTemplate(name) {
  const list = await listTemplates();
  const t = {
    id: newId(), name, subtitle: '', order: (list[list.length - 1]?.order ?? 0) + 1,
    exercises: [], createdAt: new Date().toISOString(),
  };
  await put('templates', t);
  return t;
}

export function deleteTemplate(id) {
  return remove('templates', id);
}

// Pořadí šablon (čísla 1., 2., 3. …) podle pole id
export async function reorderTemplates(ids) {
  const list = await listTemplates();
  const byId = new Map(list.map((t) => [t.id, t]));
  const changed = ids.map((id, i) => ({ ...byId.get(id), order: i + 1 }));
  await putAll('templates', changed);
}

// Výchozí položka šablony pro cvik
// Výchozí pauza podle charakteru cviku (v sekundách):
//  5 min – vlastní váha se zátěží a těžké vícekloubové cviky s velkou činkou,
//  4 min – ostatní vícekloubové cviky (zapojují víc svalů),
//  3 min – izolované cviky a „pumpičky“.
// mechanic: 'c' vícekloubový / 'i' izolovaný (u vlastních cviků se odhadne z partií).
export function exerciseMechanic(exercise) {
  if (exercise.mechanic) return exercise.mechanic;
  const p = exercise.muscles?.primary ?? [];
  const s = exercise.muscles?.secondary ?? [];
  return p.length >= 2 || p.length + s.length >= 4 ? 'c' : 'i';
}

export function defaultRest(exercise) {
  if (exercise.type === 'weight' && exercise.bodyweight) return 300;
  if (exerciseMechanic(exercise) === 'i') return 180;
  return exercise.equipment === 'barbell' ? 300 : 240;
}

export function defaultTemplateItem(exercise) {
  const rest = defaultRest(exercise);
  const set = exercise.type === 'time'
    ? { weight: 0, seconds: 60, rest }
    : { weight: exercise.type === 'reps' ? 0 : 10, reps: 10, rest };
  return { exerciseId: exercise.id, mode: 'sets', sets: [{ ...set }, { ...set }, { ...set }], repRange: null, weightStep: null };
}

// ---------- Barvy typů tréninku ----------
// Tmavé, tlumené odstíny. Podklad řádku se z barvy dopočítá v CSS (--tc).
export const TEMPLATE_COLORS = [
  { key: 'red', name: t('Vínová'), hex: '#7A1C2A' },
  { key: 'blue', name: t('Modrá'), hex: '#274B6D' },
  { key: 'green', name: t('Zelená'), hex: '#2C5A3C' },
  { key: 'purple', name: t('Fialová'), hex: '#4D3366' },
  { key: 'brown', name: t('Hnědá'), hex: '#6B4A2C' },
  { key: 'petrol', name: t('Petrolejová'), hex: '#245A57' },
  { key: 'olive', name: t('Olivová'), hex: '#4F5424' },
  { key: 'gray', name: t('Grafitová'), hex: '#4A4E54' },
];

export function templateColor(key) {
  return TEMPLATE_COLORS.find((c) => c.key === key)?.hex ?? null;
}

// Vlastnosti prvku pro zabarvení (třída + CSS proměnná), nebo prázdné
export function colorAttrs(key, cls = '') {
  const hex = templateColor(key);
  return hex ? { class: `${cls} tcolor`.trim(), style: `--tc: ${hex}` } : { class: cls };
}
