// Obrazovka průběhu tréninku: vše na jedné obrazovce bez scrollování.

import { el, openDialog, confirmDialog, promptNumber, toast, formatWeight, formatValues, formatRest, dateShort } from '../ui.js';
import { navigate } from '../router.js';
import { listTemplates } from '../data.js';
import { slotsOf } from '../recommend.js';
import { pickExercise } from '../exercisePicker.js';
import {
  getActiveWorkout, saveWorkout, deleteWorkout, currentSlot, completeCurrent, nextUndone, firstUndoneIn,
  positionAfterConfirm, prevInOrder, slotLabel, restAfter, entryDone, elapsedSeconds, formatDuration, buildAdHocEntry,
} from '../workout.js';

export const title = '';

export async function render(container, { extraEl, titleEl }) {
  const workout = await getActiveWorkout();
  if (!workout) {
    titleEl.textContent = 'Trénink';
    container.append(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'Žádný rozdělaný trénink' }),
      el('button', { type: 'button', class: 'btn btn-primary', text: 'Na Domů', onclick: () => navigate('domu') }),
    ]));
    return;
  }

  container.classList.add('view-workout');

  // Horní lišta: časomíra místo nadpisu, vpravo seznam cviků a ukončení
  titleEl.classList.add('timer-title');
  titleEl.textContent = formatDuration(elapsedSeconds(workout));
  const tick = setInterval(() => {
    if (!container.isConnected || !container.classList.contains('view-workout')) {
      clearInterval(tick);
      titleEl.classList.remove('timer-title');
      return;
    }
    titleEl.textContent = formatDuration(elapsedSeconds(workout));
  }, 1000);

  let saveTimer = null;
  const save = () => saveWorkout(workout).catch((err) => { console.error(err); toast('Uložení selhalo'); });
  const saveLater = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); };
  const ctx = { save, saveLater, draw: () => container.replaceChildren(...screen(workout, ctx)) };

  extraEl.append(
    el('button', { type: 'button', class: 'btn btn-small', text: 'Cviky', onclick: () => exerciseListSheet(workout, ctx) }),
    el('button', { type: 'button', class: 'btn btn-small btn-danger', text: 'Ukončit', onclick: () => endWorkout(workout, ctx) }),
  );

  ctx.draw();
}

async function endWorkout(workout, ctx) {
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
}

function screen(workout, ctx) {
  const cur = currentSlot(workout);

  if (!workout.exercises.length) {
    return [el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'Šablona nemá žádné cviky' }),
      el('p', { class: 'muted small', text: 'Přidej cvik přes tlačítko Cviky nahoře, nebo trénink ukonči.' }),
    ])];
  }
  if (!cur) {
    return [el('section', { class: 'card card-done' }, [
      el('h2', { class: 'card-title', text: 'Všechny série hotové' }),
      el('p', { class: 'muted small', text: 'Ukonči trénink tlačítkem nahoře, nebo ještě přidej cvik.' }),
      el('button', {
        type: 'button', class: 'btn', text: 'Zpět na poslední sérii',
        onclick: () => { workout.cursor = lastPosition(workout); ctx.save(); ctx.draw(); },
      }),
    ])];
  }
  return [currentCard(workout, cur, ctx), nextPreview(workout)];
}

function lastPosition(workout) {
  const ex = workout.exercises.length - 1;
  return { ex, slot: slotsOf(workout.exercises[ex]).length - 1 };
}

