import { useState, useEffect, useCallback } from "react";
import type { AppSettings } from "../lib/types";
import { DEFAULT_SETTINGS } from "../lib/types";
import { getSettings, saveSettings } from "../lib/tauri-bridge";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {
        // Backend not ready, use defaults
      });
  }, []);

  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    try {
      await saveSettings(newSettings);
    } catch {
      // Backend not ready
    }
  }, [settings]);

  return { settings, updateSettings };
}
