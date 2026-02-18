import { useState, useEffect, useCallback } from "react";
import type { HistoryItem } from "../lib/types";
import { getHistory } from "../lib/tauri-bridge";

export function useHistory() {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    getHistory()
      .then(setHistoryItems)
      .catch(() => {
        // Backend not ready yet, start with empty
      });
  }, []);

  const addItem = useCallback((item: HistoryItem) => {
    setHistoryItems((prev) => [item, ...prev]);
  }, []);

  return { historyItems, addItem };
}
