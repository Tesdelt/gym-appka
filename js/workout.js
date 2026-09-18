// Stav tréninku: vytvoření ze šablony, rozdělaný trénink, série, ukončení.
//
// Trénink (sklad workouts):
//   { id, templateId, name, gymId, gymName, startedAt, endedAt, status: 'active'|'done',
//     exercises: [entry], cursor: { ex, slot } | null, scales: {energy, sleep, food}, comment }
// Záznam cviku (entry):
//   { uid, exerciseId, name, type, bodyweight, perGym, weightStep, mode, note, next,
//     sets: [slot]                                   (mode 'sets')
//     rounds: [{ steps: [slot] }], rest              (mode 'dropset')
//     rec: [{weight, reps|seconds}], last: { date, values: [...] } | null }
// Série / stupeň (slot):
//   { plan: {weight, reps, seconds}, range: {min, max}, rest, weight, reps, seconds, done, doneAt }

import { getAll, get, put, remove, newId } from './db.js';
import { getExercise, getTemplate, weightStepFor, setLastGymId } from './data.js';
import { rangeFor, recommendSets, recommendDropset, slotsOf } from './recommend.js';

// ---------- Načtení ----------
export async function getActiveWorkout() {
  const list = await getAll('workouts', 'status', 'active');
  return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
}

