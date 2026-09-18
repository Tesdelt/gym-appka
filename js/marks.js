// Značky v historii tréninků: ★ série, kterou jsem posunul osobní rekord,
// 🔥 série, kterou jsem splnil cíl.

import { recordMarks } from './records.js';
import { goalHit } from './goals.js';

export const markKey = (workoutId, entryIndex, slotIndex) => `${workoutId}|${entryIndex}|${slotIndex}`;

// done: dokončené tréninky, manualSessions: ruční záznamy jako tréninky
// (manualAsWorkouts), goals: všechny cíle.
// Vrací { pr: Set klíčů, goal: Map klíč → cíl, workouts: Map id → { pr, goal } }
// (u tréninku množiny id cviků se značkou).
export function historyMarks(done, manualSessions = [], goals = []) {
  const pr = recordMarks([...done, ...manualSessions]);
  const goal = new Map();
  for (const g of goals) {
    const hit = goalHit(g, done);
    if (hit) goal.set(markKey(hit.workout.id, hit.entryIndex, hit.slotIndex), g);
  }
  const byId = new Map(done.map((w) => [w.id, w]));
  const workouts = new Map();
  const add = (key, kind) => {
    const [id, entryIndex] = key.split('|');
    const w = byId.get(id);
    const exerciseId = w?.exercises[Number(entryIndex)]?.exerciseId;
    if (!exerciseId) return;
    if (!workouts.has(id)) workouts.set(id, { pr: new Set(), goal: new Set() });
    workouts.get(id)[kind].add(exerciseId);
  };
  pr.forEach((key) => add(key, 'pr'));
  goal.forEach((_, key) => add(key, 'goal'));
  return { pr, goal, workouts };
}
