// Light / dark switch. Dark is the default; the visitor's choice is remembered in this browser only.
const KEY = 'zhq-theme';
const COLORS = { dark: '#05070c', light: '#f4f7fc' };

export function getTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' ? 'light' : 'dark';
}

export function setTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[t]);
  try { localStorage.setItem(KEY, t); } catch { /* private mode: the choice just won't persist */ }
  return t;
}
