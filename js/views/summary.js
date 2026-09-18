// Souhrn tréninku: při ukončení (škály, komentář, uložení) i jako detail
// uloženého tréninku z historie.

import { el, toast, confirmDialog, openDialog, promptText, stepField, formatValues, dateLong, timeShort } from '../ui.js';
import { navigate } from '../router.js';
import { slotsOf, workSlots, SET_TAGS, hasTag } from '../recommend.js';
import { findNewRecords } from '../records.js';
import { celebrate } from '../fx.js';
import { listGoals, evaluateGoal, markReachedGoals } from '../goals.js';
import { exerciseMap, listMeasurements, getTemplate, colorAttrs } from '../data.js';
import { listManualRecords, manualAsWorkouts } from '../stats.js';
import {
  getActiveWorkout, getWorkout, listDoneWorkouts, finishWorkout, saveWorkout, deleteWorkout,
  elapsedSeconds, formatDurationLong, compareWithPrevious, slotLabel,
} from '../workout.js';
import { t, exName } from '../i18n.js';

export const title = t('Souhrn');
export const tab = 'domu';

const SCALES = [['energy', t('Energie')], ['sleep', t('Spánek')], ['food', t('Jídlo')]];

export async function render(container, { params, actionEl }) {
  const id = params[0];
  const workout = id ? await getWorkout(id) : await getActiveWorkout();
  const state = { editing: false };
  const draw = async () => {
    container.replaceChildren();
    actionEl.replaceChildren();
    await drawSummary(container, workout, id, state, draw, actionEl);
  };
  await draw();
}

