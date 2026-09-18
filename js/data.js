// Přístup k datům appky nad IndexedDB: posilovny, cviky, šablony.

import { getAll, get, put, putAll, remove, getMeta, setMeta, newId } from './db.js';

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
  return list.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
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
  weight: 'Opakování s váhou',
  time: 'Výdrž na čas',
  reps: 'Opakování bez váhy',
};

export const EQUIPMENT_LABEL = {
  cable: 'kladka',
  dumbbell: 'jednoručky',
  plate: 'kotouč',
  body: 'vlastní váha',
  barbell: 'velká činka',
  machine: 'stroj',
  other: 'jiné',
};

// ---------- Tělesné míry ----------
// Druhy měr (uživatel si další přidá v kroku 7), záznamy { id, kind, value, date, note }
const DEFAULT_MEASURE_KINDS = [
  { key: 'vaha', name: 'Tělesná váha', unit: 'kg' },
  { key: 'biceps', name: 'Obvod bicepsu', unit: 'cm' },
];

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
export function defaultTemplateItem(exercise) {
  const set = exercise.type === 'time'
    ? { weight: 0, seconds: 60, rest: 180 }
    : { weight: exercise.type === 'reps' ? 0 : 10, reps: 10, rest: 180 };
  return { exerciseId: exercise.id, mode: 'sets', sets: [{ ...set }, { ...set }, { ...set }], repRange: null, weightStep: null };
}

// ---------- Barvy typů tréninku ----------
// Tmavé, tlumené odstíny. Podklad řádku se z barvy dopočítá v CSS (--tc).
export const TEMPLATE_COLORS = [
  { key: 'red', name: 'Vínová', hex: '#7A1C2A' },
  { key: 'blue', name: 'Modrá', hex: '#274B6D' },
  { key: 'green', name: 'Zelená', hex: '#2C5A3C' },
  { key: 'purple', name: 'Fialová', hex: '#4D3366' },
  { key: 'brown', name: 'Hnědá', hex: '#6B4A2C' },
  { key: 'petrol', name: 'Petrolejová', hex: '#245A57' },
  { key: 'olive', name: 'Olivová', hex: '#4F5424' },
  { key: 'gray', name: 'Grafitová', hex: '#4A4E54' },
];

export function templateColor(key) {
  return TEMPLATE_COLORS.find((c) => c.key === key)?.hex ?? null;
}

// Vlastnosti prvku pro zabarvení (třída + CSS proměnná), nebo prázdné
export function colorAttrs(key, cls = '') {
  const hex = templateColor(key);
  return hex ? { class: `${cls} tcolor`.trim(), style: `--tc: ${hex}` } : { class: cls };
}
