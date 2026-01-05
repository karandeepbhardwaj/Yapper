export type WidgetState = "idle" | "listening" | "processing";

export interface HistoryItem {
  id: string;
  timestamp: string;
  refinedText: string;
  rawTranscript: string;
  category?: string;
  isPinned?: boolean;
  title?: string;
}

export interface AppSettings {
  autoStopAfterSilence: boolean;
  showFloatingWidget: boolean;
  language: string;
  refinementStyle: string;
  hotkey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoStopAfterSilence: true,
  showFloatingWidget: true,
  language: "en-US",
  refinementStyle: "Professional",
  hotkey: "Cmd+Shift+.",
};
