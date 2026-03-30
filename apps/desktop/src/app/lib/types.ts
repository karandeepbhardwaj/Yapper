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
  stt_engine: "classic" | "modern";
  default_style: string;
  style_overrides: Record<string, string>;
  metrics_enabled: boolean;
  code_mode: boolean;
  recording_mode: string;
  conversation_hotkey: string;
  ai_provider_mode: string;    // "vscode" | "apikey"
  ai_provider: string;         // "groq" | "anthropic"
  ai_api_key: string;          // the actual key
  vscode_model: string;
  ai_model: string;
  theme: string;               // "light" | "dark" | "system"
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "Cmd+Shift+.",
  stt_engine: "classic",
  default_style: "Professional",
  style_overrides: {},
  metrics_enabled: true,
  code_mode: false,
  recording_mode: "toggle",
  conversation_hotkey: "Cmd+Shift+Y",
  ai_provider_mode: "vscode",
  ai_provider: "",
  ai_api_key: "",
  vscode_model: "",
  ai_model: "",
  theme: "system",
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
