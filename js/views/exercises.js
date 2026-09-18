// Katalog cviků: mřížka s fotkami (nad fotkou jen název), vyhledávání
// a filtry partií ve 2 úrovních. Nahoře moje cviky, pod nimi celý katalog
// seřazený od nejběžnějších základních cviků.

import { listExercises } from '../data.js';
import { el, openDialog } from '../ui.js';
import { navigate } from '../router.js';
import { normalize } from '../exercisePicker.js';
import { imageBox } from '../images.js';
import { loadCatalog, dbName, thumbUrl } from '../catalog.js';
import { MUSCLE_GROUPS, matchesFilters, partLabel } from '../muscles.js';
import { t, lang, exName } from '../i18n.js';

export const title = 'Cviky';

// Stav hledání a filtrů zůstává při přechodu mezi obrazovkami
const state = { query: '', groups: new Set(), parts: new Set(), open: new Set() };
const PAGE = 45;

export async function render(container, { extraEl }) {
  extraEl.append(el('button', { type: 'button', class: 'btn btn-small btn-primary', text: t('+ Vlastní'), onclick: () => navigate('cvik/novy') }));

  const [mine, catalog] = await Promise.all([listExercises(), loadCatalog().catch(() => [])]);
  const ownedDb = new Set(mine.map((e) => e.dbId).filter(Boolean));
  const labels = (m) => [...(m?.primary ?? []), ...(m?.secondary ?? [])].map((k) => partLabel(k, lang));
  const mineHay = new Map(mine.map((e) => [e.id, normalize([e.name, e.nameEn, ...(e.aliases ?? []), ...labels(e.muscles)].join(' '))]));
  const dbHay = new Map(catalog.map((m) => [m.id, normalize([m.nc, m.n, ...labels({ primary: m.p, secondary: m.s })].join(' '))]));

  const search = el('input', {
    type: 'search', class: 'input search-input', placeholder: t('Hledat cvik nebo partii…'), autocomplete: 'off', value: state.query,
    oninput: (e) => { state.query = e.target.value; draw(); },
  });
  const filterBtn = el('button', { type: 'button', class: 'btn filter-btn', onclick: () => openFilters(draw) });
  const chips = el('div', { class: 'filter-chips' });
  const mineSection = el('section', { class: 'cat-section' });
  const dbSection = el('section', { class: 'cat-section' });
  container.append(el('div', { class: 'cat-top' }, [el('div', { class: 'cat-search' }, [search, filterBtn]), chips]), mineSection, dbSection);

  let observer = null;

  function draw() {
    const words = normalize(state.query).trim().split(/\s+/).filter(Boolean);
    const hit = (hay) => words.every((w) => hay.includes(w));
    const count = state.groups.size + state.parts.size;
    filterBtn.textContent = count ? t('Filtry ({n})', { n: count }) : t('Filtry');
    filterBtn.classList.toggle('is-active', count > 0);

    // vybrané filtry jako štítky s křížkem
    chips.replaceChildren(
      ...[...state.groups].map((k) => chip(partLabel(k, lang), () => { state.groups.delete(k); draw(); })),
      ...[...state.parts].map((k) => chip(partLabel(k, lang), () => { state.parts.delete(k); draw(); }, true)),
    );

    const myList = mine
      .filter((e) => matchesFilters(e.muscles, state.groups, state.parts) && hit(mineHay.get(e.id)))
      .sort((a, b) => exName(a).localeCompare(exName(b), lang));
    mineSection.replaceChildren(
      el('h2', { class: 'section-title', text: t('Moje cviky') }),
      myList.length
        ? el('div', { class: 'cat-grid' }, myList.map((e) => card(exName(e), imageBox(e, { cls: 'cat-pic' }), () => {
          navigate(`cvik/${encodeURIComponent(e.id)}`);
        })))
        : el('p', { class: 'muted small', text: t('Žádný z mých cviků neodpovídá.') }),
    );

    const dbList = catalog.filter((m) => !ownedDb.has(m.id)
      && matchesFilters({ primary: m.p, secondary: m.s }, state.groups, state.parts) && hit(dbHay.get(m.id)));
    const grid = el('div', { class: 'cat-grid' });
    const sentinel = el('div', { class: 'cat-sentinel' });
    let shown = 0;
    const more = () => {
      const next = dbList.slice(shown, shown + PAGE);
      shown += next.length;
      grid.append(...next.map((m) => card(dbName(m), dbPic(m), () => navigate(`cvik/db/${encodeURIComponent(m.id)}`))));
      if (shown >= dbList.length) sentinel.remove();
    };
    dbSection.replaceChildren(
      el('h2', { class: 'section-title', text: t('Katalog') }),
      dbList.length ? grid : el('p', { class: 'muted small', text: catalog.length ? t('Nic nenalezeno.') : t('Katalog se nepodařilo načíst.') }),
      sentinel,
    );
    more();
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting) && sentinel.isConnected) more();
    }, { root: container, rootMargin: '600px' });
    if (sentinel.isConnected) observer.observe(sentinel);
  }

  draw();
}

