// Statistiky: frekvence tréninků, tělesné míry, osobní rekordy.
//
// Trasy: #/statistiky               přehled
//        #/statistiky/mira/<key>    tělesná míra: graf, záznamy
//        #/statistiky/cvik/<id>     výkon cviku: graf, rekordy, ruční záznamy

import { el, openDialog, confirmDialog, toast, stepField, formatWeight, formatValues, dateShort, plural } from '../ui.js';
import { navigate } from '../router.js';
import {
  listMeasureKinds, saveMeasureKinds, listMeasurements, addMeasurement, deleteMeasurement,
  exerciseMap, listGyms, getLastGymId, kindName,
} from '../data.js';
import { listDoneWorkouts } from '../workout.js';
import { computeRecords, recordKey } from '../records.js';
import { rangeChart, barChart } from '../chart.js';
import {
  listManualRecords, addManualRecord, deleteManualRecord, manualAsWorkouts, exercisePoints, exerciseFormat,
  exerciseChartTitle, frequency,
} from '../stats.js';
import { recordText } from './exercise.js';
import { countUp } from '../fx.js';
import { t, lang, locale, exName } from '../i18n.js';

export const title = t('Statistiky');

export async function render(container, { params, extraEl, titleEl }) {
  if (params[0] === 'mira' && params[1]) {
    extraEl.append(backButton());
    return renderMeasure(container, params[1], titleEl);
  }
  if (params[0] === 'cvik' && params[1]) {
    extraEl.append(backButton());
    return renderExercise(container, params[1], titleEl);
  }
  return renderOverview(container);
}

function backButton() {
  return el('button', {
    type: 'button', class: 'btn btn-small', text: t('← Zpět'),
    onclick: () => (history.length > 1 ? history.back() : navigate('statistiky')),
  });
}

const num = (v, digits = 2) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
const today = () => new Date().toISOString().slice(0, 10);
const parse = (input) => parseFloat(String(input.value).replace(',', '.').replace(/\s/g, ''));
const toIso = (dateStr) => {
  // datum z formuláře + aktuální čas, ať se záznamy ze stejného dne řadí správně
  if (!dateStr || dateStr === today()) return new Date().toISOString();
  return new Date(`${dateStr}T12:00:00`).toISOString();
};

