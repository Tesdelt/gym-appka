// Úprava typu tréninku (šablony).
//
// Trasy: #/sablona/<id>          název, cviky a jejich pořadí
//        #/sablona/<id>/<index>  série, váhy, opakování, pauzy, rozsah a krok váhy
//
// Každá změna se hned ukládá. Rozdělaný trénink se nemění, úpravy platí
// od dalšího tréninku.

import {
  getTemplate, saveTemplate, deleteTemplate, exerciseMap, getExercise, defaultTemplateItem, weightStepFor,
  TEMPLATE_COLORS, templateColor,
} from '../data.js';
import {
  el, promptText, confirmDialog, openDialog, toast, stepField, dragHandle, makeSortable, formatWeight, formatRest, plural,
} from '../ui.js';
import { navigate } from '../router.js';
import { pickExercise } from '../exercisePicker.js';
import { rangeFor } from '../recommend.js';

export const title = 'Typ tréninku';
export const tab = 'nastaveni';

export async function render(container, { params, extraEl, titleEl }) {
  extraEl.append(el('button', {
    type: 'button', class: 'btn btn-small', text: '← Zpět',
    onclick: () => (history.length > 1 ? history.back() : navigate('nastaveni')),
  }));
  const template = await getTemplate(params[0]);
  if (!template) { container.append(el('p', { class: 'muted', text: 'Typ tréninku nenalezen.' })); return; }
  if (params[1] != null && template.exercises[Number(params[1])]) {
    titleEl.textContent = 'Série';
    return renderItem(container, template, Number(params[1]));
  }
  titleEl.textContent = template.name;
  return renderTemplate(container, template, titleEl);
}

// ---------- Šablona ----------
async function renderTemplate(container, template, titleEl) {
  const exercises = await exerciseMap();
  const redraw = () => { container.replaceChildren(); renderTemplate(container, template, titleEl); };
  const save = async () => { await saveTemplate(template); };

  const list = el('ul', { class: 'list drag-list' }, template.exercises.map((item, i) => {
    const ex = exercises.get(item.exerciseId);
    return el('li', { class: 'list-row', 'data-index': i }, [
      dragHandle(),
      el('button', { type: 'button', class: 'list-main', onclick: () => navigate(`sablona/${encodeURIComponent(template.id)}/${i}`) }, [
        el('span', { class: 'block', text: ex?.name ?? 'Smazaný cvik' }),
        el('span', { class: 'muted small block', text: describeItem(item, ex) }),
      ]),
      el('button', {
        type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': 'Odebrat cvik',
        onclick: async () => {
          if (!await confirmDialog({ title: `Odebrat „${ex?.name ?? 'cvik'}“ z tréninku?`, okLabel: 'Odebrat', danger: true })) return;
          template.exercises.splice(i, 1);
          await save();
          redraw();
        },
      }),
    ]);
  }));
  makeSortable(list, async (order) => {
    template.exercises = order.map((i) => template.exercises[i]);
    await save();
    redraw();
  });

  container.append(el('div', { class: 'stack' }, [
    el('section', { class: 'card' }, [
      el('dl', { class: 'kv' }, [
        editRow('Název', template.name, async () => {
          const name = await promptText({ title: 'Název typu tréninku', value: template.name });
          if (name) { template.name = name; titleEl.textContent = name; await save(); redraw(); }
        }),
        el('div', { class: 'kv-row' }, [
          el('dt', { text: 'Barva' }),
          el('dd', {}, [el('button', {
            type: 'button', class: 'color-btn',
            onclick: async () => {
              const key = await pickColor(template.color ?? null);
              if (key === undefined) return;
              template.color = key;
              await save();
              redraw();
            },
          }, [
            el('span', { class: 'swatch', style: templateColor(template.color) ? `background: ${templateColor(template.color)}` : '' }),
            el('span', { text: TEMPLATE_COLORS.find((c) => c.key === template.color)?.name ?? 'Bez barvy' }),
            el('span', { class: 'muted', text: ' ✎' }),
          ])]),
        ]),
        editRow('Popis', template.subtitle || '–', async () => {
          const text = await promptText({ title: 'Popis (partie)', value: template.subtitle ?? '', placeholder: 'např. záda, biceps' });
          if (text != null) { template.subtitle = text; await save(); redraw(); }
        }),
      ]),
    ]),
    el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'Cviky' }),
      template.exercises.length
        ? el('p', { class: 'muted small', text: 'Klepnutím upravíš série. Pořadí změníš tažením za ≡ (nebo klepni na ≡ a pak na ≡ cíle).' })
        : el('p', { class: 'muted small', text: 'Zatím bez cviků.' }),
      list,
      el('button', {
        type: 'button', class: 'btn btn-primary', text: '+ Přidat cvik',
        onclick: async () => {
          const ex = await pickExercise({ title: 'Přidat cvik', exclude: template.exercises.map((e) => e.exerciseId) });
          if (!ex) return;
          template.exercises.push(defaultTemplateItem(ex));
          await save();
          navigate(`sablona/${encodeURIComponent(template.id)}/${template.exercises.length - 1}`);
        },
      }),
    ]),
    el('p', { class: 'muted small', text: 'Úpravy platí od dalšího tréninku. Uložené tréninky v historii se nemění.' }),
    el('button', {
      type: 'button', class: 'btn btn-danger', text: 'Smazat typ tréninku',
      onclick: async () => {
        const ok = await confirmDialog({ title: `Smazat „${template.name}“?`, text: 'Uložené tréninky tohoto typu v historii zůstanou.', okLabel: 'Smazat', danger: true });
        if (!ok) return;
        await deleteTemplate(template.id);
        toast('Typ tréninku smazán');
        navigate('nastaveni');
      },
    }),
  ]));
}

