# Dynamic Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select their AI model from the desktop app, dynamically querying available models from the VS Code bridge and supporting model choice in API Key mode.

**Architecture:** Add a `model` field to all bridge protocol messages. The VS Code extension responds to a new `list-models` query and filters `selectChatModels()` by the requested model. The Rust backend passes the model from settings through all AI calls. The settings UI shows a model dropdown for both modes.

**Tech Stack:** TypeScript (VS Code extension), Rust/Tauri (backend), React (settings UI)

---

### Task 1: Add model field to protocol types

**Files:**
- Modify: `extensions/vscode-bridge/src/protocol.ts`

- [ ] **Step 1: Add model field to all request types and new list-models types**

Add `model?: string` to `RefineRequest`, `CommandRequest`, `ConversationRequest`, `SummarizeRequest`. Add new types for model listing.

```typescript
// Add to RefineRequest (after codeMode):
  model?: string;

// Add to CommandRequest (after codeMode):
  model?: string;

// Add to ConversationRequest (after userMessage):
  model?: string;

// Add to SummarizeRequest (after history):
  model?: string;

// Add before the Union types section:

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
```

Update the `IncomingMessage` union:
```typescript
export type IncomingMessage = RefineRequest | ConversationRequest | SummarizeRequest | CommandRequest | ListModelsRequest;
```

Update the `OutgoingMessage` union:
```typescript
export type OutgoingMessage =
  | ChunkResponse
  | ResultResponse
  | ErrorResponse
  | ConversationChunkResponse
  | ConversationResultResponse
  | SummarizeResultResponse
  | CommandResultResponse
  | ListModelsResponse;
```

- [ ] **Step 2: Compile the extension to verify types**

Run: `cd extensions/vscode-bridge && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add extensions/vscode-bridge/src/protocol.ts
git commit -m "feat: add model field to bridge protocol types"
```

---

### Task 2: VS Code extension handles list-models and passes model to LM calls

**Files:**
- Modify: `extensions/vscode-bridge/src/extension.ts`
- Modify: `extensions/vscode-bridge/src/copilot-bridge.ts`

- [ ] **Step 1: Add list-models handler in extension.ts**

In `extension.ts`, add a new case in the message switch (after the `"command"` case, around line 123):

```typescript
            case "list-models":
              await handleListModels(ws, message as ListModelsRequest);
              break;
```

Add the import for `ListModelsRequest` and `ListModelsResponse` at the top (update the existing import from `./protocol`):
```typescript
import type {
  IncomingMessage,
  ResultResponse,
  ErrorResponse,
  ConversationRequest,
  ConversationChunkResponse,
  ConversationResultResponse,
  SummarizeRequest,
  SummarizeResultResponse,
  CommandRequest,
  CommandResultResponse,
  ListModelsRequest,
  ListModelsResponse,
  ModelInfo,
} from "./protocol";
```

Add the handler function before `stopServer()`:

```typescript
async function handleListModels(ws: WebSocket, message: ListModelsRequest) {
  try {
    const models = await vscode.lm.selectChatModels();
    const modelList: ModelInfo[] = models.map((m) => ({
      id: m.id,
      name: m.name,
      vendor: m.vendor,
      family: m.family,
    }));

    const response: ListModelsResponse = {
      type: "models-list",
      id: message.id,
      models: modelList,
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to list models";
    sendError(ws, message.id, errorMessage);
  }
}
```

- [ ] **Step 2: Update copilot-bridge.ts to accept and use model parameter**

Update `callVscodeLm` to accept an optional model parameter and filter by it:

