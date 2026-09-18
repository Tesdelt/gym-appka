// Obrazovka Cíle: aktivní a splněné cíle, nový cíl.

import { el, openDialog, confirmDialog, promptNumber, toast, plural, formatWeight, dateShort, stepField } from '../ui.js';
import { navigate } from '../router.js';
import { countUp } from '../fx.js';
import { exerciseMap, listGyms, getLastGymId, listMeasureKinds, listMeasurements, addMeasurement, kindName } from '../data.js';
import { listDoneWorkouts } from '../workout.js';
import { listManualRecords, manualAsWorkouts } from '../stats.js';
import { pickExercise } from '../exercisePicker.js';
import {
  listGoals, saveGoal, deleteGoal, newGoal, evaluateGoal, markReachedGoals, targetFields, goalTarget,
  cleanSets, bestSoFar, goalStartFrom, DURATIONS, dueDateAfter,
} from '../goals.js';
import { t, locale, exName } from '../i18n.js';

export const title = t('Cíle');

export async function render(container, { extraEl }) {
  extraEl.append(el('button', { type: 'button', class: 'btn btn-small btn-primary', text: t('+ Nový cíl'), onclick: () => createGoal(redraw) }));

  async function redraw() {
    const [goals, done, measurements, exercises, kinds, gyms] = await Promise.all([
      listGoals(), listDoneWorkouts(), listMeasurements(), exerciseMap(), listMeasureKinds(), listGyms(),
    ]);
    await markReachedGoals(goals, done, measurements);
    const ctx = { done, measurements, exercises, kinds, gyms, redraw };
    const active = goals.filter((g) => g.status === 'active');
    const finished = goals.filter((g) => g.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

    container.replaceChildren(el('div', { class: 'stack' }, [
      active.length
        ? el('div', { class: 'stack' }, active.map((g) => goalCard(g, ctx)))
        : el('section', { class: 'card' }, [
          el('h2', { class: 'card-title', text: t('Žádný aktivní cíl') }),
          el('p', { class: 'muted small', text: t('Cíl u cviku ovlivní doporučení v tréninku: zbývající kus cesty se rozpočítá na tréninky do termínu.') }),
          el('button', { type: 'button', class: 'btn btn-primary', text: t('+ Nový cíl'), onclick: () => createGoal(redraw) }),
        ]),
      finished.length ? el('h2', { class: 'section-title gold', text: t('Splněné') }) : null,
      ...finished.map((g) => goalCard(g, ctx)),
    ]));
  }
  await redraw();
}

function goalCard(goal, ctx) {
  const state = evaluateGoal(goal, ctx.done, ctx.measurements);
  const done = goal.status === 'done';
  let heading;
  let detail;
  let actions = [];

  if (goal.kind === 'exercise') {
    const ex = ctx.exercises.get(goal.exerciseId);
    const target = goalTarget(goal);
    const gym = goal.gymId ? ctx.gyms.find((g) => g.id === goal.gymId)?.name : null;
    heading = ex ? exName(ex) : t('Smazaný cvik');
    detail = [
      t('cíl {value}', { value: formatSet(target, ex) }),
      !done && state.best ? t('teď {value}', { value: formatSet(state.best, ex, Object.keys(target)) }) : null,
      done ? null : goal.dueDate ? timeLeft(state.daysLeft)
        : state.sessionsLeft > 0 ? t('zbývá {n}', { n: plural(state.sessionsLeft, ['trénink', 'tréninky', 'tréninků'], ['workout', 'workouts']) }) : t('termín vypršel'),
      gym,
    ].filter(Boolean).join(' · ');
    if (ex) actions.push(el('button', { type: 'button', class: 'btn btn-small', text: t('Cvik'), onclick: () => navigate(`cvik/${encodeURIComponent(ex.id)}`) }));
  } else {
    const kind = ctx.kinds.find((k) => k.key === goal.measureKey) ?? { name: goal.measureKey, unit: '' };
    const fmt = (v) => `${num(v)} ${kind.unit}`;
    heading = kindName(kind);
    detail = [
      t('cíl {value}', { value: fmt(goal.target) }),
      done ? null : state.current != null ? t('teď {value}', { value: fmt(state.current) }) : t('zatím bez záznamu'),
      !done && goal.dueDate ? timeLeft(state.daysLeft) : null,
    ].filter(Boolean).join(' · ');
    if (!done) {
      actions.push(el('button', {
        type: 'button', class: 'btn btn-small', text: t('Zapsat hodnotu'),
        onclick: async () => {
          const v = await promptNumber({ title: `${kindName(kind)} (${kind.unit})`, value: state.current ?? goal.target, min: 0, unit: kind.unit });
          if (v == null) return;
          await addMeasurement(kind.key, v);
          toast(t('Zapsáno'));
          ctx.redraw();
        },
      }));
    }
  }

  actions.push(el('button', {
    type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': t('Smazat cíl'),
    onclick: async () => {
      const ok = await confirmDialog({ title: t('Smazat cíl?'), okLabel: t('Smazat'), danger: true });
      if (ok) { await deleteGoal(goal.id); ctx.redraw(); }
    },
  }));

  const pct = Math.round((done ? 1 : state.progress) * 100);
  const fill = el('div', { class: 'progress-fill', style: 'width: 0%' });
  const pctEl = el('span', { class: 'goal-pct', text: done ? t('✓ splněno') : `${pct} %` });
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
  if (!done) countUp(pctEl, pct, (v) => `${Math.round(v)} %`);
  return el('section', { class: `card goal-card ${done ? 'is-done' : ''}` }, [
    el('div', { class: 'goal-head' }, [
      el('h3', { class: 'goal-title', text: heading }),
      pctEl,
    ]),
    el('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, [
      fill,
    ]),
    el('p', { class: 'muted small goal-detail', text: detail }),
    done && goal.doneAt ? el('p', { class: 'small gold', text: t('Splněno {date}', { date: dateShort.format(new Date(goal.doneAt)) }) }) : null,
    el('div', { class: 'goal-actions' }, actions),
  ]);
}

