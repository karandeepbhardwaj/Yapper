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
  ollama_model: string;        // local LLM, e.g. "llama3.2"
  ollama_url: string;          // e.g. "http://localhost:11434"
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
  ollama_model: "llama3.2",
  ollama_url: "http://localhost:11434",
  theme: "system",
  whisper_model: "",
  whisper_language: "auto",
  streaming_enabled: true,
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

export interface ModelInfo {
  name: string;
  size: string;
  description: string;
}

export interface ModelDownloadProgress {
  model: string;
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
}

export const WHISPER_MODELS: ModelInfo[] = [
  { name: "tiny", size: "75 MB", description: "Fastest, decent accuracy" },
  { name: "base", size: "150 MB", description: "Good balance of speed and accuracy" },
  { name: "small", size: "500 MB", description: "Great accuracy, moderate speed" },
  { name: "medium", size: "1.5 GB", description: "Excellent accuracy, slower" },
  { name: "large-v3", size: "3 GB", description: "Best accuracy, slowest" },
];
