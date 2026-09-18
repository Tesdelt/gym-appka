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
    const close = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
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
export function promptNumber({ title, value = 0, step = 'any', min = null, unit = '' }) {
  return openDialog((close) => {
    const input = el('input', { type: 'number', class: 'input input-number', value: String(value), step, min, inputmode: step === 1 ? 'numeric' : 'decimal' });
    const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: title }),
      el('div', { class: 'input-row' }, [input, unit ? el('span', { class: 'input-unit', text: unit }) : null]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => close(null) }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Použít' }),
      ]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseFloat(String(input.value).replace(',', '.'));
      if (Number.isFinite(n)) close(n);
    });
    return form;
  });
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
