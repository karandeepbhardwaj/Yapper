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
  hotkey: string;
  stt_engine: "classic" | "modern";
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "Cmd+Shift+.",
  stt_engine: "classic",
};
