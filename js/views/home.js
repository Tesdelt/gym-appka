import { el } from '../ui.js';

export const title = 'Domů';

export function render(container) {
  container.append(el('div', { class: 'stack' }, [
    el('button', { type: 'button', class: 'btn btn-primary btn-hero', text: 'Nový trénink', disabled: '' }),
    el('p', { class: 'muted small', text: 'Průběh tréninku přibude v kroku 3. Teď je hotový datový model: posilovny a šablony najdeš v Nastavení, seznam cviků v záložce Cviky.' }),
  ]));
}
