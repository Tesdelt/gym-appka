// Mřížka cviků s vyhledáváním a filtry partií (2 úrovně). Používá ji
// záložka Cviky i výběr cviku při přidávání do tréninku / typu tréninku.
//
// mountCatalog(host, {
//   scrollRoot,      prvek, který se posouvá (kvůli postupnému načítání)
//   onMine(ex),      klepnutí na můj cvik
//   onDb(meta),      klepnutí na cvik z katalogu
//   onInfo(meta),    volitelné tlačítko ⓘ na kartě z katalogu (náhled)
//   exclude,         id mých cviků, které se nemají ukázat
//   showCatalog,     false = jen moje cviky
// })

import { listExercises } from './data.js';
import { el, openDialog, normalize } from './ui.js';
import { imageBox } from './images.js';
import { loadCatalog, dbName, dbInstructions, thumbUrl } from './catalog.js';
import { MUSCLE_GROUPS, matchesFilters, partLabel } from './muscles.js';
import { t, lang, exName } from './i18n.js';

// Stav hledání a filtrů je společný pro katalog i výběr cviku
const state = { query: '', groups: new Set(), parts: new Set(), open: new Set() };
const PAGE = 45;

// Aktuální hledaný text (např. jako název nového cviku)
export const currentQuery = () => state.query.trim();

export async function mountCatalog(host, { scrollRoot, onMine, onDb, onInfo = null, exclude = [], showCatalog = true, focus = false }) {
  const excluded = new Set(exclude);
  const [allMine, catalog] = await Promise.all([listExercises(), showCatalog ? loadCatalog().catch(() => []) : []]);
  const mine = allMine.filter((e) => !excluded.has(e.id));
  // cviky z katalogu, které už mám, se ukazují jen v „Moje cviky“
  const ownedDb = new Set(allMine.map((e) => e.dbId).filter(Boolean));
  const labels = (m) => [...(m?.primary ?? []), ...(m?.secondary ?? [])].map((k) => partLabel(k, lang));
  const mineHay = new Map(mine.map((e) => [e.id, normalize([e.name, e.nameEn, e.skill ? 'kalistenika calisthenics' : '', ...(e.aliases ?? []), ...labels(e.muscles)].join(' '))]));
  const dbHay = new Map(catalog.map((m) => [m.id, normalize([m.nc, m.n, m.kw ?? '', ...labels({ primary: m.p, secondary: m.s })].join(' '))]));

  const search = el('input', {
    type: 'search', class: 'input search-input', placeholder: t('Hledat cvik nebo partii…'), autocomplete: 'off', value: state.query,
    oninput: (e) => { state.query = e.target.value; draw(); },
  });
  const filterBtn = el('button', { type: 'button', class: 'btn filter-btn', onclick: () => openFilters(draw) });
  const chips = el('div', { class: 'filter-chips' });
  const mineSection = el('section', { class: 'cat-section' });
  const dbSection = el('section', { class: 'cat-section' });
  host.append(el('div', { class: 'cat-top' }, [el('div', { class: 'cat-search' }, [search, filterBtn]), chips]), mineSection, dbSection);
  if (focus) search.focus();

  let observer = null;

  function draw() {
    const words = normalize(state.query).trim().split(/\s+/).filter(Boolean);
    const hit = (hay) => words.every((w) => hay.includes(w));
    const count = state.groups.size + state.parts.size;
    filterBtn.textContent = count ? t('Filtry ({n})', { n: count }) : t('Filtry');
    filterBtn.classList.toggle('is-active', count > 0);

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
        ? el('div', { class: 'cat-grid' }, myList.map((e) => card(exName(e), imageBox(e, { cls: 'cat-pic' }), () => onMine(e))))
        : el('p', { class: 'muted small', text: mine.length ? t('Žádný z mých cviků neodpovídá.') : t('Zatím žádné. Klepni na cvik v katalogu níže a přidej ho.') }),
    );

    if (!showCatalog) { dbSection.replaceChildren(); return; }
    const dbList = catalog.filter((m) => !ownedDb.has(m.id)
      && matchesFilters({ primary: m.p, secondary: m.s }, state.groups, state.parts) && hit(dbHay.get(m.id)));
    const grid = el('div', { class: 'cat-grid' });
    const sentinel = el('div', { class: 'cat-sentinel' });
    let shown = 0;
    const more = () => {
      const next = dbList.slice(shown, shown + PAGE);
      shown += next.length;
      grid.append(...next.map((m) => card(dbName(m), dbPic(m), () => onDb(m), onInfo ? () => onInfo(m) : null)));
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
    }, { root: scrollRoot, rootMargin: '600px' });
    if (sentinel.isConnected) observer.observe(sentinel);
  }

  draw();
}

function card(name, pic, onclick, onInfo = null) {
  const node = el('div', { class: 'cat-card', role: 'button', tabindex: '0', onclick }, [
    el('span', { class: 'cat-name', text: name }),
    pic,
  ]);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter') onclick(); });
  if (onInfo) {
    node.append(el('button', {
      type: 'button', class: 'cat-info', 'aria-label': t('Podrobnosti'), text: 'i',
      onclick: (e) => { e.stopPropagation(); onInfo(); },
    }));
  }
  return node;
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
  }, { focus: false });
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

// Náhled cviku z katalogu v dialogu (fotka, partie, postup). Vrací true = přidat.
export function previewDialog(meta, addLabel = t('Přidat')) {
  return openDialog((close) => {
    const img = el('img', { alt: '', src: thumbUrl(meta) ?? '' });
    const first = meta.t === 'time' && meta.i > 1 ? 1 : 0;
    if (meta.i) {
      const pre = new Image();
      pre.onload = () => { img.src = pre.src; };
      pre.src = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${encodeURIComponent(meta.id)}/${first}.jpg`;
    }
    const instructions = el('p', { class: 'prose small' });
    dbInstructions(meta.id).then((text) => { instructions.textContent = text; });
    return el('div', { class: 'dialog-body preview-body' }, [
      el('div', { class: 'preview-pic' }, [img]),
      el('h2', { class: 'dialog-title', text: dbName(meta) }),
      el('p', { class: 'muted small', text: `${t('Hlavní')}: ${meta.p.map((k) => partLabel(k, lang)).join(', ')}` }),
      meta.s.length ? el('p', { class: 'muted small', text: `${t('Vedlejší')}: ${meta.s.map((k) => partLabel(k, lang)).join(', ')}` }) : null,
      instructions,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zpět'), onclick: () => close(false) }),
        el('button', { type: 'button', class: 'btn btn-primary', text: addLabel, onclick: () => close(true) }),
      ]),
    ]);
  }, { focus: false });
}
