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
import { navigate, goBack as routerBack } from '../router.js';
import { listDoneWorkouts, buildEntry } from '../workout.js';
import { listGoals } from '../goals.js';
import { historyMarks } from '../marks.js';
import { computeRecords, recordKey } from '../records.js';
import { rangeChart } from '../chart.js';
import { listManualRecords, manualAsWorkouts, exercisePoints, exerciseFormat, exerciseChartTitle } from '../stats.js';
import { imageBox, pickPhoto, deleteImage, EQUIPMENT_FROM_DB } from '../images.js';
import { DEFAULT_WEIGHT_STEP } from '../seed.js';
import { loadCatalog, dbName, dbInstructions, thumbUrl, addFromCatalog } from '../catalog.js';
import { MUSCLE_GROUPS, partLabel } from '../muscles.js';
import { t, lang, locale, exName, exText } from '../i18n.js';

export const title = t('Cvik');
export const tab = 'cviky';

export async function render(container, { params, extraEl, titleEl, actionEl }) {
  extraEl.append(el('button', { type: 'button', class: 'btn btn-small', text: t('← Zpět'), onclick: goBack }));

  if (params[0] === 'db' || (params[0] === 'novy' && params[1] === 'db')) {
    titleEl.textContent = t('Katalog');
    await renderCatalogItem(container, params[0] === 'db' ? params[1] : params[2], actionEl);
    return;
  }
  if (params[0] === 'novy') {
    titleEl.textContent = t('Nový cvik');
    renderForm(container, emptyDraft(), { isNew: true, extraEl: actionEl });
    return;
  }

  const exercise = await getExercise(params[0]);
  if (!exercise) {
    container.append(el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: t('Cvik nenalezen') })]));
    return;
  }
  if (params[1] === 'upravit') {
    titleEl.textContent = t('Upravit cvik');
    renderForm(container, structuredClone(exercise), { isNew: false, extraEl: actionEl });
    return;
  }
  await renderDetail(container, exercise, actionEl);
}

function goBack() {
  routerBack('cviky');
}

