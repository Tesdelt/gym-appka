// Karta „Kontrola instalace“: ověření, že appka běží z plochy a funguje offline.

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
    <h2 class="card-title">Kontrola instalace</h2>
    <dl class="kv">
      <div class="kv-row"><dt>Režim</dt><dd data-k="mode">…</dd></div>
      <div class="kv-row"><dt>Offline</dt><dd data-k="offline">…</dd></div>
      <div class="kv-row"><dt>Připojení</dt><dd data-k="net">…</dd></div>
      <div class="kv-row"><dt>Verze</dt><dd data-k="version">…</dd></div>
    </dl>`;
  container.append(card);

  const set = (key, text, ok = true) => {
    const el = card.querySelector(`[data-k="${key}"]`);
    el.textContent = text;
    el.className = ok ? 'ok' : 'warn';
  };

  const refresh = async () => {
    if (!card.isConnected) return;
    set('mode', isStandalone() ? 'Appka z plochy' : 'Prohlížeč', isStandalone());
    set('net', navigator.onLine ? 'Online' : 'Offline');
    const version = await appVersion();
    const controlled = 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
    set('offline', version && controlled ? 'Připraveno' : version ? 'Připraveno po dalším spuštění' : 'Nepřipraveno', Boolean(version));
    set('version', version ?? '–');
  };

  refresh();
  // Service worker se instaluje na pozadí, stav proto chvíli obnovujeme.
  let ticks = 0;
  const timer = setInterval(() => {
    refresh();
    if (++ticks >= 10 || !card.isConnected) clearInterval(timer);
  }, 1000);
}
