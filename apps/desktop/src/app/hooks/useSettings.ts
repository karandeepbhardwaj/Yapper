import { useState, useEffect, useCallback } from "react";
import { DEFAULT_SETTINGS } from "../lib/types";
import { getSettings, changeHotkey, changeSttEngine } from "../lib/tauri-bridge";

export function useSettings() {
  const [hotkey, setHotkeyState] = useState(DEFAULT_SETTINGS.hotkey);
  const [sttEngine, setSttEngineState] = useState<"classic" | "modern">(DEFAULT_SETTINGS.stt_engine);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setHotkeyState(s.hotkey);
        if (s.stt_engine) setSttEngineState(s.stt_engine);
      })
      .catch(() => {});
  }, []);

  const setHotkey = useCallback(async (newHotkey: string) => {
    try {
      console.log("[Settings] Changing hotkey to:", newHotkey);
      await changeHotkey(newHotkey);
      console.log("[Settings] Hotkey changed successfully");
      setHotkeyState(newHotkey);
    } catch (e) {
      console.error("[Settings] Hotkey change failed:", e);
    }
  }, []);

  const setSttEngine = useCallback(async (engine: "classic" | "modern") => {
    try {
      await changeSttEngine(engine);
      setSttEngineState(engine);
    } catch {
      // If change fails, don't update the UI
    }
  }, []);

  return { hotkey, setHotkey, sttEngine, setSttEngine };
}