// ---------- Přehled ----------
async function renderOverview(container) {
  const [done, kinds, measurements, exercises, manual, gyms] = await Promise.all([
    listDoneWorkouts(), listMeasureKinds(), listMeasurements(), exerciseMap(), listManualRecords(), listGyms(),
  ]);
  const stack = el('div', { class: 'stack' });
  container.append(stack);

  // Frekvence
  const f = frequency(done);
  const monthFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' });
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: t('Frekvence tréninků') }),
    el('div', { class: 'stat-tiles' }, [
      tile(t('Tento týden'), String(f.week)),
      tile(t('Tento měsíc'), String(f.month)),
      tile(t('Průměr / týden'), num(f.avg, 1)),
    ]),
    el('h4', { class: 'sub-title', text: t('Posledních 12 týdnů') }),
    barChart(f.buckets.map((b, i) => ({ value: b.count, current: i === f.buckets.length - 1, from: b.from })), {
      label: (b, i) => (i % 3 === 0 || i === 11 ? monthFmt.format(b.from) : ''),
    }),
  ]));

  // Tělesné míry
  const bodyRows = kinds.map((k) => {
    const last = measurements.find((m) => m.kind === k.key);
    return el('li', { class: 'list-row' }, [
      el('button', { type: 'button', class: 'list-main stat-row', onclick: () => navigate(`statistiky/mira/${encodeURIComponent(k.key)}`) }, [
        el('span', { text: kindName(k) }),
        el('span', { class: 'stat-value' }, [
          el('strong', { text: last ? `${num(last.value)} ${k.unit}` : '–' }),
          last ? el('span', { class: 'muted small block', text: dateShort.format(new Date(last.date)) }) : null,
        ]),
      ]),
    ]);
  });
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: t('Tělesné míry') }),
    el('ul', { class: 'list' }, bodyRows),
    el('div', { class: 'row-2' }, [
      el('button', { type: 'button', class: 'btn btn-primary', text: t('+ Zapsat'), onclick: async () => { if (await addMeasureDialog(kinds)) rerender(); } }),
      el('button', { type: 'button', class: 'btn', text: t('+ Nová míra'), onclick: async () => { if (await newKindDialog(kinds)) rerender(); } }),
    ]),
  ]));

  // Osobní rekordy
  const sessions = [...done, ...manualAsWorkouts(manual, exercises)];
  const records = computeRecords(sessions);
  const rows = [];
  const sorted = [...exercises.values()].sort((a, b) => exName(a).localeCompare(exName(b), lang));
  for (const ex of sorted) {
    const keys = ex.perGym ? gyms.map((g) => ({ gym: g, key: recordKey({ exerciseId: ex.id, perGym: true }, g.id) })) : [{ gym: null, key: ex.id }];
    for (const { gym, key } of keys) {
      const rec = records.get(key);
      const text = recordText(ex, rec);
      if (text === '–') continue;
      rows.push(el('li', { class: 'list-row' }, [
        el('button', { type: 'button', class: 'list-main stat-row', onclick: () => navigate(`statistiky/cvik/${encodeURIComponent(ex.id)}`) }, [
          el('span', {}, [el('span', { class: 'block', text: exName(ex) }), gym && gyms.length > 1 ? el('span', { class: 'muted small block', text: gym.name }) : null]),
          el('strong', { class: 'gold stat-value', text: text }),
        ]),
      ]));
    }
  }
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: t('Osobní rekordy') }),
    rows.length ? el('ul', { class: 'list' }, rows) : el('p', { class: 'muted small', text: t('Zatím žádné. Plní se z tréninků, nebo zapiš ruční záznam.') }),
    el('button', {
      type: 'button', class: 'btn', text: t('+ Ruční záznam výkonu'),
      onclick: async () => {
        const { pickExercise } = await import('../exercisePicker.js');
        const ex = await pickExercise({ title: t('Ruční záznam u cviku'), catalog: false });
        if (ex && await manualRecordDialog(ex, gyms, await getLastGymId())) rerender();
      },
    }),
  ]));

  function rerender() {
    container.replaceChildren();
    renderOverview(container);
  }
}

function tile(label, value) {
  const n = parseFloat(value.replace(',', '.'));
  const valueEl = el('span', { class: 'stat-tile-value', text: value });
  const decimals = /[,.]/.test(value) ? 1 : 0;
  countUp(valueEl, n, (v) => num(decimals ? v : Math.round(v), decimals));
  return el('div', { class: 'stat-tile' }, [valueEl, el('span', { class: 'muted small', text: label })]);
}

// ---------- Tělesná míra ----------
async function renderMeasure(container, key, titleEl) {
  const [kinds, all] = await Promise.all([listMeasureKinds(), listMeasurements()]);
  const kind = kinds.find((k) => k.key === key);
  if (!kind) { container.append(el('p', { class: 'muted', text: t('Míra nenalezena.') })); return; }
  titleEl.textContent = kindName(kind);
  const entries = all.filter((m) => m.kind === key);
  const rerender = () => { container.replaceChildren(); renderMeasure(container, key, titleEl); };

  const last = entries[0];
  container.append(el('div', { class: 'stack' }, [
    el('section', { class: 'card' }, [
      el('div', { class: 'stat-head' }, [
        el('span', { class: 'stat-big', text: last ? num(last.value) : '–' }),
        el('span', { class: 'muted', text: last ? `${kind.unit} · ${dateShort.format(new Date(last.date))}` : kind.unit }),
      ]),
      rangeChart(entries.map((m) => ({ t: m.date, v: m.value })), { format: (v) => num(v, 1) }),
      el('button', { type: 'button', class: 'btn btn-primary', text: t('+ Zapsat'), onclick: async () => { if (await addMeasureDialog(kinds, key)) rerender(); } }),
    ]),
    el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: t('Záznamy') }),
      entries.length
        ? el('ul', { class: 'list' }, entries.map((m) => el('li', { class: 'list-row' }, [
          el('span', { class: 'list-main stat-row' }, [
            el('span', { text: dateShort.format(new Date(m.date)) }),
            el('strong', { text: `${num(m.value)} ${kind.unit}` }),
          ]),
          el('button', {
            type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': t('Smazat záznam'),
            onclick: async () => {
              if (await confirmDialog({ title: t('Smazat záznam?'), okLabel: t('Smazat'), danger: true })) { await deleteMeasurement(m.id); rerender(); }
            },
          }),
        ])))
        : el('p', { class: 'muted small', text: t('Zatím žádný záznam.') }),
    ]),
    el('button', {
      type: 'button', class: 'btn btn-danger', text: t('Smazat míru'),
      onclick: async () => {
        const ok = await confirmDialog({
          title: t('Smazat míru „{name}“?', { name: kindName(kind) }),
          text: entries.length ? t('Smažou se i {n}.', { n: plural(entries.length, ['záznam', 'záznamy', 'záznamů'], ['entry', 'entries']) }) : '',
          okLabel: t('Smazat'), danger: true,
        });
        if (!ok) return;
        for (const m of entries) await deleteMeasurement(m.id);
        await saveMeasureKinds(kinds.filter((k) => k.key !== key));
        navigate('statistiky');
      },
    }),
  ]));
}

