// Pravidla doporučení (SPEC: Pravidla doporučení).
//
// Vstup: záznam cviku v aktuálním tréninku (entry) a záznam téhož cviku
// z posledního tréninku (last), nebo null. Výstup: doporučené hodnoty pro
// každou sérii (nebo každý stupeň drop setu).
//
// Vliv cílů přibude v kroku 6.

export const TIME_STEP = 5; // sekund

// Čas výdrže vždy zaokrouhlený na násobek 5 s (min. 5 s)
export function round5(sec) {
  return Math.max(TIME_STEP, Math.round((sec ?? 0) / TIME_STEP) * TIME_STEP);
}

export function rangeFor(templateSet, templateItem) {
  if (templateItem?.repRange) return { ...templateItem.repRange };
  const base = templateSet.reps ?? 10;
  return { min: base, max: base + 2 };
}

// Byla série splněná v plném počtu? Plán = hodnoty, se kterými série začínala.
export function setSucceeded(entry, set) {
  if (!set.done) return false;
  if (entry.type === 'time') return (set.seconds ?? 0) >= (set.plan.seconds ?? 0);
  return (set.reps ?? 0) >= (set.plan.reps ?? 0);
}

// Směr posunu: 1 = přidat, 0 = nechat, -1 = snížit
function direction(entry, last) {
  const lastSlots = doneSlots(last);
  if (!lastSlots.length) return 0;
  // „Nechat“ je výchozí stav, proto se bere jako „bez výslovné volby“ a platí
  // automatické pravidlo (splněno vše → přidat).
  if (last.next === 'more') return 1;
  if (last.next === 'less') return -1;
  return lastSlots.every((s) => setSucceeded(last, s)) ? 1 : 0;
}

export function doneSlots(entry) {
  if (!entry) return [];
  return slotsOf(entry).filter((s) => s.done);
}

// Všechny série / stupně cviku v pořadí provádění
export function slotsOf(entry) {
  if (entry.mode === 'dropset') return entry.rounds.flatMap((r) => r.steps);
  return entry.sets;
}

function shift(entry, ref, range, dir) {
  const step = entry.weightStep ?? 2.5;
  if (entry.type === 'time') {
    return { weight: ref.weight ?? 0, seconds: round5(round5(ref.seconds) + dir * TIME_STEP) };
  }
  if (entry.type === 'reps') {
    return { reps: Math.max(1, (ref.reps ?? 0) + dir) };
  }
  // opakování s váhou
  if (dir > 0) {
    const reps = (ref.reps ?? 0) + 1;
    if (reps > range.max) return { weight: round(ref.weight + step), reps: range.min };
    return { weight: ref.weight, reps };
  }
  if (dir < 0) return { weight: round(ref.weight - step), reps: ref.reps };
  return { weight: ref.weight, reps: ref.reps };
}

function round(kg) {
  return Math.round(kg * 100) / 100;
}

// Doporučení pro série (mode 'sets'). Vrací pole hodnot podle entry.sets.
export function recommendSets(entry, last) {
  const plan = entry.sets.map((s) => ({ weight: s.plan.weight, reps: s.plan.reps, seconds: s.plan.seconds }));
  if (!last) return plan;
  const lastDone = last.mode === 'sets' ? last.sets.filter((s) => s.done) : doneSlots(last);
  if (!lastDone.length) return plan;
  const dir = direction(entry, last);
  return entry.sets.map((s, i) => {
    const ref = lastDone[Math.min(i, lastDone.length - 1)];
    return shift(entry, ref, s.range, dir);
  });
}

// Doporučení pro drop set: hodnotí se celé kolo, posun platí pro všechny stupně.
export function recommendDropset(entry, last) {
  const plan = entry.rounds[0].steps.map((s) => ({ weight: s.plan.weight, reps: s.plan.reps }));
  if (!last || last.mode !== 'dropset') return plan;
  const lastDone = doneSlots(last);
  if (!lastDone.length) return plan;
  const dir = direction(entry, last);
  const lastSteps = last.rounds[last.rounds.length - 1].steps;
  const refs = entry.rounds[0].steps.map((_, i) => lastSteps[Math.min(i, lastSteps.length - 1)]);
  const range = entry.rounds[0].steps[0].range;
  const step = entry.weightStep ?? 2.5;
  if (dir > 0) {
    const overflow = refs.some((r) => (r.reps ?? 0) + 1 > range.max);
    return refs.map((r) => (overflow
      ? { weight: round(r.weight + step), reps: range.min }
      : { weight: r.weight, reps: (r.reps ?? 0) + 1 }));
  }
  if (dir < 0) return refs.map((r) => ({ weight: round(r.weight - step), reps: r.reps }));
  return refs.map((r) => ({ weight: r.weight, reps: r.reps }));
}
