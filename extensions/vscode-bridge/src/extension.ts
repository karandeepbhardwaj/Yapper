import * as vscode from "vscode";
import { WebSocketServer, WebSocket } from "ws";
import * as http from "http";
import { BRIDGE_PORT, BRIDGE_HOST } from "./protocol";
import type { RefineRequest, ResultResponse, ErrorResponse } from "./protocol";
import { refineWithCopilot } from "./copilot-bridge";

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
      vscode.window.showInformationMessage(`Prompt Refinement: ${status}`);
    })
  );

  // Auto-start the bridge server
  startServer(context);
}

function startServer(context: vscode.ExtensionContext) {
  if (server) {
    vscode.window.showInformationMessage(
      "Prompt Refinement Bridge is already running."
    );
    return;
  }

  const httpServer = http.createServer();
  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket) => {
    connectedClients++;
    updateStatusBar();
    console.log(
      `[Prompt Refinement] Client connected (${connectedClients} total)`
    );

    ws.on("message", async (data: Buffer) => {
      try {
        const message: RefineRequest = JSON.parse(data.toString());

        if (message.type !== "refine") {
          sendError(ws, message.id || "unknown", `Unknown message type: ${message.type}`);
          return;
        }

        if (!message.rawText || message.rawText.trim().length === 0) {
          sendError(ws, message.id, "Empty transcript received");
          return;
        }

        console.log(
          `[Prompt Refinement] Refining text (${message.rawText.length} chars, style: ${message.style || "Professional"})`
        );

        const tokenSource = new vscode.CancellationTokenSource();

        // Handle client disconnect during processing
        ws.on("close", () => tokenSource.cancel());

        try {
          const refinedText = await refineWithCopilot(
            message.rawText,
            message.style || "Professional",
            tokenSource.token
          );

          const response: ResultResponse = {
            type: "result",
            id: message.id,
            refinedText,
          };

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
          }
        } catch (err) {
          const errorMessage =
            err instanceof vscode.LanguageModelError
              ? `Copilot error [${err.code}]: ${err.message}`
              : err instanceof Error
              ? err.message
              : "Unknown error during refinement";

          sendError(ws, message.id, errorMessage);
        } finally {
          tokenSource.dispose();
        }
      } catch (err) {
        console.error("[Prompt Refinement] Failed to parse message:", err);
        sendError(ws, "unknown", "Invalid message format");
      }
    });

    ws.on("close", () => {
      connectedClients = Math.max(0, connectedClients - 1);
      updateStatusBar();
      console.log(
        `[Prompt Refinement] Client disconnected (${connectedClients} remaining)`
      );
    });

    ws.on("error", (error: Error) => {
      console.error("[Prompt Refinement] WebSocket error:", error.message);
    });
  });

  httpServer.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    server = httpServer;
    console.log(
      `[Prompt Refinement] Bridge server started on ws://${BRIDGE_HOST}:${BRIDGE_PORT}`
    );
    updateStatusBar();
    vscode.window.showInformationMessage(
      `Prompt Refinement Bridge started on port ${BRIDGE_PORT}`
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
  vscode.window.showInformationMessage("Prompt Refinement Bridge stopped.");
}

function sendError(ws: WebSocket, id: string, error: string) {
  const response: ErrorResponse = { type: "error", id, error };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

function updateStatusBar() {
  if (server) {
    statusBarItem.text = `$(radio-tower) PRS${connectedClients > 0 ? ` (${connectedClients})` : ""}`;
    statusBarItem.tooltip = `Prompt Refinement Bridge - ${connectedClients} client(s) connected`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(radio-tower) PRS (off)";
    statusBarItem.tooltip = "Prompt Refinement Bridge - Not running";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }
  statusBarItem.show();
}

export function deactivate() {
  stopServer();
}