function addMeasureDialog(kinds, presetKey = null) {
  return openDialog((close) => {
    let key = presetKey ?? kinds[0]?.key;
    const kindSelect = presetKey ? null : el('select', { class: 'input', onchange: (e) => { key = e.target.value; } },
      kinds.map((k) => el('option', { value: k.key, text: `${kindName(k)} (${k.unit})` })));
    const value = el('input', { type: 'text', class: 'input input-number', inputmode: 'decimal', autocomplete: 'off' });
    const date = el('input', { type: 'date', class: 'input', value: today(), max: today() });
    const kind = kinds.find((k) => k.key === key);
    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: presetKey ? `${kindName(kind)} (${kind.unit})` : t('Zapsat míru') }),
      kindSelect ? el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Míra') }), kindSelect]) : null,
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Hodnota') }), value]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Datum') }), date]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(false) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Uložit') }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = parse(value);
      if (!Number.isFinite(v)) { toast(t('Zadej hodnotu')); return; }
      await addMeasurement(key, v, toIso(date.value));
      toast(t('Zapsáno'));
      close(true);
    });
    return form;
  });
}

// Předem nastavené míry a jednotky pro výběr
const PRESET_KINDS = [
  { key: 'vaha', name: 'Tělesná váha', unit: 'kg' },
  { key: 'biceps', name: 'Obvod bicepsu', unit: 'cm' },
  { key: 'predlokti', name: 'Obvod předloktí', unit: 'cm' },
  { key: 'hrudnik', name: 'Obvod hrudníku', unit: 'cm' },
  { key: 'ramena', name: 'Obvod ramen', unit: 'cm' },
  { key: 'krk', name: 'Obvod krku', unit: 'cm' },
  { key: 'pas', name: 'Obvod pasu', unit: 'cm' },
  { key: 'boky', name: 'Obvod boků', unit: 'cm' },
  { key: 'stehno', name: 'Obvod stehna', unit: 'cm' },
  { key: 'lytko', name: 'Obvod lýtka', unit: 'cm' },
  { key: 'tuk', name: 'Tělesný tuk', unit: '%' },
  { key: 'svaly', name: 'Svalová hmota', unit: 'kg' },
];

