import { addRoute, startRouter } from './router.js';
import { openDB, requestPersistentStorage } from './db.js';
import { seedIfEmpty, translateDbExercises } from './seed.js';
import { applyTheme } from './theme.js';
import { transition } from './fx.js';
import * as home from './views/home.js';
import * as stats from './views/stats.js';
import * as goals from './views/goals.js';
import * as exercises from './views/exercises.js';
import * as settings from './views/settings.js';
import * as workout from './views/workout.js';
import * as summary from './views/summary.js';
import * as exercise from './views/exercise.js';
import * as template from './views/template.js';

addRoute('domu', home);
addRoute('statistiky', stats);
addRoute('cile', goals);
addRoute('cviky', exercises);
addRoute('nastaveni', settings);
addRoute('trenink', workout);
addRoute('souhrn', summary);
addRoute('cvik', exercise);
addRoute('sablona', template);

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('screen-title');
const extraEl = document.getElementById('topbar-extra');
const tabs = document.querySelectorAll('.tab');

applyTheme();
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
  translateDbExercises().catch((err) => console.error(err));

  const TAB_ORDER = ['statistiky', 'cile', 'domu', 'cviky', 'nastaveni'];
  let prev = null;

  startRouter(async (name, view, params) => {
    const tab = view.tab ?? name;
    const depth = params.length + (TAB_ORDER.includes(name) ? 0 : 1);
    let direction = 'fade';
    if (prev && prev.tab !== tab) direction = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(prev.tab) ? 'next' : 'prev';
    else if (prev && depth !== prev.depth) direction = depth > prev.depth ? 'forward' : 'back';
    const first = !prev;
    prev = { tab, depth };

    const update = async () => {
      titleEl.className = 'screen-title';
      titleEl.textContent = view.title;
      extraEl.replaceChildren();
      viewEl.className = 'view';
      viewEl.replaceChildren();
      viewEl.scrollTop = 0;
      tabs.forEach((t) => {
        const active = t.dataset.route === tab;
        t.classList.toggle('is-active', active);
        if (active) t.setAttribute('aria-current', 'page');
        else t.removeAttribute('aria-current');
      });
      try {
        await view.render(viewEl, { params, extraEl, titleEl });
      } catch (err) {
        console.error(err);
        viewEl.innerHTML = `<section class="card"><h2 class="card-title">Něco se pokazilo</h2>
          <p class="muted">${escapeHtml(err?.message ?? String(err))}</p></section>`;
      }
    };
    if (first) await update();
    else await transition(direction, update);
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