function editRow(label, value, onclick) {
  return el('div', { class: 'kv-row' }, [
    el('dt', { text: label }),
    el('dd', {}, [el('button', { type: 'button', class: 'link-btn', text: `${value} ✎`, onclick })]),
  ]);
}

export function describeItem(item, exercise) {
  const bw = exercise?.bodyweight;
  if (item.mode === 'dropset') {
    const steps = item.steps.map((s) => `${formatWeight(s.weight, { bodyweight: bw })} × ${s.reps}`).join(' → ');
    return `drop set ${item.rounds}×: ${steps}, pauza ${formatRest(item.rest)}`;
  }
  if (!item.sets.length) return 'bez sérií';
  const first = item.sets[0];
  const same = item.sets.every((s) => s.weight === first.weight && s.reps === first.reps && s.seconds === first.seconds && s.rest === first.rest);
  const value = (s) => (exercise?.type === 'time' ? `${s.seconds} s` : `${s.reps}`);
  const load = (s) => (exercise?.type === 'reps' ? '' : `${formatWeight(s.weight, { bodyweight: bw })}, `);
  if (same) return `${load(first)}${item.sets.length} × ${value(first)}, pauza ${formatRest(first.rest)}`;
  return `${plural(item.sets.length, ['série', 'série', 'sérií'])}: ${item.sets.map((s) => `${load(s)}${value(s)}`.replace(', ', ' × ')).join(' | ')}`;
}

