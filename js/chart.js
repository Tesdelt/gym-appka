// Jednoduchý čárový graf v SVG (časová osa). Barvy z CSS proměnných.
//
// points: [{ t: Date | ISO string, v: number, gold?: bool }]
// format: (v) => text popisku hodnoty

const NS = 'http://www.w3.org/2000/svg';

function node(tag, attrs = {}, text = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
const dateFmtYear = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: '2-digit' });

export function lineChart(points, { format = (v) => String(v), height = 170 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const data = points
    .map((p) => ({ ...p, t: new Date(p.t).getTime() }))
    .filter((p) => Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);

  if (data.length === 0) {
    wrap.innerHTML = '<p class="muted small chart-empty">Zatím žádná data.</p>';
    return wrap;
  }

  const W = 340;
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const dataMin = Math.min(...data.map((p) => p.v));
  const dataMax = Math.max(...data.map((p) => p.v));
  let vMin = dataMin;
  let vMax = dataMax;
  if (vMin === vMax) { vMin -= 1; vMax += 1; }
  const span = vMax - vMin;
  vMin -= span * 0.1;
  vMax += span * 0.1;
  const x = (t) => (t1 === t0 ? (pad.l + W - pad.r) / 2 : pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - vMin) / (vMax - vMin)) * (H - pad.t - pad.b);

  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });

  // vodorovné linky: min, střed, max
  const ticks = dataMin === dataMax ? [dataMin] : [dataMin, (dataMin + dataMax) / 2, dataMax];
  for (const v of ticks) {
    svg.append(node('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'chart-grid' }));
    svg.append(node('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'chart-label' }, format(Math.round(v * 10) / 10)));
  }

  // osa x: první a poslední datum
  const multiYear = new Date(t0).getFullYear() !== new Date(t1).getFullYear();
  const df = multiYear ? dateFmtYear : dateFmt;
  svg.append(node('text', { x: pad.l, y: H - 6, class: 'chart-label' }, df.format(t0)));
  if (t1 !== t0) svg.append(node('text', { x: W - pad.r, y: H - 6, 'text-anchor': 'end', class: 'chart-label' }, df.format(t1)));

  if (data.length > 1) {
    const d = data.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    svg.append(node('path', { d, class: 'chart-line', pathLength: 1 }));
  }
  for (const p of data) {
    svg.append(node('circle', { cx: x(p.t), cy: y(p.v), r: p.gold ? 4.5 : 3, class: `chart-dot${p.gold ? ' is-gold' : ''}${p.manual ? ' is-manual' : ''}` }));
  }
  const last = data[data.length - 1];
  svg.setAttribute('aria-label', `Graf, poslední hodnota ${format(last.v)}`);
  wrap.append(svg);
  return wrap;
}

// Graf s volbou rozsahu 1 měsíc / 3 měsíce / 1 rok / vše
const RANGES = [['1m', '1 měs.', 31], ['3m', '3 měs.', 92], ['1y', '1 rok', 366], ['all', 'Vše', null]];
let lastRange = 'all';

export function rangeChart(points, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'range-chart';
  const seg = document.createElement('div');
  seg.className = 'segmented range-seg';
  const holder = document.createElement('div');
  const draw = (key) => {
    lastRange = key;
    const days = RANGES.find((r) => r[0] === key)[2];
    const from = days ? Date.now() - days * 86400000 : -Infinity;
    holder.replaceChildren(lineChart(points.filter((p) => new Date(p.t).getTime() >= from), options));
    seg.querySelectorAll('.seg').forEach((b) => b.classList.toggle('is-selected', b.dataset.range === key));
  };
  for (const [key, label] of RANGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg';
    b.dataset.range = key;
    b.textContent = label;
    b.addEventListener('click', () => draw(key));
    seg.append(b);
  }
  wrap.append(seg, holder);
  draw(lastRange);
  return wrap;
}

// Sloupcový graf (frekvence po týdnech)
export function barChart(bars, { height = 110, label = (b) => '' } = {}) {
  const W = 340;
  const H = height;
  const pad = { l: 6, r: 6, t: 16, b: 20 };
  const max = Math.max(1, ...bars.map((b) => b.value));
  const bw = (W - pad.l - pad.r) / bars.length;
  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': 'Sloupcový graf' });
  svg.append(node('line', { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, class: 'chart-grid' }));
  bars.forEach((b, i) => {
    const h = (b.value / max) * (H - pad.t - pad.b);
    const x = pad.l + i * bw + bw * 0.18;
    if (b.value > 0) {
      svg.append(node('rect', { x, y: H - pad.b - h, width: bw * 0.64, height: h, class: b.current ? 'chart-bar is-current' : 'chart-bar' }));
      svg.append(node('text', { x: x + bw * 0.32, y: H - pad.b - h - 4, 'text-anchor': 'middle', class: 'chart-label' }, String(b.value)));
    }
    const text = label(b, i);
    if (text) svg.append(node('text', { x: x + bw * 0.32, y: H - 6, 'text-anchor': 'middle', class: 'chart-label' }, text));
  });
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.append(svg);
  return wrap;
}
