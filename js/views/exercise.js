// Detail cviku a formulář pro úpravu / přidání.
//
// Trasy: #/cvik/<id>            detail
//        #/cvik/<id>/upravit    úprava
//        #/cvik/novy            nový vlastní cvik
//        #/cvik/novy/db/<dbId>  nový cvik z databáze free-exercise-db

import {
  getExercise, saveExercise, newExerciseId, templatesUsing, deleteExercise, listGyms, listTemplates, getLastGymId,
  EXERCISE_TYPE_LABEL, EQUIPMENT_LABEL,
} from '../data.js';
import { el, toast, confirmDialog, formatValues, formatWeight, dateShort } from '../ui.js';
import { navigate } from '../router.js';
import { listDoneWorkouts, buildEntry } from '../workout.js';
import { listGoals } from '../goals.js';
import { computeRecords, recordKey } from '../records.js';
import { slotsOf } from '../recommend.js';
import { lineChart } from '../chart.js';
import {
  imageBox, pickPhoto, deleteImage, fetchDbExercise, downloadDbImages, loadDbIndex, MUSCLE_CS, EQUIPMENT_FROM_DB,
} from '../images.js';
import { DEFAULT_WEIGHT_STEP } from '../seed.js';

export const title = 'Cvik';
export const tab = 'cviky';

export async function render(container, { params, extraEl, titleEl }) {
  extraEl.append(el('button', { type: 'button', class: 'btn btn-small', text: '← Zpět', onclick: goBack }));

  if (params[0] === 'novy') {
    titleEl.textContent = 'Nový cvik';
    const draft = params[1] === 'db' ? await draftFromDb(params[2]) : emptyDraft();
    if (!draft) { container.append(el('p', { class: 'muted', text: 'Cvik se nepodařilo načíst.' })); return; }
    renderForm(container, draft, { isNew: true, dbId: params[1] === 'db' ? params[2] : null });
    return;
  }

  const exercise = await getExercise(params[0]);
  if (!exercise) {
    container.append(el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: 'Cvik nenalezen' })]));
    return;
  }
  if (params[1] === 'upravit') {
    titleEl.textContent = 'Upravit cvik';
    renderForm(container, structuredClone(exercise), { isNew: false });
    return;
  }
  await renderDetail(container, exercise);
}

function goBack() {
  if (history.length > 1) history.back();
  else navigate('cviky');
}

