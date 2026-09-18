// Souhrn tréninku: při ukončení (škály, komentář, uložení) i jako detail
// uloženého tréninku z historie.

import { el, toast, confirmDialog, openDialog, promptText, formatValues, dateLong, timeShort } from '../ui.js';
import { navigate } from '../router.js';
import { slotsOf } from '../recommend.js';
import { findNewRecords } from '../records.js';
import {
  getActiveWorkout, getWorkout, listDoneWorkouts, finishWorkout, saveWorkout, deleteWorkout,
  elapsedSeconds, formatDurationLong, compareWithPrevious, slotLabel,
} from '../workout.js';

export const title = 'Souhrn';
export const tab = 'domu';

const SCALES = [['energy', 'Energie'], ['sleep', 'Spánek'], ['food', 'Jídlo']];

export async function render(container, { params }) {
  const id = params[0];
  const workout = id ? await getWorkout(id) : await getActiveWorkout();
  const state = { editing: false };
  const draw = async () => {
    container.replaceChildren();
    await drawSummary(container, workout, id, state, draw);
  };
  await draw();
}

async function drawSummary(container, workout, id, state, redraw) {
  if (!workout) {
    container.append(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: id ? 'Trénink nenalezen' : 'Žádný rozdělaný trénink' }),
      el('button', { type: 'button', class: 'btn btn-primary', text: 'Na Domů', onclick: () => navigate('domu') }),
    ]));
    return;
  }
  const editable = workout.status === 'active' || state.editing;
  const done = await listDoneWorkouts();
  const previousAll = done.filter((w) => w.id !== workout.id && w.startedAt < workout.startedAt);
  const previousSame = previousAll.find((w) => w.templateId === workout.templateId) ?? null;
  const records = findNewRecords(workout, previousAll);
  const recordSlots = new Set(records.map((r) => r.slot));
  const comparison = compareWithPrevious(workout, previousSame);
  const started = new Date(workout.startedAt);

  const stack = el('div', { class: 'stack' });
  container.append(stack);

  // Hlavička
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'ex-name', text: workout.name }),
    el('dl', { class: 'kv' }, [
      kv('Datum', `${dateLong.format(started)}, ${timeShort.format(started)}`),
      kv('Posilovna', workout.gymName),
      kv('Délka', formatDurationLong(elapsedSeconds(workout))),
      kv('Série', `${workout.exercises.reduce((a, e) => a + slotsOf(e).filter((s) => s.done).length, 0)} hotových`),
    ]),
  ]));

  // Rekordy
  if (records.length) {
    stack.append(el('section', { class: 'card card-gold' }, [
      el('h2', { class: 'card-title gold', text: 'Nové osobní rekordy' }),
      el('ul', { class: 'plain-list' }, records.map((r) => {
        const entry = workout.exercises.find((e) => e.uid === r.entryUid);
        return el('li', {}, [
          el('strong', { text: entry.name }),
          el('span', { class: 'muted', text: ` – ${r.text}: ${formatValues(entry, [r.slot])}` }),
        ]);
      })),
    ]));
  }

  // Porovnání
  if (comparison.length) {
    stack.append(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'Oproti minulému tréninku' }),
      el('ul', { class: 'plain-list' }, comparison.map((c) => el('li', { class: `cmp cmp-${c.verdict}` }, [
        el('span', { class: 'cmp-mark', text: c.verdict === 'up' ? '↑' : c.verdict === 'down' ? '↓' : '=' }),
        el('span', {}, [
          el('strong', { class: 'block', text: c.entry.name }),
          el('span', { class: 'muted small', text: `${formatValues(c.entry, c.before)} → ${formatValues(c.entry, c.now)}` }),
        ]),
      ]))),
    ]));
  } else if (!previousSame) {
    stack.append(el('p', { class: 'muted small', text: 'První trénink tohoto typu, není s čím porovnat.' }));
  }

  // Cviky a série
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: 'Cviky' }),
    ...workout.exercises.map((entry) => {
      const slots = slotsOf(entry);
      const doneSlots = slots.map((s, i) => [s, i]).filter(([s]) => s.done);
      return el('div', { class: 'sum-ex' }, [
        el('strong', { class: 'block', text: entry.name }),
        doneSlots.length || state.editing
          ? el('ul', { class: 'plain-list sum-sets' }, (state.editing ? slots.map((s, i) => [s, i]) : doneSlots).map(([s, i]) => {
            const text = ` ${s.done ? formatValues(entry, [s]) : 'neodcvičeno'}${recordSlots.has(s) ? ' ★' : ''}`;
            if (!state.editing) {
              return el('li', { class: recordSlots.has(s) ? 'gold' : '' }, [
                el('span', { class: 'muted small', text: slotLabel(entry, i) }),
                el('span', { text }),
              ]);
            }
            return el('li', {}, [el('button', {
              type: 'button', class: 'set-edit',
              onclick: async () => { if (await editSlot(entry, s)) redraw(); },
            }, [el('span', { class: 'muted small', text: `${slotLabel(entry, i)} ✎` }), el('span', { text })])]);
          }))
          : el('span', { class: 'muted small block', text: 'Neodcvičeno' }),
        state.editing
          ? el('button', {
            type: 'button', class: 'btn btn-small', text: entry.note ? `Poznámka: ${entry.note}` : 'Přidat poznámku',
            onclick: async () => {
              const text = await promptText({ title: 'Poznámka k cviku', value: entry.note ?? '' });
              if (text != null) { entry.note = text; redraw(); }
            },
          })
          : entry.note ? el('span', { class: 'small block', text: `Poznámka: ${entry.note}` }) : null,
        entry.next && entry.next !== 'keep' ? el('span', { class: 'muted small block', text: `Na příště: ${{ more: 'přidat', less: 'snížit' }[entry.next]}` }) : null,
      ]);
    }),
  ]));

  // Škály a komentář
  const scales = { ...workout.scales };
  const comment = el('textarea', { class: 'input textarea', rows: 3, placeholder: 'Komentář (např. „unavený už předem“)', disabled: editable ? null : '' });
  comment.value = workout.comment ?? '';
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: 'Jak to šlo' }),
    ...SCALES.map(([key, label]) => el('div', { class: 'scale-row' }, [
      el('span', { class: 'scale-label', text: label }),
      el('div', { class: 'segmented' }, [1, 2, 3, 4, 5].map((n) => el('button', {
        type: 'button', class: `seg ${scales[key] === n ? 'is-selected' : ''}`, text: String(n), disabled: editable ? null : '',
        onclick: (e) => {
          scales[key] = scales[key] === n ? null : n;
          e.currentTarget.parentElement.querySelectorAll('.seg').forEach((b, i) => b.classList.toggle('is-selected', scales[key] === i + 1));
        },
      }))),
    ])),
    comment,
  ]));

  // Akce
  if (workout.status === 'active') {
    stack.append(el('div', { class: 'stack' }, [
      el('button', {
        type: 'button', class: 'btn btn-primary btn-hero',
        text: 'Uložit trénink',
        onclick: async () => {
          await finishWorkout(workout, { scales, comment: comment.value.trim() });
          toast('Trénink uložen');
          navigate('domu');
        },
      }),
      el('button', {
        type: 'button', class: 'btn', text: 'Zpět do tréninku',
        onclick: async () => { workout.endedAt = null; await saveWorkout(workout); navigate('trenink'); },
      }),
    ]));
  } else if (state.editing) {
    stack.append(el('div', { class: 'row-2' }, [
      el('button', {
        type: 'button', class: 'btn', text: 'Zrušit',
        onclick: async () => {
          Object.assign(workout, await getWorkout(workout.id)); // zahodit neuložené úpravy
          state.editing = false;
          await redraw();
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'Uložit změny',
        onclick: async () => {
          workout.scales = scales;
          workout.comment = comment.value.trim();
          await saveWorkout(workout);
          state.editing = false;
          toast('Změny uloženy');
          await redraw();
        },
      }),
    ]));
  } else {
    stack.append(el('div', { class: 'row-2' }, [
      el('button', {
        type: 'button', class: 'btn', text: 'Upravit',
        onclick: async () => { state.editing = true; await redraw(); },
      }),
      el('button', {
        type: 'button', class: 'btn btn-danger', text: 'Smazat trénink',
        onclick: async () => {
          const ok = await confirmDialog({ title: 'Smazat tento trénink?', text: 'Záznam zmizí z historie i ze statistik.', okLabel: 'Smazat', danger: true });
          if (ok) { await deleteWorkout(workout.id); toast('Trénink smazán'); navigate('domu'); }
        },
      }),
    ]));
  }
}

