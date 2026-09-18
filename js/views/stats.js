// Statistiky: frekvence tréninků, tělesné míry, osobní rekordy.
//
// Trasy: #/statistiky               přehled
//        #/statistiky/mira/<key>    tělesná míra: graf, záznamy
//        #/statistiky/cvik/<id>     výkon cviku: graf, rekordy, ruční záznamy

import { el, openDialog, confirmDialog, toast, formatWeight, formatValues, dateShort, plural } from '../ui.js';
import { navigate } from '../router.js';
import {
  listMeasureKinds, saveMeasureKinds, listMeasurements, addMeasurement, deleteMeasurement,
  exerciseMap, listGyms, getLastGymId,
} from '../data.js';
import { listDoneWorkouts } from '../workout.js';
import { computeRecords, recordKey } from '../records.js';
import { rangeChart, barChart } from '../chart.js';
import {
  listManualRecords, addManualRecord, deleteManualRecord, manualAsWorkouts, exercisePoints, exerciseFormat,
  exerciseChartTitle, frequency,
} from '../stats.js';
import { recordText } from './exercise.js';

export const title = 'Statistiky';

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
    type: 'button', class: 'btn btn-small', text: '← Zpět',
    onclick: () => (history.length > 1 ? history.back() : navigate('statistiky')),
  });
}

const num = (v, digits = 2) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits }).format(v);
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
  const monthFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: 'Frekvence tréninků' }),
    el('div', { class: 'stat-tiles' }, [
      tile('Tento týden', String(f.week)),
      tile('Tento měsíc', String(f.month)),
      tile('Průměr / týden', num(f.avg, 1)),
    ]),
    el('h4', { class: 'sub-title', text: 'Posledních 12 týdnů' }),
    barChart(f.buckets.map((b, i) => ({ value: b.count, current: i === f.buckets.length - 1, from: b.from })), {
      label: (b, i) => (i % 3 === 0 || i === 11 ? monthFmt.format(b.from) : ''),
    }),
  ]));

  // Tělesné míry
  const bodyRows = kinds.map((k) => {
    const last = measurements.find((m) => m.kind === k.key);
    return el('li', { class: 'list-row' }, [
      el('button', { type: 'button', class: 'list-main stat-row', onclick: () => navigate(`statistiky/mira/${encodeURIComponent(k.key)}`) }, [
        el('span', { text: k.name }),
        el('span', { class: 'stat-value' }, [
          el('strong', { text: last ? `${num(last.value)} ${k.unit}` : '–' }),
          last ? el('span', { class: 'muted small block', text: dateShort.format(new Date(last.date)) }) : null,
        ]),
      ]),
    ]);
  });
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: 'Tělesné míry' }),
    el('ul', { class: 'list' }, bodyRows),
    el('div', { class: 'row-2' }, [
      el('button', { type: 'button', class: 'btn btn-primary', text: '+ Zapsat', onclick: async () => { if (await addMeasureDialog(kinds)) rerender(); } }),
      el('button', { type: 'button', class: 'btn', text: '+ Nová míra', onclick: async () => { if (await newKindDialog(kinds)) rerender(); } }),
    ]),
  ]));

  // Osobní rekordy
  const sessions = [...done, ...manualAsWorkouts(manual, exercises)];
  const records = computeRecords(sessions);
  const rows = [];
  const sorted = [...exercises.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  for (const ex of sorted) {
    const keys = ex.perGym ? gyms.map((g) => ({ gym: g, key: recordKey({ exerciseId: ex.id, perGym: true }, g.id) })) : [{ gym: null, key: ex.id }];
    for (const { gym, key } of keys) {
      const rec = records.get(key);
      const text = recordText(ex, rec);
      if (text === '–') continue;
      rows.push(el('li', { class: 'list-row' }, [
        el('button', { type: 'button', class: 'list-main stat-row', onclick: () => navigate(`statistiky/cvik/${encodeURIComponent(ex.id)}`) }, [
          el('span', {}, [el('span', { class: 'block', text: ex.name }), gym && gyms.length > 1 ? el('span', { class: 'muted small block', text: gym.name }) : null]),
          el('strong', { class: 'gold stat-value', text: text }),
        ]),
      ]));
    }
  }
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: 'Osobní rekordy' }),
    rows.length ? el('ul', { class: 'list' }, rows) : el('p', { class: 'muted small', text: 'Zatím žádné. Plní se z tréninků, nebo zapiš ruční záznam.' }),
    el('button', {
      type: 'button', class: 'btn', text: '+ Ruční záznam výkonu',
      onclick: async () => {
        const { pickExercise } = await import('../exercisePicker.js');
        const ex = await pickExercise({ title: 'Ruční záznam u cviku' });
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
  return el('div', { class: 'stat-tile' }, [el('span', { class: 'stat-tile-value', text: value }), el('span', { class: 'muted small', text: label })]);
}

// ---------- Tělesná míra ----------
async function renderMeasure(container, key, titleEl) {
  const [kinds, all] = await Promise.all([listMeasureKinds(), listMeasurements()]);
  const kind = kinds.find((k) => k.key === key);
  if (!kind) { container.append(el('p', { class: 'muted', text: 'Míra nenalezena.' })); return; }
  titleEl.textContent = kind.name;
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
      el('button', { type: 'button', class: 'btn btn-primary', text: '+ Zapsat', onclick: async () => { if (await addMeasureDialog(kinds, key)) rerender(); } }),
    ]),
    el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Záznamy' }),
      entries.length
        ? el('ul', { class: 'list' }, entries.map((m) => el('li', { class: 'list-row' }, [
          el('span', { class: 'list-main stat-row' }, [
            el('span', { text: dateShort.format(new Date(m.date)) }),
            el('strong', { text: `${num(m.value)} ${kind.unit}` }),
          ]),
          el('button', {
            type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': 'Smazat záznam',
            onclick: async () => {
              if (await confirmDialog({ title: 'Smazat záznam?', okLabel: 'Smazat', danger: true })) { await deleteMeasurement(m.id); rerender(); }
            },
          }),
        ])))
        : el('p', { class: 'muted small', text: 'Zatím žádný záznam.' }),
    ]),
    el('button', {
      type: 'button', class: 'btn btn-danger', text: 'Smazat míru',
      onclick: async () => {
        const ok = await confirmDialog({
          title: `Smazat míru „${kind.name}“?`,
          text: entries.length ? `Smažou se i ${plural(entries.length, ['záznam', 'záznamy', 'záznamů'])}.` : '',
          okLabel: 'Smazat', danger: true,
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
      kinds.map((k) => el('option', { value: k.key, text: `${k.name} (${k.unit})` })));
    const value = el('input', { type: 'text', class: 'input input-number', inputmode: 'decimal', autocomplete: 'off' });
    const date = el('input', { type: 'date', class: 'input', value: today(), max: today() });
    const kind = kinds.find((k) => k.key === key);
    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: presetKey ? `${kind.name} (${kind.unit})` : 'Zapsat míru' }),
      kindSelect ? el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Míra' }), kindSelect]) : null,
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Hodnota' }), value]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Datum' }), date]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(false) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Uložit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = parse(value);
      if (!Number.isFinite(v)) { toast('Zadej hodnotu'); return; }
      await addMeasurement(key, v, toIso(date.value));
      toast('Zapsáno');
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
const UNITS = ['cm', 'kg', '%'];

