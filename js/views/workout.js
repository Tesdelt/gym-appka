// Obrazovka průběhu tréninku.

import { el, openDialog, confirmDialog, promptNumber, toast, formatWeight, formatValues, formatRest, dateShort } from '../ui.js';
import { navigate } from '../router.js';
import { listTemplates } from '../data.js';
import { slotsOf } from '../recommend.js';
import { pickExercise } from '../exercisePicker.js';
import {
  getActiveWorkout, saveWorkout, deleteWorkout, currentSlot, completeCurrent, nextUndone, firstUndoneIn,
  slotLabel, restAfter, entryDone, elapsedSeconds, formatDuration, buildAdHocEntry,
} from '../workout.js';

export const title = 'Trénink';

export async function render(container, { extraEl }) {
  const workout = await getActiveWorkout();
  if (!workout) {
    container.append(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'Žádný rozdělaný trénink' }),
      el('button', { type: 'button', class: 'btn btn-primary', text: 'Na Domů', onclick: () => navigate('domu') }),
    ]));
    return;
  }

  // Časomíra v horní liště
  const timer = el('span', { class: 'timer', text: formatDuration(elapsedSeconds(workout)) });
  extraEl.append(timer);
  const tick = setInterval(() => {
    if (!timer.isConnected) { clearInterval(tick); return; }
    timer.textContent = formatDuration(elapsedSeconds(workout));
  }, 1000);

  let saveTimer = null;
  const save = () => saveWorkout(workout).catch((err) => { console.error(err); toast('Uložení selhalo'); });
  const saveLater = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); };

  const draw = () => {
    container.replaceChildren(...screen(workout, { save, saveLater, draw }));
  };
  draw();
}

function screen(workout, ctx) {
  const cur = currentSlot(workout);
  const parts = [];

  if (!workout.exercises.length) {
    parts.push(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'Šablona nemá žádné cviky' }),
      el('p', { class: 'muted small', text: 'Přidej cvik tlačítkem níže, nebo trénink ukonči.' }),
    ]));
  } else if (!cur) {
    parts.push(el('section', { class: 'card card-done' }, [
      el('h2', { class: 'card-title', text: 'Všechny série hotové' }),
      el('p', { class: 'muted small', text: 'Můžeš trénink ukončit, nebo ještě přidat cvik.' }),
    ]));
  } else {
    parts.push(currentCard(workout, cur, ctx));
    parts.push(nextPreview(workout));
  }

  parts.push(el('div', { class: 'row-2' }, [
    el('button', { type: 'button', class: 'btn', text: 'Cviky v tréninku', onclick: () => exerciseListSheet(workout, ctx) }),
    el('button', {
      type: 'button', class: 'btn btn-danger', text: 'Ukončit trénink',
      onclick: async () => {
        const anyDone = workout.exercises.some((e) => slotsOf(e).some((s) => s.done));
        if (!anyDone) {
          const ok = await confirmDialog({ title: 'Zahodit trénink?', text: 'Žádná série není odcvičená, trénink se neuloží.', okLabel: 'Zahodit', danger: true });
          if (ok) { await deleteWorkout(workout.id); navigate('domu'); }
          return;
        }
        const ok = await confirmDialog({ title: 'Ukončit trénink?', text: 'Zobrazí se souhrn, trénink se uloží až po potvrzení.', okLabel: 'Ukončit', danger: true });
        if (ok) {
          workout.endedAt = new Date().toISOString();
          await ctx.save();
          navigate('souhrn');
        }
      },
    }),
  ]));

  return parts;
}

