import { useState, useEffect, useCallback } from "react";
import { DEFAULT_SETTINGS } from "../lib/types";
import { getSettings, changeHotkey } from "../lib/tauri-bridge";

export function useSettings() {
  const [hotkey, setHotkeyState] = useState(DEFAULT_SETTINGS.hotkey);

  useEffect(() => {
    getSettings()
      .then((s) => setHotkeyState(s.hotkey))
      .catch(() => {});
  }, []);

  const setHotkey = useCallback(async (newHotkey: string) => {
    try {
      await changeHotkey(newHotkey);
      setHotkeyState(newHotkey);
    } catch {
      // If registration fails (e.g. invalid combo), don't update the UI
    }
  }, []);

  return { hotkey, setHotkey };
}