function newKindDialog(kinds) {
  const available = PRESET_KINDS.filter((p) => !kinds.some((k) => k.key === p.key));
  return openDialog((close) => {
    if (!available.length) {
      return el('div', { class: 'dialog-body' }, [
        el('h2', { class: 'dialog-title', text: t('Nová míra') }),
        el('p', { class: 'muted', text: t('Všechny nabízené míry už máš přidané.') }),
        el('div', { class: 'dialog-actions' }, [el('button', { type: 'button', class: 'btn btn-primary', text: t('OK'), onclick: () => close(false) })]),
      ]);
    }
    const unit = el('div', { class: 'input input-static', text: available[0].unit });
    const name = el('select', {
      class: 'input',
      onchange: () => { unit.textContent = available.find((p) => p.key === name.value).unit; },
    }, available.map((p) => el('option', { value: p.key, text: t(p.name) })));
    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: t('Nová míra') }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Míra') }), name]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Jednotka') }), unit]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(false) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Přidat') }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const preset = available.find((p) => p.key === name.value);
      await saveMeasureKinds([...kinds, { key: preset.key, name: preset.name, unit: preset.unit }]);
      close(true);
    });
    return form;
  });
}

// ---------- Výkon cviku ----------
async function renderExercise(container, id, titleEl) {
  const [exercises, done, manualAll, gyms, lastGymId] = await Promise.all([
    exerciseMap(), listDoneWorkouts(), listManualRecords(), listGyms(), getLastGymId(),
  ]);
  const exercise = exercises.get(id);
  if (!exercise) { container.append(el('p', { class: 'muted', text: t('Cvik nenalezen.') })); return; }
  titleEl.textContent = t('Výkon');
  let gymId = exercise.perGym ? (lastGymId ?? gyms[0]?.id) : null;
  const manual = manualAll.filter((m) => m.exerciseId === id);
  const sessions = [...done, ...manualAsWorkouts(manual, exercises)];
  const rerender = () => { container.replaceChildren(); renderExercise(container, id, titleEl); };

  const body = el('div', { class: 'stack' });
  container.append(body);
  const draw = () => {
    const rec = computeRecords(sessions).get(recordKey({ exerciseId: id, perGym: exercise.perGym }, gymId));
    const points = exercisePoints(sessions, exercise, gymId);
    const myManual = manual.filter((m) => !exercise.perGym || m.gymId === gymId);

    // tabulka: nejvíc opakování při dané váze
    const atWeight = exercise.type === 'weight' && rec ? [...rec.repsAtWeight.entries()].sort((a, b) => b[0] - a[0]) : [];

    body.replaceChildren(...[
      el('section', { class: 'card' }, [
        el('h2', { class: 'ex-name', text: exName(exercise) }),
        exercise.perGym && gyms.length > 1 ? el('div', { class: 'segmented gym-seg' }, gyms.map((g) => el('button', {
          type: 'button', class: `seg ${g.id === gymId ? 'is-selected' : ''}`, text: g.name, onclick: () => { gymId = g.id; draw(); },
        }))) : null,
        el('dl', { class: 'kv' }, [
          el('div', { class: 'kv-row' }, [el('dt', { text: t('Osobní rekord') }), el('dd', { class: 'gold', text: recordText(exercise, rec) })]),
          rec?.maxWeight ? el('div', { class: 'kv-row' }, [el('dt', { text: t('Dosaženo') }), el('dd', { text: dateShort.format(new Date(rec.maxWeight.date)) })]) : null,
        ]),
        el('h4', { class: 'sub-title', text: exerciseChartTitle(exercise) }),
        rangeChart(points, { format: exerciseFormat(exercise) }),
        myManual.length ? el('p', { class: 'muted small', text: t('Duté body jsou ruční záznamy.') }) : null,
      ]),
      atWeight.length ? el('section', { class: 'card' }, [
        el('h3', { class: 'card-title', text: t('Nejvíc opakování při váze') }),
        el('dl', { class: 'kv' }, atWeight.map(([w, r]) => el('div', { class: 'kv-row' }, [
          el('dt', { text: formatWeight(w, { bodyweight: exercise.bodyweight }) }),
          el('dd', { text: `${r.value} × · ${dateShort.format(new Date(r.date))}` }),
        ]))),
      ]) : null,
      el('section', { class: 'card' }, [
        el('h3', { class: 'card-title', text: t('Ruční záznamy') }),
        myManual.length
          ? el('ul', { class: 'list' }, myManual.map((m) => el('li', { class: 'list-row' }, [
            el('span', { class: 'list-main stat-row' }, [
              el('span', { text: dateShort.format(new Date(m.date)) }),
              el('strong', { text: formatValues({ type: exercise.type, bodyweight: exercise.bodyweight }, [m]) }),
            ]),
            el('button', {
              type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': t('Smazat záznam'),
              onclick: async () => {
                if (await confirmDialog({ title: t('Smazat ruční záznam?'), okLabel: t('Smazat'), danger: true })) { await deleteManualRecord(m.id); rerender(); }
              },
            }),
          ])))
          : el('p', { class: 'muted small', text: t('Např. test maxima mimo trénink.') }),
        el('button', { type: 'button', class: 'btn', text: t('+ Ruční záznam'), onclick: async () => { if (await manualRecordDialog(exercise, gyms, gymId)) rerender(); } }),
      ]),
      el('button', { type: 'button', class: 'btn', text: t('Detail cviku'), onclick: () => navigate(`cvik/${encodeURIComponent(id)}`) }),
    ].filter(Boolean));
  };
  draw();
}