function num(v) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);
}

// Číslo do textového pole (bez oddělovače tisíců, čárka i tečka projdou)
function numPlain(v) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(v);
}

// Série jako text: „+40 kg × 8“, „12 opak.“, „60 s“ (jen části `fields`)
function formatSet(set, exercise, fields = Object.keys(set)) {
  const has = (k) => fields.includes(k) && set[k] != null;
  if (has('seconds')) return `${set.seconds} s`;
  const w = has('weight') ? formatWeight(set.weight, { bodyweight: exercise?.bodyweight }) : null;
  if (w && has('reps')) return `${w} × ${set.reps}`;
  return w ?? t('{n} opak.', { n: set.reps });
}

const WEEK = [['týden', 'týdny', 'týdnů'], ['week', 'weeks']];
const MONTH = [['měsíc', 'měsíce', 'měsíců'], ['month', 'months']];

// Zbývající čas: dny, do 4 týdnů týdny, pak měsíce
function timeLeft(days) {
  if (days < 0) return t('termín vypršel');
  if (days === 0) return t('poslední den');
  if (days < 7) return t('zbývá {n}', { n: plural(days, ['den', 'dny', 'dní'], ['day', 'days']) });
  const weeks = Math.round(days / 7);
  if (weeks <= 4) return t('zbývá {n}', { n: plural(weeks, ...WEEK) });
  return t('zbývá {n}', { n: plural(Math.max(1, Math.round(days / 30.44)), ...MONTH) });
}