// ---------- Aktuální cvik ----------
function currentCard(workout, cur, ctx) {
  const { entry, slot, index } = cur;
  const rec = recommendationFor(entry, index);
  const rest = restAfter(entry, index);

  const card = el('section', { class: 'card card-current' });

  card.append(
    el('div', { class: 'ex-head' }, [
      el('h2', { class: 'ex-name', text: entry.name }),
      el('span', { class: 'ex-set', text: slotLabel(entry, index) }),
    ]),
    el('div', { class: 'ex-media' }, [
      el('div', { class: 'ex-image', 'aria-hidden': 'true', html: PLACEHOLDER_SVG }),
      el('div', { class: 'ex-meta' }, [
        metaRow('Minule', entry.last ? formatValues(entry, entry.last.values) : 'Poprvé', entry.last ? dateShort.format(new Date(entry.last.date)) : ''),
        metaRow('Doporučení', rec ? formatValues(entry, [rec]) : '–', ''),
        el('button', { type: 'button', class: 'btn btn-small', text: 'Podrobnosti', onclick: () => toast('Detail cviku přibude v kroku 5') }),
      ]),
    ]),
  );

  // Velká čísla
  const steppers = el('div', { class: 'steppers' });
  if (entry.type !== 'reps') {
    steppers.append(stepper({
      label: entry.bodyweight ? 'Přidaná váha' : 'Váha',
      unit: 'kg',
      value: () => slot.weight,
      display: () => weightDisplay(slot.weight, entry.bodyweight),
      step: entry.weightStep,
      min: entry.bodyweight ? null : 0,
      set: (v) => { slot.weight = v; ctx.save(); },
      editTitle: 'Váha (kg)',
      wide: true,
    }));
  }
  if (entry.type === 'time') {
    steppers.append(stepper({
      label: 'Výdrž', unit: 's', value: () => slot.seconds, display: () => String(slot.seconds), step: 5, min: 0,
      set: (v) => { slot.seconds = Math.round(v); ctx.save(); }, editTitle: 'Výdrž (s)', intStep: true,
    }));
  } else {
    steppers.append(stepper({
      label: 'Opakování', unit: '', value: () => slot.reps, display: () => String(slot.reps), step: 1, min: 0,
      set: (v) => { slot.reps = Math.round(v); ctx.save(); }, editTitle: 'Opakování', intStep: true,
    }));
  }
  card.append(steppers);

  card.append(el('div', { class: 'row-2' }, [
    el('button', {
      type: 'button', class: 'btn', text: 'Použít doporučení', disabled: rec ? null : '',
      onclick: () => {
        if (rec.weight != null) slot.weight = rec.weight;
        if (rec.reps != null) slot.reps = rec.reps;
        if (rec.seconds != null) slot.seconds = rec.seconds;
        ctx.save();
        ctx.draw();
      },
    }),
    el('div', { class: 'rest-info' }, [
      el('span', { class: 'muted small', text: 'Pauza' }),
      el('span', { class: 'rest-value', text: rest ? formatRest(rest) : 'bez pauzy' }),
    ]),
  ]));

  card.append(el('button', {
    type: 'button', class: 'btn btn-primary btn-hero btn-done', text: slot.done ? 'Uložit změnu' : 'Hotovo',
    onclick: () => {
      completeCurrent(workout);
      ctx.save();
      card.classList.add('is-confirmed');
      setTimeout(() => { ctx.draw(); document.getElementById('view').scrollTop = 0; }, 180);
    },
  }));

  // Poznámka a volba na příště
  const note = el('textarea', {
    class: 'input textarea', rows: 2, placeholder: 'Poznámka k cviku (např. „10 opakování, ale ne v celku“)',
    oninput: (e) => { entry.note = e.target.value; ctx.saveLater(); },
  });
  note.value = entry.note ?? '';
  const choices = [['more', 'Přidat'], ['keep', 'Nechat'], ['less', 'Snížit']];
  const seg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Na příště' },
    choices.map(([value, label]) => el('button', {
      type: 'button', class: `seg ${entry.next === value ? 'is-selected' : ''}`, text: label,
      onclick: (e) => {
        entry.next = entry.next === value ? null : value;
        seg.querySelectorAll('.seg').forEach((b) => b.classList.toggle('is-selected', b === e.currentTarget && entry.next === value));
        ctx.save();
      },
    })));
  card.append(el('div', { class: 'note-block' }, [
    note,
    el('div', { class: 'note-next' }, [el('span', { class: 'muted small', text: 'Na příště' }), seg]),
  ]));

  return card;
}