// ---------- Detail ----------
async function renderDetail(container, exercise) {
  const [done, gyms, templates, lastGymId, goals] = await Promise.all([listDoneWorkouts(), listGyms(), listTemplates(), getLastGymId(), listGoals()]);
  const records = computeRecords(done);
  let gymId = lastGymId ?? gyms[0]?.id;

  const stack = el('div', { class: 'stack' });
  container.append(stack);

  // Obrázek a název
  const pic = imageBox(exercise, { cls: 'ex-hero', toggle: true });
  stack.append(el('section', { class: 'card ex-detail-head' }, [
    pic,
    el('div', { class: 'ex-detail-title' }, [
      el('h2', { class: 'ex-name', text: exercise.name }),
      exercise.aliases?.length ? el('p', { class: 'muted small', text: exercise.aliases.join(', ') }) : null,
      el('p', { class: 'muted small', text: [
        EXERCISE_TYPE_LABEL[exercise.type],
        EQUIPMENT_LABEL[exercise.equipment],
        exercise.bodyweight ? 'přidaná váha k tělu' : null,
        exercise.perGym ? 'hodnoty podle posilovny' : null,
      ].filter(Boolean).join(' · ') }),
    ]),
    el('div', { class: 'row-2' }, [
      el('button', {
        type: 'button', class: 'btn btn-small', text: exercise.photoId ? 'Jiná fotka' : 'Vlastní fotka',
        onclick: async () => {
          const id = await pickPhoto();
          if (!id) return;
          const old = exercise.photoId;
          exercise.photoId = id;
          await saveExercise(exercise);
          if (old) await deleteImage(old);
          toast('Fotka uložena');
          refresh();
        },
      }),
      exercise.photoId ? el('button', {
        type: 'button', class: 'btn btn-small', text: 'Původní obrázek',
        onclick: async () => {
          const old = exercise.photoId;
          exercise.photoId = null;
          await saveExercise(exercise);
          await deleteImage(old);
          refresh();
        },
      }) : null,
    ]),
  ]));

  // Partie
  const primary = exercise.muscles?.primary ?? [];
  const secondary = exercise.muscles?.secondary ?? [];
  if (primary.length || secondary.length) {
    stack.append(el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Partie' }),
      el('dl', { class: 'kv' }, [
        primary.length ? kv('Hlavní', primary.join(', ')) : null,
        secondary.length ? kv('Vedlejší', secondary.join(', ')) : null,
      ]),
    ]));
  }

  // Minule / doporučení / rekord / graf (u kladek podle posilovny)
  const progress = el('section', { class: 'card' });
  stack.append(progress);
  const drawProgress = () => {
    const item = templates.flatMap((t) => t.exercises).find((e) => e.exerciseId === exercise.id)
      ?? { mode: 'sets', sets: [{ weight: 0, reps: 10, seconds: 30, rest: 180 }], repRange: null, weightStep: null };
    const entry = buildEntry(item, exercise, gymId, done, goals);
    const rec = records.get(recordKey({ exerciseId: exercise.id, perGym: exercise.perGym }, gymId));
    const chartData = historyPoints(done, exercise, gymId);

    progress.replaceChildren(...[
      el('h3', { class: 'card-title', text: 'Výkon' }),
      exercise.perGym && gyms.length > 1 ? el('div', { class: 'segmented gym-seg' }, gyms.map((g) => el('button', {
        type: 'button', class: `seg ${g.id === gymId ? 'is-selected' : ''}`, text: g.name,
        onclick: () => { gymId = g.id; drawProgress(); },
      }))) : null,
      el('dl', { class: 'kv' }, [
        kv(entry.last ? `Minule (${dateShort.format(new Date(entry.last.date))})` : 'Minule', entry.last ? formatValues(entry, entry.last.values) : 'zatím necvičeno'),
        kv(entry.goal?.applied ? 'Doporučení teď (podle cíle)' : 'Doporučení teď', entry.rec?.length ? formatValues(entry, entry.rec) : '–'),
        kv('Osobní rekord', recordText(exercise, rec), true),
      ]),
      el('h4', { class: 'sub-title', text: chartTitle(exercise) }),
      lineChart(chartData.points, { format: chartData.format }),
    ].filter(Boolean));
  };
  drawProgress();

  // Postup a tipy
  if (exercise.instructions) {
    stack.append(el('section', { class: 'card' }, [el('h3', { class: 'card-title', text: 'Postup' }), el('p', { class: 'prose', text: exercise.instructions })]));
  }
  if (exercise.tips) {
    stack.append(el('section', { class: 'card' }, [el('h3', { class: 'card-title', text: 'Tipy' }), el('p', { class: 'prose', text: exercise.tips })]));
  }

  // Akce
  stack.append(el('div', { class: 'row-2' }, [
    el('button', { type: 'button', class: 'btn', text: 'Upravit', onclick: () => navigate(`cvik/${encodeURIComponent(exercise.id)}/upravit`) }),
    el('button', {
      type: 'button', class: 'btn btn-danger', text: 'Smazat cvik',
      onclick: async () => {
        const using = await templatesUsing(exercise.id);
        if (using.length) {
          toast(`Cvik je v tréninku ${using.map((t) => t.name).join(', ')}, nejdřív ho odeber ze šablony`);
          return;
        }
        const ok = await confirmDialog({ title: `Smazat „${exercise.name}“?`, text: 'Z encyklopedie zmizí. Odcvičené série v historii zůstanou.', okLabel: 'Smazat', danger: true });
        if (!ok) return;
        await deleteExercise(exercise.id);
        if (exercise.photoId) await deleteImage(exercise.photoId);
        for (const ref of exercise.images ?? []) if (ref.startsWith('idb:')) await deleteImage(ref.slice(4));
        toast('Cvik smazán');
        navigate('cviky');
      },
    }),
  ]));

  function refresh() {
    container.replaceChildren();
    renderDetail(container, exercise);
  }
}

function kv(label, value, gold = false) {
  return el('div', { class: 'kv-row' }, [el('dt', { text: label }), el('dd', { class: gold && value !== '–' ? 'gold' : '', text: value })]);
}

function chartTitle(exercise) {
  if (exercise.type === 'time') return 'Nejdelší výdrž v tréninku';
  if (exercise.type === 'reps') return 'Nejvíc opakování v sérii';
  return exercise.bodyweight ? 'Nejvyšší přidaná váha v tréninku' : 'Nejvyšší váha v tréninku';
}

