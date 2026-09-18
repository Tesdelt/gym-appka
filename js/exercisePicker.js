// Výběr cviku přes celou obrazovku: stejná mřížka a filtry jako záložka Cviky.
// Cvik z katalogu se rovnou uloží mezi moje cviky a vrátí se. Tlačítkem
// „+ Nový“ jde rovnou založit vlastní cvik (název, typ, vybavení).

import { el, openDialog, toast, normalize } from './ui.js';
import { addFromCatalog } from './catalog.js';
import { mountCatalog, previewDialog, currentQuery } from './catalogView.js';
import { saveExercise, newExerciseId, EQUIPMENT_LABEL } from './data.js';
import { DEFAULT_WEIGHT_STEP } from './seed.js';
import { partLabel } from './muscles.js';
import { t, lang } from './i18n.js';

export { normalize };

export function matchesExercise(exercise, query) {
  const q = normalize(query).trim();
  if (!q) return true;
  const hay = [exercise.name, exercise.nameEn, ...(exercise.aliases ?? []), ...[...(exercise.muscles?.primary ?? []), ...(exercise.muscles?.secondary ?? [])].map((k) => partLabel(k, lang))];
  return hay.some((h) => normalize(h).includes(q));
}

// catalog: false = jen moje cviky (např. cíle, ruční záznamy)
// create: tlačítko „+ Nový“ pro vlastní cvik (výchozí tam, kde je katalog)
export function pickExercise({ title = t('Vybrat cvik'), exclude = [], catalog = true, create = catalog } = {}) {
  return openDialog((close) => {
    const body = el('div', { class: 'picker-scroll' });
    let busy = false;
    const takeFromCatalog = async (meta) => {
      if (busy) return;
      busy = true;
      toast(t('Přidávám…'));
      try {
        const ex = await addFromCatalog(meta);
        toast(t('Uloženo i do Mých cviků'));
        close(ex);
      } catch (err) {
        console.error(err);
        toast(t('Cvik se nepodařilo přidat'));
        busy = false;
      }
    };
    mountCatalog(body, {
      scrollRoot: body,
      exclude,
      showCatalog: catalog,
      onMine: (e) => close(e),
      onDb: takeFromCatalog,
      onInfo: async (meta) => { if (await previewDialog(meta)) takeFromCatalog(meta); },
    });
    return el('div', { class: 'picker-full' }, [
      el('div', { class: 'picker-head' }, [
        el('h2', { class: 'picker-title', text: title }),
        el('div', { class: 'picker-actions' }, [
          create ? el('button', {
            type: 'button', class: 'btn btn-small btn-primary', text: t('+ Nový'),
            onclick: async () => { const ex = await quickCreate(currentQuery()); if (ex) close(ex); },
          }) : null,
          el('button', { type: 'button', class: 'btn btn-small', text: t('Zavřít'), onclick: () => close(null) }),
        ]),
      ]),
      body,
    ]);
  }, { cls: 'dialog-full', focus: false });
}

// Rychlé založení vlastního cviku (partie a postup se doplní později v Cvicích)
function quickCreate(name = '') {
  return openDialog((close) => {
    let type = 'weight';
    const nameInput = el('input', { type: 'text', class: 'input', value: name, placeholder: t('Název cviku'), autocomplete: 'off', autocapitalize: 'sentences' });
    const equipment = el('select', { class: 'input' }, Object.entries(EQUIPMENT_LABEL).map(([k, v]) => el('option', { value: k, text: v, selected: k === 'dumbbell' ? '' : null })));
    const bw = el('input', { type: 'checkbox', class: 'checkbox' });
    const bwRow = el('label', { class: 'check-row' }, [bw, el('span', { text: t('S vlastní vahou (zadává se přidaná váha)') })]);
    const types = [['weight', t('S váhou')], ['reps', t('Bez váhy')], ['time', t('Výdrž')]];
    const seg = el('div', { class: 'segmented' }, types.map(([key, label]) => el('button', {
      type: 'button', class: `seg ${key === type ? 'is-selected' : ''}`, text: label,
      onclick: (e) => {
        type = key;
        seg.querySelectorAll('.seg').forEach((b) => b.classList.toggle('is-selected', b === e.currentTarget));
        bwRow.hidden = type !== 'weight';
      },
    })));
    equipment.addEventListener('change', () => { if (equipment.value === 'body') bw.checked = true; });
    const form = el('form', { method: 'dialog', class: 'dialog-body stack-tight' }, [
      el('h2', { class: 'dialog-title', text: t('Nový cvik') }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Název') }), nameInput]),
      seg,
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('Vybavení') }), equipment]),
      bwRow,
      el('p', { class: 'muted small', text: t('Partie, postup a fotku doplníš později v záložce Cviky.') }),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Přidat cvik') }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = nameInput.value.trim();
      if (!n) { toast(t('Vyplň název')); nameInput.focus(); return; }
      const ex = {
        id: newExerciseId(n), name: n, aliases: [], type, bodyweight: type === 'weight' && bw.checked,
        equipment: equipment.value, perGym: equipment.value === 'cable', weightStep: DEFAULT_WEIGHT_STEP, gymSteps: {},
        muscles: { primary: [], secondary: [] }, instructions: '', tips: '', images: [], photoId: null,
        source: 'custom', createdAt: new Date().toISOString(),
      };
      await saveExercise(ex);
      toast(t('Cvik přidán'));
      close(ex);
    });
    return form;
  });
}
