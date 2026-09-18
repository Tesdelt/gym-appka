import { listExercises, EXERCISE_TYPE_LABEL, EQUIPMENT_LABEL } from '../data.js';
import { el } from '../ui.js';

export const title = 'Cviky';

export async function render(container) {
  const exercises = await listExercises();
  container.append(
    el('p', { class: 'muted small', text: 'Detail cviku, obrázky a vyhledávání přibudou v kroku 5.' }),
    el('ul', { class: 'list list-cards' }, exercises.map((ex) => el('li', { class: 'card list-row list-row-stacked' }, [
      el('span', { class: 'list-main', text: ex.name }),
      el('span', { class: 'muted small', text: ex.aliases.join(', ') }),
      el('span', { class: 'muted small', text: [
        EXERCISE_TYPE_LABEL[ex.type],
        EQUIPMENT_LABEL[ex.equipment],
        ex.perGym ? 'hodnoty podle posilovny' : null,
      ].filter(Boolean).join(' · ') }),
    ]))),
  );
}
