import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_SETTINGS } from "../lib/types";
import { getSettings, changeHotkey } from "../lib/tauri-bridge";

export function useSettings() {
  const [hotkey, setHotkeyState] = useState(DEFAULT_SETTINGS.hotkey);
  const [conversationHotkey, setConversationHotkeyState] = useState(DEFAULT_SETTINGS.conversation_hotkey);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setHotkeyState(s.hotkey);
        if (s.conversation_hotkey) setConversationHotkeyState(s.conversation_hotkey);
      })
      .catch((e) => console.error("Failed to load settings:", e));

    const unsub = listen<string>("hotkey-changed", (event) => {
      if (event.payload) setHotkeyState(event.payload);
    });
    return () => { unsub.then((fn) => fn()); };
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

  return { hotkey, setHotkey, conversationHotkey };
}
