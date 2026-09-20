// Obrazovka průběhu tréninku: vše na jedné obrazovce bez scrollování.

import { el, openDialog, confirmDialog, promptNumber, toast, makeSortable, dragHandle, formatWeight, formatValues, dateShort, noteArea } from '../ui.js';
import { navigate } from '../router.js';
import { listTemplates } from '../data.js';
import { slotsOf, SET_TAGS, hasTag } from '../recommend.js';
import { pickExercise } from '../exercisePicker.js';
import { imageBox } from '../images.js';
import { exerciseMap } from '../data.js';
import { computeRecords, recordKey } from '../records.js';
import { listManualRecords, manualAsWorkouts } from '../stats.js';
import { celebrate, shockwave, reducedMotion, slideOut, slideIn, onSwipe } from '../fx.js';
import {
  getActiveWorkout, saveWorkout, deleteWorkout, currentSlot, completeCurrent, nextUndone, firstUndoneIn,
  positionAfterConfirm, prevInOrder, adjacentExercise, listDoneWorkouts, slotLabel, addSetAfterCurrent, removeLastUndoneSet, restAfter, entryDone, elapsedSeconds, formatDuration, buildAdHocEntry,
  canLogWarmup, logWarmup, allDone, isSideWarmup, occurrenceOf,
} from '../workout.js';
import { t, locale, exName } from '../i18n.js';

export const title = '';
export const tab = 'domu';

export async function render(container, { extraEl, titleEl }) {
  const workout = await getActiveWorkout();
  if (!workout) {
    titleEl.textContent = t('Trénink');
    container.append(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: t('Žádný rozdělaný trénink') }),
      el('button', { type: 'button', class: 'btn btn-primary', text: t('Na Domů'), onclick: () => navigate('domu') }),
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
  const save = () => saveWorkout(workout).catch((err) => { console.error(err); toast(t('Uložení selhalo')); });
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
      fitToScreen(container);
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
    el('button', { type: 'button', class: 'btn btn-small', text: t('Cviky'), onclick: () => exerciseListSheet(workout, ctx) }),
    el('button', { type: 'button', class: 'btn btn-small btn-danger', text: t('Ukončit'), onclick: () => endWorkout(workout, ctx) }),
  );

  ctx.draw();
  const onResize = () => { if (container.isConnected) fitToScreen(container); else window.removeEventListener('resize', onResize); };
  window.addEventListener('resize', onResize);
}

// Obrazovka tréninku se nesmí scrollovat. Když se obsah nevejde (menší
// iPhone), přepne se na kompaktní a případně ještě úspornější rozložení.
function fitToScreen(container) {
  const overflows = () => container.scrollHeight > container.clientHeight + 1
    || [...container.children].some((c) => c.scrollHeight > c.clientHeight + 1);
  container.classList.remove('is-compact', 'is-tight');
  if (!overflows()) return;
  container.classList.add('is-compact');
  if (!overflows()) return;
  container.classList.add('is-tight');
}

async function endWorkout(workout, ctx) {
  const anyDone = workout.exercises.some((e) => slotsOf(e).some((s) => s.done));
  if (!anyDone) {
    const ok = await confirmDialog({ title: t('Zahodit trénink?'), text: t('Žádná série není odcvičená, trénink se neuloží.'), okLabel: t('Zahodit'), danger: true });
    if (ok) { await deleteWorkout(workout.id); navigate('domu'); }
    return;
  }
  const ok = await confirmDialog({ title: t('Ukončit trénink?'), text: t('Zobrazí se souhrn, trénink se uloží až po potvrzení.'), okLabel: t('Ukončit'), danger: true });
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
      el('h2', { class: 'card-title', text: t('Šablona nemá žádné cviky') }),
      el('p', { class: 'muted small', text: t('Přidej cvik přes tlačítko Cviky nahoře, nebo trénink ukonči.') }),
    ])];
  }
  if (!cur) {
    return [el('section', { class: 'card card-done' }, [
      el('h2', { class: 'card-title', text: t('Všechny série hotové') }),
      el('p', { class: 'muted small', text: t('Ukonči trénink tlačítkem nahoře, nebo ještě přidej cvik.') }),
      el('button', {
        type: 'button', class: 'btn', text: t('Zpět na poslední sérii'),
        onclick: () => { workout.cursor = lastPosition(workout); ctx.save(); ctx.draw(); },
      }),
    ])];
  }
  return [currentCard(workout, cur, ctx), nextPreview(workout, ctx)];
}

