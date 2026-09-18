// Výběr cviku přes celou obrazovku: stejná mřížka a filtry jako záložka Cviky.
// Cvik z katalogu se rovnou uloží mezi moje cviky a vrátí se.

import { el, openDialog, toast, normalize } from './ui.js';
import { addFromCatalog } from './catalog.js';
import { mountCatalog, previewDialog } from './catalogView.js';
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
export function pickExercise({ title = t('Vybrat cvik'), exclude = [], catalog = true } = {}) {
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
        el('button', { type: 'button', class: 'btn btn-small', text: t('Zavřít'), onclick: () => close(null) }),
      ]),
      body,
    ]);
  }, { cls: 'dialog-full', focus: false });
}
