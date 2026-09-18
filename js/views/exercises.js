// Záložka Cviky: katalog s fotkami, vyhledáváním a filtry partií.
// Nahoře moje cviky, pod nimi celý katalog od nejběžnějších cviků.

import { el } from '../ui.js';
import { navigate } from '../router.js';
import { mountCatalog } from '../catalogView.js';
import { t } from '../i18n.js';

export const title = t('Cviky');

export async function render(container, { extraEl }) {
  extraEl.append(el('button', { type: 'button', class: 'btn btn-small btn-primary', text: t('+ Vlastní'), onclick: () => navigate('cvik/novy') }));
  await mountCatalog(container, {
    scrollRoot: container,
    onMine: (e) => navigate(`cvik/${encodeURIComponent(e.id)}`),
    onDb: (m) => navigate(`cvik/db/${encodeURIComponent(m.id)}`),
  });
}