// ---------- Detail ----------
async function renderDetail(container, exercise, extraEl) {
  const [done, gyms, templates, lastGymId, goals, manual] = await Promise.all([listDoneWorkouts(), listGyms(), listTemplates(), getLastGymId(), listGoals(), listManualRecords()]);
  const manualSessions = manualAsWorkouts(manual.filter((m) => m.exerciseId === exercise.id), new Map([[exercise.id, exercise]]));
  const records = computeRecords([...done, ...manualSessions]);
  const marks = historyMarks(done, manualSessions, goals).workouts;
  let gymId = lastGymId ?? gyms[0]?.id;

  const stack = el('div', { class: 'stack' });
  container.append(stack);

  // Akce v horní liště
  extraEl.append(...[
    el('button', { type: 'button', class: 'btn', text: t('Upravit'), onclick: () => navigate(`cvik/${encodeURIComponent(exercise.id)}/upravit`) }),
    el('button', {
      type: 'button', class: 'btn btn-danger', text: t('Smazat cvik'),
      onclick: async () => {
        const using = await templatesUsing(exercise.id);
        if (using.length) {
          toast(t('Cvik je v tréninku {names}, nejdřív ho odeber ze šablony', { names: using.map((tpl) => tpl.name).join(', ') }));
          return;
        }
        const ok = await confirmDialog({ title: t('Smazat „{name}“?', { name: exName(exercise) }), text: t('Z encyklopedie zmizí. Odcvičené série v historii zůstanou.'), okLabel: t('Smazat'), danger: true });
        if (!ok) return;
        await deleteExercise(exercise.id);
        if (exercise.photoId) await deleteImage(exercise.photoId);
        for (const ref of exercise.images ?? []) if (ref.startsWith('idb:')) await deleteImage(ref.slice(4));
        toast(t('Cvik smazán'));
        navigate('cviky');
      },
    }),
  ]);

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
        exercise.bodyweight ? t('přidaná váha k tělu') : null,
        exercise.perGym ? t('hodnoty podle posilovny') : null,
      ].filter(Boolean).join(' · ') }),
    ]),
    el('div', { class: 'row-2' }, [
      el('button', {
        type: 'button', class: 'btn btn-small', text: exercise.photoId ? t('Jiná fotka') : t('Vlastní fotka'),
        onclick: async () => {
          const id = await pickPhoto();
          if (!id) return;
          const old = exercise.photoId;
          exercise.photoId = id;
          await saveExercise(exercise);
          if (old) await deleteImage(old);
          toast(t('Fotka uložena'));
          refresh();
        },
      }),
      exercise.photoId ? el('button', {
        type: 'button', class: 'btn btn-small', text: t('Původní obrázek'),
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
      el('h3', { class: 'card-title', text: t('Partie') }),
      el('dl', { class: 'kv' }, [
        primary.length ? kv(t('Hlavní'), primary.map((k) => partLabel(k, lang)).join(', ')) : null,
        secondary.length ? kv(t('Vedlejší'), secondary.map((k) => partLabel(k, lang)).join(', ')) : null,
      ]),
    ]));
  }

  // Progrese statického prvku (kalistenika)
  if (exercise.skill) stack.append(await progressionCard(exercise.skill, exercise.dbId, records));

  // Minule / doporučení / rekord / graf (u kladek podle posilovny)
  const progress = el('section', { class: 'card' });
  stack.append(progress);
  const drawProgress = () => {
    const item = templates.flatMap((tpl) => tpl.exercises).find((e) => e.exerciseId === exercise.id)
      ?? { mode: 'sets', sets: [{ weight: 0, reps: 10, seconds: 30, rest: 180 }], repRange: null, weightStep: null };
    const entry = buildEntry(item, exercise, gymId, done, goals);
    const rec = records.get(recordKey({ exerciseId: exercise.id, perGym: exercise.perGym }, gymId));
    const points = exercisePoints([...done, ...manualSessions], exercise, gymId, marks);

    progress.replaceChildren(...[
      el('h3', { class: 'card-title', text: t('Výkon') }),
      exercise.perGym && gyms.length > 1 ? el('div', { class: 'segmented gym-seg' }, gyms.map((g) => el('button', {
        type: 'button', class: `seg ${g.id === gymId ? 'is-selected' : ''}`, text: g.name,
        onclick: () => { gymId = g.id; drawProgress(); },
      }))) : null,
      el('dl', { class: 'kv' }, [
        kv(entry.last ? t('Minule ({date})', { date: dateShort.format(new Date(entry.last.date)) }) : t('Minule'), entry.last ? formatValues(entry, entry.last.values) : t('zatím necvičeno')),
        kv(entry.goal?.applied ? t('Doporučení teď (podle cíle)') : t('Doporučení teď'), entry.rec?.length ? formatValues(entry, entry.rec) : '–'),
        kv(t('Osobní rekord'), recordText(exercise, rec), true),
      ]),
      el('h4', { class: 'sub-title', text: exerciseChartTitle(exercise) }),
      rangeChart(points, { format: exerciseFormat(exercise), onOpen: (p) => navigate(`souhrn/${encodeURIComponent(p.workoutId)}`) }),
      el('button', { type: 'button', class: 'btn btn-small', text: t('Statistiky a ruční záznamy'), onclick: () => navigate(`statistiky/cvik/${encodeURIComponent(exercise.id)}`) }),
    ].filter(Boolean));
  };
  drawProgress();

  // Postup a tipy
  if (exText(exercise, 'instructions')) {
    stack.append(el('section', { class: 'card' }, [el('h3', { class: 'card-title', text: t('Postup') }), el('p', { class: 'prose', text: exText(exercise, 'instructions') })]));
  }
  if (exText(exercise, 'tips')) {
    stack.append(el('section', { class: 'card' }, [el('h3', { class: 'card-title', text: t('Tipy') }), el('p', { class: 'prose', text: exText(exercise, 'tips') })]));
  }


  function refresh() {
    container.replaceChildren();
    extraEl.replaceChildren();
    renderDetail(container, exercise, extraEl);
  }
}

function kv(label, value, gold = false) {
  return el('div', { class: 'kv-row' }, [el('dt', { text: label }), el('dd', { class: gold && value !== '–' ? 'gold' : '', text: value })]);
}