// Volba termínu +/−: 1–4 týdny, pak 2–12 měsíců (u měr i „bez termínu“)
function durationField(initial, { optional = false } = {}) {
  const options = optional ? [null, ...DURATIONS] : DURATIONS;
  let i = Math.max(0, options.findIndex((d) => d && d.n === initial.n && d.unit === initial.unit));
  const text = el('span', { class: 'edit-field duration-value' });
  const minus = el('button', { type: 'button', class: 'btn stepper-btn', text: '−', 'aria-label': t('Kratší doba'), onclick: () => { i = Math.max(0, i - 1); draw(); } });
  const plus = el('button', { type: 'button', class: 'btn stepper-btn', text: '+', 'aria-label': t('Delší doba'), onclick: () => { i = Math.min(options.length - 1, i + 1); draw(); } });
  const draw = () => {
    const d = options[i];
    text.replaceChildren(
      d ? plural(d.n, ...(d.unit === 'week' ? WEEK : MONTH)) : t('bez termínu'),
      d ? el('small', { text: t('do {date}', { date: dateShort.format(new Date(`${dueDateAfter(d)}T00:00:00`)) }) }) : '',
    );
    minus.disabled = i === 0;
    plus.disabled = i === options.length - 1;
  };
  draw();
  return {
    root: el('div', { class: 'edit-row' }, [
      el('span', { class: 'field-label', text: t('Za jakou dobu') }),
      el('div', { class: 'stepper-row edit-stepper' }, [minus, text, plus]),
    ]),
    dueDate: () => (options[i] ? dueDateAfter(options[i]) : null),
  };
}

// ---------- Nový cíl ----------
async function createGoal(redraw) {
  const kind = await openDialog((close) => el('div', { class: 'dialog-body' }, [
    el('h2', { class: 'dialog-title', text: t('Nový cíl') }),
    el('div', { class: 'choice-list' }, [
      el('button', { type: 'button', class: 'choice', onclick: () => close('exercise') }, [
        el('span', { class: 'choice-title', text: t('U cviku') }),
        el('span', { class: 'muted small', text: t('Přesná váha a opakování do zvoleného termínu, např. shyb +40 kg × 8 do 2 měsíců.') }),
      ]),
      el('button', { type: 'button', class: 'choice', onclick: () => close('measure') }, [
        el('span', { class: 'choice-title', text: t('Tělesná míra') }),
        el('span', { class: 'muted small', text: t('Tělesná váha, obvod bicepsu… volitelně s termínem.') }),
      ]),
    ]),
    el('div', { class: 'dialog-actions' }, [el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) })]),
  ]));
  if (kind === 'exercise') await createExerciseGoal();
  if (kind === 'measure') await createMeasureGoal();
  redraw();
}

const decimalInput = (value) => el('input', { type: 'text', class: 'input', inputmode: 'decimal', autocomplete: 'off', value: value == null ? '' : numPlain(value) });
const parse = (input) => parseFloat(String(input.value).replace(',', '.').replace(/\s/g, ''));