```typescript
async function callVscodeLm(
  systemPrompt: string,
  userPrompt: string,
  token: vscode.CancellationToken,
  model?: string,
): Promise<string> {
  let models: vscode.LanguageModelChat[];
  if (model) {
    // Try family match first, then id match, then fall back to all
    models = await vscode.lm.selectChatModels({ family: model });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({ id: model });
    }
    if (models.length === 0) {
      console.warn(`[Yapper] Requested model '${model}' not found, using first available`);
      models = await vscode.lm.selectChatModels();
    }
  } else {
    models = await vscode.lm.selectChatModels();
  }
  if (models.length === 0) {
    throw new Error("No AI model available. Install GitHub Copilot in VS Code.");
  }
  const selected = models[0];
  console.log(`[Yapper] Using vscode.lm: ${selected.name} (${selected.vendor}/${selected.family})`);
  const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(userPrompt),
  ];
  const response = await selected.sendRequest(messages, {}, token);
  const chunks: string[] = [];
  for await (const fragment of response.text) {
    chunks.push(fragment);
  }
  return chunks.join("");
}
```

Update `classifyIntent` — pass model through:

```typescript
export async function classifyIntent(
  rawText: string,
  token: vscode.CancellationToken,
  model?: string,
): Promise<ClassifiedIntent> {
  try {
    const result = await callVscodeLm(CLASSIFY_SYSTEM_PROMPT, rawText, token, model);
    const cleaned = result.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as ClassifiedIntent;
  } catch (err) {
    console.log("[Yapper] Classification failed, falling back to dictation:", err);
    return { intent: "dictation" };
  }
}
```

Update `executeAction` — pass model through:

```typescript
export async function executeAction(
  intent: string,
  params: Record<string, string> | undefined,
  input: string,
  description: string | undefined,
  token: vscode.CancellationToken,
  model?: string,
): Promise<string> {
  // ... (existing switch body unchanged, just pass model to callVscodeLm)
  return callVscodeLm(systemPrompt, userPrompt, token, model);
}
```

Update `handleCommand` — read model from message and pass through:

```typescript
export async function handleCommand(
  rawText: string,
  clipboard: string | null,
  style: string | undefined,
  styleOverrides: Record<string, string> | undefined,
  codeMode: boolean | undefined,
  token: vscode.CancellationToken,
  model?: string,
): Promise<CommandResult> {
  const classified = await classifyIntent(rawText, token, model);

  if (classified.intent === "dictation") {
    const refinement = await refineWithCopilot(rawText, style, token, styleOverrides, codeMode, model);
    return {
      result: refinement.refinedText,
      action: "dictation",
      params: { category: refinement.category, title: refinement.title },
    };
  }

  if (classified.intent === "chain" && classified.actions && classified.actions.length > 0) {
    let previousOutput: string | null = null;
    let lastAction: ClassifiedAction = classified.actions[classified.actions.length - 1];

    for (const action of classified.actions) {
      const input = resolveInput(action.inputSource, rawText, clipboard, previousOutput);
      previousOutput = await executeAction(action.intent, action.params, input, action.description, token, model);
    }

    return {
      result: previousOutput || "",
      action: "chain",
      params: {
        steps: classified.actions.map(a => a.intent).join(" + "),
        ...(lastAction.params || {}),
      },
    };
  }

  const input = resolveInput(classified.inputSource, rawText, clipboard, null);
  const result = await executeAction(classified.intent, classified.params, input, classified.description, token, model);

  return { result, action: classified.intent, params: classified.params };
}
```

Update `refineWithCopilot` — accept model param, use it for selectChatModels:

```typescript
export async function refineWithCopilot(
  rawText: string,
  style: string = "Professional",
  token: vscode.CancellationToken,
  styleOverrides?: Record<string, string>,
  codeMode?: boolean,
  model?: string,
): Promise<RefinementResult> {
  let extraContext = "";
  if (styleOverrides && Object.keys(styleOverrides).length > 0) {
    const overrideLines = Object.entries(styleOverrides)
      .map(([cat, s]) => `- If the content is "${cat}", use ${s} tone`)
      .join("\n");
    extraContext += `\n\nStyle overrides by category:\n${overrideLines}`;
  }
  if (codeMode) {
    const files = await getWorkspaceFiles();
    if (files.length > 0) {
      extraContext += `\n\nCode mode is ON. Known files in workspace: ${files.slice(0, 30).join(", ")}. Preserve code references (file names, variable names, function names) with backtick formatting.`;
    }
  }

  let models: vscode.LanguageModelChat[];
  if (model) {
    models = await vscode.lm.selectChatModels({ family: model });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({ id: model });
    }
    if (models.length === 0) {
      console.warn(`[Yapper] Requested model '${model}' not found, using first available`);
      models = await vscode.lm.selectChatModels();
    }
  } else {
    models = await vscode.lm.selectChatModels();
  }
  if (models.length === 0) {
    throw new Error("No AI model available. Install GitHub Copilot in VS Code.");
  }
  const selected = models[0];
  console.log(`[Yapper] Using vscode.lm: ${selected.name} (${selected.vendor}/${selected.family})`);
  const styleNote = STYLE_MODIFIERS[style] || STYLE_MODIFIERS["Professional"];
  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT + extraContext),
    vscode.LanguageModelChatMessage.User(`Style: ${styleNote}\n\nRaw transcript:\n\n${rawText}`),
  ];
  const response = await selected.sendRequest(messages, {}, token);
  const chunks: string[] = [];
  for await (const fragment of response.text) { chunks.push(fragment); }
  const result = chunks.join("").trim();
  if (!result) {
    throw new Error("vscode.lm returned an empty response.");
  }
  return parseResult(result);
}
```

Update `handleConversation` — accept model param:

```typescript
export async function handleConversation(
  history: ConversationTurn[],
  userMessage: string,
  token: vscode.CancellationToken,
  onChunk?: (chunk: string) => void,
  model?: string,
): Promise<ConversationResult> {
  let models: vscode.LanguageModelChat[];
  if (model) {
    models = await vscode.lm.selectChatModels({ family: model });
    if (models.length === 0) models = await vscode.lm.selectChatModels({ id: model });
    if (models.length === 0) models = await vscode.lm.selectChatModels();
  } else {
    models = await vscode.lm.selectChatModels();
  }
  if (models.length === 0) {
    throw new Error("No AI model available. Install GitHub Copilot in VS Code.");
  }
  const selected = models[0];
  console.log(`[Yapper] Conversation using vscode.lm: ${selected.name}`);

  // ... rest of function unchanged (use `selected` instead of `model` variable for sendRequest)
  const messages = [
    vscode.LanguageModelChatMessage.User(CONVERSATION_SYSTEM_PROMPT),
  ];
  for (const turn of history) {
    if (turn.role === "user") {
      messages.push(vscode.LanguageModelChatMessage.User(turn.content));
    } else {
      messages.push(vscode.LanguageModelChatMessage.Assistant(turn.content));
    }
  }
  messages.push(vscode.LanguageModelChatMessage.User(userMessage));

  const response = await selected.sendRequest(messages, {}, token);
  const chunks: string[] = [];
  for await (const fragment of response.text) {
    chunks.push(fragment);
    onChunk?.(fragment);
  }
  const content = chunks.join("").trim();
  if (!content) {
    throw new Error("vscode.lm returned an empty response.");
  }
  return { content };
}
```

Update `handleSummarize` — accept model param:

```typescript
export async function handleSummarize(
  history: ConversationTurn[],
  token: vscode.CancellationToken,
  model?: string,
): Promise<SummarizeResult> {
  const historyText = history
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  let models: vscode.LanguageModelChat[];
  if (model) {
    models = await vscode.lm.selectChatModels({ family: model });
    if (models.length === 0) models = await vscode.lm.selectChatModels({ id: model });
    if (models.length === 0) models = await vscode.lm.selectChatModels();
  } else {
    models = await vscode.lm.selectChatModels();
  }
  if (models.length === 0) {
    throw new Error("No AI model available. Install GitHub Copilot in VS Code.");
  }
  const selected = models[0];
  console.log(`[Yapper] Summarize using vscode.lm: ${selected.name}`);

  const messages = [
    vscode.LanguageModelChatMessage.User(SUMMARIZE_SYSTEM_PROMPT),
    vscode.LanguageModelChatMessage.User(`Conversation:\n\n${historyText}`),
  ];

  const response = await selected.sendRequest(messages, {}, token);
  const chunks: string[] = [];
  for await (const fragment of response.text) { chunks.push(fragment); }
  const result = chunks.join("").trim();
  if (!result) {
    throw new Error("vscode.lm returned an empty response.");
  }
  return parseSummarizeResult(result);
}
```