function newKindDialog(kinds) {
  const available = PRESET_KINDS.filter((p) => !kinds.some((k) => k.key === p.key));
  return openDialog((close) => {
    if (!available.length) {
      return el('div', { class: 'dialog-body' }, [
        el('h2', { class: 'dialog-title', text: 'Nová míra' }),
        el('p', { class: 'muted', text: 'Všechny nabízené míry už máš přidané.' }),
        el('div', { class: 'dialog-actions' }, [el('button', { type: 'button', class: 'btn btn-primary', text: 'OK', onclick: () => close(false) })]),
      ]);
    }
    const unit = el('select', { class: 'input' }, UNITS.map((u) => el('option', { value: u, text: u })));
    const name = el('select', {
      class: 'input',
      onchange: () => { unit.value = available.find((p) => p.key === name.value).unit; },
    }, available.map((p) => el('option', { value: p.key, text: p.name })));
    unit.value = available[0].unit;
    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: 'Nová míra' }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Míra' }), name]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Jednotka' }), unit]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(false) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Přidat' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const preset = available.find((p) => p.key === name.value);
      await saveMeasureKinds([...kinds, { key: preset.key, name: preset.name, unit: unit.value }]);
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
  if (!exercise) { container.append(el('p', { class: 'muted', text: 'Cvik nenalezen.' })); return; }
  titleEl.textContent = 'Výkon';
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
        el('h2', { class: 'ex-name', text: exercise.name }),
        exercise.perGym && gyms.length > 1 ? el('div', { class: 'segmented gym-seg' }, gyms.map((g) => el('button', {
          type: 'button', class: `seg ${g.id === gymId ? 'is-selected' : ''}`, text: g.name, onclick: () => { gymId = g.id; draw(); },
        }))) : null,
        el('dl', { class: 'kv' }, [
          el('div', { class: 'kv-row' }, [el('dt', { text: 'Osobní rekord' }), el('dd', { class: 'gold', text: recordText(exercise, rec) })]),
          rec?.maxWeight ? el('div', { class: 'kv-row' }, [el('dt', { text: 'Dosaženo' }), el('dd', { text: dateShort.format(new Date(rec.maxWeight.date)) })]) : null,
        ]),
        el('h4', { class: 'sub-title', text: exerciseChartTitle(exercise) }),
        rangeChart(points, { format: exerciseFormat(exercise) }),
        myManual.length ? el('p', { class: 'muted small', text: 'Duté body jsou ruční záznamy.' }) : null,
      ]),
      atWeight.length ? el('section', { class: 'card' }, [
        el('h3', { class: 'card-title', text: 'Nejvíc opakování při váze' }),
        el('dl', { class: 'kv' }, atWeight.map(([w, r]) => el('div', { class: 'kv-row' }, [
          el('dt', { text: formatWeight(w, { bodyweight: exercise.bodyweight }) }),
          el('dd', { text: `${r.value} × · ${dateShort.format(new Date(r.date))}` }),
        ]))),
      ]) : null,
      el('section', { class: 'card' }, [
        el('h3', { class: 'card-title', text: 'Ruční záznamy' }),
        myManual.length
          ? el('ul', { class: 'list' }, myManual.map((m) => el('li', { class: 'list-row' }, [
            el('span', { class: 'list-main stat-row' }, [
              el('span', { text: dateShort.format(new Date(m.date)) }),
              el('strong', { text: formatValues({ type: exercise.type, bodyweight: exercise.bodyweight }, [m]) }),
            ]),
            el('button', {
              type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': 'Smazat záznam',
              onclick: async () => {
                if (await confirmDialog({ title: 'Smazat ruční záznam?', okLabel: 'Smazat', danger: true })) { await deleteManualRecord(m.id); rerender(); }
              },
            }),
          ])))
          : el('p', { class: 'muted small', text: 'Např. test maxima mimo trénink.' }),
        el('button', { type: 'button', class: 'btn', text: '+ Ruční záznam', onclick: async () => { if (await manualRecordDialog(exercise, gyms, gymId)) rerender(); } }),
      ]),
      el('button', { type: 'button', class: 'btn', text: 'Detail cviku', onclick: () => navigate(`cvik/${encodeURIComponent(id)}`) }),
    ].filter(Boolean));
  };
  draw();
}