async function createExerciseGoal() {
  const exercise = await pickExercise({ title: t('Cíl u cviku'), catalog: false });
  if (!exercise) return;
  const [done, manual, exercises, gyms, lastGymId] = await Promise.all([listDoneWorkouts(), listManualRecords(), exerciseMap(), listGyms(), getLastGymId()]);
  const history = [...done, ...manualAsWorkouts(manual.filter((m) => m.exerciseId === exercise.id), exercises)];
  const fields = targetFields(exercise);

  const goal = await openDialog((close) => {
    let gymId = exercise.perGym ? (lastGymId ?? gyms[0]?.id) : null;
    const step = exercise.weightStep ?? 2.5;
    const weight = fields.includes('weight')
      ? stepField(exercise.bodyweight ? t('Přidaná váha (kg)') : t('Váha (kg)'), null, step, exercise.bodyweight ? null : 0) : null;
    const reps = fields.includes('reps') ? stepField(t('Opakování'), null, 1, 1) : null;
    const seconds = fields.includes('seconds') ? stepField(t('Výdrž (s)'), null, 5, 5) : null;
    const duration = durationField({ n: 4, unit: 'week' });
    const info = el('p', { class: 'muted small' });
    const sets = () => cleanSets(history, exercise.id, gymId);

    // informace o dosavadním maximu a předvyplnění hodnot nejtěžší sérií
    const refresh = () => {
      const best = bestSoFar(sets(), exercise);
      const top = best?.heaviest ?? best?.mostReps ?? best?.longest;
      weight?.set(top?.weight ?? (exercise.bodyweight ? 0 : null));
      reps?.set(top?.reps ?? 10);
      seconds?.set(top?.seconds ?? 30);
      if (!best) { info.textContent = t('Cvik zatím nemáš odcvičený.'); return; }
      const parts = best.heaviest
        ? [t('nejtěžší {value}', { value: formatSet(best.heaviest, exercise, fields) }),
          best.mostReps.weight !== best.heaviest.weight ? t('nejvíc opakování {value}', { value: formatSet(best.mostReps, exercise, fields) }) : null]
        : [formatSet(top, exercise, fields)];
      info.textContent = t('Nejvíc doteď: {value}', { value: parts.filter(Boolean).join(' · ') });
    };

    const gymSelect = exercise.perGym && gyms.length > 1
      ? el('select', { class: 'input', onchange: (e) => { gymId = e.target.value; refresh(); } },
        gyms.map((g) => el('option', { value: g.id, text: g.name, selected: g.id === gymId ? '' : null })))
      : null;

    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: exName(exercise) }),
      gymSelect ? el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Posilovna') }), gymSelect]) : null,
      info,
      weight?.root, reps?.root, seconds?.root,
      duration.root,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Vytvořit') }),
      ]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const target = {};
      if (weight) target.weight = weight.value();
      if (reps) target.reps = Math.round(reps.value());
      if (seconds) target.seconds = Math.round(seconds.value());
      if (weight && !Number.isFinite(target.weight)) { toast(t('Zadej váhu')); return; }
      if (reps && !(target.reps > 0)) { toast(t('Zadej počet opakování')); return; }
      if (seconds && !(target.seconds > 0)) { toast(t('Zadej výdrž')); return; }
      const past = sets();
      if (past.some((s) => Object.keys(target).every((k) => (s[k] ?? 0) >= target[k]))) {
        toast(t('Tohle už máš splněné, nastav vyšší cíl'));
        return;
      }
      close(newGoal({
        kind: 'exercise', exerciseId: exercise.id, gymId, targetSet: target,
        start: goalStartFrom(past, target), dueDate: duration.dueDate(),
      }));
    });
    refresh();
    return form;
  }, { focus: false });
  if (goal) { await saveGoal(goal); toast(t('Cíl vytvořen')); }
}

async function createMeasureGoal() {
  const [kinds, measurements] = await Promise.all([listMeasureKinds(), listMeasurements()]);
  const goal = await openDialog((close) => {
    let key = kinds[0].key;
    const latest = (k) => measurements.find((m) => m.kind === k) ?? null;
    const info = el('p', { class: 'muted small' });
    const target = decimalInput(null);
    const duration = durationField({ n: 2, unit: 'month' }, { optional: true });
    const refresh = () => {
      const last = latest(key);
      const kind = kinds.find((k) => k.key === key);
      info.textContent = last
        ? t('Poslední záznam: {value} ({date})', { value: `${num(last.value)} ${kind.unit}`, date: dateShort.format(new Date(last.date)) })
        : t('Zatím bez záznamu – hodnotu zapíšeš později tlačítkem Zapsat hodnotu u cíle.');
    };
    const kindSelect = el('select', { class: 'input', onchange: (e) => { key = e.target.value; refresh(); } },
      kinds.map((k) => el('option', { value: k.key, text: `${kindName(k)} (${k.unit})` })));

    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: t('Cíl u tělesné míry') }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Míra') }), kindSelect]),
      info,
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Cílová hodnota') }), target]),
      duration.root,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Vytvořit') }),
      ]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const goalValue = parse(target);
      if (!Number.isFinite(goalValue)) { toast(t('Zadej cílovou hodnotu')); return; }
      close(newGoal({ kind: 'measure', measureKey: key, startValue: latest(key)?.value ?? null, target: goalValue, dueDate: duration.dueDate() }));
    });
    refresh();
    return form;
  });
  if (goal) { await saveGoal(goal); toast(t('Cíl vytvořen')); }
}
