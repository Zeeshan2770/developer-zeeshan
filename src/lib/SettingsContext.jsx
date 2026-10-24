import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from './defaults';
import { getSettings } from './api';

const Ctx = createContext(DEFAULT_SETTINGS);
export const useSettings = () => useContext(Ctx);

// The last settings are cached in the browser so a returning visitor already knows the portrait URL on first paint
// (the image starts downloading immediately instead of waiting for the settings request to finish).
const CACHE_KEY = 'zhq-settings-v1';
const readCache = () => { try { const v = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const writeCache = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* private mode / quota */ } };

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const cached = readCache();
    return cached ? { ...DEFAULT_SETTINGS, ...cached, _ready: true } : DEFAULT_SETTINGS;
  });
  useEffect(() => {
    let alive = true;
    getSettings().then(({ data }) => {
      if (!alive) return;
      if (data) { setSettings({ ...DEFAULT_SETTINGS, ...data, _ready: true }); writeCache(data); }
      else setSettings((s) => ({ ...s, _ready: true }));
    });
    return () => { alive = false; };
  }, []);
  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}
