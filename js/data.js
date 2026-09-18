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