// ---------- Série jednoho cviku ----------
async function renderItem(container, template, index) {
  const item = template.exercises[index];
  const exercise = await getExercise(item.exerciseId);
  if (!exercise) { container.append(el('p', { class: 'muted', text: 'Cvik byl smazán.' })); return; }
  const redraw = () => { container.replaceChildren(); renderItem(container, template, index); };
  const save = () => saveTemplate(template);
  const isTime = exercise.type === 'time';
  const hasWeight = exercise.type !== 'reps';
  const step = item.weightStep ?? weightStepFor(exercise, null);
  const wMin = exercise.bodyweight ? null : 0;
  const wLabel = exercise.bodyweight ? 'Přidaná (kg)' : 'Váha (kg)';

  const parts = [];

  // Hlavička
  parts.push(el('section', { class: 'card' }, [
    el('h2', { class: 'ex-name', text: exercise.name }),
    el('div', { class: 'row-2 top-gap' }, [
      el('button', {
        type: 'button', class: 'btn btn-small', text: 'Změnit cvik',
        onclick: async () => {
          const ex = await pickExercise({ title: 'Změnit cvik', exclude: template.exercises.map((e) => e.exerciseId) });
          if (!ex) return;
          if (ex.type !== exercise.type) Object.assign(item, defaultTemplateItem(ex));
          item.exerciseId = ex.id;
          await save();
          redraw();
        },
      }),
      el('button', { type: 'button', class: 'btn btn-small', text: 'Detail cviku', onclick: () => navigate(`cvik/${encodeURIComponent(exercise.id)}`) }),
    ]),
    exercise.type === 'weight' ? el('div', { class: 'segmented top-gap' }, [['sets', 'Série'], ['dropset', 'Drop set']].map(([mode, label]) => el('button', {
      type: 'button', class: `seg ${item.mode === mode ? 'is-selected' : ''}`, text: label,
      onclick: async () => {
        if (item.mode === mode) return;
        convertMode(item, mode, step);
        await save();
        redraw();
      },
    }))) : null,
  ]));

  if (item.mode === 'dropset') {
    // Drop set: kola, stupně, pauza mezi koly
    parts.push(el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Drop set' }),
      el('div', { class: 'set-grid cols-2' }, [
        stepField('Počet kol', item.rounds, 1, 1, (v) => { item.rounds = Math.max(1, Math.round(v)); save(); }).root,
        stepField('Pauza (min)', item.rest / 60, 0.5, 0, (v) => { item.rest = Math.round(v * 60); save(); }).root,
      ]),
      el('p', { class: 'muted small', text: 'Stupně jdou po sobě bez pauzy, pauza je až po celém kole.' }),
      ...item.steps.map((st, i) => el('div', { class: 'set-card' }, [
        el('div', { class: 'set-card-head' }, [
          el('span', { class: 'set-card-title', text: `Váha ${i + 1}` }),
          item.steps.length > 1 ? el('button', {
            type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': 'Odebrat stupeň',
            onclick: async () => { item.steps.splice(i, 1); await save(); redraw(); },
          }) : null,
        ]),
        el('div', { class: 'set-grid cols-2' }, [
          stepField(wLabel, st.weight, step, wMin, (v) => { st.weight = v; save(); }).root,
          stepField('Opakování', st.reps, 1, 1, (v) => { st.reps = Math.round(v); save(); }).root,
        ]),
      ])),
      el('button', {
        type: 'button', class: 'btn', text: '+ Přidat stupeň',
        onclick: async () => {
          const last = item.steps[item.steps.length - 1];
          item.steps.push({ weight: Math.max(0, Math.round((last.weight - step) * 100) / 100), reps: last.reps });
          await save();
          redraw();
        },
      }),
    ]));
  } else {
    // Série
    parts.push(el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Série' }),
      ...item.sets.map((set, i) => el('div', { class: 'set-card' }, [
        el('div', { class: 'set-card-head' }, [
          el('span', { class: 'set-card-title', text: `Série ${i + 1}` }),
          item.sets.length > 1 ? el('button', {
            type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': 'Odebrat sérii',
            onclick: async () => { item.sets.splice(i, 1); await save(); redraw(); },
          }) : null,
        ]),
        el('div', { class: 'set-grid cols-2' }, [
          hasWeight ? stepField(wLabel, set.weight, step, wMin, (v) => { set.weight = v; save(); }).root : null,
          isTime
            ? stepField('Výdrž (s)', set.seconds, 5, 5, (v) => { set.seconds = Math.round(v); save(); }).root
            : stepField('Opakování', set.reps, 1, 1, (v) => { set.reps = Math.round(v); save(); }).root,
          stepField('Pauza (min)', set.rest / 60, 0.5, 0, (v) => { set.rest = Math.round(v * 60); save(); }).root,
        ]),
      ])),
      el('div', { class: 'row-2' }, [
        el('button', {
          type: 'button', class: 'btn', text: '+ Přidat sérii',
          onclick: async () => {
            item.sets.push({ ...item.sets[item.sets.length - 1] });
            await save();
            redraw();
          },
        }),
        item.sets.length > 1 ? el('button', {
          type: 'button', class: 'btn', text: 'Všem jako 1.',
          onclick: async () => {
            item.sets = item.sets.map(() => ({ ...item.sets[0] }));
            await save();
            redraw();
          },
        }) : null,
      ]),
    ]));
  }

  // Rozsah opakování (pro doporučení)
  if (!isTime) {
    const firstReps = item.mode === 'dropset' ? item.steps[0].reps : item.sets[0]?.reps ?? 10;
    const def = rangeFor({ reps: firstReps }, { repRange: null });
    const custom = Boolean(item.repRange);
    const toggle = el('input', { type: 'checkbox', class: 'checkbox' });
    toggle.checked = custom;
    toggle.addEventListener('change', async () => {
      item.repRange = toggle.checked ? { ...def } : null;
      await save();
      redraw();
    });
    parts.push(el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Rozsah opakování' }),
      el('p', { class: 'muted small', text: 'Po dosažení horní hranice doporučí appka +1 krok váhy a návrat na spodní hranici.' }),
      el('label', { class: 'check-row' }, [toggle, el('span', { text: custom ? 'Vlastní rozsah' : `Výchozí: ${def.min}–${def.max} (opakování ze šablony až o 2 víc)` })]),
      custom ? el('div', { class: 'set-grid cols-2' }, [
        stepField('Od', item.repRange.min, 1, 1, (v) => { item.repRange.min = Math.round(v); save(); }).root,
        stepField('Do', item.repRange.max, 1, 1, (v) => { item.repRange.max = Math.round(v); save(); }).root,
      ]) : null,
    ]));
  }

  // Krok váhy
  if (hasWeight) {
    const exStep = weightStepFor(exercise, null);
    const custom = item.weightStep != null;
    const toggle = el('input', { type: 'checkbox', class: 'checkbox' });
    toggle.checked = custom;
    toggle.addEventListener('change', async () => {
      item.weightStep = toggle.checked ? exStep : null;
      await save();
      redraw();
    });
    parts.push(el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Krok váhy' }),
      el('label', { class: 'check-row' }, [toggle, el('span', {
        text: custom ? 'Vlastní krok pro tento trénink' : `Podle cviku: ${formatWeight(exStep)}${exercise.perGym ? ' (u kladek podle posilovny)' : ''}`,
      })]),
      custom ? stepField('Krok (kg)', item.weightStep, 0.25, 0.25, (v) => { item.weightStep = v; save(); }).root : null,
    ]));
  }

  parts.push(el('p', { class: 'muted small', text: 'Změny se ukládají hned a platí od dalšího tréninku.' }));
  container.append(el('div', { class: 'stack' }, parts.filter(Boolean)));
}

