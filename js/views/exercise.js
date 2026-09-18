// Detail cviku a formulář pro úpravu / přidání.
//
// Trasy: #/cvik/<id>            detail
//        #/cvik/<id>/upravit    úprava
//        #/cvik/novy            nový vlastní cvik
//        #/cvik/db/<dbId>       cvik z katalogu (náhled a přidání mezi moje cviky)

import {
  getExercise, saveExercise, newExerciseId, templatesUsing, deleteExercise, listGyms, listTemplates, getLastGymId,
  EXERCISE_TYPE_LABEL, EQUIPMENT_LABEL,
} from '../data.js';
import { el, toast, confirmDialog, openDialog, formatValues, formatWeight, dateShort } from '../ui.js';
import { navigate } from '../router.js';
import { listDoneWorkouts, buildEntry } from '../workout.js';
import { listGoals } from '../goals.js';
import { computeRecords, recordKey } from '../records.js';
import { rangeChart } from '../chart.js';
import { listManualRecords, manualAsWorkouts, exercisePoints, exerciseFormat, exerciseChartTitle } from '../stats.js';
import { imageBox, pickPhoto, deleteImage, EQUIPMENT_FROM_DB } from '../images.js';
import { DEFAULT_WEIGHT_STEP } from '../seed.js';
import { loadCatalog, dbName, dbInstructions, thumbUrl, addFromCatalog } from '../catalog.js';
import { MUSCLE_GROUPS, partLabel } from '../muscles.js';
import { lang, exName, exText } from '../i18n.js';

export const title = 'Cvik';
export const tab = 'cviky';

