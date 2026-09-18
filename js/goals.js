// Cíle: u cviku („+40 kg × 8 opakování do 2 měsíců“)
// a u tělesné míry („dosáhnout hodnoty, volitelně do data“).
//
// Cíl u cviku:
//   { id, kind: 'exercise', exerciseId, gymId | null,
//     targetSet: { weight, reps } | { reps } | { seconds },  – přesná série, kterou chci zvládnout
//     start: { weight, reps, seconds },  – nejlepší hodnoty při vytvoření (každá při splnění ostatních částí cíle)
//     dueDate: 'YYYY-MM-DD', createdAt, status: 'active'|'done', doneAt }
//   Starší tvar: metric: 'weight'|'reps'|'seconds', baseline, target (číslo), sessions (počet tréninků).
// Cíl u míry:
//   { id, kind: 'measure', measureKey, startValue | null, target, dueDate | null,
//     createdAt, status, doneAt }

import { getAll, put, remove, newId } from './db.js';
import { slotsOf, isClean, isWork } from './recommend.js';

export async function listGoals() {
  const goals = await getAll('goals');
  return goals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveGoal(goal) {
  return put('goals', goal);
}

export function deleteGoal(id) {
  return remove('goals', id);
}

export function newGoal(fields) {
  return { id: newId(), createdAt: new Date().toISOString(), status: 'active', doneAt: null, ...fields };
}

// Části cíle podle typu cviku
export function targetFields(exercise) {
  if (exercise.type === 'time') return ['seconds'];
  if (exercise.type === 'reps') return ['reps'];
  return ['weight', 'reps'];
}

// Cílová série (i u cílů ve starém tvaru)
export function goalTarget(goal) {
  return goal.targetSet ?? { [goal.metric]: goal.target };
}

function goalStart(goal) {
  return goal.start ?? { [goal.metric]: goal.baseline };
}

// Čisté série cviku z dokončených tréninků (u kladek jen v dané posilovně),
// volitelně jen z tréninků po datu `after`
export function cleanSets(done, exerciseId, gymId, after = null) {
  const out = [];
  for (const w of done) {
    if (w.status && w.status !== 'done') continue;
    if (after && w.startedAt <= after) continue;
    if (gymId && w.gymId !== gymId) continue;
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      for (const s of slotsOf(e)) if (isClean(s)) out.push(s);
    }
  }
  return out;
}

// Série splňuje všechny části cíle
const meets = (set, target) => Object.keys(target).every((k) => (set[k] ?? 0) >= target[k]);

// Nejlepší hodnota části `field` mezi sériemi, které splňují ostatní části cíle
// (např. nejvyšší váha, se kterou jsem dal aspoň 8 opakování)
export function bestAlong(sets, target, field) {
  let best = null;
  for (const s of sets) {
    if (Object.keys(target).some((k) => k !== field && (s[k] ?? 0) < target[k])) continue;
    if (field === 'weight' && !(s.reps > 0)) continue;
    const v = s[field] ?? 0;
    if (best == null || v > best) best = v;
  }
  return best;
}

// Výchozí stav nového cíle: nejlepší hodnoty doteď
export function goalStartFrom(sets, target) {
  return Object.fromEntries(Object.keys(target).map((k) => [k, bestAlong(sets, target, k)]));
}

// Nejlepší výkony doteď: nejtěžší série, série s nejvíc opakováními, nejdelší výdrž
export function bestSoFar(sets, exercise) {
  const top = (list, a, b) => list.reduce((best, s) => (a(s) > a(best) || (a(s) === a(best) && b(s) > b(best)) ? s : best));
  const w = (s) => s.weight ?? 0;
  const r = (s) => s.reps ?? 0;
  if (exercise.type === 'time') return sets.length ? { longest: top(sets, (s) => s.seconds ?? 0, w) } : null;
  const loaded = sets.filter((s) => r(s) > 0);
  if (!loaded.length) return null;
  if (exercise.type === 'reps') return { mostReps: top(loaded, r, w) };
  return { heaviest: top(loaded, w, r), mostReps: top(loaded, r, w) };
}