// ---------- Aktuální cvik ----------
function currentCard(workout, cur, ctx) {
  const { entry, slot, index } = cur;
  const rec = recommendationFor(entry, index);
  const rest = restAfter(entry, index);
  const card = el('section', { class: 'card card-current' });

  // Hlavička
  card.append(el('div', { class: 'ex-head' }, [
    el('h2', { class: 'ex-name', text: entry.name }),
    el('span', { class: 'ex-set', text: slotLabel(entry, index) }),
  ]));

  // Obrázek + minule / doporučení
  card.append(el('div', { class: 'ex-media' }, [
    el('button', { type: 'button', class: 'ex-image', 'aria-label': 'Podrobnosti cviku', onclick: () => toast('Detail cviku přibude v kroku 5') }, [
      el('span', { class: 'ex-image-pic', html: PLACEHOLDER_SVG }),
      el('span', { class: 'ex-image-label', text: 'Podrobnosti' }),
    ]),
    el('div', { class: 'ex-meta' }, [
      metaRow(entry.last ? `Minule ${dateShort.format(new Date(entry.last.date))}` : 'Minule', entry.last ? formatValues(entry, entry.last.values) : 'poprvé'),
      metaRow('Doporučení', rec ? formatValues(entry, [rec]) : '–'),
    ]),
  ]));

  // Velká čísla
  const steppers = [];
  if (entry.type !== 'reps') {
    steppers.push(stepper({
      label: entry.bodyweight ? 'Přidaná váha' : 'Váha', unit: 'kg',
      value: () => slot.weight, display: () => weightDisplay(slot.weight, entry.bodyweight),
      step: entry.weightStep, min: entry.bodyweight ? null : 0,
      set: (v) => { slot.weight = v; ctx.save(); }, editTitle: 'Váha (kg)',
    }));
  }
  if (entry.type === 'time') {
    steppers.push(stepper({
      label: 'Výdrž', unit: 's', value: () => slot.seconds, display: () => String(slot.seconds), step: 5, min: 0,
      set: (v) => { slot.seconds = Math.round(v); ctx.save(); }, editTitle: 'Výdrž (s)', intStep: true,
    }));
  } else {
    steppers.push(stepper({
      label: 'Opakování', unit: '', value: () => slot.reps, display: () => String(slot.reps), step: 1, min: 0,
      set: (v) => { slot.reps = Math.round(v); ctx.save(); }, editTitle: 'Opakování', intStep: true,
    }));
  }
  card.append(el('div', { class: 'steppers' }, steppers.map((s) => s.root)));
  // Obě čísla stejně velká: velikost podle nejdelší hodnoty
  const fitNumbers = () => {
    const longest = Math.max(...steppers.map((s) => s.text().length));
    const size = longest > 4 ? '28px' : longest > 3 ? '34px' : '';
    steppers.forEach((s) => { s.num.style.fontSize = size; });
  };
  steppers.forEach((s) => { s.onChange = fitNumbers; });
  fitNumbers();

  // Doporučení + pauza
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

  // Navigace: malá šipka zpět, velké potvrzení vpřed
  const after = positionAfterConfirm(workout);
  const prev = prevInOrder(workout, workout.cursor);
  const toNextExercise = Boolean(after) && after.ex !== workout.cursor.ex;
  let label;
  let arrow;
  if (!after) { label = slot.done ? 'Uložit' : 'Hotovo'; arrow = '✓'; }
  else if (toNextExercise) { label = 'Další cvik'; arrow = '⇥'; }
  else { label = slot.done ? 'Uložit' : 'Hotovo'; arrow = '→'; }

  card.append(el('div', { class: 'nav-row' }, [
    el('button', {
      type: 'button', class: 'btn btn-back', text: '←', 'aria-label': 'Předchozí série', disabled: prev ? null : '',
      onclick: () => { workout.cursor = prev; ctx.save(); ctx.draw(); },
    }),
    el('button', {
      type: 'button', class: `btn btn-primary btn-done ${toNextExercise ? 'is-next-exercise' : ''}`,
      onclick: () => {
        completeCurrent(workout);
        ctx.save();
        card.classList.add('is-confirmed');
        setTimeout(() => ctx.draw(), 160);
      },
    }, [el('span', { class: 'btn-done-label', text: label }), el('span', { class: 'btn-done-arrow', text: arrow })]),
  ]));

  // Poznámka a volba na příště
  const note = el('input', {
    type: 'text', class: 'input note-input', placeholder: 'Poznámka k cviku…', autocomplete: 'off',
    oninput: (e) => { entry.note = e.target.value; ctx.saveLater(); },
  });
  note.value = entry.note ?? '';
  const choices = [['more', 'Přidat'], ['keep', 'Nechat'], ['less', 'Snížit']];
  const seg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Na příště' },
    choices.map(([value, text]) => el('button', {
      type: 'button', class: `seg ${(entry.next ?? 'keep') === value ? 'is-selected' : ''}`, text,
      onclick: (e) => {
        entry.next = value;
        seg.querySelectorAll('.seg').forEach((b) => b.classList.toggle('is-selected', b === e.currentTarget));
        ctx.save();
      },
    })));
  card.append(el('div', { class: 'note-block' }, [
    note,
    el('div', { class: 'note-next' }, [el('span', { class: 'muted small', text: 'Na příště' }), seg]),
  ]));

  return card;
}