function convertMode(item, mode, step) {
  if (mode === 'dropset') {
    const first = item.sets?.[0] ?? { weight: 10, reps: 10, rest: 180 };
    item.mode = 'dropset';
    item.rounds = Math.max(1, Math.min(item.sets?.length ?? 2, 3));
    item.rest = first.rest ?? 180;
    item.steps = [0, 1, 2].map((k) => ({ weight: Math.max(0, Math.round((first.weight - k * step) * 100) / 100), reps: first.reps ?? 10 }));
    delete item.sets;
  } else {
    const first = item.steps?.[0] ?? { weight: 10, reps: 10 };
    item.mode = 'sets';
    item.sets = Array.from({ length: item.rounds ?? 3 }, () => ({ weight: first.weight, reps: first.reps, rest: item.rest ?? 180 }));
    delete item.steps;
    delete item.rounds;
    delete item.rest;
  }
}

// Výběr barvy: vrací klíč, null (bez barvy), nebo undefined při zrušení
function pickColor(current) {
  return openDialog((close) => el('div', { class: 'dialog-body' }, [
    el('h2', { class: 'dialog-title', text: 'Barva typu tréninku' }),
    el('div', { class: 'swatch-grid' }, [
      el('button', {
        type: 'button', class: `swatch-choice ${current == null ? 'is-selected' : ''}`, onclick: () => close(null),
      }, [el('span', { class: 'swatch swatch-none' }), el('span', { text: 'Bez barvy' })]),
      ...TEMPLATE_COLORS.map((c) => el('button', {
        type: 'button', class: `swatch-choice ${current === c.key ? 'is-selected' : ''}`, onclick: () => close(c.key),
      }, [el('span', { class: 'swatch', style: `background: ${c.hex}` }), el('span', { text: c.name })])),
    ]),
    el('div', { class: 'dialog-actions' }, [el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(undefined) })]),
  ]));
}