export function recordText(exercise, rec) {
  if (!rec) return '–';
  if (exercise.type === 'time') return rec.maxSeconds ? `${rec.maxSeconds.value} s` : '–';
  if (exercise.type === 'reps') return rec.maxReps ? t('{n} opak.', { n: rec.maxReps.value }) : '–';
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

async function renderForm(container, draft, { isNew, extraEl }) {
  const gyms = await listGyms();
  const fmt = (v) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(v);
  const parseNum = (v) => parseFloat(String(v).replace(',', '.'));

  const field = (label, input, hint = null) => el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }), input, hint ? el('span', { class: 'field-hint', text: hint }) : null,
  ]);
  const text = (value, placeholder = '') => el('input', { type: 'text', class: 'input', value: value ?? '', placeholder, autocomplete: 'off' });
  const area = (value, placeholder = '') => { const node = el('textarea', { class: 'input textarea', rows: 4, placeholder }); node.value = value ?? ''; return node; };
  const select = (value, options) => el('select', { class: 'input' }, Object.entries(options).map(([k, v]) => el('option', { value: k, text: v, selected: k === value ? '' : null })));
  const check = (checked, label) => {
    const input = el('input', { type: 'checkbox', class: 'checkbox' });
    input.checked = Boolean(checked);
    return { input, root: el('label', { class: 'check-row' }, [input, el('span', { text: label })]) };
  };

  // texty se upravují v aktuálním jazyce appky (druhý jazyk zůstane)
  const nameKey = lang === 'en' && !isNew ? 'nameEn' : 'name';
  const name = text(exName(draft), t('Název cviku'));
  const aliases = text(draft.aliases.join(', '), t('např. shyby, pull-up'));
  const type = select(draft.type, EXERCISE_TYPE_LABEL);
  const bodyweight = check(draft.bodyweight, t('S vlastní vahou (zadává se přidaná váha, 0 = jen tělo, záporná = guma)'));
  const equipment = select(draft.equipment, EQUIPMENT_LABEL);
  const perGym = check(draft.perGym, t('Hodnoty zvlášť pro každou posilovnu (kladky)'));
  const step = el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: fmt(draft.weightStep ?? DEFAULT_WEIGHT_STEP) });
  const gymStepInputs = gyms.map((g) => ({
    gym: g,
    input: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: draft.gymSteps?.[g.id] != null ? fmt(draft.gymSteps[g.id]) : '', placeholder: t('jako výchozí') }),
  }));
  const gymSteps = el('div', { class: 'gym-steps' }, [
    el('span', { class: 'field-label', text: t('Krok váhy podle posilovny (kg)') }),
    ...gymStepInputs.map(({ gym, input }) => el('div', { class: 'gym-step-row' }, [el('span', { text: gym.name }), input])),
  ]);
  const muscles = { primary: [...(draft.muscles?.primary ?? [])], secondary: [...(draft.muscles?.secondary ?? [])] };
  const muscleField = (key, label) => {
    const btn = el('button', { type: 'button', class: 'input muscle-btn' });
    const refresh = () => { btn.textContent = muscles[key].length ? muscles[key].map((k) => partLabel(k, lang)).join(', ') : t('Vybrat…'); };
    btn.addEventListener('click', async () => {
      const other = key === 'primary' ? muscles.secondary : muscles.primary;
      const picked = await pickMuscles(label, muscles[key], other);
      if (picked) { muscles[key] = picked; refresh(); }
    });
    refresh();
    return btn;
  };
  const primary = muscleField('primary', t('Hlavní partie'));
  const secondary = muscleField('secondary', t('Vedlejší partie'));
  const instructions = area(exText(draft, 'instructions'), t('Jak cvik provádět'));
  const tips = area(exText(draft, 'tips'), t('Na co si dát pozor'));

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
    type: 'button', class: 'btn btn-primary', text: isNew ? t('Přidat cvik') : t('Uložit'),
    onclick: async () => {
      const n = name.value.trim();
      if (!n) { toast(t('Vyplň název')); name.focus(); return; }
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
      toast(isNew ? t('Cvik přidán') : t('Uloženo'));
      // nový cvik: formulář se v historii nahradí detailem; úprava: návrat na detail
      if (isNew) location.replace(`#/cvik/${encodeURIComponent(ex.id)}`);
      else routerBack('cviky');
    },
  });

  container.append(el('div', { class: 'stack form' }, [
    el('section', { class: 'card stack' }, [
      field(t('Název'), name),
      field(t('Přezdívky'), aliases, t('Oddělené čárkou. Podle nich cvik najdeš ve vyhledávání.')),
      field(t('Typ'), type),
      bodyweight.root,
      field(t('Vybavení'), equipment),
      perGym.root,
      field(t('Krok váhy (kg)'), step, t('O kolik se mění váha tlačítky +/− a doporučením.')),
      gymSteps,
    ]),
    el('section', { class: 'card stack' }, [
      field(t('Hlavní partie'), primary, t('Na co cvik cíleně míří (izolovaný filtr v katalogu).')),
      field(t('Vedlejší partie'), secondary),
      field(t('Postup'), instructions),
      field(t('Tipy'), tips),
    ]),
  ]));
  extraEl.append(saveBtn);
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
      el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
      el('button', { type: 'button', class: 'btn btn-primary', text: t('Použít'), onclick: () => close([...chosen]) }),
    ]),
  ]));
}