export async function listDoneWorkouts() {
  const list = await getAll('workouts', 'status', 'done');
  return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getWorkout(id) {
  return get('workouts', id);
}

export function saveWorkout(workout) {
  return put('workouts', workout);
}

export function deleteWorkout(id) {
  return remove('workouts', id);
}

// Poslední dokončený záznam daného cviku (u kladek jen ve stejné posilovně)
export function findLastEntry(doneWorkouts, exerciseId, perGym, gymId, before = null) {
  for (const w of doneWorkouts) {
    if (before && w.startedAt >= before) continue;
    if (perGym && w.gymId !== gymId) continue;
    const entry = w.exercises.find((e) => e.exerciseId === exerciseId && slotsOf(e).some((s) => s.done));
    if (entry) return { entry, workout: w };
  }
  return null;
}

// ---------- Vytvoření ----------
export async function startWorkout(templateId, gymId, gymName) {
  const template = await getTemplate(templateId);
  const done = await listDoneWorkouts();
  const exercises = [];
  for (const item of template.exercises) {
    const exercise = await getExercise(item.exerciseId);
    if (!exercise) continue;
    exercises.push(buildEntry(item, exercise, gymId, done));
  }
  const workout = {
    id: newId(),
    templateId,
    name: template.name,
    gymId,
    gymName,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: 'active',
    exercises,
    cursor: exercises.length ? { ex: 0, slot: 0 } : null,
    scales: { energy: null, sleep: null, food: null },
    comment: '',
  };
  await saveWorkout(workout);
  await setLastGymId(gymId);
  return workout;
}

function slotFrom(templateSet, range, rest, exercise) {
  const plan = {
    weight: exercise.type === 'reps' ? 0 : (templateSet.weight ?? 0),
    reps: exercise.type === 'time' ? null : (templateSet.reps ?? 10),
    seconds: exercise.type === 'time' ? (templateSet.seconds ?? 30) : null,
  };
  return { plan, range, rest, ...plan, done: false, doneAt: null };
}

// Sestaví záznam cviku ze šablony, předvyplní hodnoty z posledního tréninku
// a spočítá doporučení.
export function buildEntry(item, exercise, gymId, doneWorkouts) {
  const last = findLastEntry(doneWorkouts, exercise.id, exercise.perGym, gymId);
  const entry = {
    uid: newId(),
    exerciseId: exercise.id,
    name: exercise.name,
    type: exercise.type,
    bodyweight: Boolean(exercise.bodyweight),
    perGym: Boolean(exercise.perGym),
    weightStep: item.weightStep ?? weightStepFor(exercise, gymId),
    mode: item.mode,
    note: '',
    next: 'keep',
    rec: [],
    last: null,
  };

  if (item.mode === 'dropset') {
    const range = rangeFor(item.steps[0], item);
    entry.rest = item.rest;
    entry.rounds = Array.from({ length: item.rounds }, () => ({
      steps: item.steps.map((st) => slotFrom(st, range, 0, exercise)),
    }));
    if (last?.entry.mode === 'dropset') {
      const lastSteps = last.entry.rounds[last.entry.rounds.length - 1].steps;
      for (const round of entry.rounds) {
        round.steps.forEach((slot, i) => prefill(slot, lastSteps[Math.min(i, lastSteps.length - 1)]));
      }
    }
    entry.rec = recommendDropset(entry, last?.entry ?? null);
    if (isExplicitChoice(last)) {
      for (const round of entry.rounds) round.steps.forEach((slot, i) => applyValues(slot, entry.rec[i]));
    }
  } else {
    entry.sets = item.sets.map((s) => slotFrom(s, rangeFor(s, item), s.rest, exercise));
    if (last) {
      const lastDone = slotsOf(last.entry).filter((s) => s.done);
      entry.sets.forEach((slot, i) => prefill(slot, lastDone[Math.min(i, lastDone.length - 1)]));
    }
    entry.rec = recommendSets(entry, last?.entry ?? null);
    if (isExplicitChoice(last)) entry.sets.forEach((slot, i) => applyValues(slot, entry.rec[i]));
  }

  if (last) {
    entry.last = {
      date: last.workout.startedAt,
      values: slotsOf(last.entry).filter((s) => s.done).map((s) => ({ weight: s.weight, reps: s.reps, seconds: s.seconds })),
      next: last.entry.next,
    };
  }
  return entry;
}

// Volba „Přidat“ / „Snížit“ z minula se provede rovnou: hodnoty se předvyplní
// už posunuté (a stanou se plánem série).
function isExplicitChoice(last) {
  return last?.entry.next === 'more' || last?.entry.next === 'less';
}

function applyValues(slot, values) {
  if (!values) return;
  if (values.weight != null) slot.weight = values.weight;
  if (values.reps != null) slot.reps = values.reps;
  if (values.seconds != null) slot.seconds = values.seconds;
  slot.plan = { weight: slot.weight, reps: slot.reps, seconds: slot.seconds };
}

function prefill(slot, ref) {
  if (!ref) return;
  slot.weight = ref.weight ?? slot.weight;
  slot.reps = ref.reps ?? slot.reps;
  slot.seconds = ref.seconds ?? slot.seconds;
  slot.plan = { weight: slot.weight, reps: slot.reps, seconds: slot.seconds };
}

// Záznam pro cvik přidaný během tréninku (mimo šablonu): sady ze šablony,
// kde se cvik vyskytuje, jinak výchozí 3 série.
export async function buildAdHocEntry(exercise, gymId, templates) {
  const done = await listDoneWorkouts();
  let item = null;
  for (const t of templates) {
    item = t.exercises.find((e) => e.exerciseId === exercise.id);
    if (item) break;
  }
  if (!item) {
    const base = exercise.type === 'time' ? { weight: 0, seconds: 30, rest: 180 } : { weight: 0, reps: 10, rest: 180 };
    item = { mode: 'sets', sets: [base, base, base], repRange: null, weightStep: null };
  }
  return buildEntry(item, exercise, gymId, done);
}

// ---------- Pozice v tréninku ----------
export function slotLabel(entry, index) {
  if (entry.mode === 'dropset') {
    const steps = entry.rounds[0].steps.length;
    const round = Math.floor(index / steps);
    const step = index % steps;
    return `Kolo ${round + 1}/${entry.rounds.length}, váha ${step + 1}/${steps}`;
  }
  return `Série ${index + 1}/${entry.sets.length}`;
}

// Pauza po dané sérii: u drop setu jen po posledním stupni kola
export function restAfter(entry, index) {
  if (entry.mode === 'dropset') {
    const steps = entry.rounds[0].steps.length;
    return index % steps === steps - 1 ? entry.rest : 0;
  }
  return entry.sets[index].rest;
}

export function currentSlot(workout) {
  const c = workout.cursor;
  if (!c) return null;
  const entry = workout.exercises[c.ex];
  if (!entry) return null;
  const slots = slotsOf(entry);
  if (!slots[c.slot]) return null;
  return { entry, slot: slots[c.slot], index: c.slot };
}

export function entryDone(entry) {
  const slots = slotsOf(entry);
  return slots.length > 0 && slots.every((s) => s.done);
}

// Další neodcvičená série: nejdřív ve stejném cviku, pak v dalších, pak od začátku.
export function nextUndone(workout, from) {
  const n = workout.exercises.length;
  if (!n) return null;
  const start = from ?? { ex: 0, slot: -1 };
  for (let k = 0; k < n; k++) {
    const ex = (start.ex + k) % n;
    const slots = slotsOf(workout.exercises[ex]);
    const begin = k === 0 ? start.slot + 1 : 0;
    for (let i = begin; i < slots.length; i++) {
      if (!slots[i].done) return { ex, slot: i };
    }
  }
  // dříve přeskočené série ve stejném cviku
  const slots = slotsOf(workout.exercises[start.ex]);
  for (let i = 0; i <= start.slot && i < slots.length; i++) {
    if (!slots[i].done) return { ex: start.ex, slot: i };
  }
  return null;
}

export function firstUndoneIn(entry) {
  const i = slotsOf(entry).findIndex((s) => !s.done);
  return i === -1 ? 0 : i;
}

// Následující pozice v pořadí (bez ohledu na hotovo), nebo null na konci.
export function nextInOrder(workout, from) {
  if (!from) return null;
  const slots = slotsOf(workout.exercises[from.ex]);
  if (from.slot + 1 < slots.length) return { ex: from.ex, slot: from.slot + 1 };
  if (from.ex + 1 < workout.exercises.length) return { ex: from.ex + 1, slot: 0 };
  return null;
}

// Předchozí pozice v pořadí, nebo null na začátku.
export function prevInOrder(workout, from) {
  if (!from) return null;
  if (from.slot > 0) return { ex: from.ex, slot: from.slot - 1 };
  if (from.ex > 0) {
    const ex = from.ex - 1;
    return { ex, slot: slotsOf(workout.exercises[ex]).length - 1 };
  }
  return null;
}

// Kam se přejde po potvrzení aktuální série (ještě před jejím označením).
export function positionAfterConfirm(workout) {
  const cur = currentSlot(workout);
  if (!cur) return null;
  if (cur.slot.done) return nextInOrder(workout, workout.cursor);
  return nextUndone(workout, workout.cursor);
}

// Potvrzení série: označí hotovo a posune kurzor. U už hotové série jen
// uloží změnu a jde na další v pořadí.
export function completeCurrent(workout) {
  const cur = currentSlot(workout);
  if (!cur) return;
  const target = positionAfterConfirm(workout);
  if (!cur.slot.done) {
    cur.slot.done = true;
    cur.slot.doneAt = new Date().toISOString();
  }
  workout.cursor = target ?? nextUndone(workout, workout.cursor);
}

// Zbývající sekundy do konce tréninku nejsou, jen celková délka.
export function elapsedSeconds(workout, now = Date.now()) {
  const end = workout.endedAt ? new Date(workout.endedAt).getTime() : now;
  return Math.max(0, Math.floor((end - new Date(workout.startedAt).getTime()) / 1000));
}

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDurationLong(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

// ---------- Ukončení ----------
export async function finishWorkout(workout, { scales, comment }) {
  workout.status = 'done';
  workout.endedAt = workout.endedAt ?? new Date().toISOString();
  workout.scales = scales;
  workout.comment = comment;
  workout.cursor = null;
  await saveWorkout(workout);
  return workout;
}

// Porovnání s posledním tréninkem stejného typu: pro každý cvik lepší/horší/stejné.
export function compareWithPrevious(workout, previous) {
  if (!previous) return [];
  const out = [];
  for (const entry of workout.exercises) {
    const prev = previous.exercises.find((e) => e.exerciseId === entry.exerciseId);
    const now = doneValues(entry);
    if (!prev || !now.length) continue;
    const before = doneValues(prev);
    if (!before.length) continue;
    out.push({ entry, before, now, verdict: verdict(entry.type, before, now) });
  }
  return out;
}

export function doneValues(entry) {
  return slotsOf(entry).filter((s) => s.done).map((s) => ({ weight: s.weight, reps: s.reps, seconds: s.seconds }));
}

function verdict(type, before, now) {
  const score = (vals) => {
    if (type === 'time') return [Math.max(...vals.map((v) => v.seconds ?? 0)), 0];
    if (type === 'reps') return [vals.reduce((a, v) => a + (v.reps ?? 0), 0), 0];
    const maxW = Math.max(...vals.map((v) => v.weight ?? 0));
    return [maxW, vals.reduce((a, v) => a + (v.reps ?? 0), 0)];
  };
  const [b1, b2] = score(before);
  const [n1, n2] = score(now);
  if (n1 !== b1) return n1 > b1 ? 'up' : 'down';
  if (n2 !== b2) return n2 > b2 ? 'up' : 'down';
  return 'same';
}