// Tréninky s daným cvikem (nejnovější první), u kladek jen v dané posilovně
function sessionsWith(done, goal, after = null) {
  const out = [];
  for (const w of done) {
    if (w.status && w.status !== 'done') continue;
    if (after && w.startedAt <= after) continue;
    if (goal.gymId && w.gymId !== goal.gymId) continue;
    const entry = w.exercises.find((e) => e.exerciseId === goal.exerciseId && slotsOf(e).some(isWork));
    if (entry) out.push({ workout: w, entry });
  }
  return out;
}

// Kde jsem cíl splnil: první série po vytvoření cíle, která ho splňuje.
// Vrací { workout, entryIndex, slotIndex } nebo null.
export function goalHit(goal, workouts) {
  if (goal.kind !== 'exercise') return null;
  const target = goalTarget(goal);
  const list = workouts
    .filter((w) => (!w.status || w.status === 'done') && !w.manual && w.startedAt > goal.createdAt && (!goal.gymId || w.gymId === goal.gymId))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const w of list) {
    for (const [entryIndex, e] of w.exercises.entries()) {
      if (e.exerciseId !== goal.exerciseId) continue;
      const slotIndex = slotsOf(e).findIndex((s) => isClean(s) && meets(s, target));
      if (slotIndex !== -1) return { workout: w, entryIndex, slotIndex };
    }
  }
  return null;
}

// Kolik tréninků s cvikem ještě stihnu do data: podle toho, jak často ho
// dělám poslední 4 týdny (aspoň jednou týdně)
function sessionsUntil(done, goal, days) {
  const since = new Date(Date.now() - 28 * 86400000).toISOString();
  const perWeek = Math.max(1, sessionsWith(done, goal, since).length / 4);
  return Math.max(1, Math.round((days / 7) * perWeek));
}

// Stav cíle. done = dokončené tréninky (libovolné pořadí), measurements = záznamy měr.
export function evaluateGoal(goal, done, measurements = []) {
  if (goal.kind === 'measure') {
    const values = measurements.filter((m) => m.kind === goal.measureKey).sort((a, b) => b.date.localeCompare(a.date));
    const current = values[0]?.value ?? null;
    // bez výchozí hodnoty se počítá od prvního záznamu po vytvoření cíle
    const firstAfter = values.filter((m) => m.date >= goal.createdAt.slice(0, 10)).at(-1)?.value ?? null;
    const start = goal.startValue ?? firstAfter ?? current;
    const reached = current != null && (goal.target >= (start ?? goal.target) ? current >= goal.target : current <= goal.target);
    let progress = 0;
    if (current != null && start != null && goal.target !== start) progress = (current - start) / (goal.target - start);
    else if (reached) progress = 1;
    const days = daysLeft(goal.dueDate);
    return { current, start, progress: clamp(progress), reached, daysLeft: days, expired: days != null && days < 0 };
  }

  const target = goalTarget(goal);
  const start = goalStart(goal);
  const sets = cleanSets(done, goal.exerciseId, goal.gymId, goal.createdAt);
  // postup = nejdál posunutá část cíle (váha při cílových opakováních,
  // nebo opakování při cílové váze), od stavu při vytvoření cíle
  let progress = 0;
  let best = null;
  for (const s of sets) {
    let score = meets(s, target) ? 1 : 0;
    for (const k of Object.keys(target)) {
      const base = start[k] ?? (k === 'weight' ? null : 0);
      if (base == null || target[k] <= base) continue;
      if (Object.keys(target).some((o) => o !== k && (s[o] ?? 0) < target[o])) continue;
      score = Math.max(score, ((s[k] ?? 0) - base) / (target[k] - base));
    }
    if (score > 0 && (!best || score > progress)) { progress = score; best = s; }
  }
  const reached = sets.some((s) => meets(s, target));
  const sessionsDone = sessionsWith(done, goal, goal.createdAt).length;
  const days = daysLeft(goal.dueDate);
  const sessionsLeft = goal.dueDate
    ? (days < 0 ? 0 : sessionsUntil(done, goal, days))
    : Math.max(0, (goal.sessions ?? 0) - sessionsDone);
  return {
    progress: clamp(reached ? 1 : progress),
    reached,
    best,
    sessionsDone,
    sessionsLeft,
    daysLeft: days,
    expired: goal.dueDate ? days < 0 : sessionsLeft === 0,
  };
}

