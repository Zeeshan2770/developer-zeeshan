import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from './defaults';
import { getSettings } from './api';

const Ctx = createContext(DEFAULT_SETTINGS);
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => {
    let alive = true;
    getSettings().then(({ data }) => {
      if (alive && data) setSettings({ ...DEFAULT_SETTINGS, ...data });
    });
    return () => { alive = false; };
  }, []);
  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}
