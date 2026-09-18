// Obrazovka Cíle: aktivní a splněné cíle, nový cíl.

import { el, openDialog, confirmDialog, promptNumber, toast, plural, formatWeight, dateShort } from '../ui.js';
import { navigate } from '../router.js';
import { countUp } from '../fx.js';
import { exerciseMap, listGyms, getLastGymId, listMeasureKinds, listMeasurements, addMeasurement, kindName } from '../data.js';
import { listDoneWorkouts } from '../workout.js';
import { pickExercise } from '../exercisePicker.js';
import {
  listGoals, saveGoal, deleteGoal, newGoal, evaluateGoal, metricsFor, currentBaseline, markReachedGoals, daysLeft,
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
          el('p', { class: 'muted small', text: t('Cíl u cviku ovlivní doporučení v tréninku: zbývající přírůstek se rozpočítá na zbývající tréninky.') }),
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
    const fmt = valueFormatter(goal.metric, ex);
    const gym = goal.gymId ? ctx.gyms.find((g) => g.id === goal.gymId)?.name : null;
    heading = ex ? exName(ex) : t('Smazaný cvik');
    detail = [
      `${fmt(goal.baseline)} → ${fmt(goal.target)}`,
      done ? null : t('teď {value}', { value: fmt(state.current) }),
      done ? null : state.sessionsLeft > 0 ? t('zbývá {n}', { n: plural(state.sessionsLeft, ['trénink', 'tréninky', 'tréninků'], ['workout', 'workouts']) }) : t('termín vypršel'),
      gym,
    ].filter(Boolean).join(' · ');
    if (ex) actions.push(el('button', { type: 'button', class: 'btn btn-small', text: t('Cvik'), onclick: () => navigate(`cvik/${encodeURIComponent(ex.id)}`) }));
  } else {
    const kind = ctx.kinds.find((k) => k.key === goal.measureKey) ?? { name: goal.measureKey, unit: '' };
    const fmt = (v) => (v == null ? '–' : `${num(v)} ${kind.unit}`);
    const days = daysLeft(goal.dueDate);
    heading = kindName(kind);
    detail = [
      `${fmt(state.start)} → ${fmt(goal.target)}`,
      done ? null : t('teď {value}', { value: fmt(state.current) }),
      !done && goal.dueDate ? (days >= 0 ? t('do {date} ({days})', { date: dateShort.format(new Date(goal.dueDate)), days: plural(days, ['den', 'dny', 'dní'], ['day', 'days']) }) : t('termín vypršel')) : null,
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

function valueFormatter(metric, exercise) {
  if (metric === 'weight') return (v) => (v == null ? '–' : formatWeight(v, { bodyweight: exercise?.bodyweight }));
  if (metric === 'seconds') return (v) => (v == null ? '–' : `${v} s`);
  return (v) => (v == null ? '–' : t('{n} opak.', { n: v }));
}

// ---------- Nový cíl ----------
async function createGoal(redraw) {
  const kind = await openDialog((close) => el('div', { class: 'dialog-body' }, [
    el('h2', { class: 'dialog-title', text: t('Nový cíl') }),
    el('div', { class: 'choice-list' }, [
      el('button', { type: 'button', class: 'choice', onclick: () => close('exercise') }, [
        el('span', { class: 'choice-title', text: t('U cviku') }),
        el('span', { class: 'muted small', text: t('Za X tréninků o Y kg, opakování nebo sekund víc.') }),
      ]),
      el('button', { type: 'button', class: 'choice', onclick: () => close('measure') }, [
        el('span', { class: 'choice-title', text: t('Tělesná míra') }),
        el('span', { class: 'muted small', text: t('Tělesná váha, obvod bicepsu… volitelně do data.') }),
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
  const [done, gyms, lastGymId] = await Promise.all([listDoneWorkouts(), listGyms(), getLastGymId()]);
  const metrics = metricsFor(exercise);

  const goal = await openDialog((close) => {
    let metric = metrics[0];
    let gymId = exercise.perGym ? (lastGymId ?? gyms[0]?.id) : null;
    const gain = decimalInput(metric === 'weight' ? (exercise.weightStep ?? 2.5) * 2 : metric === 'seconds' ? 15 : 2);
    const sessions = el('input', { type: 'text', class: 'input', inputmode: 'numeric', value: '6', autocomplete: 'off' });
    const baseline = decimalInput(null);
    const info = el('p', { class: 'muted small' });
    const gainLabel = el('span', { class: 'field-label' });

    const refresh = () => {
      const base = currentBaseline(done, exercise.id, gymId, metric);
      const fmt = valueFormatter(metric, exercise);
      baseline.closest('.field')?.toggleAttribute('hidden', base != null);
      baseline.dataset.auto = base == null ? '' : String(base);
      info.textContent = base != null ? t('Teď (poslední trénink): {value}', { value: fmt(base) }) : t('Cvik zatím nemáš odcvičený, zadej výchozí hodnotu.');
      gainLabel.textContent = t('O kolik víc ({unit})', { unit: metric === 'weight' ? 'kg' : metric === 'seconds' ? 's' : t('opakování') });
    };

    const metricSeg = metrics.length > 1 ? el('div', { class: 'segmented' }, metrics.map((m) => el('button', {
      type: 'button', class: `seg ${m === metric ? 'is-selected' : ''}`, text: m === 'weight' ? t('Váha') : m === 'reps' ? t('Opakování') : t('Výdrž'),
      onclick: (e) => {
        metric = m;
        e.currentTarget.parentElement.querySelectorAll('.seg').forEach((b) => b.classList.toggle('is-selected', b === e.currentTarget));
        gain.value = m === 'weight' ? numPlain((exercise.weightStep ?? 2.5) * 2) : m === 'seconds' ? '15' : '2';
        refresh();
      },
    }))) : null;

    const gymSelect = exercise.perGym && gyms.length > 1
      ? el('select', { class: 'input', onchange: (e) => { gymId = e.target.value; refresh(); } },
        gyms.map((g) => el('option', { value: g.id, text: g.name, selected: g.id === gymId ? '' : null })))
      : null;

    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: exName(exercise) }),
      metricSeg,
      gymSelect ? el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Posilovna') }), gymSelect]) : null,
      info,
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Výchozí hodnota') }), baseline]),
      el('label', { class: 'field' }, [gainLabel, gain]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Za kolik tréninků') }), sessions]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Vytvořit') }),
      ]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const base = baseline.dataset.auto !== '' ? Number(baseline.dataset.auto) : parse(baseline);
      const g = parse(gain);
      const n = parseInt(sessions.value, 10);
      if (!Number.isFinite(base)) { toast(t('Zadej výchozí hodnotu')); return; }
      if (!(g > 0)) { toast(t('Přírůstek musí být větší než 0')); return; }
      if (!(n > 0)) { toast(t('Zadej počet tréninků')); return; }
      close(newGoal({
        kind: 'exercise', exerciseId: exercise.id, gymId, metric,
        baseline: base, target: Math.round((base + g) * 100) / 100, sessions: n,
      }));
    });
    queueMicrotask(refresh);
    return form;
  });
  if (goal) { await saveGoal(goal); toast(t('Cíl vytvořen')); }
}

async function createMeasureGoal() {
  const [kinds, measurements] = await Promise.all([listMeasureKinds(), listMeasurements()]);
  const goal = await openDialog((close) => {
    let key = kinds[0].key;
    const latest = (k) => measurements.find((m) => m.kind === k)?.value ?? null;
    const kindSelect = el('select', { class: 'input', onchange: (e) => { key = e.target.value; refresh(); } },
      kinds.map((k) => el('option', { value: k.key, text: `${kindName(k)} (${k.unit})` })));
    const current = decimalInput(latest(key));
    const target = decimalInput(null);
    const due = el('input', { type: 'date', class: 'input' });
    const refresh = () => { current.value = latest(key) == null ? '' : numPlain(latest(key)); };

    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: t('Cíl u tělesné míry') }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Míra') }), kindSelect]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Současná hodnota') }), current, el('span', { class: 'field-hint', text: t('Zapíše se jako dnešní měření, pokud se liší od posledního.') })]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Cílová hodnota') }), target]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Do data (nepovinné)') }), due]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Vytvořit') }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cur = parse(current);
      const goalValue = parse(target);
      if (!Number.isFinite(goalValue)) { toast(t('Zadej cílovou hodnotu')); return; }
      if (Number.isFinite(cur) && cur !== latest(key)) await addMeasurement(key, cur);
      close(newGoal({ kind: 'measure', measureKey: key, startValue: Number.isFinite(cur) ? cur : null, target: goalValue, dueDate: due.value || null }));
    });
    return form;
  });
  if (goal) { await saveGoal(goal); toast(t('Cíl vytvořen')); }
}
