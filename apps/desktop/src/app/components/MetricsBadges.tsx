import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Metrics } from "../lib/types";

function formatWords(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

export default function MetricsBadges() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const refresh = useCallback(() => {
    invoke<Metrics>("get_metrics")
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const listeners = [
      listen("refinement-complete", refresh),
      listen("conversation-ended", refresh),
      listen("stt-state-changed", (e) => {
        if ((e.payload as string) === "idle") refresh();
      }),
    ];
    return () => { listeners.forEach((p) => p.then((fn) => fn())); };
  }, [refresh]);

  if (
    !metrics ||
    (metrics.streakDays === 0 && metrics.totalWords === 0 && metrics.avgWpm === 0)
  ) {
    return null;
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontSize: 10,
      color: "var(--yapper-text-secondary)",
      opacity: 0.6,
    }}>
      <span>{metrics.streakDays}d streak</span>
      <span style={{ opacity: 0.3 }}>·</span>
      <span>{formatWords(metrics.totalWords)} words</span>
      <span style={{ opacity: 0.3 }}>·</span>
      <span>{Math.round(metrics.avgWpm)} wpm</span>
    </div>
  );
}
