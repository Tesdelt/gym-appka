// Společné UI prvky: dialogy (výzva, potvrzení), formát čísel.

import { t, locale, plural as i18nPlural } from './i18n.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

// Dialog. cls = další třída (např. 'dialog-full' přes celou obrazovku),
// focus = automaticky zaměřit první pole (na iPhonu otevře klávesnici).
export function openDialog(build, { cls = '', focus = true } = {}) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: `dialog ${cls}`.trim() });
    let closing = false;
    const close = (value) => {
      if (closing) return;
      closing = true;
      resolve(value);
      const done = () => { dialog.close(); dialog.remove(); };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
      dialog.classList.add('is-closing');
      setTimeout(done, 140);
    };
    dialog.append(build(close));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(null); });
    document.body.append(dialog);
    dialog.showModal();
    const input = focus ? dialog.querySelector('input, textarea') : null;
    if (input) {
      input.focus();
      // u poznámky kurzor na konec, ať se text omylem nepřepíše
      if (input.tagName === 'TEXTAREA') input.setSelectionRange(input.value.length, input.value.length);
      else input.select?.();
    }
  });
}

// Víceřádková poznámka: Enter = nový řádek. Řádek s odrážkou („- “, „• “,
// „1. “) pokračuje po Enteru další odrážkou; Enter na prázdné odrážce ji zruší.
export function noteArea(value = '', { placeholder = '', rows = 3 } = {}) {
  const area = el('textarea', { class: 'input textarea note-area', rows, placeholder, autocapitalize: 'sentences' });
  area.value = value ?? '';
  const bullet = () => {
    const { selectionStart: pos, selectionEnd: end, value: text } = area;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const line = text.slice(lineStart, pos);
    const m = line.match(/^(\s*)([-•*–]|(\d+)([.)]))\s+/);
    if (!m) return false;
    if (line.trim() === m[0].trim()) area.setRangeText('', lineStart, pos, 'end');
    else area.setRangeText(`\n${m[1]}${m[3] ? `${Number(m[3]) + 1}${m[4]}` : m[2]} `, pos, end, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && !e.shiftKey && bullet()) e.preventDefault();
  });
  // některé klávesnice na iPhonu posílají Enter jen jako vstup nového řádku
  area.addEventListener('beforeinput', (e) => {
    if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && bullet()) e.preventDefault();
  });
  return area;
}

// Dialog s víceřádkovou poznámkou. Vrátí text (oříznutý), nebo null při zrušení.
export function promptNote({ title, value = '', placeholder = '', okLabel = t('Uložit') }) {
  return openDialog((close) => {
    const area = noteArea(value, { placeholder, rows: 5 });
    return el('div', { class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: title }),
      area,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'button', class: 'btn btn-primary', text: okLabel, onclick: () => close(area.value.trim()) }),
      ]),
    ]);
  });
}

// Textová výzva. Vrátí zadaný text, nebo null při zrušení.
export function promptText({ title, label = '', value = '', placeholder = '', okLabel = t('Uložit') }) {
  return openDialog((close) => {
    const input = el('input', { type: 'text', class: 'input', value, placeholder, autocomplete: 'off', autocapitalize: 'sentences' });
    const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: title }),
      label ? el('label', { class: 'field-label', text: label }) : null,
      input,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: okLabel }),
      ]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) close(text);
    });
    return form;
  });
}

// Číselná výzva. Vrátí číslo, nebo null při zrušení.
// Textové pole s klávesnicí „decimal“: iOS na ní nabízí čárku podle jazyka
// a přijímáme čárku i tečku. Záporné hodnoty (guma) přes tlačítko znaménka.
export function promptNumber({ title, value = 0, step = 'any', min = null, unit = '' }) {
  return openDialog((close) => {
    const numFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false });
    const input = el('input', {
      type: 'text', class: 'input input-number', value: numFormat.format(Math.abs(value)),
      inputmode: step === 1 ? 'numeric' : 'decimal', autocomplete: 'off',
    });
    let negative = value < 0;
    const sign = el('button', {
      type: 'button', class: `btn sign-btn ${negative ? 'is-selected' : ''}`, text: '−', 'aria-label': t('Záporná hodnota (s dopomocí)'),
      onclick: () => { negative = !negative; sign.classList.toggle('is-selected', negative); input.focus(); },
    });
    const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: title }),
      el('div', { class: 'input-row' }, [min == null ? sign : null, input, unit ? el('span', { class: 'input-unit', text: unit }) : null]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('Použít') }),
      ]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let n = parseFloat(String(input.value).trim().replace(',', '.').replace(/\s/g, ''));
      if (!Number.isFinite(n)) return;
      n = Math.abs(n) * (negative ? -1 : 1);
      if (min != null && n < min) n = min;
      close(n);
    });
    return form;
  });
}