// ---------- Cvik z katalogu ----------
async function renderCatalogItem(container, dbId, extraEl) {
  const catalog = await loadCatalog().catch(() => []);
  const meta = catalog.find((m) => m.id === dbId);
  if (!meta) { container.append(el('p', { class: 'muted', text: t('Cvik nenalezen.') })); return; }
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
    type: 'button', class: 'btn btn-primary', text: t('Přidat mezi moje cviky'),
    onclick: async () => {
      addBtn.disabled = true;
      addBtn.textContent = t('Přidávám…');
      const ex = await addFromCatalog(meta);
      toast(ex.images.length ? t('Cvik přidán') : t('Cvik přidán (fotky se stáhnou, až bude internet)'));
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
    el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: t('Partie') }),
      el('dl', { class: 'kv' }, [
        kv(t('Hlavní'), meta.p.map((k) => partLabel(k, lang)).join(', ')),
        meta.s.length ? kv(t('Vedlejší'), meta.s.map((k) => partLabel(k, lang)).join(', ')) : null,
      ]),
    ]),
  );
  extraEl.append(addBtn);
  if (meta.sk) stack.append(await progressionCard(meta.sk, meta.id));
  const instructions = await dbInstructions(dbId);
  if (instructions) stack.append(el('section', { class: 'card' }, [el('h3', { class: 'card-title', text: t('Postup') }), el('p', { class: 'prose', text: instructions })]));
}

// Žebříček úrovní statického prvku: od nejlehčí po plnou verzi. U úrovní,
// které už mám mezi svými cviky, ukáže nejlepší výdrž.
async function progressionCard(skill, currentDbId, records = null) {
  const [catalog, mine] = await Promise.all([loadCatalog().catch(() => []), (await import('../data.js')).listExercises()]);
  const levels = catalog.filter((m) => m.sk === skill).sort((a, b) => a.lv - b.lv);
  const owned = new Map(mine.filter((e) => e.dbId).map((e) => [e.dbId, e]));
  if (!records) {
    const [done, manual] = await Promise.all([listDoneWorkouts(), listManualRecords()]);
    records = computeRecords([...done, ...manualAsWorkouts(manual, new Map(mine.map((e) => [e.id, e])))]);
  }
  const currentLv = levels.find((m) => m.id === currentDbId)?.lv ?? -1;
  return el('section', { class: 'card' }, [
    el('h3', { class: 'card-title', text: t('Progrese') }),
    el('ol', { class: 'progression' }, levels.map((m) => {
      const ex = owned.get(m.id);
      const best = ex ? records.get(ex.id)?.maxSeconds?.value : null;
      return el('li', { class: `prog-step ${m.id === currentDbId ? 'is-current' : ''} ${m.lv < currentLv ? 'is-below' : ''}` }, [
        el('button', {
          type: 'button', class: 'prog-btn',
          onclick: () => navigate(ex ? `cvik/${encodeURIComponent(ex.id)}` : `cvik/db/${encodeURIComponent(m.id)}`),
        }, [
          el('span', { class: 'prog-dot', text: String(m.lv + 1) }),
          el('span', { class: 'prog-name', text: dbName(m) }),
          el('span', { class: `prog-best ${best ? 'gold' : 'muted'}`, text: best ? `${best} s` : ex ? '–' : t('nezačato') }),
        ]),
      ]);
    })),
  ]);
}