function metaRow(label, value, sub) {
  return el('div', { class: 'meta-row' }, [
    el('span', { class: 'muted small', text: label + (sub ? ` (${sub})` : '') }),
    el('span', { class: 'meta-value', text: value }),
  ]);
}

function recommendationFor(entry, index) {
  if (!entry.rec?.length) return null;
  if (entry.mode === 'dropset') return entry.rec[index % entry.rounds[0].steps.length] ?? null;
  return entry.rec[Math.min(index, entry.rec.length - 1)] ?? null;
}

function weightDisplay(kg, bodyweight) {
  const num = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(Math.abs(kg));
  if (!bodyweight) return num;
  if (kg > 0) return `+${num}`;
  if (kg < 0) return `−${num}`;
  return '0';
}

function stepper({ label, unit, value, display, step, min, set, editTitle, intStep = false, wide = false }) {
  const num = el('button', { type: 'button', class: 'stepper-value', 'aria-label': `${label}: upravit` });
  const refresh = () => {
    const text = display();
    num.textContent = text;
    // delší hodnoty (+12,5) zmenšit, aby se vešly mezi tlačítka
    num.style.fontSize = text.length > 4 ? '28px' : text.length > 3 ? '34px' : '';
  };
  refresh();
  const change = (delta) => {
    let v = Math.round((value() + delta) * 100) / 100;
    if (min != null && v < min) v = min;
    set(v);
    refresh();
  };
  num.addEventListener('click', async () => {
    const v = await promptNumber({ title: editTitle, value: value(), step: intStep ? 1 : 'any', min, unit });
    if (v != null) { set(min != null ? Math.max(min, v) : v); refresh(); }
  });
  return el('div', { class: `stepper ${wide ? 'stepper-weight' : ''}` }, [
    el('div', { class: 'stepper-label' }, [el('span', { text: label }), unit ? el('span', { class: 'muted', text: ` ${unit}` }) : null]),
    el('div', { class: 'stepper-row' }, [
      el('button', { type: 'button', class: 'btn stepper-btn', text: '−', 'aria-label': `${label} minus`, onclick: () => change(-step) }),
      num,
      el('button', { type: 'button', class: 'btn stepper-btn', text: '+', 'aria-label': `${label} plus`, onclick: () => change(step) }),
    ]),
  ]);
}

// ---------- Náhled dalšího cviku ----------
function nextPreview(workout) {
  const c = workout.cursor;
  let next = null;
  for (let i = c.ex + 1; i < workout.exercises.length; i++) {
    if (!entryDone(workout.exercises[i])) { next = workout.exercises[i]; break; }
  }
  if (!next) {
    for (let i = 0; i < c.ex; i++) {
      if (!entryDone(workout.exercises[i])) { next = workout.exercises[i]; break; }
    }
  }
  return el('section', { class: 'card card-next' }, [
    el('span', { class: 'muted small', text: next ? 'Další cvik' : 'Poslední cvik v tréninku' }),
    next ? el('span', { class: 'next-name', text: next.name }) : null,
    next ? el('span', { class: 'muted small', text: describeEntry(next) }) : null,
  ]);
}

function describeEntry(entry) {
  const slots = slotsOf(entry);
  const first = slots[0];
  const weight = entry.type === 'reps' ? '' : `${formatWeight(first.weight, { bodyweight: entry.bodyweight })}, `;
  const value = entry.type === 'time' ? `${first.seconds} s` : `${first.reps}`;
  if (entry.mode === 'dropset') return `drop set, ${entry.rounds.length} kola × ${entry.rounds[0].steps.length} váhy`;
  return `${weight}${slots.length} × ${value}`;
}