function lastPosition(workout) {
  const ex = workout.exercises.length - 1;
  return { ex, slot: slotsOf(workout.exercises[ex]).length - 1 };
}

// ---------- Aktuální cvik ----------
function currentCard(workout, cur, ctx) {
  const { entry, slot, index } = cur;
  const rec = recommendationFor(entry, index);
  const card = el('section', { class: 'card card-current' });
  const warmups = slotsOf(entry).filter(isSideWarmup);

  // Hlavička
  // série: − ubere poslední neodcvičenou, + vloží kopii aktuální za ni
  const undone = slotsOf(entry).filter((st) => !st.done).length;
  const workCount = slotsOf(entry).filter((st) => !isSideWarmup(st)).length;
  const canRemove = entry.mode === 'dropset' ? entry.rounds.length > 1 && undone > 0 : workCount > 1 && undone > 0;
  card.append(el('div', { class: 'ex-head' }, [
    el('h2', { class: 'ex-name', text: nameOf(entry, ctx) }),
    el('div', { class: 'set-control' }, [
      el('button', {
        type: 'button', class: 'set-btn', text: '−', 'aria-label': entry.mode === 'dropset' ? t('Ubrat kolo') : t('Ubrat sérii'), disabled: canRemove ? null : '',
        onclick: () => { if (removeLastUndoneSet(workout)) { ctx.save(); ctx.draw(); } },
      }),
      el('span', { class: 'ex-set', text: slotLabel(entry, index) }),
      el('button', {
        type: 'button', class: 'set-btn', text: '+', 'aria-label': entry.mode === 'dropset' ? t('Přidat kolo') : t('Přidat sérii'),
        onclick: () => { if (addSetAfterCurrent(workout)) { ctx.save(); ctx.draw(); toast(entry.mode === 'dropset' ? t('Kolo přidáno') : t('Série přidána')); } },
      }),
    ]),
  ]));

  // Odpočet (jen výdrž): kulaté tlačítko vpravo nad sloupcem s časem
  const cd = entry.type === 'time' ? countdown(() => slot.seconds) : null;

  // Obrázek + minule / doporučení
  card.append(el('div', { class: 'ex-media' }, [
    el('button', { type: 'button', class: 'ex-image', 'aria-label': t('Podrobnosti cviku'), onclick: () => navigate(`cvik/${encodeURIComponent(entry.exerciseId)}`) }, [
      Object.assign(imageBox(ctx.exercises.get(entry.exerciseId), { cls: 'ex-image-pic' }), { style: 'view-transition-name: ex-image' }),
      el('span', { class: 'ex-image-label', text: t('Podrobnosti') }),
    ]),
    el('div', { class: 'ex-meta' }, [
      el('button', {
        type: 'button', class: 'btn btn-small btn-skip', text: t('Přeskočit cvik »'),
        onclick: () => {
          entry.skipped = true;
          toast(t('{name} přeskočen', { name: nameOf(entry, ctx) }));
          ctx.move(1, () => { workout.cursor = nextUndone(workout, { ex: workout.cursor.ex, slot: 999 }); });
        },
      }),
      metaRow(entry.last ? t('Minule {date}', { date: dateShort.format(new Date(entry.last.date)) }) : t('Minule'), entry.last ? formatValues(entry, entry.last.values) : t('poprvé')),
      metaRow(entry.goal?.applied ? t('Doporučení podle cíle') : t('Doporučení'), rec ? formatValues(entry, [rec]) : '–'),
      warmups.length ? metaRow(t('Zahřívací (bokem)'), formatValues(entry, warmups)) : null,
    ]),
    cd?.root,
  ]));

  // Velká čísla
  const steppers = [];
  if (entry.type !== 'reps') {
    steppers.push(stepper({
      label: entry.bodyweight ? t('Přidaná váha') : t('Váha'), unit: 'kg',
      value: () => slot.weight, display: (v) => weightDisplay(v, entry.bodyweight),
      step: entry.weightStep, min: entry.bodyweight ? null : 0,
      set: (v) => { slot.weight = v; ctx.save(); }, editTitle: t('Váha (kg)'),
    }));
  }
  if (entry.type === 'time') {
    steppers.push(stepper({
      label: t('Výdrž'), unit: 's', value: () => slot.seconds, display: (v) => String(v), step: 5, min: 5, snap: true,
      set: (v) => { slot.seconds = Math.round(v); ctx.save(); cd.refresh(); }, editTitle: t('Výdrž (s)'), intStep: true,
    }));
  } else {
    steppers.push(stepper({
      label: t('Opakování'), unit: '', value: () => slot.reps, display: (v) => String(v), step: 1, min: 0,
      set: (v) => { slot.reps = Math.round(v); ctx.save(); }, editTitle: t('Opakování'), intStep: true,
    }));
  }
  card.append(el('div', { class: 'steppers' }, steppers.map((s) => s.root)));
  // Doporučení + pauza
  card.append(el('div', { class: 'row-2' }, [
    el('button', {
      type: 'button', class: 'btn', text: t('Použít doporučení'), disabled: rec ? null : '',
      onclick: () => {
        if (rec.weight != null) slot.weight = rec.weight;
        if (rec.reps != null) slot.reps = rec.reps;
        if (rec.seconds != null) slot.seconds = rec.seconds;
        ctx.save();
        ctx.draw();
      },
    }),
    restStepper(entry, index, ctx),
  ]));

  // Štítky série (před potvrzením): zahřívací se nikam nepočítá, po částech
  // a s dopomocí se nepočítá jako splněná ani jako rekord
  card.append(el('div', { class: 'set-tags' }, SET_TAGS.map(([key, text]) => el('button', {
    type: 'button', class: `tag-chip tag-${key} ${hasTag(slot, key) ? 'is-on' : ''}`, text: t(text), 'aria-pressed': String(hasTag(slot, key)),
    onclick: (e) => {
      const on = !hasTag(slot, key);
      slot.tags = (slot.tags ?? []).filter((x) => x !== key);
      if (on) slot.tags.push(key);
      e.currentTarget.classList.toggle('is-on', on);
      e.currentTarget.setAttribute('aria-pressed', String(on));
      // zahřívací mění tlačítko Hotovo na „Zapsat zahřívací“
      if (key === 'warmup' && !slot.done) {
        ctx.save();
        ctx.draw();
        return;
      }
      ctx.save();
      ctx.progress.update(workout);
    },
  }))));

  // Navigace: malá šipka zpět, velké potvrzení vpřed
  const after = positionAfterConfirm(workout);
  const prev = prevInOrder(workout, workout.cursor);
  const warmup = canLogWarmup(workout);
  const toNextExercise = !warmup && Boolean(after) && after.ex !== workout.cursor.ex;
  let label;
  let arrow;
  if (warmup) { label = t('Zapsat zahřívací'); arrow = '↺'; }
  else if (!after) { label = slot.done ? t('Uložit') : t('Dokončit trénink'); arrow = '✓'; }
  else if (toNextExercise) { label = t('Další cvik'); arrow = '⇥'; }
  else { label = slot.done ? t('Uložit') : t('Hotovo'); arrow = '→'; }

  card.append(el('div', { class: 'nav-row' }, [
    el('button', {
      type: 'button', class: 'btn btn-back', text: '←', 'aria-label': t('Předchozí série'), disabled: prev ? null : '',
      onclick: () => ctx.move(-1, () => { workout.cursor = prev; }),
    }),
    el('button', {
      type: 'button', class: `btn btn-primary btn-done ${toNextExercise ? 'is-next-exercise' : ''}`,
      onclick: async () => {
        if (cd) {
          const held = cd.heldSeconds();
          if (held != null && held < slot.seconds) { slot.seconds = Math.max(1, held); toast(t('Zapsáno {n} s', { n: slot.seconds })); }
          cd.stop();
        }
        // zahřívací série: zapíše se bokem, zůstávám na stejné sérii
        if (warmup) {
          logWarmup(workout);
          ctx.save();
          ctx.draw();
          toast(t('Zahřívací série zapsána bokem'));
          return;
        }
        const record = isNewRecord(workout, cur, ctx);
        card.classList.add('is-confirmed');
        if (record) { cur.slot.pr = true; celebrate(); toast(t('Nový osobní rekord!')); }
        // poslední série: rovnou konec tréninku a souhrn
        if (!slot.done && !after) {
          completeCurrent(workout);
          workout.endedAt = new Date().toISOString();
          await ctx.save();
          await slideOut(card, 1);
          navigate('souhrn');
          return;
        }
        ctx.move(1, () => completeCurrent(workout));
      },
    }, [el('span', { class: 'btn-done-label', text: label }), el('span', { class: 'btn-done-arrow', text: arrow })]),
  ]));

  // Poznámka (k sérii, případně k celému cviku) a volba na příště
  const firstLine = (text) => String(text ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
  const noteText = slot.note ? firstLine(slot.note) : entry.note ? `${t('Cvik:')} ${firstLine(entry.note)}` : '';
  const note = el('button', {
    type: 'button', class: `input note-input note-btn ${noteText ? 'has-note' : ''}`,
    onclick: async () => { if (await notesDialog(entry, slot, index)) { ctx.save(); ctx.draw(); } },
  }, [el('span', { text: noteText ? `✎ ${noteText}` : t('✎ Poznámka k sérii nebo cviku…') })]);
  const choices = [['less', t('Snížit')], ['keep', t('Nechat')], ['more', t('Přidat')]];
  const seg = el('div', { class: 'segmented', role: 'group', 'aria-label': t('Na příště') },
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
    el('div', { class: 'note-next' }, [el('span', { class: 'muted small', text: t('Na příště') }), seg]),
  ]));

  // přejetí prstem: doleva další cvik, doprava předchozí (bez potvrzení)
  onSwipe(card, {
    left: () => { const n = adjacentExercise(workout, workout.cursor, 1); if (n) ctx.move(1, () => { workout.cursor = n; }); },
    right: () => { const p = adjacentExercise(workout, workout.cursor, -1); if (p) ctx.move(-1, () => { workout.cursor = p; }); },
  });

  return card;
}

