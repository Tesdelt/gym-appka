// Výpočty pro statistiky: ruční záznamy výkonu, body grafů, frekvence tréninků.
//
// Ruční záznam výkonu (např. test maxima) je ve skladu measurements:
//   { id, kind: 'ex-record', exerciseId, gymId | null, weight, reps, seconds, date, note }

import { getAll, put, remove, newId } from './db.js';
import { slotsOf } from './recommend.js';
import { formatWeight } from './ui.js';
import { t, exName } from './i18n.js';

export const EX_RECORD = 'ex-record';

export async function listManualRecords() {
  const all = await getAll('measurements', 'kind', EX_RECORD);
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function addManualRecord(fields) {
  const row = { id: newId(), kind: EX_RECORD, note: '', ...fields };
  await put('measurements', row);
  return row;
}

export function deleteManualRecord(id) {
  return remove('measurements', id);
}

// Ruční záznamy jako „tréninky“ o jedné sérii, aby šly spočítat rekordy
// stejným kódem jako u tréninků. Do historie tréninků se nedostanou.
export function manualAsWorkouts(manual, exercises) {
  const out = [];
  for (const m of manual) {
    const ex = exercises.get(m.exerciseId);
    if (!ex) continue;
    out.push({
      id: m.id,
      manual: true,
      status: 'done',
      startedAt: m.date,
      gymId: m.gymId,
      exercises: [{
        uid: m.id, exerciseId: ex.id, name: exName(ex), type: ex.type, bodyweight: Boolean(ex.bodyweight), perGym: Boolean(ex.perGym),
        mode: 'sets', sets: [{ done: true, weight: m.weight ?? 0, reps: m.reps ?? null, seconds: m.seconds ?? null }],
      }],
    });
  }
  return out;
}

// Body grafu výkonu cviku: nejlepší hodnota z každého tréninku / záznamu.
// Maximum je zlaté.
export function exercisePoints(sessions, exercise, gymId) {
  const points = [];
  for (const w of sessions) {
    if (exercise.perGym && w.gymId !== gymId) continue;
    for (const entry of w.exercises) {
      if (entry.exerciseId !== exercise.id) continue;
      const slots = slotsOf(entry).filter((s) => s.done);
      if (!slots.length) continue;
      let v;
      if (exercise.type === 'time') v = Math.max(...slots.map((s) => s.seconds ?? 0));
      else if (exercise.type === 'reps') v = Math.max(...slots.map((s) => s.reps ?? 0));
      else {
        const loaded = slots.filter((s) => (s.reps ?? 0) > 0);
        if (!loaded.length) continue;
        v = Math.max(...loaded.map((s) => s.weight ?? 0));
      }
      if (Number.isFinite(v)) points.push({ t: w.startedAt, v, manual: Boolean(w.manual) });
    }
  }
  if (points.length) {
    const max = Math.max(...points.map((p) => p.v));
    [...points].sort((a, b) => a.t.localeCompare(b.t)).find((p) => p.v === max).gold = true;
  }
  return points;
}

export function exerciseFormat(exercise) {
  if (exercise.type === 'time') return (v) => `${v} s`;
  if (exercise.type === 'reps') return (v) => String(v);
  return (v) => formatWeight(v, { bodyweight: exercise.bodyweight }).replace(' kg', '');
}

export function exerciseChartTitle(exercise) {
  if (exercise.type === 'time') return t('Nejdelší výdrž');
  if (exercise.type === 'reps') return t('Nejvíc opakování v sérii');
  return exercise.bodyweight ? t('Nejvyšší přidaná váha (kg)') : t('Nejvyšší váha (kg)');
}

// ---------- Frekvence ----------
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // pondělí
  return d;
}

export function frequency(done, weeks = 12, now = new Date()) {
  const thisWeek = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = new Date(thisWeek);
    from.setDate(from.getDate() - i * 7);
    buckets.push({ from, count: 0 });
  }
  let week = 0;
  let month = 0;
  const firstFrom = buckets[0].from.getTime();
  for (const w of done) {
    const t = new Date(w.startedAt);
    if (t >= thisWeek) week++;
    if (t >= monthStart) month++;
    if (t.getTime() >= firstFrom) {
      const idx = Math.floor((startOfWeek(t).getTime() - firstFrom) / (7 * 86400000) + 0.01);
      if (buckets[idx]) buckets[idx].count++;
    }
  }
  // průměr za týdny od prvního tréninku (max. `weeks`)
  const first = done.length ? startOfWeek(done[done.length - 1].startedAt).getTime() : thisWeek.getTime();
  const span = Math.min(weeks, Math.max(1, Math.round((thisWeek.getTime() - first) / (7 * 86400000)) + 1));
  const recent = buckets.slice(-span).reduce((a, b) => a + b.count, 0);
  return { week, month, avg: recent / span, buckets };
}