export async function render(container, { params, extraEl, titleEl }) {
  extraEl.append(el('button', { type: 'button', class: 'btn btn-small', text: '← Zpět', onclick: goBack }));

  if (params[0] === 'db' || (params[0] === 'novy' && params[1] === 'db')) {
    titleEl.textContent = 'Katalog';
    await renderCatalogItem(container, params[0] === 'db' ? params[1] : params[2]);
    return;
  }
  if (params[0] === 'novy') {
    titleEl.textContent = 'Nový cvik';
    renderForm(container, emptyDraft(), { isNew: true });
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
  const [done, gyms, templates, lastGymId, goals, manual] = await Promise.all([listDoneWorkouts(), listGyms(), listTemplates(), getLastGymId(), listGoals(), listManualRecords()]);
  const manualSessions = manualAsWorkouts(manual.filter((m) => m.exerciseId === exercise.id), new Map([[exercise.id, exercise]]));
  const records = computeRecords([...done, ...manualSessions]);
  let gymId = lastGymId ?? gyms[0]?.id;

  const stack = el('div', { class: 'stack' });
  container.append(stack);

  // Obrázek a název
  const pic = imageBox(exercise, { cls: 'ex-hero', toggle: true });
  pic.style.viewTransitionName = 'ex-image';
  stack.append(el('section', { class: 'card ex-detail-head' }, [
    pic,
    el('div', { class: 'ex-detail-title' }, [
      el('h2', { class: 'ex-name', text: exName(exercise) }),
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
        primary.length ? kv('Hlavní', primary.map((k) => partLabel(k, lang)).join(', ')) : null,
        secondary.length ? kv('Vedlejší', secondary.map((k) => partLabel(k, lang)).join(', ')) : null,
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
    const points = exercisePoints([...done, ...manualSessions], exercise, gymId);

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
      el('h4', { class: 'sub-title', text: exerciseChartTitle(exercise) }),
      rangeChart(points, { format: exerciseFormat(exercise) }),
      el('button', { type: 'button', class: 'btn btn-small', text: 'Statistiky a ruční záznamy', onclick: () => navigate(`statistiky/cvik/${encodeURIComponent(exercise.id)}`) }),
    ].filter(Boolean));
  };
  drawProgress();

  // Postup a tipy
  if (exText(exercise, 'instructions')) {
    stack.append(el('section', { class: 'card' }, [el('h3', { class: 'card-title', text: 'Postup' }), el('p', { class: 'prose', text: exText(exercise, 'instructions') })]));
  }
  if (exText(exercise, 'tips')) {
    stack.append(el('section', { class: 'card' }, [el('h3', { class: 'card-title', text: 'Tipy' }), el('p', { class: 'prose', text: exText(exercise, 'tips') })]));
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

export function recordText(exercise, rec) {
  if (!rec) return '–';
  if (exercise.type === 'time') return rec.maxSeconds ? `${rec.maxSeconds.value} s` : '–';
  if (exercise.type === 'reps') return rec.maxReps ? `${rec.maxReps.value} opak.` : '–';
  if (!rec.maxWeight) return '–';
  const reps = rec.repsAtWeight.get(rec.maxWeight.value)?.value ?? rec.maxWeight.reps;
  return `${formatWeight(rec.maxWeight.value, { bodyweight: exercise.bodyweight })} × ${reps}`;
}

// ---------- Formulář ----------
function emptyDraft() {
  return {
    id: null, name: '', aliases: [], type: 'weight', bodyweight: false, equipment: 'dumbbell', perGym: false,
    weightStep: DEFAULT_WEIGHT_STEP, gymSteps: {}, muscles: { primary: [], secondary: [] },
    instructions: '', tips: '', images: [], photoId: null, source: 'custom',
  };
}

async function renderForm(container, draft, { isNew }) {
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

  // texty se upravují v aktuálním jazyce appky (druhý jazyk zůstane)
  const nameKey = lang === 'en' && !isNew ? 'nameEn' : 'name';
  const name = text(exName(draft), 'Název cviku');
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
  const muscles = { primary: [...(draft.muscles?.primary ?? [])], secondary: [...(draft.muscles?.secondary ?? [])] };
  const muscleField = (key, label) => {
    const btn = el('button', { type: 'button', class: 'input muscle-btn' });
    const refresh = () => { btn.textContent = muscles[key].length ? muscles[key].map((k) => partLabel(k, lang)).join(', ') : 'Vybrat…'; };
    btn.addEventListener('click', async () => {
      const other = key === 'primary' ? muscles.secondary : muscles.primary;
      const picked = await pickMuscles(label, muscles[key], other);
      if (picked) { muscles[key] = picked; refresh(); }
    });
    refresh();
    return btn;
  };
  const primary = muscleField('primary', 'Hlavní partie');
  const secondary = muscleField('secondary', 'Vedlejší partie');
  const instructions = area(exText(draft, 'instructions'), 'Jak cvik provádět');
  const tips = area(exText(draft, 'tips'), 'Na co si dát pozor');

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
      ex[nameKey] = n;
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
      ex.muscles = muscles;
      const suffix = nameKey === 'nameEn' ? 'En' : '';
      ex[`instructions${suffix}`] = instructions.value.trim();
      ex[`tips${suffix}`] = tips.value.trim();
      if (isNew) {
        ex.id = newExerciseId(n);
        ex.createdAt = new Date().toISOString();
      }
      await saveExercise(ex);
      toast(isNew ? 'Cvik přidán' : 'Uloženo');
      // nový cvik: formulář se v historii nahradí detailem; úprava: návrat na detail
      if (isNew) location.replace(`#/cvik/${encodeURIComponent(ex.id)}`);
      else history.back();
    },
  });

  container.append(el('div', { class: 'stack form' }, [
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
      field('Hlavní partie', primary, 'Na co cvik cíleně míří (izolovaný filtr v katalogu).'),
      field('Vedlejší partie', secondary),
      field('Postup', instructions),
      field('Tipy', tips),
    ]),
    saveBtn,
  ]));
  sync();
}