// Poznámky: k této sérii a k celému cviku. Vrátí true po uložení.
function notesDialog(entry, slot, index) {
  return openDialog((close) => {
    const setNote = noteArea(slot.note, { placeholder: t('Např. poslední opakování s dopomocí'), rows: 4 });
    const exNote = noteArea(entry.note, { placeholder: t('Např. příště vyšší váha'), rows: 3 });
    return el('div', { class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: t('Poznámky') }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('K sérii ({label})', { label: slotLabel(entry, index) }) }), setNote]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('K celému cviku') }), exNote]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(false) }),
        el('button', {
          type: 'button', class: 'btn btn-primary', text: t('Uložit'),
          onclick: () => { slot.note = setNote.value.trim(); entry.note = exNote.value.trim(); close(true); },
        }),
      ]),
    ]);
  });
}

// Je právě potvrzovaná série nový osobní rekord? (jen když cvik už má historii)
function isNewRecord(workout, cur, ctx) {
  const { entry, slot } = cur;
  if (slot.done || hasTag(slot, 'warmup') || hasTag(slot, 'partial') || hasTag(slot, 'assisted')) return false;
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

// Název cviku v aktuálním jazyce (v tréninku je uložený jen český název)
function nameOf(entry, ctx) {
  return exName(ctx.exercises.get(entry.exerciseId), entry.name);
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
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Math.abs(kg));
  if (!bodyweight) return num;
  if (kg > 0) return `+${num}`;
  if (kg < 0) return `−${num}`;
  return '0';
}

