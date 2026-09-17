// Jednoduchý hash router: #/domu, #/statistiky, ...
const routes = new Map();
let fallback = null;

export function addRoute(name, view) {
  routes.set(name, view);
  if (!fallback) fallback = name;
}

export function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  return routes.has(name) ? name : fallback;
}

export function startRouter(onChange) {
  const handle = () => {
    const name = currentRoute();
    onChange(name, routes.get(name));
  };
  window.addEventListener('hashchange', handle);
  handle();
}