- [ ] **Step 3: Update extension.ts message handlers to pass model**

Update `handleRefine` to pass `message.model`:
```typescript
  const result = await refineWithCopilot(
    message.rawText,
    message.style || "Professional",
    tokenSource.token,
    message.styleOverrides,
    message.codeMode,
    message.model,
  );
```

Update `handleConversationMessage` to pass `message.model`:
```typescript
  const result = await handleConversation(
    message.history,
    message.userMessage,
    tokenSource.token,
    (chunk) => { /* existing chunk handler */ },
    message.model,
  );
```

Update `handleSummarizeMessage` to pass `message.model`:
```typescript
  const result = await handleSummarize(message.history, tokenSource.token, message.model);
```

Update `handleCommandMessage` to pass `message.model`:
```typescript
  const result = await handleCommand(
    message.rawText,
    message.clipboard,
    message.style,
    message.styleOverrides,
    message.codeMode,
    tokenSource.token,
    message.model,
  );
```

- [ ] **Step 4: Compile the extension**

Run: `cd extensions/vscode-bridge && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add extensions/vscode-bridge/src/extension.ts extensions/vscode-bridge/src/copilot-bridge.ts
git commit -m "feat: VS Code extension handles list-models and model selection"
```

---

### Task 3: Rust backend — add model to bridge structs and settings