function metaRow(label, value) {
  return el('div', { class: 'meta-row' }, [
    el('span', { class: 'muted small', text: label }),
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

function stepper({ label, unit, value, display, step, min, set, editTitle, intStep = false }) {
  const api = { onChange: null };
  const num = el('button', { type: 'button', class: 'stepper-value', 'aria-label': `${label}: upravit` });
  const refresh = () => { num.textContent = display(); api.onChange?.(); };
  refresh();
  const change = (delta) => {
    let v = Math.round((value() + delta) * 100) / 100;
    if (min != null && v < min) v = min;
    set(v);
    refresh();
  };
  num.addEventListener('click', async () => {
    const v = await promptNumber({ title: editTitle, value: value(), step: intStep ? 1 : 'any', min, unit });
    if (v != null) { set(v); refresh(); }
  });
  api.num = num;
  api.text = display;
  api.root = el('div', { class: 'stepper' }, [
    el('div', { class: 'stepper-label' }, [el('span', { text: label }), unit ? el('span', { class: 'muted', text: ` ${unit}` }) : null]),
    el('div', { class: 'stepper-row' }, [
      el('button', { type: 'button', class: 'btn stepper-btn', text: '−', 'aria-label': `${label} minus`, onclick: () => change(-step) }),
      num,
      el('button', { type: 'button', class: 'btn stepper-btn', text: '+', 'aria-label': `${label} plus`, onclick: () => change(step) }),
    ]),
  ]);
  return api;
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
    next ? el('span', { class: 'next-name' }, [next.name, el('span', { class: 'muted small', text: ` · ${describeEntry(next)}` })]) : null,
  ]);
}

function describeEntry(entry) {
  const slots = slotsOf(entry);
  const first = slots[0];
  if (entry.mode === 'dropset') return `drop set, ${entry.rounds.length} kola × ${entry.rounds[0].steps.length} váhy`;
  const weight = entry.type === 'reps' ? '' : `${formatWeight(first.weight, { bodyweight: entry.bodyweight })}, `;
  const value = entry.type === 'time' ? `${first.seconds} s` : `${first.reps}`;
  return `${weight}${slots.length} × ${value}`;
}

// ---------- Seznam cviků v tréninku (přetažením se mění pořadí) ----------
async function exerciseListSheet(workout, ctx) {
  await openDialog((close) => {
    const body = el('div', { class: 'dialog-body' });
    const list = el('ul', { class: 'list drag-list' });

    const draw = () => {
      list.replaceChildren(...workout.exercises.map((entry, i) => {
        const slots = slotsOf(entry);
        const doneCount = slots.filter((s) => s.done).length;
        const isCurrent = workout.cursor?.ex === i;
        const row = el('li', { class: `list-row ex-row ${isCurrent ? 'is-current' : ''}`, 'data-index': i }, [
          el('span', { class: 'drag-handle', 'aria-label': 'Přetáhnout', html: '&#8801;' }),
          el('button', {
            type: 'button', class: 'list-main',
            onclick: () => { workout.cursor = { ex: i, slot: firstUndoneIn(entry) }; ctx.save(); close(); ctx.draw(); },
          }, [
            el('span', { class: 'block', text: entry.name }),
            el('span', { class: `muted small block ${doneCount === slots.length ? 'is-done' : ''}`, text: `${doneCount}/${slots.length} hotovo${isCurrent ? ' · právě cvičím' : ''}` }),
          ]),
          el('button', { type: 'button', class: 'btn btn-small', text: 'Nahradit', onclick: () => replace(i) }),
          el('button', { type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': 'Odebrat', onclick: () => removeAt(i) }),
        ]);
        attachDrag(row);
        return row;
      }));
    };

    body.append(
      el('h2', { class: 'dialog-title', text: 'Cviky v tréninku' }),
      el('p', { class: 'muted small', text: 'Klepnutím na název přeskočíš na cvik. Pořadí změníš tažením za ≡, nebo klepni na ≡ u cviku a pak na ≡ tam, kam ho chceš vložit.' }),
      list,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: '+ Přidat cvik', onclick: add }),
        el('button', { type: 'button', class: 'btn btn-primary', text: 'Zavřít', onclick: () => close() }),
      ]),
    );

    // Přetahování: řádek se za úchyt táhne prstem (touch i myš), ostatní se
    // mu vyhýbají. Pouhé klepnutí na úchyt cvik „vezme“ a další klepnutí
    // na jiný úchyt ho vloží před něj (náhrada tažení, když nefunguje).
    let picked = null;
    function commitOrder() {
      const order = [...list.children].map((r) => Number(r.dataset.index));
      if (order.some((v, i) => v !== i)) {
        const currentUid = workout.cursor ? workout.exercises[workout.cursor.ex]?.uid : null;
        workout.exercises = order.map((i) => workout.exercises[i]);
        if (currentUid) workout.cursor.ex = workout.exercises.findIndex((e) => e.uid === currentUid);
        ctx.save(); ctx.draw();
      }
      picked = null;
      draw();
    }
    function moveRowTo(row, clientY) {
      const rows = [...list.children].filter((r) => r !== row);
      const target = rows.find((r) => {
        const b = r.getBoundingClientRect();
        return clientY < b.top + b.height / 2;
      });
      if (target) list.insertBefore(row, target);
      else list.append(row);
    }
    function attachDrag(row) {
      const handle = row.querySelector('.drag-handle');
      if (picked !== null && Number(row.dataset.index) === picked) row.classList.add('is-picked');

      // Klepnutí (bez tažení): vzít / vložit
      handle.addEventListener('click', () => {
        if (row.dataset.moved === '1') { row.dataset.moved = ''; return; }
        const idx = Number(row.dataset.index);
        if (picked === null) { picked = idx; draw(); return; }
        if (picked === idx) { picked = null; draw(); return; }
        const pickedRow = [...list.children].find((r) => Number(r.dataset.index) === picked);
        list.insertBefore(pickedRow, row);
        commitOrder();
      });

      // Tažení prstem
      handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        let moved = false;
        row.classList.add('is-dragging');
        const onMove = (ev) => { moved = true; moveRowTo(row, ev.touches[0].clientY); };
        const onEnd = () => {
          handle.removeEventListener('touchmove', onMove);
          handle.removeEventListener('touchend', onEnd);
          handle.removeEventListener('touchcancel', onEnd);
          row.classList.remove('is-dragging');
          if (moved) { row.dataset.moved = '1'; commitOrder(); }
          else handle.click();
        };
        handle.addEventListener('touchmove', onMove, { passive: false });
        handle.addEventListener('touchend', onEnd);
        handle.addEventListener('touchcancel', onEnd);
      }, { passive: false });

      // Tažení myší
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        let moved = false;
        row.classList.add('is-dragging');
        const onMove = (ev) => { moved = true; moveRowTo(row, ev.clientY); };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          row.classList.remove('is-dragging');
          if (moved) { row.dataset.moved = '1'; commitOrder(); }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    const fixCursor = () => {
      if (!workout.exercises.length) { workout.cursor = null; return; }
      const c = workout.cursor;
      if (!c || !workout.exercises[c.ex] || slotsOf(workout.exercises[c.ex])[c.slot]?.done !== false) {
        workout.cursor = nextUndone(workout, null);
      }
    };
    async function removeAt(i) {
      const entry = workout.exercises[i];
      const ok = await confirmDialog({ title: `Odebrat „${entry.name}“?`, okLabel: 'Odebrat', danger: true });
      if (!ok) return;
      workout.exercises.splice(i, 1);
      if (workout.cursor && workout.cursor.ex > i) workout.cursor.ex -= 1;
      else if (workout.cursor?.ex === i) workout.cursor = null;
      fixCursor();
      ctx.save(); draw(); ctx.draw();
    }
    async function add() {
      const exercise = await pickExercise({ title: 'Přidat cvik' });
      if (!exercise) return;
      workout.exercises.push(await buildAdHocEntry(exercise, workout.gymId, await listTemplates()));
      fixCursor();
      ctx.save(); draw(); ctx.draw();
    }
    async function replace(i) {
      const exercise = await pickExercise({ title: 'Nahradit cvik' });
      if (!exercise) return;
      workout.exercises[i] = await buildAdHocEntry(exercise, workout.gymId, await listTemplates());
      if (workout.cursor?.ex === i) workout.cursor.slot = 0;
      fixCursor();
      ctx.save(); draw(); ctx.draw();
    }

    draw();
    return body;
  });
}

const PLACEHOLDER_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square">
  <path d="M10 32h44M14 22v20M20 18v28M44 18v28M50 22v20"/></svg>`;