function card(name, pic, onclick) {
  return el('button', { type: 'button', class: 'cat-card', onclick }, [
    el('span', { class: 'cat-name', text: name }),
    pic,
  ]);
}

function dbPic(meta) {
  const url = thumbUrl(meta);
  const box = el('div', { class: `cat-pic ${url ? '' : 'is-empty'}` });
  if (url) box.append(el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
  else box.innerHTML = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 32h44M14 22v20M20 18v28M44 18v28M50 22v20"/></svg>';
  return box;
}

function chip(text, onRemove, isolated = false) {
  return el('button', { type: 'button', class: `filter-chip ${isolated ? 'is-part' : ''}`, onclick: onRemove }, [
    el('span', { text }), el('span', { class: 'filter-chip-x', text: '×' }),
  ]);
}

// Panel filtrů: skupina = základní filtr, rozbalením izolované svaly
function openFilters(onChange) {
  return openDialog((close) => {
    const body = el('div', { class: 'dialog-body filter-panel' });
    const draw = () => {
      body.replaceChildren(
        el('h2', { class: 'dialog-title', text: t('Filtr partií') }),
        el('p', { class: 'muted small', text: t('Základní partie najde vše, co ji zapojuje. Po rozbalení vybereš konkrétní sval – pak se ukážou jen cviky cílené přímo na něj.') }),
        el('div', { class: 'filter-list' }, MUSCLE_GROUPS.map((g) => {
          const open = state.open.has(g.key);
          const partsOn = g.parts.filter((p) => state.parts.has(p.key)).length;
          return el('div', { class: `filter-group ${open ? 'is-open' : ''}` }, [
            el('div', { class: 'filter-row' }, [
              checkRow(g[lang], state.groups.has(g.key), (on) => { toggle(state.groups, g.key, on); onChange(); }),
              g.parts.length > 1 ? el('button', {
                type: 'button', class: 'filter-expand', 'aria-label': t('Podrobně'),
                onclick: () => { if (open) state.open.delete(g.key); else state.open.add(g.key); draw(); },
              }, [partsOn ? el('span', { class: 'filter-count', text: String(partsOn) }) : null, el('span', { class: 'filter-arrow', text: '›' })]) : null,
            ]),
            open ? el('div', { class: 'filter-parts' }, g.parts.map((p) => checkRow(p[lang], state.parts.has(p.key), (on) => {
              toggle(state.parts, p.key, on); onChange(); draw();
            }))) : null,
          ]);
        })),
        el('div', { class: 'dialog-actions' }, [
          el('button', { type: 'button', class: 'btn', text: t('Zrušit filtry'), onclick: () => { state.groups.clear(); state.parts.clear(); onChange(); draw(); } }),
          el('button', { type: 'button', class: 'btn btn-primary', text: t('Hotovo'), onclick: () => close() }),
        ]),
      );
    };
    draw();
    return body;
  });
}

function toggle(set, key, on) {
  if (on) set.add(key); else set.delete(key);
}

function checkRow(label, checked, onToggle) {
  const input = el('input', { type: 'checkbox', class: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onToggle(input.checked));
  return el('label', { class: 'check-row filter-check' }, [input, el('span', { text: label })]);
}