// Číselné pole s tlačítky +/− a možností ručního zadání (čárka i tečka).
// Vrací { root, input, value() }.
export function stepField(label, value, step, min = null, onChange = null, { snap = false } = {}) {
  const fmt = (v) => (v == null || !Number.isFinite(v) ? '' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(v));
  const read = () => parseFloat(String(input.value).replace(',', '.').replace(/\s/g, ''));
  const input = el('input', { type: 'text', class: 'input edit-field', inputmode: 'decimal', value: fmt(value), autocomplete: 'off' });
  const bump = (d) => {
    let v = read();
    if (!Number.isFinite(v)) v = 0;
    // přichycení: z 2 s tlačítkem + na 5, ne na 7
    v = snap ? (d > 0 ? Math.floor(v / step) * step + step : Math.ceil(v / step) * step - step) : v + d;
    v = Math.round(v * 100) / 100;
    if (min != null && v < min) v = min;
    input.value = fmt(v);
    onChange?.(v);
  };
  if (onChange) {
    input.addEventListener('change', () => {
      let v = read();
      if (!Number.isFinite(v)) return;
      if (snap) { v = Math.round(v / step) * step; input.value = fmt(v); }
      if (min != null && v < min) { v = min; input.value = fmt(v); }
      onChange(v);
    });
  }
  const root = el('div', { class: 'edit-row' }, [
    el('span', { class: 'field-label', text: label }),
    el('div', { class: 'stepper-row edit-stepper' }, [
      el('button', { type: 'button', class: 'btn stepper-btn', text: '−', 'aria-label': `${label} minus`, onclick: () => bump(-step) }),
      input,
      el('button', { type: 'button', class: 'btn stepper-btn', text: '+', 'aria-label': `${label} plus`, onclick: () => bump(step) }),
    ]),
  ]);
  return { root, input, value: read, set: (v) => { input.value = fmt(v); } };
}

// Řazení seznamu: řádky <li data-index> s úchytem .drag-handle.
// Řádek se vezme až po krátkém podržení úchytu – do té doby jde stránkou
// scrollovat. Při tažení se řádek veze s prstem a ostatní plynule uhýbají.
// Krátké klepnutí na úchyt řádek „vezme“ (zezlátne) a klepnutí na jiný úchyt
// ho vloží před tento řádek.
// onReorder(order) dostane nové pořadí původních indexů.
const DRAG_HOLD = 260; // ms podržení, než se řádek začne přesouvat
const DRAG_SLOP = 10; // px pohybu, které podržení ještě zruší (= scrollování)

