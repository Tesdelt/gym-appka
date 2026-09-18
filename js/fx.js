// Efekty a animace. Vše krátké (do ~250 ms, oslava ~600 ms) a respektuje
// systémové nastavení „Omezit pohyb“.

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
// lehké pružení (překmit a návrat)
export const EASE_SPRING = 'linear(0, 0.21 6%, 0.66 16%, 0.99 28%, 1.07 36%, 1.08 42%, 1.04 54%, 1 70%, 0.99 84%, 1)';

// Oslava rekordu / cíle: zlatorudý záblesk po krajích obrazovky a jemné zatřesení
export function celebrate() {
  const flash = document.createElement('div');
  flash.className = 'fx-flash';
  document.body.append(flash);
  flash.addEventListener('animationend', () => flash.remove(), { once: true });
  setTimeout(() => flash.remove(), 1200);
  shake([
    { transform: 'none' },
    { transform: 'translateX(-4px)' },
    { transform: 'translateX(4px)' },
    { transform: 'translateX(-3px)' },
    { transform: 'translateX(2px)' },
    { transform: 'none' },
  ], 320);
}

// Otřes celé appky. Animace se po skončení zruší (cancel) a styl se vyčistí,
// aby na iOS nezůstal „viset“ rozpracovaný posun.
let shaking = null;
export function shake(keyframes, duration) {
  if (reducedMotion()) return;
  const app = document.getElementById('app');
  if (!app?.animate) return;
  shaking?.cancel();
  const anim = app.animate(keyframes, { duration, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' });
  shaking = anim;
  const clean = () => {
    anim.cancel();
    if (shaking === anim) shaking = null;
    app.style.transform = '';
  };
  anim.finished.then(clean, clean);
  setTimeout(clean, duration + 150);
}

// Číslo se „přetočí“: nová hodnota přijede zespodu (nahoru) nebo shora (dolů)
export function roll(node, direction) {
  if (reducedMotion() || !node.animate) return;
  node.animate([
    { transform: `translateY(${direction > 0 ? 45 : -45}%)`, opacity: 0 },
    { transform: 'none', opacity: 1 },
  ], { duration: 180, easing: EASE_OUT });
}

// Počítadlo od nuly k hodnotě (text se zformátuje funkcí fmt)
export function countUp(node, to, fmt = (v) => String(Math.round(v)), duration = 500) {
  if (reducedMotion() || !Number.isFinite(to) || to === 0) { node.textContent = fmt(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    node.textContent = fmt(t < 1 ? to * eased : to);
    if (t < 1) requestAnimationFrame(step);
  };
  node.textContent = fmt(0);
  requestAnimationFrame(step);
}

// Karta odjede do strany (dir 1 = doleva, vpřed; -1 = doprava, zpět)
export function slideOut(node, dir) {
  if (reducedMotion() || !node.animate) return Promise.resolve();
  return node.animate([
    { transform: 'none', opacity: 1 },
    { transform: `translateX(${dir * -28}%)`, opacity: 0 },
  ], { duration: 130, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.catch(() => {});
}

export function slideIn(node, dir) {
  if (reducedMotion() || !node.animate) return;
  node.animate([
    { transform: `translateX(${dir * 28}%)`, opacity: 0 },
    { transform: 'none', opacity: 1 },
  ], { duration: 220, easing: EASE_OUT });
}

// Přejetí prstem doleva / doprava po prvku
export function onSwipe(node, { left, right }) {
  let x0 = null;
  let y0 = null;
  node.addEventListener('touchstart', (e) => {
    if (e.target.closest('input, textarea, .stepper-row')) { x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  node.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 45) return;
    if (dx < 0) left?.();
    else right?.();
  }, { passive: true });
}

// Přechod mezi obrazovkami (View Transitions API, jinak jednoduché prolnutí)
export async function transition(direction, update) {
  const root = document.documentElement;
  root.dataset.nav = direction;
  if (!document.startViewTransition || reducedMotion()) {
    await update();
    const view = document.getElementById('view');
    if (!reducedMotion()) {
      view.classList.remove('fx-enter');
      void view.offsetWidth;
      view.classList.add('fx-enter');
    }
    return;
  }
  const t = document.startViewTransition(update);
  try { await t.updateCallbackDone; } catch { /* chyba vykreslení se hlásí jinde */ }
}

// Vlna z bodu (x, y) přes celou obrazovku; uprostřed dráhy lehce zesílí
export function shockwave(x, y) {
  const layer = document.createElement('div');
  layer.className = 'fx-wave';
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) * 2;
  layer.style.setProperty('--x', `${x}px`);
  layer.style.setProperty('--y', `${y}px`);
  layer.style.setProperty('--r', `${reach}px`);
  layer.innerHTML = '<div class="fx-wave-glow"></div><div class="fx-wave-ring"></div>';
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1000);
  shake([
    { transform: 'none' },
    { transform: 'scale(0.992)', offset: 0.35 },
    { transform: 'scale(1.004)', offset: 0.6 },
    { transform: 'none' },
  ], 600);
}
