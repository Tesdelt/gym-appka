// Obrazovka průběhu tréninku: vše na jedné obrazovce bez scrollování.

import { el, openDialog, confirmDialog, promptNumber, toast, makeSortable, dragHandle, formatWeight, formatValues, formatRest, dateShort } from '../ui.js';
import { navigate } from '../router.js';
import { listTemplates } from '../data.js';
import { slotsOf } from '../recommend.js';
import { pickExercise } from '../exercisePicker.js';
import { imageBox } from '../images.js';
import { exerciseMap } from '../data.js';
import { computeRecords, recordKey } from '../records.js';
import { listManualRecords, manualAsWorkouts } from '../stats.js';
import { celebrate, explode, reducedMotion, slideOut, slideIn, onSwipe } from '../fx.js';
import {
  getActiveWorkout, saveWorkout, deleteWorkout, currentSlot, completeCurrent, nextUndone, firstUndoneIn,
  positionAfterConfirm, prevInOrder, adjacentExercise, listDoneWorkouts, slotLabel, restAfter, entryDone, elapsedSeconds, formatDuration, buildAdHocEntry,
} from '../workout.js';

export const title = '';
export const tab = 'domu';

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
  const [exercises, done, manual] = await Promise.all([exerciseMap(), listDoneWorkouts(), listManualRecords()]);
  const prior = [...done, ...manualAsWorkouts(manual, exercises)];
  const ctx = {
    save, saveLater, exercises, prior, priorRecords: computeRecords(prior),
    progress: progressBar((ex, slot) => {
      const target = workout.exercises[ex];
      if (!target) return;
      const c = workout.cursor;
      if (c && c.ex === ex && c.slot === slot) return;
      const dir = !c || ex > c.ex || (ex === c.ex && slot > c.slot) ? 1 : -1;
      ctx.move(dir, () => { target.skipped = false; workout.cursor = { ex, slot }; });
    }),
    draw: () => {
      container.replaceChildren(...screen(workout, ctx), ...(workout.exercises.length ? [ctx.progress.root] : []));
      ctx.progress.update(workout);
    },
    // karta odjede, změní se pozice a nová přijede z druhé strany
    move: async (dir, mutate) => {
      const card = container.querySelector('.card-current');
      if (card) await slideOut(card, dir);
      mutate();
      ctx.save();
      ctx.draw();
      const next = container.querySelector('.card-current') ?? container.firstElementChild;
      if (next) slideIn(next, dir);
    },
  };

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
    el('button', { type: 'button', class: 'ex-image', 'aria-label': 'Podrobnosti cviku', onclick: () => navigate(`cvik/${encodeURIComponent(entry.exerciseId)}`) }, [
      Object.assign(imageBox(ctx.exercises.get(entry.exerciseId), { cls: 'ex-image-pic' }), { style: 'view-transition-name: ex-image' }),
      el('span', { class: 'ex-image-label', text: 'Podrobnosti' }),
    ]),
    el('div', { class: 'ex-meta' }, [
      el('button', {
        type: 'button', class: 'btn btn-small btn-skip', text: 'Přeskočit cvik »',
        onclick: () => {
          entry.skipped = true;
          toast(`${entry.name} přeskočen`);
          ctx.move(1, () => { workout.cursor = nextUndone(workout, { ex: workout.cursor.ex, slot: 999 }); });
        },
      }),
      metaRow(entry.last ? `Minule ${dateShort.format(new Date(entry.last.date))}` : 'Minule', entry.last ? formatValues(entry, entry.last.values) : 'poprvé'),
      metaRow(entry.goal?.applied ? 'Doporučení podle cíle' : 'Doporučení', rec ? formatValues(entry, [rec]) : '–'),
    ]),
  ]));

  // Velká čísla
  const steppers = [];
  if (entry.type === 'weight') {
    steppers.push(stepper({
      label: entry.bodyweight ? 'Přidaná váha' : 'Váha', unit: 'kg',
      value: () => slot.weight, display: (v) => weightDisplay(v, entry.bodyweight),
      step: entry.weightStep, min: entry.bodyweight ? null : 0,
      set: (v) => { slot.weight = v; ctx.save(); }, editTitle: 'Váha (kg)',
    }));
  }
  if (entry.type === 'time') {
    steppers.push(stepper({
      label: 'Výdrž', unit: 's', value: () => slot.seconds, display: (v) => String(v), step: 5, min: 5,
      set: (v) => { slot.seconds = Math.round(v); ctx.save(); }, editTitle: 'Výdrž (s)', intStep: true,
    }));
    steppers.push(countdown(() => slot.seconds, (held) => { slot.seconds = held; ctx.save(); ctx.draw(); }));
  } else {
    steppers.push(stepper({
      label: 'Opakování', unit: '', value: () => slot.reps, display: (v) => String(v), step: 1, min: 0,
      set: (v) => { slot.reps = Math.round(v); ctx.save(); }, editTitle: 'Opakování', intStep: true,
    }));
  }
  card.append(el('div', { class: 'steppers' }, steppers.map((s) => s.root)));
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
      onclick: () => ctx.move(-1, () => { workout.cursor = prev; }),
    }),
    el('button', {
      type: 'button', class: `btn btn-primary btn-done ${toNextExercise ? 'is-next-exercise' : ''}`,
      onclick: () => {
        const record = isNewRecord(workout, cur, ctx);
        card.classList.add('is-confirmed');
        if (record) { cur.slot.pr = true; celebrate(); toast('Nový osobní rekord!'); }
        ctx.move(1, () => completeCurrent(workout));
      },
    }, [el('span', { class: 'btn-done-label', text: label }), el('span', { class: 'btn-done-arrow', text: arrow })]),
  ]));

  // Poznámka a volba na příště
  const note = el('input', {
    type: 'text', class: 'input note-input', placeholder: 'Poznámka k cviku…', autocomplete: 'off',
    oninput: (e) => { entry.note = e.target.value; ctx.saveLater(); },
  });
  note.value = entry.note ?? '';
  const choices = [['less', 'Snížit'], ['keep', 'Nechat'], ['more', 'Přidat']];
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

  // přejetí prstem: doleva další cvik, doprava předchozí (bez potvrzení)
  onSwipe(card, {
    left: () => { const n = adjacentExercise(workout, workout.cursor, 1); if (n) ctx.move(1, () => { workout.cursor = n; }); },
    right: () => { const p = adjacentExercise(workout, workout.cursor, -1); if (p) ctx.move(-1, () => { workout.cursor = p; }); },
  });

  return card;
}

