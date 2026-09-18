import { el, openDialog, toast, dateShort, plural, promptText, formatValues } from '../ui.js';
import { workSlots, isClean } from '../recommend.js';
import { listTemplates, listGyms, getLastGymId, colorAttrs, addTemplate, exerciseMap } from '../data.js';
import { getActiveWorkout, startWorkout, listDoneWorkouts } from '../workout.js';
import { navigate } from '../router.js';
import { t, locale, exName } from '../i18n.js';
import { shouldRemindBackup, shareBackup, snoozeBackupReminder } from '../backup.js';

export const title = t('Trénink');

export async function render(container) {
  const [active, done, templates, remind, exercises] = await Promise.all([getActiveWorkout(), listDoneWorkouts(), listTemplates(), shouldRemindBackup(), exerciseMap()]);
  // u starších tréninků i rok
  const thisYear = new Date().getFullYear();
  const dateWithYear = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: '2-digit' });
  const dateOf = (iso) => (new Date(iso).getFullYear() === thisYear ? dateShort : dateWithYear).format(new Date(iso));
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
    !templates.length && !done.length ? welcomeCard() : null,
    remind ? backupBanner(remind) : null,
    el('section', {}, [
      el('h2', { class: 'section-title', text: t('Historie') }),
      done.length
        ? el('div', { class: 'history' }, byMonth(done).map(({ label, items }) => el('div', { class: 'history-month' }, [
          el('h3', { class: 'history-month-title' }, [el('span', { text: label }), el('span', { class: 'muted', text: plural(items.length, ['trénink', 'tréninky', 'tréninků'], ['workout', 'workouts']) })]),
          el('ul', { class: 'list list-cards' }, items.map((w) => el('li', colorAttrs(colorOf(w.templateId), 'card list-row history-row'), [
            el('button', {
              type: 'button', class: 'list-main history-btn',
              onclick: () => navigate(`souhrn/${w.id}`),
            }, [
              el('span', { class: 'history-date', text: dateOf(w.startedAt) }),
              el('span', { class: 'history-main' }, [
                el('span', { class: 'history-name', text: w.name }),
                el('span', { class: 'history-sum muted small', text: headline(w, exercises) }),
              ]),
            ]),
          ]))),
        ])))
        : el('p', { class: 'muted small', text: t('Zatím žádný uložený trénink.') }),
    ]),
  ]));
}

async function onNewWorkout() {
  const [templates, gyms, lastGymId] = await Promise.all([listTemplates(), listGyms(), getLastGymId()]);
  if (!gyms.length) { toast(t('Nejdřív přidej posilovnu v Nastavení')); return; }
  if (!templates.length) { await createFirstTemplate(); return; }

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

// Připomínka zálohy: data jsou jen v telefonu
function backupBanner(st) {
  const text = st.lastAt == null
    ? t('Data jsou jen v tomto telefonu a zatím nemáš zálohu. Při smazání appky by zmizela.')
    : t('Od poslední zálohy uběhlo {days} dní a přibylo {n}.', {
      days: st.days,
      n: plural(st.since, ['trénink', 'tréninky', 'tréninků'], ['workout', 'workouts']),
    });
  const card = el('section', { class: 'card backup-banner' }, [
    el('h2', { class: 'card-title', text: t('Zálohuj data') }),
    el('p', { class: 'small', text }),
    el('div', { class: 'row-2' }, [
      el('button', {
        type: 'button', class: 'btn', text: t('Později'),
        onclick: async () => { await snoozeBackupReminder(3); card.remove(); },
      }),
      el('button', {
        type: 'button', class: 'btn btn-primary', text: t('Zálohovat'),
        onclick: async () => {
          const res = await shareBackup().catch(() => 'error');
          if (res === 'shared' || res === 'downloaded') { toast(t('Záloha hotová')); card.remove(); }
          else if (res === 'error') toast(t('Export selhal'));
        },
      }),
    ]),
  ]);
  return card;
}

// Prázdná appka (nový uživatel): krátký návod, jak začít
function welcomeCard() {
  const step = (n, text) => el('li', { class: 'welcome-step' }, [el('span', { class: 'prog-dot', text: String(n) }), el('span', { text })]);
  return el('section', { class: 'card welcome' }, [
    el('h2', { class: 'card-title', text: t('Jak začít') }),
    el('ol', { class: 'welcome-steps' }, [
      step(1, t('Vytvoř si typ tréninku (např. Záda a biceps, Nohy…).')),
      step(2, t('Přidej do něj cviky z katalogu a nastav série, váhy a pauzy.')),
      step(3, t('Klepni na Nový trénink a cvič. Appka si pamatuje výkony a doporučí další zátěž.')),
    ]),
    el('button', { type: 'button', class: 'btn btn-primary', text: t('Vytvořit typ tréninku'), onclick: createFirstTemplate }),
    el('p', { class: 'muted small welcome-hint', text: t('Data zůstávají jen v tomto telefonu. Appku si přidej na plochu přes Sdílet → Přidat na plochu.') }),
  ]);
}

async function createFirstTemplate() {
  const name = await promptText({ title: t('Nový typ tréninku'), placeholder: t('např. Záda a biceps'), okLabel: t('Vytvořit') });
  if (!name) return;
  const tpl = await addTemplate(name);
  navigate(`sablona/${encodeURIComponent(tpl.id)}`);
}

// Tréninky po měsících (nejnovější nahoře)
function byMonth(done) {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const groups = [];
  for (const w of done) {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const label = fmt.format(d);
      g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
      groups.push(g);
    }
    g.items.push(w);
  }
  return groups;
}

// Hlavní výkon tréninku: nejlepší série prvního cviku a počet pracovních sérií
function headline(w, exercises) {
  const sets = w.exercises.reduce((a, e) => a + workSlots(e).length, 0);
  const entry = w.exercises.find((e) => workSlots(e).some(isClean)) ?? w.exercises.find((e) => workSlots(e).length);
  const parts = [];
  if (entry) {
    const slots = workSlots(entry).filter(isClean).length ? workSlots(entry).filter(isClean) : workSlots(entry);
    const best = slots.reduce((a, b) => {
      if (entry.type === 'time') return (b.seconds ?? 0) > (a.seconds ?? 0) ? b : a;
      if (entry.type === 'reps') return (b.reps ?? 0) > (a.reps ?? 0) ? b : a;
      return (b.weight ?? 0) > (a.weight ?? 0) || ((b.weight ?? 0) === (a.weight ?? 0) && (b.reps ?? 0) > (a.reps ?? 0)) ? b : a;
    });
    parts.push(`${exName(exercises.get(entry.exerciseId), entry.name)} ${formatValues(entry, [best])}`);
  }
  parts.push(plural(sets, ['série', 'série', 'sérií'], ['set', 'sets']));
  return parts.join(' · ');
}