// Stepper: uprostřed hodnota, po stranách napůl schovaná sousední čísla
// (o krok níž / výš). Při změně se celý pás rychle posune jako při swipu.
function stepper({ label, unit, value, display, step, min, set, editTitle, intStep = false, snap = false }) {
  const api = {};
  const round = (v) => Math.round(v * 100) / 100;
  const prevEl = el('span', { class: 'sv sv-prev', 'aria-hidden': 'true' });
  const curEl = el('span', { class: 'sv sv-cur' });
  const nextEl = el('span', { class: 'sv sv-next', 'aria-hidden': 'true' });
  const track = el('span', { class: 'sv-track' }, [prevEl, curEl, nextEl]);
  const num = el('button', { type: 'button', class: 'stepper-value', 'aria-label': t('{label}: upravit', { label }) }, [track]);
  const refresh = () => {
    const v = value();
    curEl.textContent = display(v);
    const lo = round(v - step);
    const hasPrev = !(min != null && lo < min);
    // bez nižší hodnoty zůstane místo (neviditelně), ať je číslo pořád uprostřed
    prevEl.textContent = hasPrev ? display(lo) : display(round(v + step));
    prevEl.style.visibility = hasPrev ? '' : 'hidden';
    nextEl.textContent = display(round(v + step));
  };
  refresh();
  const change = (delta) => {
    const cur = value();
    // přichycení na násobky kroku: ze 2 s tlačítkem + na 5 s, ne na 7 s
    let v = snap ? round(delta > 0 ? Math.floor(cur / step) * step + step : Math.ceil(cur / step) * step - step) : round(cur + delta);
    if (min != null && v < min) v = min;
    if (v === value()) return;
    set(v);
    refresh();
    slideValue(track, curEl, Math.sign(delta));
  };
  num.addEventListener('click', async () => {
    let v = await promptNumber({ title: editTitle, value: value(), step: intStep ? 1 : 'any', min, unit });
    if (v == null) return;
    if (snap) v = Math.round(v / step) * step;
    if (min != null && v < min) v = min;
    set(v);
    refresh();
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
function slideValue(track, curEl, dir) {
  if (reducedMotion() || !track.animate) return;
  const side = dir > 0 ? curEl.nextElementSibling : curEl.previousElementSibling;
  const d = side ? Math.abs(side.offsetLeft + side.offsetWidth / 2 - (curEl.offsetLeft + curEl.offsetWidth / 2)) : 30;
  track.animate([
    { transform: `translateX(${dir * d}px)` },
    { transform: 'none' },
  ], { duration: 170, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' });
}

// Odpočet výdrže (kulaté tlačítko). Klepnutí: start → pauza → pokračovat.
// Na nule vlna přes obrazovku. Změna času v „Výdrž“ se hned propíše.
function countdown(getSeconds) {
  const big = el('span', { class: 'cd-big' });
  const small = el('span', { class: 'cd-small' });
  const btn = el('button', { type: 'button', class: 'countdown-btn', 'aria-label': t('Odpočet výdrže') }, [big, small]);
  let left = null; // zbývající ms (pauza), null = připraveno
  let total = null; // délka právě běžícího / pozastaveného odpočtu (ms)
  let endAt = null; // běží do tohoto času
  let raf = null;
  let wakeLock = null;

  const fmt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec));
  const setRing = (fraction) => btn.style.setProperty('--left', String(fraction));
  const release = () => { wakeLock?.release?.().catch(() => {}); wakeLock = null; };
  const idle = () => {
    endAt = null; left = null;
    cancelAnimationFrame(raf);
    btn.classList.remove('is-running', 'is-paused', 'is-final');
    big.textContent = fmt(getSeconds());
    small.textContent = t('Start');
    setRing(1);
    release();
  };
  const tick = () => {
    if (!btn.isConnected) { cancelAnimationFrame(raf); release(); return; }
    const total = getSeconds() * 1000;
    const ms = Math.max(0, endAt - Date.now());
    const shown = Math.ceil(ms / 1000);
    big.textContent = fmt(shown);
    setRing(ms / total);
    btn.classList.toggle('is-final', shown <= 3 && shown > 0);
    if (ms <= 0) {
      const r = btn.getBoundingClientRect();
      shockwave(r.left + r.width / 2, r.top + r.height / 2);
      idle();
      big.textContent = '✓';
      small.textContent = t('Hotovo');
      setTimeout(() => { if (endAt == null && left == null && btn.isConnected) idle(); }, 1800);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('click', async () => {
    if (endAt != null) {
      // pauza: zůstane zbývající čas
      left = Math.max(0, endAt - Date.now());
      endAt = null;
      cancelAnimationFrame(raf);
      btn.classList.remove('is-running', 'is-final');
      btn.classList.add('is-paused');
      big.textContent = fmt(Math.ceil(left / 1000));
      small.textContent = t('Pokračovat');
      release();
      return;
    }
    if (left == null) total = getSeconds() * 1000;
    endAt = Date.now() + (left ?? total);
    left = null;
    btn.classList.remove('is-paused');
    btn.classList.add('is-running');
    small.textContent = t('Stop');
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* nepodporováno */ }
    tick();
  });
  idle();
  return {
    root: btn,
    refresh: () => { if (endAt == null) idle(); },
    // odvisené sekundy, pokud odpočet běží nebo je zastavený; jinak null
    heldSeconds: () => {
      if (endAt != null) return Math.round((total - Math.max(0, endAt - Date.now())) / 1000);
      if (left != null) return Math.round((total - left) / 1000);
      return null;
    },
    stop: () => idle(),
  };
}

// Pauza po sérii s +/− po minutách (0–10). Změna platí pro tuto a zbývající
// neodcvičené série cviku v tomto tréninku. U drop setu je to pauza po kole.
function restStepper(entry, index, ctx) {
  const inRound = entry.mode === 'dropset' && restAfter(entry, index) === 0;
  const current = () => (entry.mode === 'dropset' ? entry.rest : entry.sets[index].rest) ?? 0;
  const value = el('span', { class: 'rest-value' });
  const show = () => {
    const min = Math.round(current() / 60);
    value.textContent = `${min} min`;
  };
  const change = (d) => {
    const min = Math.max(0, Math.min(10, Math.round(current() / 60) + d));
    if (min * 60 === current()) return;
    if (entry.mode === 'dropset') entry.rest = min * 60;
    else entry.sets.forEach((slot, i) => { if (i === index || (!slot.done && i > index)) slot.rest = min * 60; });
    ctx.save();
    show();
    slideValue(value, value, Math.sign(d));
  };
  show();
  return el('div', { class: 'rest-info rest-stepper' }, [
    el('span', { class: 'muted small rest-label', text: inRound ? t('Pauza po kole') : t('Pauza') }),
    el('div', { class: 'rest-row' }, [
      el('button', { type: 'button', class: 'btn rest-btn', text: '−', 'aria-label': t('Kratší pauza'), onclick: () => change(-1) }),
      value,
      el('button', { type: 'button', class: 'btn rest-btn', text: '+', 'aria-label': t('Delší pauza'), onclick: () => change(1) }),
    ]),
  ]);
}

// ---------- Náhled dalšího cviku ----------
function nextPreview(workout, ctx) {
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
    el('span', { class: 'muted small', text: next ? t('Další cvik') : t('Poslední cvik v tréninku') }),
    next ? el('span', { class: 'next-name' }, [nameOf(next, ctx), el('span', { class: 'muted small', text: ` · ${describeEntry(next)}` })]) : null,
  ]);
}

function describeEntry(entry) {
  const slots = slotsOf(entry).filter((s) => !isSideWarmup(s));
  const first = slots[0] ?? slotsOf(entry)[0];
  if (entry.mode === 'dropset') return t('drop set, {rounds} kola × {steps} váhy', { rounds: entry.rounds.length, steps: entry.rounds[0].steps.length });
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
        const slots = slotsOf(entry).filter((s) => !isSideWarmup(s));
        const doneCount = slots.filter((s) => s.done).length;
        const isCurrent = workout.cursor?.ex === i;
        const row = el('li', { class: `list-row ex-row ${isCurrent ? 'is-current' : ''}`, 'data-index': i }, [
          dragHandle(),
          el('button', {
            type: 'button', class: 'list-main',
            onclick: () => { entry.skipped = false; workout.cursor = { ex: i, slot: firstUndoneIn(entry) }; ctx.save(); close(); ctx.draw(); },
          }, [
            el('span', { class: 'block', text: nameOf(entry, ctx) }),
            el('span', { class: `muted small block ${doneCount === slots.length ? 'is-done' : ''}`, text: entry.skipped ? t('přeskočeno · klepnutím vrátíš') : t('{done}/{total} hotovo', { done: doneCount, total: slots.length }) + (isCurrent ? t(' · právě cvičím') : '') }),
          ]),
          el('button', { type: 'button', class: 'btn btn-small', text: t('Nahradit'), onclick: () => replace(i) }),
          el('button', { type: 'button', class: 'btn btn-small btn-icon', html: '&times;', 'aria-label': t('Odebrat'), onclick: () => removeAt(i) }),
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
      el('h2', { class: 'dialog-title', text: t('Cviky v tréninku') }),
      el('p', { class: 'muted small', text: t('Klepnutím na název přeskočíš na cvik. Pořadí změníš podržením ≡ a tažením, nebo klepni na ≡ u cviku a pak na ≡ tam, kam ho chceš vložit.') }),
      list,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('+ Přidat cvik'), onclick: add }),
        el('button', { type: 'button', class: 'btn btn-primary', text: t('Zavřít'), onclick: () => close() }),
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
      const ok = await confirmDialog({ title: t('Odebrat „{name}“?', { name: nameOf(entry, ctx) }), okLabel: t('Odebrat'), danger: true });
      if (!ok) return;
      workout.exercises.splice(i, 1);
      if (workout.cursor && workout.cursor.ex > i) workout.cursor.ex -= 1;
      else if (workout.cursor?.ex === i) workout.cursor = null;
      fixCursor();
      ctx.save(); draw(); ctx.draw();
    }
    async function add() {
      const exercise = await pickExercise({ title: t('Přidat cvik') });
      if (!exercise) return;
      const occurrence = workout.exercises.filter((e) => e.exerciseId === exercise.id).length;
      workout.exercises.push(await buildAdHocEntry(exercise, workout.gymId, await listTemplates(), occurrence));
      fixCursor();
      ctx.save(); draw(); ctx.draw();
    }
    async function replace(i) {
      const exercise = await pickExercise({ title: t('Nahradit cvik') });
      if (!exercise) return;
      const occurrence = workout.exercises.slice(0, i).filter((e) => e.exerciseId === exercise.id).length;
      workout.exercises[i] = await buildAdHocEntry(exercise, workout.gymId, await listTemplates(), occurrence);
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
// Náhodný pás bublinek (dlouhý 900 px, aby se opakování nedalo poznat):
// různé velikosti, výšky a rozestupy, někdy shluk, někdy dlouho nic.
const BUBBLE_PERIOD = 900;
function bubblePattern() {
  const circles = [];
  let x = 0;
  while (x < BUBBLE_PERIOD) {
    const cluster = Math.random() < 0.25 ? 2 + Math.floor(Math.random() * 3) : 1;
    for (let i = 0; i < cluster; i++) {
      const cx = x + i * (3 + Math.random() * 6);
      const cy = 3 + Math.random() * 10;
      const r = 0.7 + Math.random() ** 1.6 * 1.9;
      const o = (0.45 + Math.random() * 0.4).toFixed(2);
      for (const shift of [-BUBBLE_PERIOD, 0, BUBBLE_PERIOD]) {
        circles.push(`<circle cx="${(cx + shift).toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(2)}" fill-opacity="${o}"/>`);
      }
    }
    x += Math.random() < 0.2 ? 45 + Math.random() * 90 : 6 + Math.random() * 28;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BUBBLE_PERIOD}" height="16" viewBox="0 0 ${BUBBLE_PERIOD} 16">${circles.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
let bubbles = null;

function progressBar(onJump) {
  const root = el('div', { class: 'wprog', role: 'progressbar', 'aria-label': t('Postup tréninku, klepnutím přejdeš na sérii'), 'aria-valuemin': 0, 'aria-valuemax': 100 });
  bubbles ??= bubblePattern();
  root.style.setProperty('--bubbles', bubbles);
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
    onJump(ex, indexMap[ex][hit === -1 ? slots.length - 1 : hit]);
  });
  let signature = '';
  let slotEls = [];
  let indexMap = []; // pořadí v pásu → index série (zahřívací bokem v pásu nejsou)
  return {
    root,
    update(workout) {
      indexMap = workout.exercises.map((entry) => slotsOf(entry).map((sl, k) => (isSideWarmup(sl) ? -1 : k)).filter((k) => k !== -1));
      const sig = workout.exercises.map((e, i) => `${e.uid}:${indexMap[i].join(',')}`).join('|');
      if (sig !== signature) {
        signature = sig;
        slotEls = indexMap.map((list) => list.map(() => el('div', { class: 'wprog-slot' }, [
          el('div', { class: 'wprog-fill' }, [el('div', { class: 'wl-wave' }), el('div', { class: 'wl-bubbles' })]),
        ])));
        root.replaceChildren(...slotEls.map((slots, i) => el('div', { class: 'wprog-ex', style: `flex-grow: ${slots.length}` }, slots)));
      }
      let done = 0;
      let total = 0;
      workout.exercises.forEach((entry, i) => {
        root.children[i].classList.toggle('is-skipped', Boolean(entry.skipped));
        indexMap[i].forEach((k, pos) => {
          const slot = slotsOf(entry)[k];
          total++;
          if (slot.done) done++;
          const node = slotEls[i][pos];
          node.classList.toggle('is-done', slot.done);
          node.classList.toggle('is-pr', Boolean(slot.pr && slot.done));
          node.classList.toggle('is-warmup', hasTag(slot, 'warmup'));
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
        layer.style.width = `${width + BUBBLE_PERIOD}px`;
        const fast = node.classList.contains('is-current');
        const dur = layer.classList.contains('wl-wave') ? (fast ? 0.5 : 0.9) : (fast ? 6.9 : 10.7);
        layer.style.animationDelay = `${-(now % dur)}s`;
      }
    }
  }
  window.addEventListener('resize', () => requestAnimationFrame(alignLiquid));
}