function clamp(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

// Aktivní cíl u cviku pro danou posilovnu
export function activeGoalFor(goals, exercise, gymId) {
  return goals.find((g) => g.kind === 'exercise' && g.status === 'active' && g.exerciseId === exercise.id
    && (!exercise.perGym || !g.gymId || g.gymId === gymId)) ?? null;
}

// Doporučení podle cíle: zbývající kus cesty se rozpočítá na tréninky, které
// do termínu stihnu, a zaokrouhlí na krok (váha na krok váhy, výdrž na 5 s,
// opakování na 1). U cíle váha × opakování se nejdřív přidává váha (a drží
// cílový počet opakování); když chybí opakování i váha, vede běžné pravidlo
// (opakování nahoru, pak váha). Vrací funkci (série z minula) → hodnoty,
// nebo null, když cíl nic nemění.
export function goalAdjust(goal, state, lastEntry, weightStep) {
  if (!goal || !lastEntry || state.reached || state.expired) return null;
  const last = slotsOf(lastEntry).filter(isClean);
  if (!last.length) return null;
  const left = Math.max(1, state.sessionsLeft);
  const target = goalTarget(goal);
  const round2 = (v) => Math.round(v * 100) / 100;

  if (target.seconds != null) {
    const best = Math.max(...last.map((s) => s.seconds ?? 0));
    const d = Math.round((target.seconds - best) / left / 5) * 5;
    return d > 0 ? (ref) => ({ weight: ref.weight, seconds: (ref.seconds ?? 0) + d }) : null;
  }
  const loaded = last.filter((s) => (s.reps ?? 0) > 0);
  if (!loaded.length) return null;
  const top = loaded.reduce((a, s) => ((s.weight ?? 0) > (a.weight ?? 0) ? s : a));
  if (target.weight != null && (top.weight ?? 0) < target.weight) {
    if (target.reps != null && (top.reps ?? 0) < target.reps) return null;
    const d = Math.round((target.weight - top.weight) / left / weightStep) * weightStep;
    if (d <= 0) return null;
    return (ref) => ({
      weight: round2(Math.min(Math.max(target.weight, ref.weight), ref.weight + d)),
      reps: target.reps ?? ref.reps,
    });
  }
  if (target.reps != null) {
    const atWeight = target.weight != null ? loaded.filter((s) => (s.weight ?? 0) >= target.weight) : loaded;
    const best = Math.max(...atWeight.map((s) => s.reps ?? 0));
    const d = Math.round((target.reps - best) / left);
    return d > 0 ? (ref) => ({ weight: ref.weight, reps: (ref.reps ?? 0) + d }) : null;
  }
  return null;
}

// Kolik dní zbývá do data cíle: 0 = poslední den, záporné = termín vypršel
export function daysLeft(dueDate) {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${dueDate}T00:00:00`) - today) / 86400000);
}

// Termín cíle: týdny (1–4), pak měsíce (2–12)
export const DURATIONS = [
  ...[1, 2, 3, 4].map((n) => ({ n, unit: 'week' })),
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ n, unit: 'month' })),
];

// Datum termínu (YYYY-MM-DD, místní čas) za danou dobu od dneška
export function dueDateAfter({ n, unit }, from = new Date()) {
  const d = new Date(from);
  if (unit === 'week') d.setDate(d.getDate() + 7 * n);
  else d.setMonth(d.getMonth() + n);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Označí splněné cíle. Vrací cíle, které se právě splnily.
export async function markReachedGoals(goals, done, measurements) {
  const reached = [];
  for (const g of goals) {
    if (g.status !== 'active') continue;
    if (evaluateGoal(g, done, measurements).reached) {
      g.status = 'done';
      g.doneAt = new Date().toISOString();
      await saveGoal(g);
      reached.push(g);
    }
  }
  return reached;
}