function kv(label, value) {
  return el('div', { class: 'kv-row' }, [el('dt', { text: label }), el('dd', { text: value })]);
}

// Dialog pro úpravu jedné série: váha / opakování (nebo výdrž) s tlačítky +/−
// a přepínač, zda byla odcvičená.
function editSlot(entry, slot) {
  return openDialog((close) => {
    const fmt = (v) => (v == null ? '' : new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2, useGrouping: false }).format(v));
    const parse = (input) => parseFloat(String(input.value).replace(',', '.'));
    const field = (label, value, step, min) => {
      const input = el('input', { type: 'text', class: 'input edit-field', inputmode: 'decimal', value: fmt(value), autocomplete: 'off' });
      const bump = (d) => {
        let v = parse(input);
        if (!Number.isFinite(v)) v = 0;
        v = Math.round((v + d) * 100) / 100;
        if (min != null && v < min) v = min;
        input.value = fmt(v);
      };
      const root = el('div', { class: 'edit-row' }, [
        el('span', { class: 'field-label', text: label }),
        el('div', { class: 'stepper-row edit-stepper' }, [
          el('button', { type: 'button', class: 'btn stepper-btn', text: '−', onclick: () => bump(-step) }),
          input,
          el('button', { type: 'button', class: 'btn stepper-btn', text: '+', onclick: () => bump(step) }),
        ]),
      ]);
      return { root, input };
    };
    const weight = entry.type === 'reps' ? null : field(entry.bodyweight ? 'Přidaná váha (kg)' : 'Váha (kg)', slot.weight, entry.weightStep ?? 2.5, entry.bodyweight ? null : 0);
    const reps = entry.type === 'time' ? null : field('Opakování', slot.reps, 1, 0);
    const seconds = entry.type === 'time' ? field('Výdrž (s)', slot.seconds, 5, 0) : null;
    let done = slot.done;
    const doneBtn = el('button', {
      type: 'button', class: `btn btn-small ${done ? 'btn-primary' : ''}`, text: done ? 'Odcvičeno' : 'Neodcvičeno',
      onclick: () => { done = !done; doneBtn.textContent = done ? 'Odcvičeno' : 'Neodcvičeno'; doneBtn.classList.toggle('btn-primary', done); },
    });
    const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: 'Upravit sérii' }),
      weight?.root, reps?.root, seconds?.root,
      el('div', { class: 'note-next' }, [el('span', { class: 'muted small', text: 'Stav' }), doneBtn]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(false) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Použít' }),
      ]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (weight) { const v = parse(weight.input); if (Number.isFinite(v)) slot.weight = Math.round(v * 100) / 100; }
      if (reps) { const v = parse(reps.input); if (Number.isFinite(v)) slot.reps = Math.round(v); }
      if (seconds) { const v = parse(seconds.input); if (Number.isFinite(v)) slot.seconds = Math.round(v); }
      if (done !== slot.done) { slot.done = done; slot.doneAt = done ? new Date().toISOString() : null; }
      close(true);
    });
    return form;
  });
}
