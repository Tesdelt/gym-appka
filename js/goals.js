// Cíle: u cviku („za X tréninků o Y kg / opakování / sekund víc“)
// a u tělesné míry („dosáhnout hodnoty, volitelně do data“).
//
// Cíl u cviku:
//   { id, kind: 'exercise', exerciseId, gymId | null, metric: 'weight'|'reps'|'seconds',
//     baseline, target, sessions, createdAt, status: 'active'|'done', doneAt }
// Cíl u míry:
//   { id, kind: 'measure', measureKey, startValue | null, target, dueDate | null,
//     createdAt, status, doneAt }

import { getAll, put, remove, newId } from './db.js';
import { slotsOf } from './recommend.js';

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

// Metrika, kterou cvik umí: váha, opakování, výdrž
export function metricsFor(exercise) {
  if (exercise.type === 'time') return ['seconds'];
  if (exercise.type === 'reps') return ['reps'];
  return ['weight', 'reps'];
}

export const METRIC_UNIT = { weight: 'kg', reps: 'opak.', seconds: 's' };

// Nejlepší hodnota záznamu cviku v tréninku podle metriky
export function bestValue(entry, metric) {
  const slots = slotsOf(entry).filter((s) => s.done);
  if (!slots.length) return null;
  if (metric === 'seconds') return Math.max(...slots.map((s) => s.seconds ?? 0));
  if (metric === 'reps') return Math.max(...slots.map((s) => s.reps ?? 0));
  const loaded = slots.filter((s) => (s.reps ?? 0) > 0);
  return loaded.length ? Math.max(...loaded.map((s) => s.weight ?? 0)) : null;
}

// Tréninky s daným cvikem (nejnovější první), u kladek jen v dané posilovně
function sessionsWith(done, goal, after = null) {
  const out = [];
  for (const w of done) {
    if (w.status && w.status !== 'done') continue;
    if (after && w.startedAt <= after) continue;
    if (goal.gymId && w.gymId !== goal.gymId) continue;
    const entry = w.exercises.find((e) => e.exerciseId === goal.exerciseId && slotsOf(e).some((s) => s.done));
    if (entry) out.push({ workout: w, entry });
  }
  return out;
}

// Výchozí hodnota pro nový cíl: nejlepší výkon z posledního tréninku
export function currentBaseline(done, exerciseId, gymId, metric) {
  const last = sessionsWith(done, { exerciseId, gymId })[0];
  return last ? bestValue(last.entry, metric) : null;
}

// Stav cíle. done = dokončené tréninky (libovolné pořadí), measurements = záznamy měr.
export function evaluateGoal(goal, done, measurements = []) {
  if (goal.kind === 'measure') {
    const values = measurements.filter((m) => m.kind === goal.measureKey).sort((a, b) => b.date.localeCompare(a.date));
    const current = values[0]?.value ?? null;
    const start = goal.startValue ?? values[values.length - 1]?.value ?? current;
    const reached = current != null && (goal.target >= (start ?? goal.target) ? current >= goal.target : current <= goal.target);
    let progress = 0;
    if (current != null && start != null && goal.target !== start) progress = (current - start) / (goal.target - start);
    else if (reached) progress = 1;
    return { current, start, progress: clamp(progress), reached };
  }

  const sessions = sessionsWith([...done].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), goal, goal.createdAt);
  const values = sessions.map((s) => bestValue(s.entry, goal.metric)).filter((v) => v != null);
  const current = values.length ? Math.max(goal.baseline, ...values) : goal.baseline;
  const gain = goal.target - goal.baseline;
  const progress = gain > 0 ? (current - goal.baseline) / gain : 1;
  return {
    current,
    progress: clamp(progress),
    reached: current >= goal.target,
    sessionsDone: sessions.length,
    sessionsLeft: Math.max(0, goal.sessions - sessions.length),
    lastValue: values[0] ?? goal.baseline,
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

// Posun doporučení podle cíle: zbývající přírůstek se rozpočítá na zbývající
// tréninky a zaokrouhlí na krok (váha na krok váhy, výdrž na 5 s, opakování na 1).
// Vrací { metric, delta } nebo null, když cíl nic nemění.
export function goalDelta(goal, state, lastEntry, weightStep) {
  if (!goal || !lastEntry) return null;
  const lastValue = bestValue(lastEntry, goal.metric);
  if (lastValue == null) return null;
  const remainingGain = goal.target - lastValue;
  if (remainingGain <= 0) return null;
  const per = remainingGain / Math.max(1, state.sessionsLeft);
  const step = goal.metric === 'weight' ? weightStep : goal.metric === 'seconds' ? 5 : 1;
  const delta = Math.round(per / step) * step;
  return { metric: goal.metric, delta: Math.round(delta * 100) / 100 };
}

// Kolik dní zbývá do data cíle (u měr)
export function daysLeft(dueDate) {
  if (!dueDate) return null;
  const ms = new Date(`${dueDate}T23:59:59`).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
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
