export type WidgetState = "idle" | "listening" | "processing" | "conversation";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ConversationData {
  turns: ConversationTurn[];
  keyPoints?: string[];
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  refinedText: string;
  rawTranscript: string;
  category?: string;
  isPinned?: boolean;
  title?: string;
  entryType?: "transcription" | "conversation";
  conversation?: ConversationData;
  durationSeconds?: number;
  action?: string;
  actionParams?: Record<string, string>;
}

export interface ConversationSummary {
  summary: string;
  title: string;
  keyPoints: string[];
  turnCount: number;
  durationSeconds: number;
}

export interface AppSettings {
  hotkey: string;
  default_style: string;
  style_overrides: Record<string, string>;
  metrics_enabled: boolean;
  code_mode: boolean;
  recording_mode: string;
  conversation_hotkey: string;
  theme: string;               // "light" | "dark" | "system"
  whisper_model: string;
  whisper_language: string;
  streaming_enabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "Cmd+Shift+.",
  default_style: "Professional",
  style_overrides: {},
  metrics_enabled: true,
  code_mode: false,
  recording_mode: "toggle",
  conversation_hotkey: "Cmd+Shift+Y",
  theme: "system",
  whisper_model: "",
  whisper_language: "auto",
  streaming_enabled: false,
};

export interface DictionaryEntry {
  id: string;
  shorthand: string;
  expansion: string;
  category: string;
  isFavorite?: boolean;
  createdAt: string;
}

export interface Snippet {
  id: string;
  trigger: string;
  expansion: string;
  category: string;
  isFavorite?: boolean;
  createdAt: string;
}

export interface Metrics {
  streakDays: number;
  totalWords: number;
  avgWpm: number;
  totalEntries: number;
  totalDurationSeconds: number;
}