function manualRecordDialog(exercise, gyms, presetGymId) {
  return openDialog((close) => {
    let gymId = exercise.perGym ? (presetGymId ?? gyms[0]?.id) : null;
    const input = (placeholder) => el('input', { type: 'text', class: 'input', inputmode: 'decimal', autocomplete: 'off', placeholder });
    const weight = exercise.type === 'reps' ? null : input(exercise.bodyweight ? 'přidaná, 0 = tělo' : 'kg');
    const reps = exercise.type === 'time' ? null : input('opakování');
    const seconds = exercise.type === 'time' ? input('sekundy') : null;
    const date = el('input', { type: 'date', class: 'input', value: today(), max: today() });
    const gymSelect = exercise.perGym && gyms.length > 1
      ? el('select', { class: 'input', onchange: (e) => { gymId = e.target.value; } }, gyms.map((g) => el('option', { value: g.id, text: g.name, selected: g.id === gymId ? '' : null })))
      : null;
    const field = (label, control) => el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), control]);
    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: exercise.name }),
      gymSelect ? field('Posilovna', gymSelect) : null,
      weight ? field(exercise.bodyweight ? 'Přidaná váha (kg)' : 'Váha (kg)', weight) : null,
      reps ? field('Opakování', reps) : null,
      seconds ? field('Výdrž (s)', seconds) : null,
      field('Datum', date),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(false) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Uložit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const w = weight ? parse(weight) : 0;
      const r = reps ? Math.round(parse(reps)) : null;
      const s = seconds ? Math.round(parse(seconds)) : null;
      if ((weight && !Number.isFinite(w)) || (reps && !(r > 0)) || (seconds && !(s > 0))) { toast('Vyplň hodnoty'); return; }
      await addManualRecord({ exerciseId: exercise.id, gymId, weight: w, reps: r, seconds: s, date: toIso(date.value) });
      toast('Záznam uložen');
      close(true);
    });
    return form;
  });
}
