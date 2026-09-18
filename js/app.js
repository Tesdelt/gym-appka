import { addRoute, startRouter } from './router.js';
import { openDB, requestPersistentStorage } from './db.js';
import { seedIfEmpty } from './seed.js';
import * as home from './views/home.js';
import * as stats from './views/stats.js';
import * as goals from './views/goals.js';
import * as exercises from './views/exercises.js';
import * as settings from './views/settings.js';

addRoute('domu', home);
addRoute('statistiky', stats);
addRoute('cile', goals);
addRoute('cviky', exercises);
addRoute('nastaveni', settings);

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('screen-title');
const tabs = document.querySelectorAll('.tab');

init();

async function init() {
  try {
    await openDB();
    await seedIfEmpty();
  } catch (err) {
    console.error('Databáze se nepodařila otevřít', err);
    viewEl.innerHTML = `<section class="card"><h2 class="card-title">Chyba úložiště</h2>
      <p class="muted">Databázi appky se nepodařilo otevřít. ${escapeHtml(err?.message ?? '')}</p></section>`;
    return;
  }
  // Nečekáme na výsledek, jen požádáme (iOS rozhodne samo).
  requestPersistentStorage();

  startRouter(async (name, view) => {
    titleEl.textContent = view.title;
    viewEl.replaceChildren();
    viewEl.scrollTop = 0;
    tabs.forEach((tab) => {
      const active = tab.dataset.route === name;
      tab.classList.toggle('is-active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    try {
      await view.render(viewEl);
    } catch (err) {
      console.error(err);
      viewEl.innerHTML = `<section class="card"><h2 class="card-title">Něco se pokazilo</h2>
        <p class="muted">${escapeHtml(err?.message ?? String(err))}</p></section>`;
    }
  });

  registerServiceWorker();
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Když řízení převezme nová verze, nabídneme načtení. Jinak se projeví
  // sama při dalším spuštění appky.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) document.getElementById('update-bar').hidden = false;
  });
  document.getElementById('update-reload').addEventListener('click', () => location.reload());

  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    // Appka na ploše iPhonu se často jen probouzí z pozadí, bez nového
    // načtení stránky, proto kontrolujeme novou verzi při každém návratu.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (err) {
    console.error('Registrace service workeru selhala', err);
  }
}
