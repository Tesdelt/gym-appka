import { listGyms, addGym, renameGym, deleteGym, listTemplates, exerciseMap } from '../data.js';
import { el, promptText, confirmDialog, toast, formatWeight, formatRest } from '../ui.js';
import { renderDiagnostics } from '../diagnostics.js';

export const title = 'Nastavení';

export function render(container) {
  const wrap = el('div', { class: 'stack' });
  container.append(wrap);

  const gymsCard = el('section', { class: 'card' });
  const templatesCard = el('section', { class: 'card' });
  wrap.append(gymsCard, templatesCard);
  renderGyms(gymsCard);
  renderTemplates(templatesCard);
  renderDiagnostics(wrap);
}

async function renderGyms(card) {
  const gyms = await listGyms();
  card.replaceChildren(
    el('h2', { class: 'card-title', text: 'Posilovny' }),
    el('ul', { class: 'list' }, gyms.map((gym) => el('li', { class: 'list-row' }, [
      el('button', {
        type: 'button', class: 'list-main', text: gym.name,
        onclick: async () => {
          const name = await promptText({ title: 'Přejmenovat posilovnu', value: gym.name });
          if (name && name !== gym.name) { await renameGym(gym.id, name); renderGyms(card); }
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-small btn-icon', 'aria-label': `Smazat ${gym.name}`, html: '&times;',
        disabled: gyms.length <= 1 ? '' : null,
        onclick: async () => {
          const ok = await confirmDialog({
            title: `Smazat „${gym.name}“?`,
            text: 'Záznamy tréninků z této posilovny zůstanou, ale kladkové hodnoty pro ni už nepůjde vybrat.',
            okLabel: 'Smazat', danger: true,
          });
          if (ok) { await deleteGym(gym.id); toast('Posilovna smazána'); renderGyms(card); }
        },
      }),
    ]))),
    el('button', {
      type: 'button', class: 'btn', text: '+ Přidat posilovnu',
      onclick: async () => {
        const name = await promptText({ title: 'Nová posilovna', placeholder: 'Název', okLabel: 'Přidat' });
        if (name) { await addGym(name); toast('Posilovna přidána'); renderGyms(card); }
      },
    }),
  );
}

async function renderTemplates(card) {
  const [templates, exercises] = await Promise.all([listTemplates(), exerciseMap()]);
  card.replaceChildren(
    el('h2', { class: 'card-title', text: 'Typy tréninků' }),
    el('p', { class: 'muted small', text: 'Úpravy šablon (cviky, série, váhy) přibudou v dalším kroku stavby.' }),
    ...templates.map((t) => el('details', { class: 'accordion' }, [
      el('summary', {}, [
        el('span', { class: 'accordion-title', text: `${t.order}. ${t.name}` }),
        el('span', { class: 'muted small', text: t.subtitle }),
      ]),
      t.exercises.length
        ? el('ul', { class: 'list' }, t.exercises.map((item) => {
          const ex = exercises.get(item.exerciseId);
          return el('li', { class: 'list-row list-row-stacked' }, [
            el('span', { class: 'list-main', text: ex?.name ?? item.exerciseId }),
            el('span', { class: 'muted small', text: describeTemplateItem(item, ex) }),
          ]);
        }))
        : el('p', { class: 'muted small', text: 'Zatím bez cviků.' }),
    ])),
  );
}

// „+15 kg, 3 × 8, pauza 5 min“ nebo popis drop setu
export function describeTemplateItem(item, exercise) {
  const bw = exercise?.bodyweight;
  if (item.mode === 'dropset') {
    const steps = item.steps.map((s) => `${formatWeight(s.weight, { bodyweight: bw })} × ${s.reps}`).join(' → ');
    return `${item.rounds} kola: ${steps}, pauza ${formatRest(item.rest)} mezi koly`;
  }
  const first = item.sets[0];
  const same = item.sets.every((s) => s.weight === first.weight && s.reps === first.reps && s.seconds === first.seconds && s.rest === first.rest);
  const value = (s) => (exercise?.type === 'time' ? `${s.seconds} s` : `${s.reps}`);
  const load = (s) => (exercise?.type === 'reps' ? '' : `${formatWeight(s.weight, { bodyweight: bw })}, `);
  if (same) return `${load(first)}${item.sets.length} × ${value(first)}, pauza ${formatRest(first.rest)}`;
  return item.sets.map((s) => `${load(s)}${value(s)}`).join(' | ') + `, pauza ${formatRest(first.rest)}`;
}
