// Společné UI prvky: dialogy (výzva, potvrzení), formát čísel.

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

export function openDialog(build) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: 'dialog' });
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
    const input = dialog.querySelector('input, textarea');
    if (input) { input.focus(); input.select?.(); }
  });
}

// Textová výzva. Vrátí zadaný text, nebo null při zrušení.
export function promptText({ title, label = '', value = '', placeholder = '', okLabel = 'Uložit' }) {
  return openDialog((close) => {
    const input = el('input', { type: 'text', class: 'input', value, placeholder, autocomplete: 'off', autocapitalize: 'sentences' });
    const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: title }),
      label ? el('label', { class: 'field-label', text: label }) : null,
      input,
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(null) }),
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
    const numFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2, useGrouping: false });
    const input = el('input', {
      type: 'text', class: 'input input-number', value: numFormat.format(Math.abs(value)),
      inputmode: step === 1 ? 'numeric' : 'decimal', autocomplete: 'off',
    });
    let negative = value < 0;
    const sign = el('button', {
      type: 'button', class: `btn sign-btn ${negative ? 'is-selected' : ''}`, text: '−', 'aria-label': 'Záporná hodnota (s dopomocí)',
      onclick: () => { negative = !negative; sign.classList.toggle('is-selected', negative); input.focus(); },
    });
    const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: title }),
      el('div', { class: 'input-row' }, [min == null ? sign : null, input, unit ? el('span', { class: 'input-unit', text: unit }) : null]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Použít' }),
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
export function stepField(label, value, step, min = null, onChange = null) {
  const fmt = (v) => (v == null || !Number.isFinite(v) ? '' : new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2, useGrouping: false }).format(v));
  const read = () => parseFloat(String(input.value).replace(',', '.').replace(/\s/g, ''));
  const input = el('input', { type: 'text', class: 'input edit-field', inputmode: 'decimal', value: fmt(value), autocomplete: 'off' });
  const bump = (d) => {
    let v = read();
    if (!Number.isFinite(v)) v = 0;
    v = Math.round((v + d) * 100) / 100;
    if (min != null && v < min) v = min;
    input.value = fmt(v);
    onChange?.(v);
  };
  if (onChange) {
    input.addEventListener('change', () => {
      let v = read();
      if (!Number.isFinite(v)) return;
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

// Řazení seznamu: řádky <li data-index> s úchytem .drag-handle. Řádek se za
// úchyt táhne prstem nebo myší. Klepnutí na úchyt řádek „vezme“ (zezlátne)
// a klepnutí na jiný úchyt ho vloží před tento řádek.
// onReorder(order) dostane nové pořadí původních indexů.
export function makeSortable(list, onReorder) {
  let picked = null;
  const rows = () => [...list.children].filter((r) => r.dataset.index != null);
  const commit = () => {
    picked?.classList.remove('is-picked');
    picked = null;
    const order = rows().map((r) => Number(r.dataset.index));
    if (order.some((v, i) => v !== i)) onReorder(order);
  };
  const moveTo = (row, clientY) => {
    const target = rows().filter((r) => r !== row).find((r) => {
      const b = r.getBoundingClientRect();
      return clientY < b.top + b.height / 2;
    });
    if (target) list.insertBefore(row, target);
    else list.append(row);
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
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      let moved = false;
      row.classList.add('is-dragging');
      const onMove = (ev) => { moved = true; moveTo(row, ev.touches[0].clientY); };
      const onEnd = () => {
        handle.removeEventListener('touchmove', onMove);
        handle.removeEventListener('touchend', onEnd);
        handle.removeEventListener('touchcancel', onEnd);
        row.classList.remove('is-dragging');
        if (moved) commit(); else tap();
      };
      handle.addEventListener('touchmove', onMove, { passive: false });
      handle.addEventListener('touchend', onEnd);
      handle.addEventListener('touchcancel', onEnd);
    }, { passive: false });
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      let moved = false;
      row.classList.add('is-dragging');
      const onMove = (ev) => { moved = true; moveTo(row, ev.clientY); };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        row.classList.remove('is-dragging');
        if (moved) commit(); else tap();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }
}

export function dragHandle() {
  return el('span', { class: 'drag-handle', 'aria-label': 'Přesunout', html: '&#8801;' });
}

// Skloňování: plural(4, ['cvik', 'cviky', 'cviků']) → „4 cviky“
export function plural(n, forms) {
  const abs = Math.abs(n);
  const form = abs === 1 ? forms[0] : abs >= 2 && abs <= 4 ? forms[1] : forms[2];
  return `${n} ${form}`;
}

// Potvrzení. Vrátí true/false.
export function confirmDialog({ title, text = '', okLabel = 'Potvrdit', danger = false }) {
  return openDialog((close) => el('div', { class: 'dialog-body' }, [
    el('h2', { class: 'dialog-title', text: title }),
    text ? el('p', { class: 'muted', text }) : null,
    el('div', { class: 'dialog-actions' }, [
      el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(false) }),
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

const kgFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

export function formatWeight(kg, { bodyweight = false } = {}) {
  if (bodyweight) {
    if (kg === 0) return 'tělo';
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

export const dateShort = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
export const dateLong = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const timeShort = new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit' });

export function formatRest(seconds) {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min`;
}

export function formatBytes(bytes) {
  if (bytes == null) return '–';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
