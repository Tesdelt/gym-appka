// Nastavení: vzhled, jazyk, typy tréninků, posilovny, záloha dat, kontrola instalace.

import {
  listGyms, addGym, renameGym, deleteGym, listTemplates, addTemplate, reorderTemplates, colorAttrs,
} from '../data.js';
import { el, promptText, confirmDialog, openDialog, toast, plural, dragHandle, makeSortable, dateShort } from '../ui.js';
import { navigate } from '../router.js';
import { renderDiagnostics } from '../diagnostics.js';
import { shareBackup, pickBackupFile, inspectBackup, importData, backupStatus, isHistoryFile, historyOverlap, importHistory } from '../backup.js';
import { t, lang, setLang } from '../i18n.js';

export const title = t('Nastavení');

export function render(container) {
  const wrap = el('div', { class: 'stack' });
  container.append(wrap);

  const langCard = el('section', { class: 'card' });
  const templatesCard = el('section', { class: 'card' });
  const gymsCard = el('section', { class: 'card' });
  const backupCard = el('section', { class: 'card' });
  wrap.append(langCard, templatesCard, gymsCard, backupCard);
  renderLang(langCard);
  renderTemplates(templatesCard);
  renderGyms(gymsCard);
  renderBackup(backupCard);
  renderDiagnostics(wrap);
}

// ---------- Jazyk ----------
function renderLang(card) {
  card.replaceChildren(
    el('h2', { class: 'card-title', text: 'Jazyk / Language' }),
    el('div', { class: 'segmented' }, [['cs', 'Čeština'], ['en', 'English']].map(([key, label]) => el('button', {
      type: 'button', class: `seg ${lang === key ? 'is-selected' : ''}`, text: label,
      onclick: () => { if (key !== lang) setLang(key); },
    }))),
  );
}

// ---------- Typy tréninků ----------
async function renderTemplates(card) {
  const templates = await listTemplates();
  const list = el('ul', { class: 'list drag-list' }, templates.map((tpl, i) => el('li', { ...colorAttrs(tpl.color, 'list-row'), 'data-index': i }, [
    dragHandle(),
    el('button', { type: 'button', class: 'list-main', onclick: () => navigate(`sablona/${encodeURIComponent(tpl.id)}`) }, [
      el('span', { class: 'block', text: `${i + 1}. ${tpl.name}` }),
      el('span', { class: 'muted small block', text: [
        tpl.subtitle,
        tpl.exercises.length ? plural(tpl.exercises.length, ['cvik', 'cviky', 'cviků'], ['exercise', 'exercises']) : t('bez cviků'),
      ].filter(Boolean).join(' · ') }),
    ]),
    el('span', { class: 'chevron', 'aria-hidden': 'true', text: '›' }),
  ])));
  makeSortable(list, async (order) => {
    await reorderTemplates(order.map((i) => templates[i].id));
    renderTemplates(card);
  });
  card.replaceChildren(
    el('h2', { class: 'card-title', text: t('Typy tréninků') }),
    list,
    el('button', {
      type: 'button', class: 'btn', text: t('+ Přidat typ tréninku'),
      onclick: async () => {
        const name = await promptText({ title: t('Nový typ tréninku'), placeholder: t('např. Nohy'), okLabel: t('Přidat') });
        if (!name) return;
        const tpl = await addTemplate(name);
        navigate(`sablona/${encodeURIComponent(tpl.id)}`);
      },
    }),
  );
}

