// Jazyk appky (čeština / angličtina).
//
// Texty v kódu jsou česky; t('Nový trénink') vrátí v angličtině překlad ze
// slovníku EN (klíčem je český text). Proměnné: t('Série {a}/{b}', { a, b }).
// Volba jazyka je uložená v zařízení; po změně se appka znovu načte.

import { EN } from './i18n-en.js';

const KEY = 'gym-lang';

function readLang() {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'cs';
  } catch {
    return 'cs';
  }
}

export const lang = readLang();
export const locale = lang === 'en' ? 'en-GB' : 'cs-CZ';

export function setLang(value) {
  try { localStorage.setItem(KEY, value); } catch { /* soukromý režim */ }
  location.reload();
}

export function t(text, vars = null) {
  let out = lang === 'en' ? (EN[text] ?? text) : text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return out;
}

// Skloňování: plural(n, ['cvik', 'cviky', 'cviků'], ['exercise', 'exercises'])
export function plural(n, csForms, enForms = null) {
  const abs = Math.abs(n);
  if (lang === 'en' && enForms) return `${n} ${abs === 1 ? enForms[0] : enForms[1]}`;
  const form = abs === 1 ? csForms[0] : abs >= 2 && abs <= 4 ? csForms[1] : csForms[2];
  return `${n} ${form}`;
}

// Text cviku v aktuálním jazyce (název, postup, tipy) s náhradou za druhý jazyk
export function exName(exercise, fallback = '') {
  if (!exercise) return fallback;
  return (lang === 'en' ? exercise.nameEn : null) || exercise.name || fallback;
}

export function exText(exercise, field) {
  if (!exercise) return '';
  if (lang === 'en') {
    const en = exercise[`${field}En`];
    if (en) return en;
  }
  return exercise[field] ?? '';
}
