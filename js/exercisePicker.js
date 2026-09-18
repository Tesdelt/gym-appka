// Dialog pro výběr cviku z encyklopedie (hledání podle názvu, přezdívek a partií).

import { el, openDialog } from './ui.js';
import { listExercises } from './data.js';
import { imageBox } from './images.js';
import { partLabel } from './muscles.js';
import { lang, exName } from './i18n.js';

export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function matchesExercise(exercise, query) {
  const q = normalize(query).trim();
  if (!q) return true;
  const hay = [exercise.name, exercise.nameEn, ...(exercise.aliases ?? []), ...[...(exercise.muscles?.primary ?? []), ...(exercise.muscles?.secondary ?? [])].map((k) => partLabel(k, lang))];
  return hay.some((h) => normalize(h).includes(q));
}

export async function pickExercise({ title = 'Vybrat cvik', exclude = [] } = {}) {
  const all = (await listExercises()).filter((e) => !exclude.includes(e.id));
  return openDialog((close) => {
    const list = el('ul', { class: 'list picker-list' });
    const draw = (query) => {
      const found = all.filter((e) => matchesExercise(e, query));
      list.replaceChildren(...found.map((e) => el('li', { class: 'list-row' }, [
        el('button', { type: 'button', class: 'list-main picker-row', onclick: () => close(e) }, [
          imageBox(e, { cls: 'ex-thumb ex-thumb-small' }),
          el('span', {}, [
            el('span', { class: 'block', text: exName(e) }),
            el('span', { class: 'muted small block', text: (e.aliases ?? []).join(', ') }),
          ]),
        ]),
      ])));
      if (!found.length) list.append(el('li', { class: 'muted small', text: 'Nic nenalezeno.' }));
    };
    const search = el('input', { type: 'search', class: 'input', placeholder: 'Hledat cvik…', autocomplete: 'off', oninput: (e) => draw(e.target.value) });
    draw('');
    return el('div', { class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: title }),
      search,
      list,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(null) }),
      ]),
    ]);
  });
}