// Je právě potvrzovaná série nový osobní rekord? (jen když cvik už má historii)
function isNewRecord(workout, cur, ctx) {
  const { entry, slot } = cur;
  if (slot.done) return false;
  const key = recordKey(entry, workout.gymId);
  if (!ctx.priorRecords.get(key)) return false;
  const rec = computeRecords([...ctx.prior, { ...workout, status: 'done' }]).get(key);
  if (entry.type === 'time') return slot.seconds > (rec.maxSeconds?.value ?? 0);
  if (entry.type === 'reps') return slot.reps > (rec.maxReps?.value ?? 0);
  if (!(slot.reps > 0)) return false;
  if (!rec.maxWeight || slot.weight > rec.maxWeight.value) return true;
  const at = rec.repsAtWeight.get(slot.weight);
  return Boolean(at) && slot.reps > at.value;
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

// Stepper: uprostřed hodnota, po stranách napůl schovaná sousední čísla
// (o krok níž / výš). Při změně se celý pás rychle posune jako při swipu.
function stepper({ label, unit, value, display, step, min, set, editTitle, intStep = false }) {
  const api = {};
  const round = (v) => Math.round(v * 100) / 100;
  const prevEl = el('span', { class: 'sv sv-prev', 'aria-hidden': 'true' });
  const curEl = el('span', { class: 'sv sv-cur' });
  const nextEl = el('span', { class: 'sv sv-next', 'aria-hidden': 'true' });
  const track = el('span', { class: 'sv-track' }, [prevEl, curEl, nextEl]);
  const num = el('button', { type: 'button', class: 'stepper-value', 'aria-label': `${label}: upravit` }, [track]);
  const refresh = () => {
    const v = value();
    curEl.textContent = display(v);
    const lo = round(v - step);
    prevEl.textContent = min != null && lo < min ? '' : display(lo);
    nextEl.textContent = display(round(v + step));
  };
  refresh();
  const change = (delta) => {
    let v = round(value() + delta);
    if (min != null && v < min) v = min;
    if (v === value()) return;
    set(v);
    refresh();
    slideValue(track, Math.sign(delta));
  };
  num.addEventListener('click', async () => {
    const v = await promptNumber({ title: editTitle, value: value(), step: intStep ? 1 : 'any', min, unit });
    if (v != null) { set(v); refresh(); }
  });
  api.num = num;
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

// Posun pásu čísel: při zvýšení přijede nová hodnota zprava, při snížení zleva
function slideValue(track, dir) {
  if (reducedMotion() || !track.animate) return;
  track.animate([
    { transform: `translateX(${dir * 50}%)` },
    { transform: 'none' },
  ], { duration: 170, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' });
}

// Odpočet výdrže: Start → běží do nuly → výbuch. Klepnutím během běhu se
// zastaví a skutečně odvisená doba se zapíše do série.
function countdown(getSeconds, onStopEarly) {
  const api = {};
  const big = el('span', { class: 'cd-big', text: 'Start' });
  const small = el('span', { class: 'cd-small', text: `${getSeconds()} s` });
  const btn = el('button', { type: 'button', class: 'btn countdown-btn', 'aria-label': 'Odpočet výdrže' }, [big, small]);
  let endAt = null;
  let startedAt = null;
  let raf = null;
  let wakeLock = null;

  const fmt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec));
  const reset = () => {
    endAt = null;
    cancelAnimationFrame(raf);
    btn.classList.remove('is-running', 'is-final');
    btn.style.removeProperty('--p');
    big.textContent = 'Start';
    small.textContent = `${getSeconds()} s`;
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
  };
  const tick = () => {
    if (!btn.isConnected) { reset(); return; }
    const total = getSeconds();
    const left = Math.max(0, (endAt - Date.now()) / 1000);
    const shown = Math.ceil(left);
    big.textContent = fmt(shown);
    btn.style.setProperty('--p', String(1 - left / total));
    btn.classList.toggle('is-final', shown <= 3 && shown > 0);
    if (left <= 0) {
      const r = btn.getBoundingClientRect();
      explode(r.left + r.width / 2, r.top + r.height / 2);
      reset();
      big.textContent = 'Hotovo!';
      small.textContent = `${total} s`;
      setTimeout(() => { if (!endAt && btn.isConnected) { big.textContent = 'Start'; } }, 1800);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('click', async () => {
    if (endAt) {
      const held = Math.round((Date.now() - startedAt) / 1000);
      reset();
      if (held > 0) { toast(`Zastaveno po ${held} s`); onStopEarly(held); }
      return;
    }
    startedAt = Date.now();
    endAt = startedAt + getSeconds() * 1000;
    btn.classList.add('is-running');
    small.textContent = 'klepni = stop';
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* nepodporováno */ }
    tick();
  });

  api.root = el('div', { class: 'stepper' }, [
    el('div', { class: 'stepper-label' }, [el('span', { text: 'Odpočet' })]),
    btn,
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
          dragHandle(),
          el('button', {
            type: 'button', class: 'list-main',
            onclick: () => { entry.skipped = false; workout.cursor = { ex: i, slot: firstUndoneIn(entry) }; ctx.save(); close(); ctx.draw(); },
          }, [
            el('span', { class: 'block', text: entry.name }),
            el('span', { class: `muted small block ${doneCount === slots.length ? 'is-done' : ''}`, text: entry.skipped ? 'přeskočeno · klepnutím vrátíš' : `${doneCount}/${slots.length} hotovo${isCurrent ? ' · právě cvičím' : ''}` }),
          ]),
          el('button', { type: 'button', class: 'btn btn-small', text: 'Nahradit', onclick: () => replace(i) }),
          el('button', { type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': 'Odebrat', onclick: () => removeAt(i) }),
        ]);
        return row;
      }));
      makeSortable(list, (order) => {
        const currentUid = workout.cursor ? workout.exercises[workout.cursor.ex]?.uid : null;
        workout.exercises = order.map((i) => workout.exercises[i]);
        if (currentUid) workout.cursor.ex = workout.exercises.findIndex((e) => e.uid === currentUid);
        ctx.save(); ctx.draw(); draw();
      });
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

// ---------- Ukazatel postupu (jako kapitoly na YouTube) ----------
// Cviky jsou oddělené větší mezerou s čárkou, série menší mezerou.
// Hotové série se plynule vyplní rudou.
function progressBar(onJump) {
  const root = el('div', { class: 'wprog', role: 'progressbar', 'aria-label': 'Postup tréninku, klepnutím přejdeš na sérii', 'aria-valuemin': 0, 'aria-valuemax': 100 });
  // klepnutí: cvik podle bloku, série podle místa v bloku
  root.addEventListener('click', (e) => {
    const group = e.target.closest('.wprog-ex') ?? [...root.children].find((g) => {
      const b = g.getBoundingClientRect();
      return e.clientX >= b.left && e.clientX <= b.right;
    });
    if (!group) return;
    const ex = [...root.children].indexOf(group);
    const slots = [...group.children];
    const hit = slots.findIndex((sl) => e.clientX <= sl.getBoundingClientRect().right + 1);
    onJump(ex, hit === -1 ? slots.length - 1 : hit);
  });
  let signature = '';
  let slotEls = [];
  return {
    root,
    update(workout) {
      const sig = workout.exercises.map((e) => `${e.uid}:${slotsOf(e).length}`).join('|');
      if (sig !== signature) {
        signature = sig;
        slotEls = workout.exercises.map((entry) => slotsOf(entry).map(() => el('div', { class: 'wprog-slot' }, [
          el('div', { class: 'wprog-fill' }, [el('div', { class: 'wl-wave' }), el('div', { class: 'wl-bubbles' })]),
        ])));
        root.replaceChildren(...slotEls.map((slots, i) => el('div', { class: 'wprog-ex', style: `flex-grow: ${slots.length}` }, slots)));
      }
      let done = 0;
      let total = 0;
      workout.exercises.forEach((entry, i) => {
        root.children[i].classList.toggle('is-skipped', Boolean(entry.skipped));
        slotsOf(entry).forEach((slot, k) => {
          total++;
          if (slot.done) done++;
          const node = slotEls[i][k];
          node.classList.toggle('is-done', slot.done);
          node.classList.toggle('is-pr', Boolean(slot.pr && slot.done));
          node.classList.toggle('is-current', workout.cursor?.ex === i && workout.cursor?.slot === k);
        });
      });
      root.setAttribute('aria-valuenow', total ? Math.round((done / total) * 100) : 0);
      requestAnimationFrame(alignLiquid);
    },
  };

  // Tekutina: vzor ve všech sériích tvoří jeden souvislý proud (každá vrstva
  // je posunutá o polohu své série) a všechny běží ve stejné fázi.
  function alignLiquid() {
    if (!root.isConnected) return;
    const base = root.getBoundingClientRect();
    const width = Math.ceil(base.width);
    const now = performance.now() / 1000;
    for (const node of root.querySelectorAll('.wprog-slot')) {
      const off = node.getBoundingClientRect().left - base.left;
      for (const layer of node.querySelectorAll('.wl-wave, .wl-bubbles')) {
        layer.style.left = `${-off}px`;
        layer.style.width = `${width + 60}px`;
        const fast = node.classList.contains('is-current');
        const dur = layer.classList.contains('wl-wave') ? (fast ? 0.5 : 0.9) : (fast ? 0.35 : 0.55);
        layer.style.animationDelay = `${-(now % dur)}s`;
      }
    }
  }
  window.addEventListener('resize', () => requestAnimationFrame(alignLiquid));
}
