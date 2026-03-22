// Message types shared between desktop app and VS Code extension

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

export type IncomingMessage = RefineRequest;
export type OutgoingMessage = ChunkResponse | ResultResponse | ErrorResponse;

export const BRIDGE_PORT = 9147;
export const BRIDGE_HOST = "127.0.0.1";