function recordText(exercise, rec) {
  if (!rec) return '–';
  if (exercise.type === 'time') return rec.maxSeconds ? `${rec.maxSeconds.value} s` : '–';
  if (exercise.type === 'reps') return rec.maxReps ? `${rec.maxReps.value} opak.` : '–';
  if (!rec.maxWeight) return '–';
  const reps = rec.repsAtWeight.get(rec.maxWeight.value)?.value ?? rec.maxWeight.reps;
  return `${formatWeight(rec.maxWeight.value, { bodyweight: exercise.bodyweight })} × ${reps}`;
}

// Body grafu: nejlepší hodnota z každého tréninku
export function historyPoints(done, exercise, gymId) {
  const points = [];
  for (const w of done) {
    if (exercise.perGym && w.gymId !== gymId) continue;
    for (const entry of w.exercises) {
      if (entry.exerciseId !== exercise.id) continue;
      const slots = slotsOf(entry).filter((s) => s.done);
      if (!slots.length) continue;
      let v;
      if (exercise.type === 'time') v = Math.max(...slots.map((s) => s.seconds ?? 0));
      else if (exercise.type === 'reps') v = Math.max(...slots.map((s) => s.reps ?? 0));
      else v = Math.max(...slots.filter((s) => s.reps > 0).map((s) => s.weight ?? 0));
      if (Number.isFinite(v)) points.push({ t: w.startedAt, v });
    }
  }
  // zlatě maximum
  if (points.length) {
    const max = Math.max(...points.map((p) => p.v));
    const best = [...points].sort((a, b) => a.t.localeCompare(b.t)).find((p) => p.v === max);
    best.gold = true;
  }
  let format;
  if (exercise.type === 'time') format = (v) => `${v} s`;
  else if (exercise.type === 'reps') format = (v) => String(v);
  else format = (v) => formatWeight(v, { bodyweight: exercise.bodyweight }).replace(' kg', '');
  return { points, format };
}

// ---------- Formulář ----------
function emptyDraft() {
  return {
    id: null, name: '', aliases: [], type: 'weight', bodyweight: false, equipment: 'dumbbell', perGym: false,
    weightStep: DEFAULT_WEIGHT_STEP, gymSteps: {}, muscles: { primary: [], secondary: [] },
    instructions: '', tips: '', images: [], photoId: null, source: 'custom',
  };
}

async function draftFromDb(dbId) {
  const index = await loadDbIndex().catch(() => null);
  const meta = index?.find((e) => e.id === dbId);
  if (!meta) return null;
  const equipment = EQUIPMENT_FROM_DB[meta.eq] ?? 'other';
  const draft = {
    ...emptyDraft(),
    name: meta.n,
    aliases: [meta.n],
    bodyweight: meta.eq === 'body only',
    equipment,
    perGym: equipment === 'cable',
    muscles: { primary: meta.p.map((m) => MUSCLE_CS[m] ?? m), secondary: meta.s.map((m) => MUSCLE_CS[m] ?? m) },
    source: 'free-exercise-db',
    dbId,
  };
  try {
    const full = await fetchDbExercise(dbId);
    draft.instructions = (full.instructions ?? []).join(' ');
  } catch {
    // bez internetu: postup zůstane prázdný
  }
  return draft;
}

