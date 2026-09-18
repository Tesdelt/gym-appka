// Nastavení: vzhled, typy tréninků, posilovny, záloha dat, kontrola instalace.

import {
  listGyms, addGym, renameGym, deleteGym, listTemplates, addTemplate, reorderTemplates, colorAttrs,
} from '../data.js';
import { el, promptText, confirmDialog, toast, plural, dragHandle, makeSortable, dateShort } from '../ui.js';
import { navigate } from '../router.js';
import { renderDiagnostics } from '../diagnostics.js';
import { getTheme, setTheme } from '../theme.js';
import { shareBackup, pickBackupFile, inspectBackup, importData } from '../backup.js';

export const title = 'Nastavení';

export function render(container) {
  const wrap = el('div', { class: 'stack' });
  container.append(wrap);

  const themeCard = el('section', { class: 'card' });
  const templatesCard = el('section', { class: 'card' });
  const gymsCard = el('section', { class: 'card' });
  const backupCard = el('section', { class: 'card' });
  wrap.append(themeCard, templatesCard, gymsCard, backupCard);
  renderTheme(themeCard);
  renderTemplates(templatesCard);
  renderGyms(gymsCard);
  renderBackup(backupCard);
  renderDiagnostics(wrap);
}

// ---------- Vzhled ----------
function renderTheme(card) {
  const current = getTheme();
  card.replaceChildren(
    el('h2', { class: 'card-title', text: 'Vzhled' }),
    el('div', { class: 'segmented' }, [['dark', 'Tmavý'], ['light', 'Světlý']].map(([key, label]) => el('button', {
      type: 'button', class: `seg ${current === key ? 'is-selected' : ''}`, text: label,
      onclick: () => { setTheme(key); renderTheme(card); },
    }))),
  );
}

// ---------- Typy tréninků ----------
async function renderTemplates(card) {
  const templates = await listTemplates();
  const list = el('ul', { class: 'list drag-list' }, templates.map((t, i) => el('li', { ...colorAttrs(t.color, 'list-row'), 'data-index': i }, [
    dragHandle(),
    el('button', { type: 'button', class: 'list-main', onclick: () => navigate(`sablona/${encodeURIComponent(t.id)}`) }, [
      el('span', { class: 'block', text: `${i + 1}. ${t.name}` }),
      el('span', { class: 'muted small block', text: [
        t.subtitle,
        t.exercises.length ? plural(t.exercises.length, ['cvik', 'cviky', 'cviků']) : 'bez cviků',
      ].filter(Boolean).join(' · ') }),
    ]),
    el('span', { class: 'chevron', 'aria-hidden': 'true', text: '›' }),
  ])));
  makeSortable(list, async (order) => {
    await reorderTemplates(order.map((i) => templates[i].id));
    renderTemplates(card);
  });
  card.replaceChildren(
    el('h2', { class: 'card-title', text: 'Typy tréninků' }),
    list,
    el('button', {
      type: 'button', class: 'btn', text: '+ Přidat typ tréninku',
      onclick: async () => {
        const name = await promptText({ title: 'Nový typ tréninku', placeholder: 'např. Nohy', okLabel: 'Přidat' });
        if (!name) return;
        const t = await addTemplate(name);
        navigate(`sablona/${encodeURIComponent(t.id)}`);
      },
    }),
  );
}

// ---------- Posilovny ----------
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
    el('p', { class: 'muted small', text: 'Klepnutím na název posilovnu přejmenuješ.' }),
    el('button', {
      type: 'button', class: 'btn', text: '+ Přidat posilovnu',
      onclick: async () => {
        const name = await promptText({ title: 'Nová posilovna', placeholder: 'Název', okLabel: 'Přidat' });
        if (name) { await addGym(name); toast('Posilovna přidána'); renderGyms(card); }
      },
    }),
  );
}

// ---------- Záloha ----------
function renderBackup(card) {
  card.replaceChildren(
    el('h2', { class: 'card-title', text: 'Záloha dat' }),
    el('p', { class: 'muted small', text: 'Export uloží všechna data včetně vlastních fotek do souboru. Na iPhonu zvol „Uložit do Souborů“.' }),
    el('div', { class: 'row-2' }, [
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'Exportovat',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const result = await shareBackup();
            if (result === 'downloaded') toast('Záloha stažena');
          } catch (err) {
            console.error(err);
            toast('Export selhal');
          } finally {
            btn.disabled = false;
          }
        },
      }),
      el('button', {
        type: 'button', class: 'btn', text: 'Importovat',
        onclick: async () => {
          const data = await pickBackupFile();
          if (!data) return;
          if (data.error) { toast(data.error); return; }
          let info;
          try { info = inspectBackup(data); } catch (err) { toast(err.message); return; }
          const ok = await confirmDialog({
            title: 'Přepsat současná data?',
            text: `Záloha z ${info.exportedAt ? dateShort.format(new Date(info.exportedAt)) : '?'}: ${plural(info.workouts, ['trénink', 'tréninky', 'tréninků'])}, ${plural(info.exercises, ['cvik', 'cviky', 'cviků'])}, ${plural(info.photos, ['obrázek', 'obrázky', 'obrázků'])}. Všechna data v appce se nahradí obsahem zálohy.`,
            okLabel: 'Přepsat', danger: true,
          });
          if (!ok) return;
          try {
            await importData(data);
            toast('Data obnovena');
            setTimeout(() => { location.hash = '#/domu'; location.reload(); }, 600);
          } catch (err) {
            console.error(err);
            toast('Import selhal, data zůstala beze změny');
          }
        },
      }),
    ]),
  );
}