async function drawSummary(container, workout, id, state, redraw, actionEl) {
  if (!workout) {
    container.append(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: id ? t('Trénink nenalezen') : t('Žádný rozdělaný trénink') }),
      el('button', { type: 'button', class: 'btn btn-primary', text: t('Na Domů'), onclick: () => navigate('domu') }),
    ]));
    return;
  }
  const editable = workout.status === 'active' || state.editing;
  const done = await listDoneWorkouts();
  const previousAll = done.filter((w) => w.id !== workout.id && w.startedAt < workout.startedAt);
  const previousSame = previousAll.find((w) => w.templateId === workout.templateId) ?? null;
  const [manual, exMap] = await Promise.all([listManualRecords(), exerciseMap()]);
  const manualBefore = manualAsWorkouts(manual.filter((m) => m.date < workout.startedAt), exMap);
  const records = findNewRecords(workout, [...previousAll, ...manualBefore]);
  const recordSlots = new Set(records.map((r) => r.slot));
  const comparison = compareWithPrevious(workout, previousSame);
  const started = new Date(workout.startedAt);
  const nameOf = (entry) => exName(exMap.get(entry.exerciseId), entry.name);

  const stack = el('div', { class: 'stack' });
  container.append(stack);

  // Hlavička (v barvě typu tréninku)
  const tmpl = await getTemplate(workout.templateId);
  stack.append(el('section', colorAttrs(tmpl?.color, 'card'), [
    el('h2', { class: 'ex-name', text: workout.name }),
    el('dl', { class: 'kv' }, [
      kv(t('Datum'), `${dateLong.format(started)}, ${timeShort.format(started)}`),
      kv(t('Posilovna'), workout.gymName),
      kv(t('Délka'), formatDurationLong(elapsedSeconds(workout))),
      kv(t('Série'), t('{n} hotových', { n: workout.exercises.reduce((a, e) => a + workSlots(e).length, 0) })),
    ]),
  ]));

  // Rekordy
  if (records.length) {
    stack.append(el('section', { class: 'card card-gold' }, [
      el('h2', { class: 'card-title gold', text: t('Nové osobní rekordy') }),
      el('ul', { class: 'plain-list' }, records.map((r) => {
        const entry = workout.exercises.find((e) => e.uid === r.entryUid);
        return el('li', {}, [
          el('strong', { text: nameOf(entry) }),
          el('span', { class: 'muted', text: ` – ${r.text}: ${formatValues(entry, [r.slot])}` }),
        ]);
      })),
    ]));
  }

  // Cíle: splněné nebo posunuté tímto tréninkem (jen při ukončení)
  if (workout.status === 'active') {
    const [goals, exercises] = await Promise.all([listGoals(), exerciseMap()]);
    const asDone = { ...workout, status: 'done' };
    const rows = [];
    for (const g of goals) {
      if (g.kind !== 'exercise' || g.status !== 'active') continue;
      if (!workout.exercises.some((e) => e.exerciseId === g.exerciseId)) continue;
      const before = evaluateGoal(g, previousAll);
      const after = evaluateGoal(g, [asDone, ...previousAll]);
      const name = exName(exercises.get(g.exerciseId));
      if (after.reached) rows.push(el('li', { class: 'gold' }, [el('strong', { text: name }), el('span', { text: t(' – cíl splněn!') })]));
      else if (after.progress > before.progress) {
        rows.push(el('li', {}, [el('strong', { text: name }), el('span', { class: 'muted', text: t(' – cíl posunut {from} % → {to} %', { from: Math.round(before.progress * 100), to: Math.round(after.progress * 100) }) })]));
      } else {
        rows.push(el('li', {}, [el('strong', { text: name }), el('span', { class: 'muted', text: t(' – cíl beze změny ({n} %)', { n: Math.round(after.progress * 100) }) })]));
      }
    }
    if (rows.length) {
      stack.append(el('section', { class: `card ${rows.some((r) => r.classList.contains('gold')) ? 'card-gold' : ''}` }, [
        el('h2', { class: 'card-title', text: t('Cíle') }),
        el('ul', { class: 'plain-list' }, rows),
      ]));
    }
  }

  // Porovnání
  if (comparison.length) {
    stack.append(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: t('Oproti minulému tréninku') }),
      el('ul', { class: 'plain-list' }, comparison.map((c) => el('li', { class: `cmp cmp-${c.verdict}` }, [
        el('span', { class: 'cmp-mark', text: c.verdict === 'up' ? '↑' : c.verdict === 'down' ? '↓' : '=' }),
        el('span', {}, [
          el('strong', { class: 'block', text: nameOf(c.entry) }),
          el('span', { class: 'muted small', text: `${formatValues(c.entry, c.before)} → ${formatValues(c.entry, c.now)}` }),
        ]),
      ]))),
    ]));
  } else if (!previousSame) {
    stack.append(el('p', { class: 'muted small', text: t('První trénink tohoto typu, není s čím porovnat.') }));
  }

  // Cviky a série
  stack.append(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: t('Cviky') }),
    ...workout.exercises.map((entry) => {
      const slots = slotsOf(entry);
      const doneSlots = slots.map((s, i) => [s, i]).filter(([s]) => s.done);
      return el('div', { class: 'sum-ex' }, [
        el('strong', { class: 'block', text: nameOf(entry) }),
        doneSlots.length || state.editing
          ? el('ul', { class: 'plain-list sum-sets' }, (state.editing ? slots.map((s, i) => [s, i]) : doneSlots).map(([s, i]) => {
            const text = ` ${s.done ? formatValues(entry, [s]) : t('neodcvičeno')}${recordSlots.has(s) ? ' ★' : ''}`;
            if (!state.editing) {
              return el('li', { class: `${recordSlots.has(s) ? 'gold' : ''} ${hasTag(s, 'warmup') ? 'is-warmup' : ''}` }, [
                el('span', { class: 'muted small', text: slotLabel(entry, i) }),
                el('span', { text }),
                tagBadges(s),
              ]);
            }
            return el('li', {}, [el('button', {
              type: 'button', class: 'set-edit',
              onclick: async () => { if (await editSlot(entry, s)) redraw(); },
            }, [el('span', { class: 'muted small', text: `${slotLabel(entry, i)} ✎` }), el('span', {}, [el('span', { text }), tagBadges(s)])])]);
          }))
          : el('span', { class: 'muted small block', text: entry.skipped ? t('Přeskočeno') : t('Neodcvičeno') }),
        state.editing
          ? el('button', {
            type: 'button', class: 'btn btn-small', text: entry.note ? t('Poznámka: {note}', { note: entry.note }) : t('Přidat poznámku'),
            onclick: async () => {
              const text = await promptText({ title: t('Poznámka k cviku'), value: entry.note ?? '' });
              if (text != null) { entry.note = text; redraw(); }
            },
          })
          : entry.note ? el('span', { class: 'small block', text: t('Poznámka: {note}', { note: entry.note }) }) : null,
        entry.next && entry.next !== 'keep' ? el('span', { class: 'muted small block', text: t('Na příště: {what}', { what: { more: t('přidat'), less: t('snížit') }[entry.next] }) }) : null,
      ]);
    }),
  ]));

  // Škály a komentář. Při ukončení jsou předvyplněné nejlepší hodnoty
  // (energie a spánek 5, jídlo 3 = akorát), stačí upravit, co bylo horší.
  const BEST = { energy: 5, sleep: 5, food: 3 };
  const scales = { ...workout.scales };
  if (workout.status === 'active') for (const k of Object.keys(BEST)) scales[k] ??= BEST[k];
  const comment = el('textarea', { class: 'input textarea', rows: 3, placeholder: t('Komentář (např. „unavený už předem“)'), disabled: editable ? null : '' });
  comment.value = workout.comment ?? '';
  // u jídla je optimum uprostřed, proto popisky
  const hints = { food: [t('nic'), t('akorát'), t('přejedený')] };
  const howCard = el('section', { class: 'card' }, [
    el('h2', { class: 'card-title', text: t('Jak to šlo') }),
    ...SCALES.map(([key, label]) => el('div', { class: 'scale-block' }, [
      el('div', { class: 'scale-row' }, [
        el('span', { class: 'scale-label', text: label }),
        el('div', { class: `segmented ${key === 'food' ? 'scale-food' : ''}` }, [1, 2, 3, 4, 5].map((n) => el('button', {
          type: 'button', class: `seg ${scales[key] === n ? 'is-selected' : ''} ${n === BEST[key] ? 'is-best' : ''}`, text: String(n), disabled: editable ? null : '',
          onclick: (e) => {
            scales[key] = n;
            e.currentTarget.parentElement.querySelectorAll('.seg').forEach((b, i) => b.classList.toggle('is-selected', scales[key] === i + 1));
          },
        }))),
      ]),
      hints[key] ? el('div', { class: 'scale-hints' }, hints[key].map((h) => el('span', { text: h }))) : null,
    ])),
    comment,
  ]);
  // při vyplňování hned pod hlavičkou, ať není potřeba scrollovat
  if (editable) stack.children[0].after(howCard);
  else stack.append(howCard);

  // Oslava: nový rekord nebo splněný cíl (jen při ukončení tréninku)
  if (workout.status === 'active' && !state.celebrated && (records.length || stack.querySelector('.card-gold li.gold'))) {
    state.celebrated = true;
    setTimeout(celebrate, 250);
  }

  // Akce ve spodní liště nad navigací (vždy vidět, u palce)
  const btn = (text, cls, onclick) => el('button', { type: 'button', class: `btn ${cls}`.trim(), text, onclick });
  if (workout.status === 'active') {
    actionEl.append(
      btn(t('← Zpět do tréninku'), '', async () => { workout.endedAt = null; await saveWorkout(workout); navigate('trenink'); }),
      btn(t('Uložit trénink'), 'btn-primary', async () => {
        await finishWorkout(workout, { scales, comment: comment.value.trim() });
        const [goals, all, measurements] = await Promise.all([listGoals(), listDoneWorkouts(), listMeasurements()]);
        const reached = await markReachedGoals(goals, all, measurements);
        toast(reached.length ? t('Trénink uložen, cíl splněn!') : t('Trénink uložen'));
        navigate('domu');
      }),
    );
  } else if (state.editing) {
    actionEl.append(
      btn(t('Zrušit'), '', async () => {
        Object.assign(workout, await getWorkout(workout.id)); // zahodit neuložené úpravy
        state.editing = false;
        await redraw();
      }),
      btn(t('Uložit'), 'btn-primary', async () => {
        workout.scales = scales;
        workout.comment = comment.value.trim();
        await saveWorkout(workout);
        state.editing = false;
        toast(t('Změny uloženy'));
        await redraw();
      }),
    );
  } else {
    actionEl.append(
      btn(t('Upravit'), '', async () => { state.editing = true; await redraw(); }),
      btn(t('Smazat trénink'), 'btn-danger', async () => {
        const ok = await confirmDialog({ title: t('Smazat tento trénink?'), text: t('Záznam zmizí z historie i ze statistik.'), okLabel: t('Smazat'), danger: true });
        if (ok) { await deleteWorkout(workout.id); toast(t('Trénink smazán')); navigate('domu'); }
      }),
    );
  }
}

