import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { WidgetState, HistoryItem } from "../lib/types";

interface SttResult {
  rawTranscript: string;
  refinedText: string;
  category?: string;
  title?: string;
}

export function useTauriEvents() {
  const [, setWidgetState] = useState<WidgetState>("idle");
  const [latestResult, setLatestResult] = useState<HistoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const listeners = [
      listen<string>("stt-state-changed", (event) => {
        setWidgetState(event.payload as WidgetState);
      }),
      listen<SttResult>("refinement-complete", (event) => {
        const item: HistoryItem = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          refinedText: event.payload.refinedText,
          rawTranscript: event.payload.rawTranscript,
          category: event.payload.category,
          title: event.payload.title,
        };
        setLatestResult(item);
        setWidgetState("idle");
      }),
      listen<string>("stt-error", (event) => {
        setError(event.payload);
        setWidgetState("idle");
      }),
    ];

    return () => {
      listeners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  return { latestResult, error, setError };
}
