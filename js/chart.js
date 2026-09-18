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
  let vMin = Math.min(...data.map((p) => p.v));
  let vMax = Math.max(...data.map((p) => p.v));
  if (vMin === vMax) { vMin -= 1; vMax += 1; }
  const span = vMax - vMin;
  vMin -= span * 0.1;
  vMax += span * 0.1;
  const x = (t) => (t1 === t0 ? (pad.l + W - pad.r) / 2 : pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - vMin) / (vMax - vMin)) * (H - pad.t - pad.b);

  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });

  // vodorovné linky: min, střed, max
  const ticks = [vMin + (vMax - vMin) * 0.1, (vMin + vMax) / 2, vMax - (vMax - vMin) * 0.1];
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
    svg.append(node('path', { d, class: 'chart-line' }));
  }
  for (const p of data) {
    svg.append(node('circle', { cx: x(p.t), cy: y(p.v), r: p.gold ? 4.5 : 3, class: p.gold ? 'chart-dot is-gold' : 'chart-dot' }));
  }
  const last = data[data.length - 1];
  svg.setAttribute('aria-label', `Graf, poslední hodnota ${format(last.v)}`);
  wrap.append(svg);
  return wrap;
}
