import { useState, useEffect, useCallback } from "react";
import type { HistoryItem } from "../lib/types";
import { getHistory, clearHistory as clearHistoryApi, deleteHistoryItem as deleteHistoryItemApi, togglePinItem as togglePinItemApi } from "../lib/tauri-bridge";

export function useHistory() {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    getHistory()
      .then((items) => {
        setHistoryItems(items);
      })
      .catch((e) => {
        console.error("Failed to load history:", e);
      });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const items = await getHistory();
      setHistoryItems(items);
    } catch (e) {
      console.error("Failed to refresh history:", e);
    }
  }, []);

  const addItem = useCallback((item: HistoryItem) => {
    setHistoryItems((prev) => [item, ...prev]);
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await clearHistoryApi();
    } catch (e) { console.error("Failed to clear history:", e); }
    setHistoryItems([]);
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    try {
      await deleteHistoryItemApi(id);
    } catch (e) { console.error("Failed to delete history item:", e); }
    setHistoryItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const togglePin = useCallback(async (id: string) => {
    try {
      await togglePinItemApi(id);
    } catch (e) { console.error("Failed to toggle pin item:", e); }
    setHistoryItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isPinned: !item.isPinned } : item
      )
    );
  }, []);

  return { historyItems, addItem, refresh, clearAll, deleteItem, togglePin };
}
