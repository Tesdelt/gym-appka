// Encyklopedie cviků: seznam s vyhledáváním a přidání cviku.

import { listExercises, EQUIPMENT_LABEL } from '../data.js';
import { el, openDialog } from '../ui.js';
import { navigate } from '../router.js';
import { matchesExercise, normalize } from '../exercisePicker.js';
import { imageBox, loadDbIndex, MUSCLE_CS } from '../images.js';

export const title = 'Cviky';

let lastQuery = '';

export async function render(container, { extraEl }) {
  const exercises = await listExercises();

  extraEl.append(el('button', { type: 'button', class: 'btn btn-small btn-primary', text: '+ Přidat', onclick: addExercise }));

  const list = el('ul', { class: 'list list-cards ex-list' });
  const draw = (query) => {
    lastQuery = query;
    const found = exercises.filter((e) => matchesExercise(e, query));
    list.replaceChildren(...found.map((ex) => el('li', { class: 'card ex-card' }, [
      el('button', {
        type: 'button', class: 'ex-card-btn',
        onclick: (e) => {
          e.currentTarget.querySelector('.ex-thumb').style.viewTransitionName = 'ex-image';
          navigate(`cvik/${encodeURIComponent(ex.id)}`);
        },
      }, [
        imageBox(ex, { cls: 'ex-thumb' }),
        el('span', { class: 'ex-card-text' }, [
          el('span', { class: 'ex-card-name', text: ex.name }),
          ex.aliases?.length ? el('span', { class: 'muted small block', text: ex.aliases.join(', ') }) : null,
          el('span', { class: 'muted small block', text: [
            ...(ex.muscles?.primary ?? []),
            EQUIPMENT_LABEL[ex.equipment],
          ].filter(Boolean).join(' · ') }),
        ]),
      ]),
    ])));
    if (!found.length) list.append(el('li', { class: 'muted small', text: 'Nic nenalezeno.' }));
  };

  const search = el('input', {
    type: 'search', class: 'input search-input', placeholder: 'Hledat podle názvu, přezdívky nebo partie…',
    autocomplete: 'off', value: lastQuery, oninput: (e) => draw(e.target.value),
  });
  container.append(el('div', { class: 'stack' }, [search, list]));
  draw(lastQuery);
}

async function addExercise() {
  const choice = await openDialog((close) => el('div', { class: 'dialog-body' }, [
    el('h2', { class: 'dialog-title', text: 'Přidat cvik' }),
    el('div', { class: 'choice-list' }, [
      el('button', { type: 'button', class: 'choice', onclick: () => close('custom') }, [
        el('span', { class: 'choice-title', text: 'Vlastní cvik' }),
        el('span', { class: 'muted small', text: 'Vyplníš vše sám, obrázek můžeš vyfotit.' }),
      ]),
      el('button', { type: 'button', class: 'choice', onclick: () => close('db') }, [
        el('span', { class: 'choice-title', text: 'Z databáze' }),
        el('span', { class: 'muted small', text: 'Přes 800 cviků s obrázky a českým postupem. Obrázky se stahují, je potřeba internet.' }),
      ]),
    ]),
    el('div', { class: 'dialog-actions' }, [el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(null) })]),
  ]));
  if (choice === 'custom') navigate('cvik/novy');
  if (choice === 'db') {
    const dbId = await pickFromDb();
    if (dbId) navigate(`cvik/novy/db/${encodeURIComponent(dbId)}`);
  }
}

const EQUIPMENT_DB_CS = {
  cable: 'kladka', dumbbell: 'jednoručky', barbell: 'velká činka', 'e-z curl bar': 'EZ činka', 'body only': 'vlastní váha',
  machine: 'stroj', kettlebells: 'kettlebell', bands: 'guma', 'medicine ball': 'medicinbal', 'exercise ball': 'míč', 'foam roll': 'válec', other: 'jiné',
};

async function pickFromDb() {
  let index;
  try {
    index = await loadDbIndex();
  } catch {
    await openDialog((close) => el('div', { class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: 'Databáze není k dispozici' }),
      el('p', { class: 'muted', text: 'Seznam cviků z databáze se nepodařilo načíst. Zkus to s připojením k internetu.' }),
      el('div', { class: 'dialog-actions' }, [el('button', { type: 'button', class: 'btn btn-primary', text: 'OK', onclick: () => close() })]),
    ]));
    return null;
  }
  return openDialog((close) => {
    const list = el('ul', { class: 'list picker-list' });
    const hay = index.map((e) => normalize([e.nc ?? '', e.n, ...e.p, ...e.s, ...e.p.map((m) => MUSCLE_CS[m] ?? ''), EQUIPMENT_DB_CS[e.eq] ?? ''].join(' ')));
    const draw = (query) => {
      const words = normalize(query).trim().split(/\s+/).filter(Boolean);
      const found = [];
      for (let i = 0; i < index.length && found.length < 60; i++) {
        if (words.every((w) => hay[i].includes(w))) found.push(index[i]);
      }
      list.replaceChildren(...found.map((e) => el('li', { class: 'list-row' }, [
        el('button', { type: 'button', class: 'list-main', onclick: () => close(e.id) }, [
          el('span', { class: 'block', text: e.nc ?? e.n }),
          el('span', { class: 'muted small block', text: [e.nc ? e.n : null, e.p.map((m) => MUSCLE_CS[m] ?? m).join(', '), EQUIPMENT_DB_CS[e.eq]].filter(Boolean).join(' · ') }),
        ]),
      ])));
      if (!found.length) list.append(el('li', { class: 'muted small', text: 'Nic nenalezeno.' }));
    };
    draw('');
    return el('div', { class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: 'Cvik z databáze' }),
      el('input', { type: 'search', class: 'input', placeholder: 'Hledat česky nebo anglicky, i podle partie…', autocomplete: 'off', oninput: (e) => draw(e.target.value) }),
      list,
      el('div', { class: 'dialog-actions' }, [el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(null) })]),
    ]);
  });
}
