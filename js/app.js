import { addRoute, startRouter } from './router.js';
import { openDB, requestPersistentStorage } from './db.js';
import { seedIfEmpty, translateDbExercises, upgradeExerciseData, applyRestRule, fixCableCurl } from './seed.js';
import { transition } from './fx.js';
import { fillMissingImages } from './catalog.js';
import { t, lang } from './i18n.js';
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
const actionEl = document.getElementById('actionbar');
const tabs = document.querySelectorAll('.tab');

translateStatic();
init();

async function init() {
  try {
    await openDB();
    await seedIfEmpty();
    await translateDbExercises().catch((err) => console.error(err));
    await upgradeExerciseData().catch((err) => console.error(err));
    await applyRestRule().catch((err) => console.error(err));
    await fixCableCurl().catch((err) => console.error(err));
  } catch (err) {
    console.error('Databáze se nepodařila otevřít', err);
    viewEl.innerHTML = `<section class="card"><h2 class="card-title">${t('Chyba úložiště')}</h2>
      <p class="muted">${t('Databázi appky se nepodařilo otevřít.')} ${escapeHtml(err?.message ?? '')}</p></section>`;
    return;
  }
  // Nečekáme na výsledek, jen požádáme (iOS rozhodne samo).
  requestPersistentStorage();
  // fotky cviků přidaných bez internetu
  fillMissingImages().catch(() => {});
  window.addEventListener('online', () => fillMissingImages().catch(() => {}));

  const TAB_ORDER = ['statistiky', 'cile', 'domu', 'cviky', 'nastaveni'];
  let prev = null;

  // Pozice posunutí každé navštívené stránky; po návratu Zpět se obnoví
  const scrollMemory = new Map();
  let currentHash = location.hash;
  const restoreScroll = (top) => {
    // obsah se může dotahovat postupně (katalog), proto několik pokusů
    let tries = 0;
    const step = () => {
      viewEl.scrollTop = top;
      if (Math.abs(viewEl.scrollTop - top) > 2 && tries++ < 30) setTimeout(step, 60);
    };
    requestAnimationFrame(step);
  };

  startRouter(async (name, view, params, isBack) => {
    scrollMemory.set(currentHash, viewEl.scrollTop);
    currentHash = location.hash;
    const savedTop = isBack ? scrollMemory.get(currentHash) : null;
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
      actionEl.replaceChildren();
      viewEl.className = 'view';
      viewEl.replaceChildren();
      viewEl.scrollTop = 0;
      tabs.forEach((tabEl) => {
        const active = tabEl.dataset.route === tab;
        tabEl.classList.toggle('is-active', active);
        if (active) tabEl.setAttribute('aria-current', 'page');
        else tabEl.removeAttribute('aria-current');
      });
      try {
        await view.render(viewEl, { params, extraEl, titleEl, actionEl });
      } catch (err) {
        console.error(err);
        viewEl.innerHTML = `<section class="card"><h2 class="card-title">${t('Něco se pokazilo')}</h2>
          <p class="muted">${escapeHtml(err?.message ?? String(err))}</p></section>`;
      }
    };
    if (first) await update();
    else await transition(isBack ? 'back' : direction, update);
    if (savedTop) restoreScroll(savedTop);
  });

  registerServiceWorker();
}

// Texty přímo v index.html (lišta, pruh s novou verzí)
function translateStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
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
