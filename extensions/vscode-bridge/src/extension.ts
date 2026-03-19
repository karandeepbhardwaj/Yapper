import * as vscode from "vscode";
import { WebSocketServer, WebSocket } from "ws";
import * as http from "http";
import { BRIDGE_PORT, BRIDGE_HOST } from "./protocol";
import type {
  IncomingMessage,
  ResultResponse,
  ErrorResponse,
  ConversationRequest,
  ConversationChunkResponse,
  ConversationResultResponse,
  SummarizeRequest,
  SummarizeResultResponse,
} from "./protocol";
import { refineWithCopilot, handleConversation, handleSummarize } from "./copilot-bridge";

let server: http.Server | undefined;
let wss: WebSocketServer | undefined;
let statusBarItem: vscode.StatusBarItem;
let connectedClients = 0;

export function activate(context: vscode.ExtensionContext) {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "promptRefinement.showStatus";
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("promptRefinement.startBridge", () => {
      startServer(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("promptRefinement.stopBridge", () => {
      stopServer();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("promptRefinement.showStatus", () => {
      const status = server
        ? `Bridge running on ${BRIDGE_HOST}:${BRIDGE_PORT} (${connectedClients} client(s))`
        : "Bridge not running";
      vscode.window.showInformationMessage(`Yapper: ${status}`);
    })
  );

  // Auto-start the bridge server
  startServer(context);
}

function startServer(context: vscode.ExtensionContext) {
  if (server) {
    vscode.window.showInformationMessage(
      "Yapper Bridge is already running."
    );
    return;
  }

  const httpServer = http.createServer();
  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket) => {
    connectedClients++;
    updateStatusBar();
    console.log(
      `[Yapper] Client connected (${connectedClients} total)`
    );

    ws.on("message", async (data: Buffer) => {
      try {
        const message: IncomingMessage = JSON.parse(data.toString());
        const tokenSource = new vscode.CancellationTokenSource();
        ws.on("close", () => tokenSource.cancel());

        try {
          switch (message.type) {
            case "refine":
              await handleRefine(ws, message, tokenSource);
              break;
            case "conversation":
              await handleConversationMessage(ws, message, tokenSource);
              break;
            case "summarize":
              await handleSummarizeMessage(ws, message, tokenSource);
              break;
            default:
              sendError(ws, (message as { id?: string }).id || "unknown", `Unknown message type: ${(message as { type: string }).type}`);
          }
        } catch (err) {
          const id = (message as { id?: string }).id || "unknown";
          const errorMessage =
            err instanceof vscode.LanguageModelError
              ? `Copilot error [${err.code}]: ${err.message}`
              : err instanceof Error
              ? err.message
              : "Unknown error";
          sendError(ws, id, errorMessage);
        } finally {
          tokenSource.dispose();
        }
      } catch (err) {
        console.error("[Yapper] Failed to parse message:", err);
        sendError(ws, "unknown", "Invalid message format");
      }
    });

    ws.on("close", () => {
      connectedClients = Math.max(0, connectedClients - 1);
      updateStatusBar();
      console.log(
        `[Yapper] Client disconnected (${connectedClients} remaining)`
      );
    });

    ws.on("error", (error: Error) => {
      console.error("[Yapper] WebSocket error:", error.message);
    });
  });

  httpServer.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    server = httpServer;
    console.log(
      `[Yapper] Bridge server started on ws://${BRIDGE_HOST}:${BRIDGE_PORT}`
    );
    updateStatusBar();
    vscode.window.showInformationMessage(
      `Yapper Bridge started on port ${BRIDGE_PORT}`
    );
  });

  httpServer.on("error", (err: Error) => {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      vscode.window.showErrorMessage(
        `Port ${BRIDGE_PORT} is already in use. Stop other instances first.`
      );
    } else {
      vscode.window.showErrorMessage(
        `Failed to start bridge: ${err.message}`
      );
    }
    server = undefined;
    updateStatusBar();
  });
}

async function handleRefine(
  ws: WebSocket,
  message: IncomingMessage & { type: "refine" },
  tokenSource: vscode.CancellationTokenSource
) {
  if (!message.rawText || message.rawText.trim().length === 0) {
    sendError(ws, message.id, "Empty transcript received");
    return;
  }

  console.log(
    `[Yapper] Refining text (${message.rawText.length} chars, style: ${message.style || "Professional"})`
  );

  const result = await refineWithCopilot(
    message.rawText,
    message.style || "Professional",
    tokenSource.token
  );

  const response: ResultResponse = {
    type: "result",
    id: message.id,
    refinedText: result.refinedText,
    category: result.category,
    title: result.title,
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

async function handleConversationMessage(
  ws: WebSocket,
  message: ConversationRequest,
  tokenSource: vscode.CancellationTokenSource
) {
  if (!message.userMessage || message.userMessage.trim().length === 0) {
    sendError(ws, message.id, "Empty conversation message received");
    return;
  }

  console.log(
    `[Yapper] Conversation turn (${message.history.length} prior turns, ${message.userMessage.length} chars)`
  );

  const result = await handleConversation(
    message.history,
    message.userMessage,
    tokenSource.token,
    (chunk) => {
      if (ws.readyState === WebSocket.OPEN) {
        const chunkResponse: ConversationChunkResponse = {
          type: "conversation_chunk",
          id: message.id,
          turnId: message.turnId,
          content: chunk,
        };
        ws.send(JSON.stringify(chunkResponse));
      }
    }
  );

  if (ws.readyState === WebSocket.OPEN) {
    const response: ConversationResultResponse = {
      type: "conversation_result",
      id: message.id,
      turnId: message.turnId,
      content: result.content,
    };
    ws.send(JSON.stringify(response));
  }
}

async function handleSummarizeMessage(
  ws: WebSocket,
  message: SummarizeRequest,
  tokenSource: vscode.CancellationTokenSource
) {
  if (!message.history || message.history.length === 0) {
    sendError(ws, message.id, "Empty conversation history");
    return;
  }

  console.log(
    `[Yapper] Summarizing conversation (${message.history.length} turns)`
  );

  const result = await handleSummarize(message.history, tokenSource.token);

  if (ws.readyState === WebSocket.OPEN) {
    const response: SummarizeResultResponse = {
      type: "summarize_result",
      id: message.id,
      summary: result.summary,
      title: result.title,
      keyPoints: result.keyPoints,
    };
    ws.send(JSON.stringify(response));
  }
}

function stopServer() {
  if (wss) {
    wss.clients.forEach((client) => client.close());
    wss.close();
    wss = undefined;
  }

  if (server) {
    server.close();
    server = undefined;
  }

  connectedClients = 0;
  updateStatusBar();
  vscode.window.showInformationMessage("Yapper Bridge stopped.");
}

function sendError(ws: WebSocket, id: string, error: string) {
  const response: ErrorResponse = { type: "error", id, error };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

function updateStatusBar() {
  if (server) {
    statusBarItem.text = `$(radio-tower) Yapper${connectedClients > 0 ? ` (${connectedClients})` : ""}`;
    statusBarItem.tooltip = `Yapper Bridge - ${connectedClients} client(s) connected`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(radio-tower) Yapper (off)";
    statusBarItem.tooltip = "Yapper Bridge - Not running";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }
  statusBarItem.show();
}

export function deactivate() {
  stopServer();
}