**Files:**
- Modify: `apps/desktop/src-tauri/src/bridge.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Add model field to all bridge request structs in bridge.rs**

Add to `RefineRequest` (after `code_mode`):
```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
```

Add to `ConversationRequest` (after `user_message`):
```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
```

Add to `SummarizeRequest` (after `history`):
```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
```

Add to `CommandRequest` (after `code_mode`):
```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
```

- [ ] **Step 2: Add model parameter to all bridge public functions**

Update `refine_text` signature and pass model through:
```rust
pub async fn refine_text(
    raw_text: &str,
    style: Option<String>,
    style_overrides: Option<std::collections::HashMap<String, String>>,
    code_mode: Option<bool>,
    model: Option<String>,
) -> Result<RefinementResult, String> {
    let raw = raw_text.to_string();
    let result = tauri::async_runtime::spawn_blocking(move || {
        refine_text_blocking(&raw, style, style_overrides, code_mode, model)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;
    result
}
```

Update `refine_text_blocking` to accept and include model:
```rust
fn refine_text_blocking(
    raw_text: &str,
    style: Option<String>,
    style_overrides: Option<std::collections::HashMap<String, String>>,
    code_mode: Option<bool>,
    model: Option<String>,
) -> Result<RefinementResult, String> {
    let mut socket = open_bridge_socket()?;
    let request = RefineRequest {
        msg_type: "refine".to_string(),
        id: crate::store::uuid_simple(),
        raw_text: raw_text.to_string(),
        style,
        style_overrides,
        code_mode,
        model,
    };
    // ... rest unchanged
```

Apply the same pattern to `send_conversation_turn`, `summarize_conversation`, and `send_command` — add `model: Option<String>` parameter and pass it into the request struct.

- [ ] **Step 3: Add list_models function to bridge.rs**

Add new structs and function after the `CommandResult` struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeModelInfo {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub family: String,
}

pub async fn list_models() -> Result<Vec<BridgeModelInfo>, String> {
    let result = tauri::async_runtime::spawn_blocking(list_models_blocking)
        .await
        .map_err(|e| format!("Task failed: {}", e))?;
    result
}

fn list_models_blocking() -> Result<Vec<BridgeModelInfo>, String> {
    let mut socket = open_bridge_socket()?;

    let request = serde_json::json!({
        "type": "list-models",
        "id": crate::store::uuid_simple()
    });

    socket.send(tungstenite::Message::Text(request.to_string()))
        .map_err(|e| format!("Failed to send message: {}", e))?;

    loop {
        let msg = socket.read()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        match msg {
            tungstenite::Message::Text(text) => {
                let response: serde_json::Value = serde_json::from_str(&text)
                    .map_err(|e| format!("Invalid response: {}", e))?;

                if let Some(error) = response.get("error").and_then(|e| e.as_str()) {
                    return Err(error.to_string());
                }

                if response.get("type").and_then(|t| t.as_str()) == Some("models-list") {
                    let models: Vec<BridgeModelInfo> = response.get("models")
                        .and_then(|m| serde_json::from_value(m.clone()).ok())
                        .unwrap_or_default();
                    let _ = socket.close(None);
                    return Ok(models);
                }
            }
            tungstenite::Message::Close(_) => {
                return Err("Bridge closed connection".to_string());
            }
            _ => continue,
        }
    }
}
```

- [ ] **Step 4: Add model fields to AppSettings in commands.rs**

Add to `AppSettings` struct (after `ai_api_key`):
```rust
    #[serde(default)]
    pub vscode_model: String,         // model family/id for VS Code mode
    #[serde(default)]
    pub ai_model: String,             // model id for API Key mode
```

Add to `Default for AppSettings` (after `ai_api_key`):
```rust
            vscode_model: String::new(),
            ai_model: String::new(),
```

- [ ] **Step 5: Add list_bridge_models Tauri command**

Add to commands.rs (after `check_bridge_status`):

```rust
#[tauri::command]
pub async fn list_bridge_models() -> Result<Vec<bridge::BridgeModelInfo>, String> {
    bridge::list_models().await
}
```

Register it in `lib.rs` invoke_handler (add after `commands::check_bridge_status`):
```rust
            commands::list_bridge_models,
```

- [ ] **Step 6: Pass model through process_recording_result in commands.rs**

In the VS Code bridge path (around line 300), pass `settings.vscode_model`:
```rust
        match bridge::send_command(
            processed_transcript.clone(),
            clipboard,
            Some(settings.default_style.clone()),
            if settings.style_overrides.is_empty() { None } else { Some(settings.style_overrides.clone()) },
            if settings.code_mode { Some(true) } else { None },
            if settings.vscode_model.is_empty() { None } else { Some(settings.vscode_model.clone()) },
        ).await {
```

And in the refine_text fallback (around line 320):
```rust
                match bridge::refine_text(
                    &processed_transcript,
                    Some(settings.default_style.clone()),
                    if settings.style_overrides.is_empty() { None } else { Some(settings.style_overrides.clone()) },
                    if settings.code_mode { Some(true) } else { None },
                    if settings.vscode_model.is_empty() { None } else { Some(settings.vscode_model.clone()) },
                ).await {
```

- [ ] **Step 7: Pass model through conversation.rs bridge calls**

In `send_conversation_turn` (around line 120):
```rust
        bridge::send_conversation_turn(
            prior_history,
            user_text,
            move |chunk| { /* unchanged */ },
            if settings.vscode_model.is_empty() { None } else { Some(settings.vscode_model.clone()) },
        ).await?
```

In `end_conversation` (around line 195):
```rust
        bridge::summarize_conversation(
            history,
            if settings.vscode_model.is_empty() { None } else { Some(settings.vscode_model.clone()) },
        ).await
```

- [ ] **Step 8: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles with only pre-existing warnings

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src-tauri/src/bridge.rs apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/conversation.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add model selection to bridge protocol and settings"
```

---

### Task 4: API Key mode — use configurable model instead of hardcoded

**Files:**
- Modify: `apps/desktop/src-tauri/src/ai_provider.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/conversation.rs`

- [ ] **Step 1: Add model parameter to call_groq and call_anthropic**

Update `call_groq` signature and use the model parameter:
```rust
fn call_groq(
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: f64,
    model: &str,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        // ... rest unchanged
    });
```

Update `call_anthropic` the same way:
```rust
fn call_anthropic(
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: f64,
    model: &str,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        // ... rest unchanged
    });
```

Update `call_provider_blocking`:
```rust
fn call_provider_blocking(
    provider: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: f64,
    model: &str,
) -> Result<String, String> {
    match provider {
        "groq" => call_groq(api_key, system_prompt, user_prompt, temperature, model),
        "anthropic" => call_anthropic(api_key, system_prompt, user_prompt, temperature, model),
        other => Err(format!("Unknown provider: {}", other)),
    }
}
```

Apply same pattern to `call_provider_with_messages_blocking` — add `model: &str` and pass to the inner `serde_json::json!` `"model"` field for both groq and anthropic branches.

- [ ] **Step 2: Add default model resolution helper**

Add after the `strip_markdown_fences` function:

```rust
fn resolve_model<'a>(provider: &str, model: &'a str) -> &'a str {
    if !model.is_empty() {
        return model;
    }
    match provider {
        "anthropic" => "claude-haiku-4-5-20251001",
        "groq" => "llama-3.3-70b-versatile",
        _ => "llama-3.3-70b-versatile",
    }
}
```

- [ ] **Step 3: Update all public async functions to accept and pass model**

Update `test_key`:
```rust
pub fn test_key(provider: &str, api_key: &str) -> Result<bool, String> {
    let model = resolve_model(provider, "");
    let result = call_provider_blocking(provider, api_key, "Reply with just the word 'ok'.", "Test", 0.0, model);
    match result {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}
```

Update `refine_text` and `refine_text_blocking` — add `model: &str` param, pass to `call_provider_blocking`.

Update `send_command` and `send_command_blocking` — add `model: &str` param, pass through to `call_provider_blocking` and `refine_text_blocking`.

Update `send_conversation_turn` and `summarize_conversation` — add `model: &str` param, pass to `call_provider_with_messages_blocking`.

- [ ] **Step 4: Update callers in commands.rs to pass model**

In `process_recording_result`, the API key path (around line 265):
```rust
        match ai_provider::send_command(
            processed_transcript.clone(),
            clipboard,
            Some(settings.default_style.clone()),
            if settings.style_overrides.is_empty() { None } else { Some(settings.style_overrides.clone()) },
            if settings.code_mode { Some(true) } else { None },
            &settings.ai_provider,
            &settings.ai_api_key,
            &settings.ai_model,
        ).await {
```

- [ ] **Step 5: Update callers in conversation.rs to pass model**

In `send_conversation_turn` API key path (around line 107):
```rust
        crate::ai_provider::send_conversation_turn(
            prior_history,
            user_text,
            &settings.ai_provider,
            &settings.ai_api_key,
            &settings.ai_model,
            move |chunk| { /* unchanged */ },
        ).await?
```

In `end_conversation` API key path (around line 189):
```rust
        crate::ai_provider::summarize_conversation(
            history,
            &settings.ai_provider,
            &settings.ai_api_key,
            &settings.ai_model,
        ).await
```

- [ ] **Step 6: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles with only pre-existing warnings

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/ai_provider.rs apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/conversation.rs
git commit -m "feat: configurable model for API Key mode, default to Haiku 4.5"
```

---

### Task 5: Frontend — add model fields to types and model dropdown to Settings UI

**Files:**
- Modify: `apps/desktop/src/app/lib/types.ts`
- Modify: `apps/desktop/src/app/components/SettingsView.tsx`

- [ ] **Step 1: Update types.ts with new settings fields**

Add to `AppSettings` interface (after `ai_api_key`):
```typescript
  vscode_model: string;           // model family/id for VS Code mode
  ai_model: string;               // model id for API Key mode
```

Add to `DEFAULT_SETTINGS` (after `ai_api_key`):
```typescript
  vscode_model: "",
  ai_model: "",
```

- [ ] **Step 2: Add model dropdown for VS Code mode in SettingsView.tsx**

Add state for bridge models at the top of the Settings component (near other state):
```typescript
const [bridgeModels, setBridgeModels] = useState<{id: string; name: string; vendor: string; family: string}[]>([]);
const [modelsLoading, setModelsLoading] = useState(false);
```

Add a function to fetch models:
```typescript
const fetchBridgeModels = useCallback(() => {
  setModelsLoading(true);
  invoke<{id: string; name: string; vendor: string; family: string}[]>("list_bridge_models")
    .then((models) => setBridgeModels(models))
    .catch((e) => {
      console.error("Failed to list models:", e);
      setBridgeModels([]);
    })
    .finally(() => setModelsLoading(false));
}, []);
```

Fetch models when bridge is connected (add to existing useEffect that checks bridge status, or add new effect):
```typescript
useEffect(() => {
  if (bridgeConnected && settings.ai_provider_mode === "vscode") {
    fetchBridgeModels();
  }
}, [bridgeConnected, settings.ai_provider_mode, fetchBridgeModels]);
```

Add a Model row after the Status row (inside the `settings.ai_provider_mode === "vscode"` block, after the Status SettingRow closing tag around line 843):

```tsx
<SettingRow label="Model" description={!bridgeConnected ? "Connect VS Code to see available models" : undefined}>
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <select
      value={settings.vscode_model}
      onChange={(e) => update({ vscode_model: e.target.value })}
      disabled={!bridgeConnected || modelsLoading}
      style={{
        flex: 1,
        padding: "7px 10px",
        borderRadius: 10,
        border: "1px solid var(--yapper-border, #ddd)",
        background: "var(--yapper-surface-low, #f5f5f5)",
        color: "var(--yapper-text-primary)",
        fontSize: 13,
        cursor: bridgeConnected ? "pointer" : "not-allowed",
        opacity: bridgeConnected ? 1 : 0.5,
      }}
    >
      <option value="">Auto (first available)</option>
      {bridgeModels.map((m) => (
        <option key={m.id} value={m.family}>{m.name} ({m.vendor})</option>
      ))}
    </select>
    {bridgeConnected && (
      <button
        onClick={fetchBridgeModels}
        disabled={modelsLoading}
        style={{
          padding: "7px 10px",
          borderRadius: 10,
          border: "1px solid var(--yapper-border, #ddd)",
          background: "var(--yapper-surface-low, #f5f5f5)",
          color: "var(--yapper-text-secondary)",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {modelsLoading ? "..." : "Refresh"}
      </button>
    )}
  </div>
</SettingRow>
```

- [ ] **Step 3: Add model dropdown for API Key mode**

Add a Model row after the Provider segmented control (inside the `settings.ai_provider_mode === "apikey"` block, after the Provider SettingRow around line 854):

```tsx
<SettingRow label="Model">
  <select
    value={settings.ai_model}
    onChange={(e) => update({ ai_model: e.target.value })}
    style={{
      padding: "7px 10px",
      borderRadius: 10,
      border: "1px solid var(--yapper-border, #ddd)",
      background: "var(--yapper-surface-low, #f5f5f5)",
      color: "var(--yapper-text-primary)",
      fontSize: 13,
      cursor: "pointer",
    }}
  >
    {(settings.ai_provider || "groq") === "anthropic" ? (
      <>
        <option value="">Claude Haiku 4.5 (default)</option>
        <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
        <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
      </>
    ) : (
      <>
        <option value="">Llama 3.3 70B (default)</option>
        <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
      </>
    )}
  </select>
</SettingRow>
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd apps/desktop && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/lib/types.ts apps/desktop/src/app/components/SettingsView.tsx
git commit -m "feat: model selection dropdowns in Settings UI"
```

---

### Task 6: Build extension and verify end-to-end

**Files:** None new — integration verification

- [ ] **Step 1: Build the VS Code extension**

Run: `cd extensions/vscode-bridge && bun run compile`
Expected: Build succeeds

- [ ] **Step 2: Cargo check the Rust backend**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles with no new warnings

- [ ] **Step 3: Build the frontend**

Run: `cd apps/desktop && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "feat: dynamic model selection for VS Code and API Key modes"
```