export function makeSortable(list, onReorder) {
  let picked = null;
  const rows = () => [...list.children].filter((r) => r.dataset.index != null);
  const commit = () => {
    picked?.classList.remove('is-picked');
    picked = null;
    const order = rows().map((r) => Number(r.dataset.index));
    if (order.some((v, i) => v !== i)) onReorder(order);
  };

  // Přesune řádek na místo podle polohy prstu. Ostatní řádky se na nové místo
  // přesunou plynule (doanimují se z původní pozice). Vrací posun taženého
  // řádku, o který se musí dorovnat jeho transform.
  const reorderTo = (row, clientY) => {
    const tops = new Map(rows().map((r) => [r, r.getBoundingClientRect().top]));
    const target = rows().filter((r) => r !== row).find((r) => {
      const b = r.getBoundingClientRect();
      return clientY < b.top + b.height / 2;
    });
    if (target) {
      if (target === row.nextElementSibling) return 0;
      list.insertBefore(row, target);
    } else {
      if (row === list.lastElementChild) return 0;
      list.append(row);
    }
    let shift = 0;
    for (const [r, top] of tops) {
      const now = r.getBoundingClientRect().top;
      if (r === row) { shift = now - top; continue; }
      if (Math.abs(now - top) < 1) continue;
      r.animate?.([{ transform: `translateY(${top - now}px)` }, { transform: 'none' }], { duration: 150, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' });
    }
    return shift;
  };

  for (const row of rows()) {
    const handle = row.querySelector('.drag-handle');
    if (!handle) continue;
    const tap = () => {
      if (!picked) { picked = row; row.classList.add('is-picked'); return; }
      if (picked === row) { row.classList.remove('is-picked'); picked = null; return; }
      list.insertBefore(picked, row);
      commit();
    };

    // společný průběh pro dotyk i myš
    const begin = (startClientY) => {
      const st = { active: false, moved: false, cancelled: false, startY: startClientY };
      st.timer = setTimeout(() => {
        st.active = true;
        row.classList.add('is-dragging');
        navigator.vibrate?.(8);
      }, DRAG_HOLD);
      st.move = (clientY) => {
        if (!st.active) {
          // pohyb před podržením = scrollování, řádek se nebere
          if (Math.abs(clientY - st.startY) > DRAG_SLOP) { clearTimeout(st.timer); st.cancelled = true; }
          return false;
        }
        st.moved = true;
        row.style.transform = `translateY(${clientY - st.startY}px)`;
        const shift = reorderTo(row, clientY);
        if (shift) {
          st.startY += shift;
          row.style.transform = `translateY(${clientY - st.startY}px)`;
        }
        return true;
      };
      st.end = () => {
        clearTimeout(st.timer);
        row.style.transform = '';
        row.classList.remove('is-dragging');
        if (st.active && st.moved) commit();
        else if (!st.cancelled) tap();
      };
      return st;
    };

    handle.addEventListener('touchstart', (e) => {
      const st = begin(e.touches[0].clientY);
      const onMove = (ev) => { if (st.move(ev.touches[0].clientY)) ev.preventDefault(); };
      const onEnd = () => {
        handle.removeEventListener('touchmove', onMove);
        handle.removeEventListener('touchend', onEnd);
        handle.removeEventListener('touchcancel', onEnd);
        st.end();
      };
      handle.addEventListener('touchmove', onMove, { passive: false });
      handle.addEventListener('touchend', onEnd);
      handle.addEventListener('touchcancel', onEnd);
    }, { passive: true });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const st = begin(e.clientY);
      const onMove = (ev) => st.move(ev.clientY);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        st.end();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }
}

export function dragHandle() {
  return el('span', { class: 'drag-handle', 'aria-label': t('Přesunout'), html: '&#8801;' });
}

// Skloňování: plural(4, ['cvik', 'cviky', 'cviků'], ['exercise', 'exercises']) → „4 cviky“
export function plural(n, forms, enForms = null) {
  return i18nPlural(n, forms, enForms);
}

// Potvrzení. Vrátí true/false.
export function confirmDialog({ title, text = '', okLabel = t('Potvrdit'), danger = false }) {
  return openDialog((close) => el('div', { class: 'dialog-body' }, [
    el('h2', { class: 'dialog-title', text: title }),
    text ? el('p', { class: 'muted', text }) : null,
    el('div', { class: 'dialog-actions' }, [
      el('button', { type: 'button', class: 'btn', text: t('Zrušit'), onclick: () => close(false) }),
      el('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: okLabel, onclick: () => close(true) }),
    ]),
  ]));
}

export function toast(text) {
  let host = document.getElementById('toast');
  if (!host) {
    host = el('div', { id: 'toast', class: 'toast', role: 'status' });
    document.body.append(host);
  }
  host.textContent = text;
  host.classList.add('is-visible');
  clearTimeout(host._timer);
  host._timer = setTimeout(() => host.classList.remove('is-visible'), 2200);
}

const kgFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

export function formatWeight(kg, { bodyweight = false } = {}) {
  if (bodyweight) {
    if (kg === 0) return t('tělo');
    return `${kg > 0 ? '+' : '−'}${kgFormat.format(Math.abs(kg))} kg`;
  }
  return `${kgFormat.format(kg)} kg`;
}

// „+15 kg × 8, 8, 7“ / „15 kg × 8 | 12,5 kg × 7“ / „40 s, 45 s“ / „8, 8, 8“
export function formatValues(entry, values) {
  if (!values.length) return '–';
  if (entry.type === 'time') return values.map((v) => `${v.seconds} s`).join(', ');
  if (entry.type === 'reps') return values.map((v) => v.reps).join(', ');
  const sameWeight = values.every((v) => v.weight === values[0].weight);
  const w = (v) => formatWeight(v.weight, { bodyweight: entry.bodyweight });
  if (sameWeight) return `${w(values[0])} × ${values.map((v) => v.reps).join(', ')}`;
  return values.map((v) => `${w(v)} × ${v.reps}`).join(' | ');
}

export const dateShort = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'numeric' });
export const dateLong = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const timeShort = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });

export function formatRest(seconds) {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min`;
}

export function formatBytes(bytes) {
  if (bytes == null) return '–';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Text pro vyhledávání: malá písmena bez diakritiky
export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
