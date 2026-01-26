// Message types shared between desktop app and VS Code extension

// --- Refinement (existing) ---

export interface RefineRequest {
  type: "refine";
  id: string;
  rawText: string;
  style?: "Professional" | "Casual" | "Technical" | "Creative";
  styleOverrides?: Record<string, string>;
  codeMode?: boolean;
  model?: string;
}

export interface ChunkResponse {
  type: "chunk";
  id: string;
  refinedText: string;
}

export interface ResultResponse {
  type: "result";
  id: string;
  refinedText: string;
  category?: string;
  title?: string;
}

export interface ErrorResponse {
  type: "error";
  id: string;
  error: string;
}

// --- Conversation ---

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationRequest {
  type: "conversation";
  id: string;
  turnId: string;
  history: ConversationTurn[];
  userMessage: string;
  model?: string;
}

export interface ConversationChunkResponse {
  type: "conversation_chunk";
  id: string;
  turnId: string;
  content: string;
}

export interface ConversationResultResponse {
  type: "conversation_result";
  id: string;
  turnId: string;
  content: string;
}

// --- Summarize ---

export interface SummarizeRequest {
  type: "summarize";
  id: string;
  history: ConversationTurn[];
  model?: string;
}

export interface SummarizeResultResponse {
  type: "summarize_result";
  id: string;
  summary: string;
  title: string;
  keyPoints?: string[];
}

// --- Command ---

export interface CommandRequest {
  type: "command";
  id: string;
  rawText: string;
  clipboard: string | null;
  style?: "Professional" | "Casual" | "Technical" | "Creative";
  styleOverrides?: Record<string, string>;
  codeMode?: boolean;
  model?: string;
}

export interface ClassifiedAction {
  intent: "dictation" | "translate" | "summarize" | "draft" | "explain" | "unknown";
  params?: Record<string, string>;
  inputSource?: "spoken" | "clipboard" | "previous";
  description?: string;
}

export interface ClassifiedIntent {
  intent: "dictation" | "translate" | "summarize" | "draft" | "explain" | "unknown" | "chain";
  params?: Record<string, string>;
  inputSource?: "spoken" | "clipboard" | "previous";
  description?: string;
  actions?: ClassifiedAction[];
}

export interface CommandResultResponse {
  type: "command_result";
  id: string;
  result: string;
  action: string;
  params?: Record<string, string>;
}

// --- Model listing ---

export interface ListModelsRequest {
  type: "list-models";
  id: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  vendor: string;
  family: string;
}

export interface ListModelsResponse {
  type: "models-list";
  id: string;
  models: ModelInfo[];
}

// --- Union types ---

export type IncomingMessage = RefineRequest | ConversationRequest | SummarizeRequest | CommandRequest | ListModelsRequest;
export type OutgoingMessage =
  | ChunkResponse
  | ResultResponse
  | ErrorResponse
  | ConversationChunkResponse
  | ConversationResultResponse
  | SummarizeResultResponse
  | CommandResultResponse
  | ListModelsResponse;

export const BRIDGE_PORT = 9147;
export const BRIDGE_HOST = "127.0.0.1";
export const BRIDGE_TOKEN_DIR = ".yapper";
export const BRIDGE_TOKEN_FILE = "bridge-token";
