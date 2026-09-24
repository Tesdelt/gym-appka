// Svalová mapa cviku: silueta postavy se zvýrazněnými partiemi.
// Používá se místo fotek v seznamech a mřížkách (fotka zůstává v detailu).
// Vychází z partií cviku: hlavní partie se zvýrazní výrazně, vedlejší slabě.

import { groupOf } from './muscles.js';

// Oblasti siluety (pohled zepředu, zjednodušené tvary). Klíč = skupina partií.
const REGIONS = [
  ['neck', 'M44 20h12v8a6 6 0 0 1-12 0z'],
  ['traps', 'M37 27 50 23 63 27 67 35 33 35Z'],
  ['shoulders', 'M29 33a9 8 0 0 1 8 4l-2 12a9 9 0 0 1-9-7zM71 33a9 8 0 0 0-8 4l2 12a9 9 0 0 0 9-7z'],
  ['chest', 'M37 36h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H40a3 3 0 0 1-3-3zM63 36H52a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8a3 3 0 0 0 3-3z'],
  ['back', 'M36 38 41 66 30 56ZM64 38 59 66 70 56Z'],
  ['abs', 'M41 54h18v24a4 4 0 0 1-4 4H45a4 4 0 0 1-4-4z'],
  ['glutes', 'M39 83h22v10a5 5 0 0 1-5 5H44a5 5 0 0 1-5-5z'],
  ['biceps', 'M24 46h9v25a4 4 0 0 1-9 0zM76 46h-9v25a4 4 0 0 0 9 0z'],
  ['forearms', 'M22 74h8v25a4 4 0 0 1-8 0zM78 74h-8v25a4 4 0 0 0 8 0z'],
  ['thighs', 'M38 99h10v32a5 5 0 0 1-10 0zM62 99H52v32a5 5 0 0 0 10 0z'],
  ['calves', 'M39 134h8v24a4 4 0 0 1-8 0zM61 134h-8v24a4 4 0 0 0 8 0z'],
];
// triceps sdílí s bicepsem tvar paže
const SHARED = { triceps: 'biceps' };

const HEAD = 'M50 4a9 9 0 0 1 9 9v3a9 9 0 0 1-18 0v-3a9 9 0 0 1 9-9z';

const NS = 'http://www.w3.org/2000/svg';

function regionsOf(keys) {
  const out = new Set();
  for (const k of keys ?? []) {
    const g = groupOf(k) ?? k;
    out.add(SHARED[g] ?? g);
  }
  return out;
}

// muscles = { primary: [klíče], secondary: [klíče] }
export function muscleMap(muscles, { cls = 'mm' } = {}) {
  const primary = regionsOf(muscles?.primary);
  const secondary = regionsOf(muscles?.secondary);
  // u cviků jen na horní polovinu těla se silueta ořízne po pas, ať je větší
  const legs = ['thighs', 'calves', 'glutes'].some((k) => primary.has(k) || secondary.has(k));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', legs ? '17 0 66 164' : '19 0 62 104');
  svg.setAttribute('class', `mmap ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const add = (d, klass) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', klass);
    svg.append(p);
  };
  add(HEAD, 'mm-base');
  for (const [key, d] of REGIONS) {
    const on = primary.has(key) ? 'is-primary' : secondary.has(key) ? 'is-secondary' : '';
    add(d, `mm-base ${on}`.trim());
  }
  return svg;
}

// Obal do čtvercového rámečku (stejné rozměry jako dřív měla fotka)
export function muscleBox(exercise, { cls = 'ex-pic' } = {}) {
  const box = document.createElement('div');
  box.className = `${cls} mm-box`;
  box.append(muscleMap(exercise?.muscles, { cls: 'mm' }));
  return box;
}
