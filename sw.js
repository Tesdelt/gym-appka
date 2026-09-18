// Service worker: offline cache. Při každém nasazení zvýšit VERSION
// a nové soubory doplnit do ASSETS.
const VERSION = '0.11.0';
const CACHE = `gym-app-v${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/fonts.css',
  'css/style.css',
  'js/app.js',
  'js/router.js',
  'js/db.js',
  'js/seed.js',
  'js/data.js',
  'js/ui.js',
  'js/diagnostics.js',
  'js/recommend.js',
  'js/records.js',
  'js/workout.js',
  'js/exercisePicker.js',
  'js/images.js',
  'js/builtinImages.js',
  'js/chart.js',
  'js/goals.js',
  'js/stats.js',
  'js/theme.js',
  'js/backup.js',
  'js/fx.js',
  'js/i18n.js',
  'js/i18n-en.js',
  'js/muscles.js',
  'js/catalog.js',
  'js/catalogView.js',
  'data/free-exercise-db.json',
  'data/free-exercise-db-cs.json',
  'data/free-exercise-db-en.json',
  'js/views/home.js',
  'js/views/stats.js',
  'js/views/goals.js',
  'js/views/exercises.js',
  'js/views/settings.js',
  'js/views/workout.js',
  'js/views/summary.js',
  'js/views/exercise.js',
  'js/views/template.js',
  'fonts/barlow-400-latin-ext.woff2',
  'fonts/barlow-400-latin.woff2',
  'fonts/barlow-500-latin-ext.woff2',
  'fonts/barlow-500-latin.woff2',
  'fonts/barlow-600-latin-ext.woff2',
  'fonts/barlow-600-latin.woff2',
  'fonts/barlow-700-latin-ext.woff2',
  'fonts/barlow-700-latin.woff2',
  'fonts/big-shoulders-display-700-latin-ext.woff2',
  'fonts/big-shoulders-display-700-latin.woff2',
  'fonts/big-shoulders-display-800-latin-ext.woff2',
  'fonts/big-shoulders-display-800-latin.woff2',
  'img/exercises/dip-0.jpg',
  'img/exercises/dip-1.jpg',
  'img/exercises/dumbbell-brachialis-curls-0.jpg',
  'img/exercises/dumbbell-brachialis-curls-1.jpg',
  'img/exercises/kladka-biceps-curls-0.jpg',
  'img/exercises/kladka-biceps-curls-1.jpg',
  'img/exercises/kladka-pull-row-0.jpg',
  'img/exercises/kladka-pull-row-1.jpg',
  'img/exercises/kladka-triceps-extension-0.jpg',
  'img/exercises/kladka-triceps-extension-1.jpg',
  'img/exercises/shoulder-lateral-raise-0.jpg',
  'img/exercises/shoulder-lateral-raise-1.jpg',
  'img/exercises/shoulder-press-dumbbell-0.jpg',
  'img/exercises/shoulder-press-dumbbell-1.jpg',
  'img/exercises/shyb-0.jpg',
  'img/exercises/shyb-1.jpg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' obejde HTTP cache prohlížeče, ať se nestáhne stará verze
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    // Nová verze převezme řízení hned; už načtená stránka doběhne ze svých
    // souborů a nová verze se projeví při dalším spuštění.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('gym-app-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      // náhledy katalogu se ukládají průběžně, jak je uživatel prohlíží
      if (response.ok && new URL(request.url).pathname.includes('/img/db/')) cache.put(request, response.clone());
      return response;
    } catch (err) {
      if (request.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