// Ruční záznam výkonu. Hodnoty se předvyplní z dosavadního rekordu.
async function manualRecordDialog(exercise, gyms, presetGymId) {
  const [done, manualAll, exercises] = await Promise.all([listDoneWorkouts(), listManualRecords(), exerciseMap()]);
  const records = computeRecords([...done, ...manualAsWorkouts(manualAll.filter((m) => m.exerciseId === exercise.id), exercises)]);
  const recFor = (gymId) => records.get(recordKey({ exerciseId: exercise.id, perGym: exercise.perGym }, gymId));

  return openDialog((close) => {
    let gymId = exercise.perGym ? (presetGymId ?? gyms[0]?.id) : null;
    const step = exercise.weightStep ?? 2.5;
    const weight = exercise.type === 'reps' ? null : stepField(exercise.bodyweight ? t('Přidaná váha (kg)') : t('Váha (kg)'), 0, step, exercise.bodyweight ? null : 0);
    const reps = exercise.type === 'time' ? null : stepField(t('Opakování'), 1, 1, 1);
    const seconds = exercise.type === 'time' ? stepField(t('Výdrž (s)'), 30, 5, 0) : null;
    const info = el('p', { class: 'muted small' });
    const prefill = () => {
      const rec = recFor(gymId);
      if (exercise.type === 'time') {
        seconds.set(rec?.maxSeconds?.value ?? 30);
        if (weight) weight.set(rec?.maxSeconds?.weight ?? 0);
      } else if (exercise.type === 'reps') {
        reps.set(rec?.maxReps?.value ?? 10);
      } else {
        const w = rec?.maxWeight?.value ?? 0;
        weight.set(w);
        reps.set(rec?.repsAtWeight.get(w)?.value ?? rec?.maxWeight?.reps ?? 1);
      }
      info.textContent = rec && recordText(exercise, rec) !== '–' ? t('Dosavadní rekord: {value}', { value: recordText(exercise, rec) }) : t('Zatím bez rekordu.');
    };
    const date = el('input', { type: 'date', class: 'input', value: today(), max: today() });
    const gymSelect = exercise.perGym && gyms.length > 1
      ? el('select', { class: 'input', onchange: (e) => { gymId = e.target.value; prefill(); } }, gyms.map((g) => el('option', { value: g.id, text: g.name, selected: g.id === gymId ? '' : null })))
      : null;
    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: exName(exercise) }),
      gymSelect ? el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Posilovna') }), gymSelect]) : null,
      info,
      weight?.root, reps?.root, seconds?.root,
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Datum') }), date]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(false) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Uložit') }),
      ]),
    ]);
    prefill();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const w = weight ? weight.value() : 0;
      const r = reps ? Math.round(reps.value()) : null;
      const sec = seconds ? Math.round(seconds.value()) : null;
      if ((weight && !Number.isFinite(w)) || (reps && !(r > 0)) || (seconds && !(sec > 0))) { toast(t('Vyplň hodnoty')); return; }
      await addManualRecord({ exerciseId: exercise.id, gymId, weight: w, reps: r, seconds: sec, date: toIso(date.value) });
      toast(t('Záznam uložen'));
      close(true);
    });
    return form;
  });
}
