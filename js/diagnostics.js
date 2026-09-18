// Karta „Kontrola instalace“: ověření, že appka běží z plochy, funguje offline
// a má trvalé úložiště.

import { storageEstimate, count } from './db.js';
import { formatBytes } from './ui.js';
import { t } from './i18n.js';

export function isStandalone() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export async function appVersion() {
  if (!('caches' in window)) return null;
  const keys = (await caches.keys()).filter((k) => k.startsWith('gym-app-v')).sort();
  return keys.length ? keys[keys.length - 1].replace('gym-app-v', '') : null;
}

export function renderDiagnostics(container) {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="card-title">${t('Kontrola instalace')}</h2>
    <dl class="kv">
      <div class="kv-row"><dt>${t('Režim')}</dt><dd data-k="mode">…</dd></div>
      <div class="kv-row"><dt>${t('Offline')}</dt><dd data-k="offline">…</dd></div>
      <div class="kv-row"><dt>${t('Připojení')}</dt><dd data-k="net">…</dd></div>
      <div class="kv-row"><dt>${t('Trvalé úložiště')}</dt><dd data-k="persist">…</dd></div>
      <div class="kv-row"><dt>${t('Obsazeno')}</dt><dd data-k="usage">…</dd></div>
      <div class="kv-row"><dt>${t('Data')}</dt><dd data-k="data">…</dd></div>
      <div class="kv-row"><dt>${t('Verze')}</dt><dd data-k="version">…</dd></div>
    </dl>`;
  container.append(card);

  const set = (key, text, ok = true) => {
    const el = card.querySelector(`[data-k="${key}"]`);
    el.textContent = text;
    el.className = ok ? 'ok' : 'warn';
  };

  const refresh = async () => {
    if (!card.isConnected) return;
    set('mode', isStandalone() ? t('Appka z plochy') : t('Prohlížeč'), isStandalone());
    set('net', navigator.onLine ? 'Online' : 'Offline');
    const version = await appVersion();
    const controlled = 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
    set('offline', version && controlled ? t('Připraveno') : version ? t('Připraveno po dalším spuštění') : t('Nepřipraveno'), Boolean(version));
    set('version', version ?? '–');

    let persisted = null;
    try { persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { /* nepodporováno */ }
    set('persist', persisted === true ? t('Ano') : persisted === false ? t('Ne') : t('Nezjištěno'), persisted !== false);

    const est = await storageEstimate();
    set('usage', est ? t('{used} z {total}', { used: formatBytes(est.usage), total: formatBytes(est.quota) }) : '–');

    try {
      const [gyms, exercises, templates, workouts] = await Promise.all(['gyms', 'exercises', 'templates', 'workouts'].map(count));
      set('data', t('{gyms} posil., {exercises} cviků, {templates} šablony, {workouts} trén.', { gyms, exercises, templates, workouts }));
    } catch {
      set('data', t('Databáze nedostupná'), false);
    }
  };

  refresh();
  // Service worker se instaluje na pozadí, stav proto chvíli obnovujeme.
  let ticks = 0;
  const timer = setInterval(() => {
    refresh();
    if (++ticks >= 10 || !card.isConnected) clearInterval(timer);
  }, 1000);
}
