import { useState } from 'react';
import { getTheme, setTheme } from '../lib/theme';

export default function ThemeToggle({ className = '' }) {
  const [theme, set] = useState(getTheme);
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button type="button" className={`theme-toggle ${className}`} onClick={() => set(setTheme(next))}
      aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <svg className="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
      <svg className="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    </button>
  );
}
