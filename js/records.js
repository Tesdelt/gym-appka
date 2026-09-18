// Osobní rekordy odvozené z uložených tréninků.
//
// Klíč rekordu: cvik + (u kladkových cviků) posilovna.
// Typy: maxWeight (nejvyšší váha), repsAtWeight (nejvíc opakování při dané
// váze), maxSeconds (nejdelší výdrž), maxReps (nejvíc opakování bez váhy).

import { slotsOf } from './recommend.js';
import { t } from './i18n.js';

export function recordKey(entry, gymId) {
  return entry.perGym ? `${entry.exerciseId}|${gymId}` : entry.exerciseId;
}

function emptyRecord() {
  return { maxWeight: null, repsAtWeight: new Map(), maxSeconds: null, maxReps: null };
}

// workouts: dokončené tréninky (libovolné pořadí)
export function computeRecords(workouts) {
  const records = new Map();
  for (const w of workouts) {
    for (const entry of w.exercises) {
      const key = recordKey(entry, w.gymId);
      if (!records.has(key)) records.set(key, emptyRecord());
      const rec = records.get(key);
      for (const slot of slotsOf(entry)) {
        if (!slot.done) continue;
        applySlot(rec, entry, slot, { date: w.startedAt, workoutId: w.id });
      }
    }
  }
  return records;
}

function applySlot(rec, entry, slot, meta) {
  if (entry.type === 'time') {
    if (!rec.maxSeconds || slot.seconds > rec.maxSeconds.value) rec.maxSeconds = { value: slot.seconds, weight: slot.weight, ...meta };
    return;
  }
  if (entry.type === 'reps') {
    if (!rec.maxReps || slot.reps > rec.maxReps.value) rec.maxReps = { value: slot.reps, ...meta };
    return;
  }
  if (!(slot.reps > 0)) return;
  if (!rec.maxWeight || slot.weight > rec.maxWeight.value) rec.maxWeight = { value: slot.weight, reps: slot.reps, ...meta };
  const at = rec.repsAtWeight.get(slot.weight);
  if (!at || slot.reps > at.value) rec.repsAtWeight.set(slot.weight, { value: slot.reps, ...meta });
}

// Nové rekordy v tréninku `workout` oproti `previousWorkouts`.
// Vrací pole { entryUid, slot, kind, text }. Cvik bez dřívějších záznamů
// rekord nedává (není s čím srovnávat); z jednoho tréninku se hlásí jen
// nejlepší série každého druhu.
export function findNewRecords(workout, previousWorkouts) {
  const before = computeRecords(previousWorkouts);
  const found = [];
  for (const entry of workout.exercises) {
    const prev = before.get(recordKey(entry, workout.gymId));
    if (!prev) continue;
    const now = emptyRecord();
    for (const slot of slotsOf(entry)) {
      if (slot.done) applySlot(now, entry, slot, { slot });
    }
    const push = (kind, text, meta) => found.push({ entryUid: entry.uid, slot: meta.slot, kind, text });

    if (entry.type === 'time') {
      if (now.maxSeconds && (!prev.maxSeconds || now.maxSeconds.value > prev.maxSeconds.value)) push('maxSeconds', t('Nejdelší výdrž'), now.maxSeconds);
      continue;
    }
    if (entry.type === 'reps') {
      if (now.maxReps && (!prev.maxReps || now.maxReps.value > prev.maxReps.value)) push('maxReps', t('Nejvíc opakování'), now.maxReps);
      continue;
    }
    let weightSlot = null;
    if (now.maxWeight && (!prev.maxWeight || now.maxWeight.value > prev.maxWeight.value)) {
      push('maxWeight', t('Nejvyšší váha'), now.maxWeight);
      weightSlot = now.maxWeight.slot;
    }
    for (const [weight, best] of now.repsAtWeight) {
      const was = prev.repsAtWeight.get(weight);
      if (was && best.value > was.value && best.slot !== weightSlot) push('repsAtWeight', t('Nejvíc opakování při této váze'), best);
    }
  }
  return found;
}