// ---------- Seznam cviků v tréninku ----------
async function exerciseListSheet(workout, ctx) {
  await openDialog((close) => {
    const body = el('div', { class: 'dialog-body' });
    const draw = () => {
      body.replaceChildren(
        el('h2', { class: 'dialog-title', text: 'Cviky v tréninku' }),
        el('ul', { class: 'list' }, workout.exercises.map((entry, i) => {
          const slots = slotsOf(entry);
          const doneCount = slots.filter((s) => s.done).length;
          const isCurrent = workout.cursor?.ex === i;
          return el('li', { class: `list-row list-row-stacked ex-row ${isCurrent ? 'is-current' : ''}` }, [
            el('button', {
              type: 'button', class: 'list-main',
              onclick: () => { workout.cursor = { ex: i, slot: firstUndoneIn(entry) }; ctx.save(); close(); ctx.draw(); },
            }, [
              el('span', { class: 'block', text: `${i + 1}. ${entry.name}` }),
              el('span', { class: `muted small block ${doneCount === slots.length ? 'is-done' : ''}`, text: `${doneCount}/${slots.length} hotovo${isCurrent ? ' · právě cvičím' : ''}` }),
            ]),
            el('div', { class: 'row-actions' }, [
              el('button', { type: 'button', class: 'btn btn-small', text: '↑', 'aria-label': 'Posunout nahoru', disabled: i === 0 ? '' : null, onclick: () => move(i, -1) }),
              el('button', { type: 'button', class: 'btn btn-small', text: '↓', 'aria-label': 'Posunout dolů', disabled: i === workout.exercises.length - 1 ? '' : null, onclick: () => move(i, 1) }),
              el('button', { type: 'button', class: 'btn btn-small', text: 'Nahradit', onclick: () => replace(i) }),
              el('button', { type: 'button', class: 'btn btn-small', text: 'Odebrat', onclick: () => removeAt(i) }),
            ]),
          ]);
        })),
        el('div', { class: 'dialog-actions' }, [
          el('button', { type: 'button', class: 'btn', text: '+ Přidat cvik', onclick: add }),
          el('button', { type: 'button', class: 'btn btn-primary', text: 'Zavřít', onclick: () => close() }),
        ]),
      );
    };

    const fixCursor = () => {
      if (!workout.exercises.length) { workout.cursor = null; return; }
      const c = workout.cursor;
      if (!c || !workout.exercises[c.ex] || slotsOf(workout.exercises[c.ex])[c.slot]?.done !== false) {
        workout.cursor = nextUndone(workout, null);
      }
    };
    const move = (i, dir) => {
      const j = i + dir;
      const list = workout.exercises;
      [list[i], list[j]] = [list[j], list[i]];
      if (workout.cursor?.ex === i) workout.cursor.ex = j;
      else if (workout.cursor?.ex === j) workout.cursor.ex = i;
      ctx.save(); draw(); ctx.draw();
    };
    const removeAt = async (i) => {
      const entry = workout.exercises[i];
      const ok = await confirmDialog({ title: `Odebrat „${entry.name}“?`, okLabel: 'Odebrat', danger: true });
      if (!ok) return;
      workout.exercises.splice(i, 1);
      if (workout.cursor && workout.cursor.ex > i) workout.cursor.ex -= 1;
      else if (workout.cursor?.ex === i) workout.cursor = null;
      fixCursor();
      ctx.save(); draw(); ctx.draw();
    };
    const add = async () => {
      const exercise = await pickExercise({ title: 'Přidat cvik' });
      if (!exercise) return;
      const entry = await buildAdHocEntry(exercise, workout.gymId, await listTemplates());
      workout.exercises.push(entry);
      fixCursor();
      ctx.save(); draw(); ctx.draw();
    };
    const replace = async (i) => {
      const exercise = await pickExercise({ title: 'Nahradit cvik' });
      if (!exercise) return;
      const entry = await buildAdHocEntry(exercise, workout.gymId, await listTemplates());
      workout.exercises[i] = entry;
      if (workout.cursor?.ex === i) workout.cursor.slot = 0;
      fixCursor();
      ctx.save(); draw(); ctx.draw();
    };

    draw();
    return body;
  });
}

const PLACEHOLDER_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square">
  <path d="M10 32h44M14 22v20M20 18v28M44 18v28M50 22v20"/></svg>`;