function kv(label, value) {
  return el('div', { class: 'kv-row' }, [el('dt', { text: label }), el('dd', { text: value })]);
}

// Dialog pro úpravu jedné série: váha / opakování (nebo výdrž) s tlačítky +/−
// a přepínač, zda byla odcvičená.
function editSlot(entry, slot) {
  return openDialog((close) => {
    const field = stepField;
    const weight = entry.type === 'reps' ? null : field(entry.bodyweight ? t('Přidaná váha (kg)') : t('Váha (kg)'), slot.weight, entry.weightStep ?? 2.5, entry.bodyweight ? null : 0);
    const reps = entry.type === 'time' ? null : field(t('Opakování'), slot.reps, 1, 0);
    const seconds = entry.type === 'time' ? field(t('Výdrž (s)'), slot.seconds, 5, 0) : null;
    let done = slot.done;
    const doneBtn = el('button', {
      type: 'button', class: `btn btn-small ${done ? 'btn-primary' : ''}`, text: done ? t('Odcvičeno') : t('Neodcvičeno'),
      onclick: () => { done = !done; doneBtn.textContent = done ? t('Odcvičeno') : t('Neodcvičeno'); doneBtn.classList.toggle('btn-primary', done); },
    });
    const tags = new Set(slot.tags ?? []);
    const tagRow = el('div', { class: 'set-tags' }, SET_TAGS.map(([key, label]) => el('button', {
      type: 'button', class: `tag-chip tag-${key} ${tags.has(key) ? 'is-on' : ''}`, text: t(label),
      onclick: (e) => { if (tags.has(key)) tags.delete(key); else tags.add(key); e.currentTarget.classList.toggle('is-on', tags.has(key)); },
    })));
    const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: t('Upravit sérii') }),
      weight?.root, reps?.root, seconds?.root,
      tagRow,
      el('div', { class: 'note-next' }, [el('span', { class: 'muted small', text: t('Stav') }), doneBtn]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(false) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Použít') }),
      ]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (weight) { const v = weight.value(); if (Number.isFinite(v)) slot.weight = Math.round(v * 100) / 100; }
      if (reps) { const v = reps.value(); if (Number.isFinite(v)) slot.reps = Math.round(v); }
      if (seconds) { const v = seconds.value(); if (Number.isFinite(v)) slot.seconds = Math.round(v); }
      if (done !== slot.done) { slot.done = done; slot.doneAt = done ? new Date().toISOString() : null; }
      slot.tags = [...tags];
      close(true);
    });
    return form;
  });
}

// Štítky série jako malé odznaky (zahřívací, selhání, po částech, s dopomocí)
function tagBadges(slot) {
  const on = SET_TAGS.filter(([key]) => hasTag(slot, key));
  if (!on.length) return null;
  return el('span', { class: 'tag-badges' }, on.map(([key, label]) => el('span', { class: `tag-badge tag-${key}`, text: t(label) })));
}
