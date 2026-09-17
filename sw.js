// Service worker: offline cache. Při každém nasazení zvýšit VERSION
// a nové soubory doplnit do ASSETS.
const VERSION = '0.1.0';
const CACHE = `gym-app-v${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/router.js',
  'js/diagnostics.js',
  'js/views/home.js',
  'js/views/stats.js',
  'js/views/goals.js',
  'js/views/exercises.js',
  'js/views/settings.js',
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
      return await fetch(request);
    } catch (err) {
      if (request.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