// Výběr svalů: skupiny s podrobnými svaly na zaškrtnutí.
// Svaly vybrané v druhém poli (hlavní/vedlejší) nejdou vybrat znovu.
function pickMuscles(title, selected, taken) {
  const chosen = new Set(selected);
  const blocked = new Set(taken);
  return openDialog((close) => el('div', { class: 'dialog-body filter-panel' }, [
    el('h2', { class: 'dialog-title', text: title }),
    el('div', { class: 'filter-list' }, MUSCLE_GROUPS.map((g) => el('div', { class: 'filter-group is-open' }, [
      el('div', { class: 'muscle-group-title', text: g[lang] }),
      el('div', { class: 'filter-parts' }, g.parts.map((p) => {
        const input = el('input', { type: 'checkbox', class: 'checkbox', disabled: blocked.has(p.key) ? '' : null });
        input.checked = chosen.has(p.key);
        input.addEventListener('change', () => { if (input.checked) chosen.add(p.key); else chosen.delete(p.key); });
        return el('label', { class: `check-row filter-check ${blocked.has(p.key) ? 'is-disabled' : ''}` }, [input, el('span', { text: p[lang] })]);
      })),
    ]))),
    el('div', { class: 'dialog-actions' }, [
      el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(null) }),
      el('button', { type: 'button', class: 'btn btn-primary', text: 'Použít', onclick: () => close([...chosen]) }),
    ]),
  ]));
}

// ---------- Cvik z katalogu ----------
async function renderCatalogItem(container, dbId) {
  const catalog = await loadCatalog().catch(() => []);
  const meta = catalog.find((m) => m.id === dbId);
  if (!meta) { container.append(el('p', { class: 'muted', text: 'Cvik nenalezen.' })); return; }
  const mine = (await (await import('../data.js')).listExercises()).find((e) => e.dbId === dbId);
  if (mine) { location.replace(`#/cvik/${encodeURIComponent(mine.id)}`); return; }

  const stack = el('div', { class: 'stack' });
  container.append(stack);

  // fotky: plné z internetu, jinak náhled z appky
  const hero = el('div', { class: 'ex-hero is-toggle' });
  hero.style.viewTransitionName = 'ex-image';
  const img = el('img', { alt: '', src: thumbUrl(meta) ?? '' });
  hero.append(img);
  const first = meta.t === 'time' && meta.i > 1 ? 1 : 0;
  const frames = Array.from({ length: meta.i || 0 }, (_, i) => i).filter((i) => i >= first);
  let frame = 0;
  const full = (i) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${encodeURIComponent(dbId)}/${i}.jpg`;
  if (frames.length) {
    const pre = new Image();
    pre.onload = () => { img.src = pre.src; };
    pre.src = full(frames[0]);
    if (frames.length > 1) hero.addEventListener('click', () => { frame = (frame + 1) % frames.length; img.src = full(frames[frame]); });
    else hero.classList.remove('is-toggle');
  }

  const equipment = EQUIPMENT_FROM_DB[meta.eq] ?? 'other';
  const addBtn = el('button', {
    type: 'button', class: 'btn btn-primary btn-hero', text: 'Přidat mezi moje cviky',
    onclick: async () => {
      addBtn.disabled = true;
      addBtn.textContent = 'Přidávám…';
      const ex = await addFromCatalog(meta);
      toast(ex.images.length ? 'Cvik přidán' : 'Cvik přidán (fotky se stáhnou, až bude internet)');
      location.replace(`#/cvik/${encodeURIComponent(ex.id)}`);
    },
  });

  stack.append(
    el('section', { class: 'card ex-detail-head' }, [
      hero,
      el('div', { class: 'ex-detail-title' }, [
        el('h2', { class: 'ex-name', text: dbName(meta) }),
        el('p', { class: 'muted small', text: [lang === 'en' ? meta.nc : meta.n, EXERCISE_TYPE_LABEL[meta.t], EQUIPMENT_LABEL[equipment]].filter(Boolean).join(' · ') }),
      ]),
    ]),
    addBtn,
    el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Partie' }),
      el('dl', { class: 'kv' }, [
        kv('Hlavní', meta.p.map((k) => partLabel(k, lang)).join(', ')),
        meta.s.length ? kv('Vedlejší', meta.s.map((k) => partLabel(k, lang)).join(', ')) : null,
      ]),
    ]),
  );
  const instructions = await dbInstructions(dbId);
  if (instructions) stack.append(el('section', { class: 'card' }, [el('h3', { class: 'card-title', text: 'Postup' }), el('p', { class: 'prose', text: instructions })]));
}
