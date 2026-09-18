// Jednoduchý hash router: #/domu, #/statistiky, ...
const routes = new Map();
let fallback = null;

export function addRoute(name, view) {
  routes.set(name, view);
  if (!fallback) fallback = name;
}

export function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const name = routes.has(parts[0]) ? parts[0] : fallback;
  return { name, params: routes.has(parts[0]) ? parts.slice(1) : [] };
}

export function navigate(path) {
  location.hash = `#/${path}`;
}

// Zpět na předchozí stránku (včetně pozice, kam byla posunutá).
// Bez historie (např. otevřeno přímo) jde na záložní stránku.
let goingBack = false;
export function goBack(fallback = 'domu') {
  if (history.length > 1) {
    goingBack = true;
    history.back();
  } else {
    navigate(fallback);
  }
}

export function startRouter(onChange) {
  const handle = () => {
    const { name, params } = currentRoute();
    const back = goingBack;
    goingBack = false;
    onChange(name, routes.get(name), params, back);
  };
  window.addEventListener('hashchange', handle);
  handle();
}