async function renderForm(container, draft, { isNew, dbId = null }) {
  const gyms = await listGyms();
  const fmt = (v) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2, useGrouping: false }).format(v);
  const parseNum = (v) => parseFloat(String(v).replace(',', '.'));

  const field = (label, input, hint = null) => el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }), input, hint ? el('span', { class: 'field-hint', text: hint }) : null,
  ]);
  const text = (value, placeholder = '') => el('input', { type: 'text', class: 'input', value: value ?? '', placeholder, autocomplete: 'off' });
  const area = (value, placeholder = '') => { const t = el('textarea', { class: 'input textarea', rows: 4, placeholder }); t.value = value ?? ''; return t; };
  const select = (value, options) => el('select', { class: 'input' }, Object.entries(options).map(([k, v]) => el('option', { value: k, text: v, selected: k === value ? '' : null })));
  const check = (checked, label) => {
    const input = el('input', { type: 'checkbox', class: 'checkbox' });
    input.checked = Boolean(checked);
    return { input, root: el('label', { class: 'check-row' }, [input, el('span', { text: label })]) };
  };

  const name = text(draft.name, dbId ? 'Český název' : 'Název cviku');
  const aliases = text(draft.aliases.join(', '), 'např. shyby, pull-up');
  const type = select(draft.type, EXERCISE_TYPE_LABEL);
  const bodyweight = check(draft.bodyweight, 'S vlastní vahou (zadává se přidaná váha, 0 = jen tělo, záporná = guma)');
  const equipment = select(draft.equipment, EQUIPMENT_LABEL);
  const perGym = check(draft.perGym, 'Hodnoty zvlášť pro každou posilovnu (kladky)');
  const step = el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: fmt(draft.weightStep ?? DEFAULT_WEIGHT_STEP) });
  const gymStepInputs = gyms.map((g) => ({
    gym: g,
    input: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: draft.gymSteps?.[g.id] != null ? fmt(draft.gymSteps[g.id]) : '', placeholder: 'jako výchozí' }),
  }));
  const gymSteps = el('div', { class: 'gym-steps' }, [
    el('span', { class: 'field-label', text: 'Krok váhy podle posilovny (kg)' }),
    ...gymStepInputs.map(({ gym, input }) => el('div', { class: 'gym-step-row' }, [el('span', { text: gym.name }), input])),
  ]);
  const primary = text(draft.muscles.primary.join(', '), 'např. biceps, předloktí');
  const secondary = text(draft.muscles.secondary.join(', '));
  const instructions = area(draft.instructions, 'Jak cvik provádět');
  const tips = area(draft.tips, 'Na co si dát pozor');

  const sync = () => {
    const isWeight = type.value === 'weight';
    bodyweight.root.hidden = !isWeight;
    step.closest('.field').hidden = type.value !== 'weight';
    gymSteps.hidden = !(isWeight && perGym.input.checked);
  };
  type.addEventListener('change', sync);
  perGym.input.addEventListener('change', sync);
  equipment.addEventListener('change', () => {
    if (equipment.value === 'cable') perGym.input.checked = true;
    if (equipment.value === 'body' && type.value === 'weight') bodyweight.input.checked = true;
    sync();
  });

  const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
  const saveBtn = el('button', {
    type: 'button', class: 'btn btn-primary btn-hero', text: isNew ? 'Přidat cvik' : 'Uložit',
    onclick: async () => {
      const n = name.value.trim();
      if (!n) { toast('Vyplň název'); name.focus(); return; }
      const ex = { ...draft };
      ex.name = n;
      ex.aliases = list(aliases.value);
      ex.type = type.value;
      ex.bodyweight = ex.type === 'weight' && bodyweight.input.checked;
      ex.equipment = equipment.value;
      ex.perGym = perGym.input.checked;
      const s = parseNum(step.value);
      ex.weightStep = Number.isFinite(s) && s > 0 ? s : DEFAULT_WEIGHT_STEP;
      ex.gymSteps = {};
      for (const { gym, input } of gymStepInputs) {
        const v = parseNum(input.value);
        if (Number.isFinite(v) && v > 0) ex.gymSteps[gym.id] = v;
      }
      ex.muscles = { primary: list(primary.value), secondary: list(secondary.value) };
      ex.instructions = instructions.value.trim();
      ex.tips = tips.value.trim();
      if (isNew) {
        ex.id = newExerciseId(n);
        ex.createdAt = new Date().toISOString();
        if (dbId) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Stahuji obrázky…';
          const count = (await loadDbIndex().catch(() => []))?.find((e) => e.id === dbId)?.i ?? 2;
          try {
            ex.images = await downloadDbImages(dbId, count);
          } catch {
            ex.images = [];
          }
          if (!ex.images.length) toast('Obrázky se nepodařilo stáhnout, cvik je bez obrázku');
        }
      }
      await saveExercise(ex);
      toast(isNew ? 'Cvik přidán' : 'Uloženo');
      // nový cvik: formulář se v historii nahradí detailem; úprava: návrat na detail
      if (isNew) location.replace(`#/cvik/${encodeURIComponent(ex.id)}`);
      else history.back();
    },
  });

  container.append(el('div', { class: 'stack form' }, [
    dbId ? el('p', { class: 'muted small', text: 'Cvik z databáze free-exercise-db. Doplň český název a případně přelož postup. Obrázky se stáhnou při uložení.' }) : null,
    el('section', { class: 'card stack' }, [
      field('Název', name),
      field('Přezdívky', aliases, 'Oddělené čárkou. Podle nich cvik najdeš ve vyhledávání.'),
      field('Typ', type),
      bodyweight.root,
      field('Vybavení', equipment),
      perGym.root,
      field('Krok váhy (kg)', step, 'O kolik se mění váha tlačítky +/− a doporučením.'),
      gymSteps,
    ]),
    el('section', { class: 'card stack' }, [
      field('Hlavní partie', primary, 'Oddělené čárkou.'),
      field('Vedlejší partie', secondary),
      field('Postup', instructions),
      field('Tipy', tips),
    ]),
    saveBtn,
  ]));
  sync();
}
