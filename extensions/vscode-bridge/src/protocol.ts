// Message types shared between desktop app and VS Code extension

// --- Refinement (existing) ---

export interface RefineRequest {
  type: "refine";
  id: string;
  rawText: string;
  style?: "Professional" | "Casual" | "Technical" | "Creative";
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
}

export interface SummarizeResultResponse {
  type: "summarize_result";
  id: string;
  summary: string;
  title: string;
  keyPoints?: string[];
}

// --- Union types ---

export type IncomingMessage = RefineRequest | ConversationRequest | SummarizeRequest;
export type OutgoingMessage =
  | ChunkResponse
  | ResultResponse
  | ErrorResponse
  | ConversationChunkResponse
  | ConversationResultResponse
  | SummarizeResultResponse;

export const BRIDGE_PORT = 9147;
export const BRIDGE_HOST = "127.0.0.1";