// ---------- Posilovny ----------
async function renderGyms(card) {
  const gyms = await listGyms();
  card.replaceChildren(
    el('h2', { class: 'card-title', text: t('Posilovny') }),
    el('ul', { class: 'list' }, gyms.map((gym) => el('li', { class: 'list-row' }, [
      el('button', {
        type: 'button', class: 'list-main', text: gym.name,
        onclick: async () => {
          const name = await promptText({ title: t('Přejmenovat posilovnu'), value: gym.name });
          if (name && name !== gym.name) { await renameGym(gym.id, name); renderGyms(card); }
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-small btn-icon', 'aria-label': t('Smazat {name}', { name: gym.name }), html: '&times;',
        disabled: gyms.length <= 1 ? '' : null,
        onclick: async () => {
          const ok = await confirmDialog({
            title: t('Smazat „{name}“?', { name: gym.name }),
            text: t('Záznamy tréninků z této posilovny zůstanou, ale kladkové hodnoty pro ni už nepůjde vybrat.'),
            okLabel: t('Smazat'), danger: true,
          });
          if (ok) { await deleteGym(gym.id); toast(t('Posilovna smazána')); renderGyms(card); }
        },
      }),
    ]))),
    el('p', { class: 'muted small', text: t('Klepnutím na název posilovnu přejmenuješ.') }),
    el('button', {
      type: 'button', class: 'btn', text: t('+ Přidat posilovnu'),
      onclick: async () => {
        const name = await promptText({ title: t('Nová posilovna'), placeholder: t('Název'), okLabel: t('Přidat') });
        if (name) { await addGym(name); toast(t('Posilovna přidána')); renderGyms(card); }
      },
    }),
  );
}

// ---------- Záloha ----------
async function renderBackup(card) {
  const st = await backupStatus();
  const when = st.lastAt == null ? t('zatím nikdy')
    : st.days === 0 ? t('dnes') : st.days === 1 ? t('včera') : t('před {n} dny', { n: st.days });
  const risky = st.lastAt == null ? st.done > 0 : st.days >= 7 && st.since > 0;
  card.replaceChildren(
    el('h2', { class: 'card-title', text: t('Záloha dat') }),
    el('dl', { class: 'kv backup-status' }, [
      el('div', { class: 'kv-row' }, [el('dt', { text: t('Poslední záloha') }), el('dd', { class: risky ? 'warn' : '', text: when })]),
      st.lastAt ? el('div', { class: 'kv-row' }, [el('dt', { text: t('Tréninky od zálohy') }), el('dd', { class: risky ? 'warn' : '', text: String(st.since) })]) : null,
    ]),
    el('p', { class: 'muted small', text: t('Export uloží všechna data včetně vlastních fotek do souboru. Na iPhonu zvol „Uložit do Souborů“.') }),
    el('div', { class: 'row-2' }, [
      el('button', {
        type: 'button', class: 'btn btn-primary', text: t('Exportovat'),
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const result = await shareBackup();
            if (result === 'downloaded') toast(t('Záloha stažena'));
            if (result !== 'cancelled') renderBackup(card);
          } catch (err) {
            console.error(err);
            toast(t('Export selhal'));
          } finally {
            btn.disabled = false;
          }
        },
      }),
      el('button', {
        type: 'button', class: 'btn', text: t('Importovat'),
        onclick: async () => {
          const data = await pickBackupFile();
          if (!data) return;
          if (data.error) { toast(data.error); return; }
          if (isHistoryFile(data)) {
            // historie z poznámek: přidá se k současným datům; tréninky
            // z dřívějšího importu téhož souboru jde nahradit novou verzí
            const workoutsN = (n) => plural(n, ['trénink', 'tréninky', 'tréninků'], ['workout', 'workouts']);
            const overlap = await historyOverlap(data);
            const choice = overlap.existing === 0
              ? (await confirmDialog({
                title: t('Přidat historii tréninků?'),
                text: t('Soubor obsahuje {workouts}. Přidají se k současným datům, nic se nepřepíše.', { workouts: workoutsN(overlap.total) }),
                okLabel: t('Přidat'),
              }) ? 'add' : null)
              : await openDialog((close) => el('div', { class: 'dialog-body' }, [
                el('h2', { class: 'dialog-title', text: t('Přidat historii tréninků?') }),
                el('p', { class: 'muted', text: t('Soubor obsahuje {workouts}, z toho {existing} už v appce máš z dřívějšího importu. Nahradit je verzí ze souboru? Tvoje ruční úpravy v nich se ztratí.', {
                  workouts: workoutsN(overlap.total), existing: overlap.existing,
                }) }),
                el('div', { class: 'dialog-actions is-tight' }, [
                  el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
                  overlap.fresh > 0 ? el('button', { type: 'button', class: 'btn', text: t('Jen nové'), onclick: () => close('add') }) : null,
                  el('button', { type: 'button', class: 'btn btn-primary', text: t('Nahradit'), onclick: () => close('replace') }),
                ]),
              ]));
            if (!choice) return;
            try {
              const res = await importHistory(data, { replace: choice === 'replace' });
              toast(res.replaced
                ? t('Přidáno: {n}, nahrazeno: {m}', { n: workoutsN(res.workouts), m: res.replaced })
                : t('Přidáno: {n}', { n: workoutsN(res.workouts) }));
              setTimeout(() => { location.hash = '#/domu'; location.reload(); }, 800);
            } catch (err) {
              console.error(err);
              toast(t('Import selhal, data zůstala beze změny'));
            }
            return;
          }
          let info;
          try { info = inspectBackup(data); } catch (err) { toast(err.message); return; }
          const ok = await confirmDialog({
            title: t('Přepsat současná data?'),
            text: t('Záloha z {date}: {workouts}, {exercises}, {photos}. Všechna data v appce se nahradí obsahem zálohy.', {
              date: info.exportedAt ? dateShort.format(new Date(info.exportedAt)) : '?',
              workouts: plural(info.workouts, ['trénink', 'tréninky', 'tréninků'], ['workout', 'workouts']),
              exercises: plural(info.exercises, ['cvik', 'cviky', 'cviků'], ['exercise', 'exercises']),
              photos: plural(info.photos, ['obrázek', 'obrázky', 'obrázků'], ['image', 'images']),
            }),
            okLabel: t('Přepsat'), danger: true,
          });
          if (!ok) return;
          try {
            await importData(data);
            toast(t('Data obnovena'));
            setTimeout(() => { location.hash = '#/domu'; location.reload(); }, 600);
          } catch (err) {
            console.error(err);
            toast(t('Import selhal, data zůstala beze změny'));
          }
        },
      }),
    ]),
  );
}

