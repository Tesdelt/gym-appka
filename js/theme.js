// Tmavý / světlý režim. Volba je uložená v zařízení (localStorage), výchozí tmavý.

const KEY = 'gym-theme';
const BAR = { dark: '#0A0A0A', light: '#0A0A0A' }; // horní lišta zůstává tmavá kvůli stavovému řádku iOS

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* soukromý režim apod. */ }
  applyTheme(theme);
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
}
