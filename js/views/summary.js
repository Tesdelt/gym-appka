// Souhrn tréninku: při ukončení (škály, komentář, uložení) i jako detail
// uloženého tréninku z historie.

import { el, toast, confirmDialog, formatValues, dateLong, timeShort } from '../ui.js';
import { navigate } from '../router.js';
import { slotsOf } from '../recommend.js';
import { findNewRecords } from '../records.js';
import {
  getActiveWorkout, getWorkout, listDoneWorkouts, finishWorkout, saveWorkout, deleteWorkout,
  elapsedSeconds, formatDurationLong, compareWithPrevious, slotLabel,
} from '../workout.js';

export const title = 'Souhrn';

const SCALES = [['energy', 'Energie'], ['sleep', 'Spánek'], ['food', 'Jídlo']];

export async function render(container, { params }) {
  const id = params[0];
  const workout = id ? await getWorkout(id) : await getActiveWorkout();
  if (!workout) {
    container.append(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: id ? 'Trénink nenalezen' : 'Žádný rozdělaný trénink' }),
      el('button', { type: 'button', class: 'btn btn-primary', text: 'Na Domů', onclick: () => navigate('domu') }),
    ]));
    return;
  }
  const editable = workout.status === 'active';
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
        doneSlots.length
          ? el('ul', { class: 'plain-list sum-sets' }, doneSlots.map(([s, i]) => el('li', { class: recordSlots.has(s) ? 'gold' : '' }, [
            el('span', { class: 'muted small', text: slotLabel(entry, i) }),
            el('span', { text: ` ${formatValues(entry, [s])}${recordSlots.has(s) ? ' ★' : ''}` }),
          ])))
          : el('span', { class: 'muted small block', text: 'Neodcvičeno' }),
        entry.note ? el('span', { class: 'small block', text: `Poznámka: ${entry.note}` }) : null,
        entry.next ? el('span', { class: 'muted small block', text: `Na příště: ${{ more: 'přidat', keep: 'nechat', less: 'snížit' }[entry.next]}` }) : null,
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
  if (editable) {
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
  } else {
    stack.append(el('button', {
      type: 'button', class: 'btn btn-danger', text: 'Smazat trénink',
      onclick: async () => {
        const ok = await confirmDialog({ title: 'Smazat tento trénink?', text: 'Záznam zmizí z historie i ze statistik.', okLabel: 'Smazat', danger: true });
        if (ok) { await deleteWorkout(workout.id); toast('Trénink smazán'); navigate('domu'); }
      },
    }));
  }
}

function kv(label, value) {
  return el('div', { class: 'kv-row' }, [el('dt', { text: label }), el('dd', { text: value })]);
}
