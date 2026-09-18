import { el, openDialog, toast, dateShort, plural } from '../ui.js';
import { listTemplates, listGyms, getLastGymId, colorAttrs } from '../data.js';
import { getActiveWorkout, startWorkout, listDoneWorkouts } from '../workout.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';

export const title = t('Trénink');

export async function render(container) {
  const [active, done, templates] = await Promise.all([getActiveWorkout(), listDoneWorkouts(), listTemplates()]);
  const colorOf = (id) => templates.find((tpl) => tpl.id === id)?.color ?? null;

  const hero = active
    ? el('button', {
      type: 'button', class: 'btn btn-primary btn-hero', onclick: () => navigate('trenink'),
    }, [
      el('span', { text: t('Pokračovat v tréninku') }),
      el('span', { class: 'btn-hero-sub', text: active.name }),
    ])
    : el('button', { type: 'button', class: 'btn btn-primary btn-hero', text: t('Nový trénink'), onclick: onNewWorkout });

  container.append(el('div', { class: 'stack' }, [
    hero,
    el('section', {}, [
      el('h2', { class: 'section-title', text: t('Historie') }),
      done.length
        ? el('ul', { class: 'list list-cards' }, done.map((w) => el('li', colorAttrs(colorOf(w.templateId), 'card list-row history-row'), [
          el('button', {
            type: 'button', class: 'list-main history-btn',
            onclick: () => navigate(`souhrn/${w.id}`),
          }, [
            el('span', { class: 'history-date', text: dateShort.format(new Date(w.startedAt)) }),
            el('span', { class: 'history-name', text: w.name }),
          ]),
        ])))
        : el('p', { class: 'muted small', text: t('Zatím žádný uložený trénink.') }),
    ]),
  ]));
}

async function onNewWorkout() {
  const [templates, gyms, lastGymId] = await Promise.all([listTemplates(), listGyms(), getLastGymId()]);
  if (!gyms.length) { toast(t('Nejdřív přidej posilovnu v Nastavení')); return; }

  const choice = await openDialog((close) => {
    let templateId = templates[0]?.id ?? null;
    let gymId = lastGymId ?? gyms[0].id;

    const typeButtons = templates.map((tpl) => el('button', {
      type: 'button', ...colorAttrs(tpl.color, `choice ${tpl.id === templateId ? 'is-selected' : ''}`),
      onclick: (e) => {
        templateId = tpl.id;
        typeButtons.forEach((b) => b.classList.toggle('is-selected', b === e.currentTarget));
      },
    }, [
      el('span', { class: 'choice-title', text: `${tpl.order}. ${tpl.name}` }),
      el('span', { class: 'muted small', text: tpl.exercises.length ? `${tpl.subtitle} · ${plural(tpl.exercises.length, ['cvik', 'cviky', 'cviků'], ['exercise', 'exercises'])}` : `${tpl.subtitle} · ${t('bez cviků')}` }),
    ]));

    const gymSelect = el('select', { class: 'input', onchange: (e) => { gymId = e.target.value; } },
      gyms.map((g) => el('option', { value: g.id, text: g.name, selected: g.id === gymId ? '' : null })));

    return el('div', { class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: t('Nový trénink') }),
      el('label', { class: 'field-label', text: t('Typ tréninku') }),
      el('div', { class: 'choice-list' }, typeButtons),
      el('label', { class: 'field-label', text: t('Posilovna') }),
      gymSelect,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'button', class: 'btn btn-primary', text: t('Začít'), onclick: () => close({ templateId, gymId }) }),
      ]),
    ]);
  });

  if (!choice?.templateId) return;
  const gym = gyms.find((g) => g.id === choice.gymId) ?? gyms[0];
  await startWorkout(choice.templateId, gym.id, gym.name);
  navigate('trenink');
}
