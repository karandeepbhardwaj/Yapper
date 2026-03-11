# Voice Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voice commands to Yapper — users speak naturally to trigger AI actions (translate, summarize, draft, explain) routed through the existing Copilot bridge with AI-first intent classification.

**Architecture:** Every transcript goes through an AI intent classifier (fast model) before processing. The classifier determines dictation vs. command, extracts parameters, and routes to dedicated handlers. Basic chaining ("translate and then summarize") supported via sequential execution.

**Tech Stack:** TypeScript (VS Code extension), Rust (Tauri desktop), React (frontend)

**Spec:** `docs/superpowers/specs/2026-03-29-voice-commands-design.md`

---

### Task 1: Add Protocol Types

**Files:**
- Modify: `extensions/vscode-bridge/src/protocol.ts`

- [ ] **Step 1: Add CommandRequest interface**

Add after `SummarizeRequest` (line 69):

```typescript
export interface CommandRequest {
  type: "command";
  id: string;
  rawText: string;
  clipboard: string | null;
  style?: "Professional" | "Casual" | "Technical" | "Creative";
  styleOverrides?: Record<string, string>;
  codeMode?: boolean;
}
```

- [ ] **Step 2: Add ClassifiedIntent types**

Add after `CommandRequest`:

```typescript
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
```

- [ ] **Step 3: Add CommandResultResponse interface**

Add after `SummarizeResultResponse` (line 77):

```typescript
export interface CommandResultResponse {
  type: "command_result";
  id: string;
  result: string;
  action: string;
  params?: Record<string, string>;
}
```

- [ ] **Step 4: Update union types**

Update `IncomingMessage` (line 81) to include `CommandRequest`:

```typescript
export type IncomingMessage = RefineRequest | ConversationRequest | SummarizeRequest | CommandRequest;
```

Update `OutgoingMessage` (line 82-88) to include `CommandResultResponse`:

```typescript
export type OutgoingMessage =
  | ChunkResponse
  | ResultResponse
  | ErrorResponse
  | ConversationChunkResponse
  | ConversationResultResponse
  | SummarizeResultResponse
  | CommandResultResponse;
```

- [ ] **Step 5: Compile check**

Run: `cd extensions/vscode-bridge && bun run compile`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add extensions/vscode-bridge/src/protocol.ts
git commit -m "feat: add voice command protocol types"
```

---

### Task 2: Add Intent Classifier

**Files:**
- Modify: `extensions/vscode-bridge/src/copilot-bridge.ts`

- [ ] **Step 1: Add classifier system prompt constant**

Add after the `STYLE_MODIFIERS` constant (line 50):

```typescript
const CLASSIFY_SYSTEM_PROMPT = `You are a voice command classifier. Given a user's spoken transcript, determine their intent.

Return ONLY valid JSON with no markdown fences. Possible intents:
- "dictation" — user is dictating text to be refined and pasted (this is the default)
- "translate" — user wants text translated. Extract targetLang.
- "summarize" — user wants text summarized
- "draft" — user wants structured writing generated. Extract type (email, message, PR description, commit message, etc.) and topic.
- "explain" — user wants something explained
- "unknown" — user wants something else. Include a description.
- "chain" — user wants multiple actions in sequence. Return an actions array.

For inputSource:
- "spoken" — the user's own words are the content to process (e.g., "translate hello world to Spanish")
- "clipboard" — the user wants to act on their clipboard content (e.g., "summarize this", "explain this code")

Examples:
- "I need to send an email to the team about the deadline" → {"intent": "dictation"}
- "Translate this to Spanish" → {"intent": "translate", "params": {"targetLang": "Spanish"}, "inputSource": "clipboard"}
- "Translate hello world to French" → {"intent": "translate", "params": {"targetLang": "French"}, "inputSource": "spoken"}
- "Summarize this" → {"intent": "summarize", "inputSource": "clipboard"}
- "Draft an email about tomorrow's standup" → {"intent": "draft", "params": {"type": "email", "topic": "tomorrow's standup"}, "inputSource": "spoken"}
- "Explain this function" → {"intent": "explain", "inputSource": "clipboard"}
- "Translate this to German and then summarize it" → {"intent": "chain", "actions": [{"intent": "translate", "params": {"targetLang": "German"}, "inputSource": "clipboard"}, {"intent": "summarize", "inputSource": "previous"}]}
- "Rewrite this as a haiku" → {"intent": "unknown", "description": "Rewrite text as a haiku", "inputSource": "clipboard"}`;
```

- [ ] **Step 2: Add model tier type and provider selection helper**

Add after the classify prompt:

```typescript
type ModelTier = "fast" | "quality";

async function selectProviderByTier(
  tier: ModelTier,
  token: vscode.CancellationToken
): Promise<{ type: "vscode"; model: vscode.LanguageModelChat } | { type: "api"; provider: string; apiKey: string } | null> {
  if (tier === "quality") {
    // Try vscode.lm first (Copilot, Claude for VS Code)
    try {
      const models = await vscode.lm.selectChatModels();
      if (models.length > 0) {
        return { type: "vscode", model: models[0] };
      }
    } catch {}

    // Try Anthropic
    const anthropicKey = getApiKey("anthropicApiKey", "ANTHROPIC_API_KEY");
    if (anthropicKey) {
      return { type: "api", provider: "anthropic", apiKey: anthropicKey };
    }

    // Fall through to fast tier
  }

  // Fast tier: Groq first, then Gemini
  const groqKey = getApiKey("groqApiKey", "GROQ_API_KEY");
  if (groqKey) {
    return { type: "api", provider: "groq", apiKey: groqKey };
  }

  const geminiKey = getApiKey("geminiApiKey", "GEMINI_API_KEY");
  if (geminiKey) {
    return { type: "api", provider: "gemini", apiKey: geminiKey };
  }

  // Last resort: try vscode.lm even for fast tier
  try {
    const models = await vscode.lm.selectChatModels();
    if (models.length > 0) {
      return { type: "vscode", model: models[0] };
    }
  } catch {}

  return null;
}
```

- [ ] **Step 3: Add callProvider helper for generic prompt execution**

```typescript
async function callProvider(
  selected: { type: "vscode"; model: vscode.LanguageModelChat } | { type: "api"; provider: string; apiKey: string },
  systemPrompt: string,
  userPrompt: string,
  token: vscode.CancellationToken
): Promise<string> {
  if (selected.type === "vscode") {
    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(userPrompt),
    ];
    const response = await selected.model.sendRequest(messages, {}, token);
    const chunks: string[] = [];
    for await (const fragment of response.text) {
      chunks.push(fragment);
    }
    return chunks.join("");
  }

  const { provider, apiKey } = selected;

  if (provider === "groq") {
    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });
    return httpPost("api.groq.com", "/openai/v1/chat/completions", {
      "Authorization": `Bearer ${apiKey}`,
    }, body).then(r => JSON.parse(r).choices[0].message.content);
  }

  if (provider === "gemini") {
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3 },
    });
    return httpPost(
      "generativelanguage.googleapis.com",
      "/v1beta/models/gemini-2.0-flash:generateContent",
      { "x-goog-api-key": apiKey },
      body
    ).then(r => JSON.parse(r).candidates[0].content.parts[0].text);
  }

  if (provider === "anthropic") {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return httpPost("api.anthropic.com", "/v1/messages", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }, body).then(r => JSON.parse(r).content[0].text);
  }

  throw new Error(`Unknown provider: ${provider}`);
}
```

- [ ] **Step 4: Add classifyIntent function**

```typescript
import type { ClassifiedIntent } from "./protocol";

export async function classifyIntent(
  rawText: string,
  token: vscode.CancellationToken
): Promise<ClassifiedIntent> {
  const selected = await selectProviderByTier("fast", token);
  if (!selected) {
    // No provider available — fall back to dictation
    return { intent: "dictation" };
  }

  try {
    const result = await callProvider(selected, CLASSIFY_SYSTEM_PROMPT, rawText, token);
    const cleaned = result.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as ClassifiedIntent;
  } catch (err) {
    console.log("[Yapper] Classification failed, falling back to dictation:", err);
    return { intent: "dictation" };
  }
}
```

- [ ] **Step 5: Compile check**

Run: `cd extensions/vscode-bridge && bun run compile`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add extensions/vscode-bridge/src/copilot-bridge.ts
git commit -m "feat: add intent classifier with model tier selection"
```

---

### Task 3: Add Action Handlers

**Files:**
- Modify: `extensions/vscode-bridge/src/copilot-bridge.ts`

- [ ] **Step 1: Add action handler system prompts**

Add after the `CLASSIFY_SYSTEM_PROMPT`:

```typescript
const ACTION_PROMPTS: Record<string, string> = {
  translate: `You are a translator. Translate the given text to the target language naturally, preserving tone, formatting, and meaning. Return ONLY the translated text with no explanation or wrapping.`,

  summarize: `You are a summarizer. Produce a concise summary of the given text. Include key points as bullet points if the text is long. Return ONLY the summary with no explanation or wrapping.`,

  draft: `You are a writing assistant. Generate structured writing matching the requested type and topic. For emails, include a subject line. For messages, keep it concise. For PR descriptions, use markdown with sections. Return ONLY the drafted text with no explanation or wrapping.`,

  explain: `You are an explainer. Explain the given content clearly and concisely. If it's code, explain what it does, key patterns, and any notable aspects. If it's general text, break down the key concepts. Return ONLY the explanation with no wrapping.`,
};
```

- [ ] **Step 2: Add resolveInput helper**

```typescript
function resolveInput(
  inputSource: string | undefined,
  rawText: string,
  clipboard: string | null,
  previousOutput: string | null
): string {
  switch (inputSource) {
    case "clipboard":
      return clipboard || rawText;
    case "previous":
      return previousOutput || clipboard || rawText;
    case "spoken":
    default:
      return rawText;
  }
}
```

- [ ] **Step 3: Add executeAction function**

```typescript
export async function executeAction(
  intent: string,
  params: Record<string, string> | undefined,
  input: string,
  description: string | undefined,
  token: vscode.CancellationToken
): Promise<string> {
  const selected = await selectProviderByTier(
    intent === "translate" ? "fast" : "quality",
    token
  );
  if (!selected) {
    throw new Error("No AI provider available");
  }

  let systemPrompt: string;
  let userPrompt: string;

  switch (intent) {
    case "translate": {
      const lang = params?.targetLang || "English";
      systemPrompt = ACTION_PROMPTS.translate;
      userPrompt = `Translate the following text to ${lang}:\n\n${input}`;
      break;
    }
    case "summarize":
      systemPrompt = ACTION_PROMPTS.summarize;
      userPrompt = `Summarize the following:\n\n${input}`;
      break;
    case "draft": {
      const type = params?.type || "message";
      const topic = params?.topic || input;
      systemPrompt = ACTION_PROMPTS.draft;
      userPrompt = `Draft a ${type} about: ${topic}`;
      break;
    }
    case "explain":
      systemPrompt = ACTION_PROMPTS.explain;
      userPrompt = `Explain the following:\n\n${input}`;
      break;
    case "unknown":
      systemPrompt = `You are a helpful assistant. The user wants to: ${description || "process this text"}. Do exactly what they ask. Return ONLY the result with no explanation or wrapping.`;
      userPrompt = input;
      break;
    default:
      throw new Error(`Unknown action: ${intent}`);
  }

  return callProvider(selected, systemPrompt, userPrompt, token);
}
```

- [ ] **Step 4: Compile check**

Run: `cd extensions/vscode-bridge && bun run compile`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add extensions/vscode-bridge/src/copilot-bridge.ts
git commit -m "feat: add action handlers for translate, summarize, draft, explain"
```

---

### Task 4: Add Command Handler with Chaining

**Files:**
- Modify: `extensions/vscode-bridge/src/copilot-bridge.ts`

- [ ] **Step 1: Add the main handleCommand function**

This is the top-level function that extension.ts will call. It classifies intent, routes to handlers, and supports chaining.

```typescript
import type { CommandRequest, CommandResultResponse, ClassifiedIntent, ClassifiedAction } from "./protocol";

export interface CommandResult {
  result: string;
  action: string;
  params?: Record<string, string>;
}

export async function handleCommand(
  rawText: string,
  clipboard: string | null,
  style: string | undefined,
  styleOverrides: Record<string, string> | undefined,
  codeMode: boolean | undefined,
  token: vscode.CancellationToken
): Promise<CommandResult> {
  // Step 1: Classify intent
  const classified = await classifyIntent(rawText, token);

  // Step 2: If dictation, use existing refine path
  if (classified.intent === "dictation") {
    const refinement = await refineWithCopilot(rawText, style, token, styleOverrides, codeMode);
    return {
      result: refinement.refinedText,
      action: "dictation",
      params: { category: refinement.category, title: refinement.title },
    };
  }

  // Step 3: If chain, execute actions sequentially
  if (classified.intent === "chain" && classified.actions) {
    let previousOutput: string | null = null;
    let lastAction: ClassifiedAction = classified.actions[classified.actions.length - 1];

    for (const action of classified.actions) {
      const input = resolveInput(action.inputSource, rawText, clipboard, previousOutput);
      previousOutput = await executeAction(
        action.intent,
        action.params,
        input,
        action.description,
        token
      );
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

  // Step 4: Single action
  const input = resolveInput(classified.inputSource, rawText, clipboard, null);
  const result = await executeAction(
    classified.intent,
    classified.params,
    input,
    classified.description,
    token
  );

  return {
    result,
    action: classified.intent,
    params: classified.params,
  };
}
```

- [ ] **Step 2: Compile check**

Run: `cd extensions/vscode-bridge && bun run compile`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add extensions/vscode-bridge/src/copilot-bridge.ts
git commit -m "feat: add command handler with intent routing and chaining"
```

---

### Task 5: Route Command Messages in Extension

**Files:**
- Modify: `extensions/vscode-bridge/src/extension.ts`

- [ ] **Step 1: Import new types and handler**

Add to the existing imports from `./copilot-bridge`:

```typescript
import { refineWithCopilot, handleConversation, handleSummarize, handleCommand } from "./copilot-bridge";
```

Add to the existing imports from `./protocol`:

```typescript
import type { CommandRequest, CommandResultResponse } from "./protocol";
```

- [ ] **Step 2: Add handleCommandMessage function**

Add after `handleSummarizeMessage` (around line 282):

```typescript
async function handleCommandMessage(
  ws: WebSocket,
  message: CommandRequest,
  tokenSource: vscode.CancellationTokenSource
) {
  if (!message.rawText || message.rawText.trim().length === 0) {
    sendError(ws, message.id, "Empty transcript");
    return;
  }

  const result = await handleCommand(
    message.rawText,
    message.clipboard,
    message.style,
    message.styleOverrides,
    message.codeMode,
    tokenSource.token
  );

  const response: CommandResultResponse = {
    type: "command_result",
    id: message.id,
    result: result.result,
    action: result.action,
    params: result.params,
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}
```

- [ ] **Step 3: Add "command" case to message switch**

In the `ws.on("message")` handler's switch statement (around line 113), add a new case before the `default`:

```typescript
        case "command":
          await handleCommandMessage(ws, message as CommandRequest, tokenSource);
          break;
```

- [ ] **Step 4: Compile check**

Run: `cd extensions/vscode-bridge && bun run compile`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add extensions/vscode-bridge/src/extension.ts
git commit -m "feat: route command messages through WebSocket handler"
```

---

### Task 6: Add Clipboard Reading in Rust

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Add read_clipboard function**

Add after the `set_transcript` function (around line 287):

```rust
fn read_clipboard() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("pbpaste").output() {
            Ok(output) => {
                let text = String::from_utf8_lossy(&output.stdout).to_string();
                if text.is_empty() {
                    None
                } else {
                    // Truncate to 10K chars to avoid oversized messages
                    Some(text.chars().take(10_000).collect())
                }
            }
            Err(_) => None,
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        match Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-Clipboard"])
            .output()
        {
            Ok(output) => {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if text.is_empty() {
                    None
                } else {
                    Some(text.chars().take(10_000).collect())
                }
            }
            Err(_) => None,
        }
    }
}
```

- [ ] **Step 2: Compile check**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs
git commit -m "feat: add cross-platform clipboard reading"
```

---

### Task 7: Add Command Message to Rust Bridge

**Files:**
- Modify: `apps/desktop/src-tauri/src/bridge.rs`

- [ ] **Step 1: Add CommandRequest struct**

Add after `SummarizeRequest` (around line 66):

```rust
#[derive(Serialize)]
struct CommandRequest {
    #[serde(rename = "type")]
    msg_type: String,
    id: String,
    #[serde(rename = "rawText")]
    raw_text: String,
    clipboard: Option<String>,
    style: Option<String>,
    #[serde(rename = "styleOverrides", skip_serializing_if = "Option::is_none")]
    style_overrides: Option<HashMap<String, String>>,
    #[serde(rename = "codeMode", skip_serializing_if = "Option::is_none")]
    code_mode: Option<bool>,
}
```

- [ ] **Step 2: Add CommandResult struct**

Add after `SummarizeResponse` (around line 194):

```rust
#[derive(Clone, Debug)]
pub struct CommandResult {
    pub result: String,
    pub action: String,
    pub params: Option<HashMap<String, String>>,
}
```

- [ ] **Step 3: Add send_command async wrapper**

Add after `summarize_conversation` (around line 288):

```rust
pub async fn send_command(
    raw_text: String,
    clipboard: Option<String>,
    style: Option<String>,
    style_overrides: Option<HashMap<String, String>>,
    code_mode: Option<bool>,
) -> Result<CommandResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        send_command_blocking(&raw_text, clipboard.as_deref(), style.as_deref(), style_overrides, code_mode)
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))?;
    result
}
```

- [ ] **Step 4: Add send_command_blocking function**

```rust
fn send_command_blocking(
    raw_text: &str,
    clipboard: Option<&str>,
    style: Option<&str>,
    style_overrides: Option<HashMap<String, String>>,
    code_mode: Option<bool>,
) -> Result<CommandResult, String> {
    let mut socket = open_bridge_socket()?;

    let request = CommandRequest {
        msg_type: "command".to_string(),
        id: uuid_simple(),
        raw_text: raw_text.to_string(),
        clipboard: clipboard.map(|s| s.to_string()),
        style: style.map(|s| s.to_string()),
        style_overrides,
        code_mode,
    };

    let json = serde_json::to_string(&request).map_err(|e| format!("Serialize error: {e}"))?;
    socket
        .send(tungstenite::Message::Text(json))
        .map_err(|e| format!("Send error: {e}"))?;

    loop {
        let msg = socket
            .read()
            .map_err(|e| format!("Read error: {e}"))?;

        match msg {
            tungstenite::Message::Text(text) => {
                let resp: BridgeResponse =
                    serde_json::from_str(&text).map_err(|e| format!("Parse error: {e}"))?;

                match resp.msg_type.as_str() {
                    "command_result" => {
                        let result = resp
                            .refined_text
                            .unwrap_or_default();
                        let action = resp
                            .category
                            .unwrap_or_else(|| "unknown".to_string());
                        return Ok(CommandResult {
                            result,
                            action,
                            params: None,
                        });
                    }
                    "error" => {
                        return Err(resp.error.unwrap_or_else(|| "Unknown bridge error".to_string()));
                    }
                    _ => continue,
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

- [ ] **Step 5: Update BridgeResponse to handle command_result fields**

The existing `BridgeResponse` struct (line 74) uses `refined_text` and `category` which we can reuse. But we need to add a `params` field and a `result` field. Update `BridgeResponse`:

Add these fields to the existing `BridgeResponse` struct:

```rust
    #[serde(default)]
    result: Option<String>,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    params: Option<HashMap<String, String>>,
```

Then update `send_command_blocking` to use the correct fields:

```rust
                    "command_result" => {
                        let result = resp.result
                            .or(resp.refined_text)
                            .unwrap_or_default();
                        let action = resp.action
                            .unwrap_or_else(|| "unknown".to_string());
                        return Ok(CommandResult {
                            result,
                            action,
                            params: resp.params,
                        });
                    }
```

- [ ] **Step 6: Add uuid_simple import if needed**

The `uuid_simple()` function is already available from `store.rs`. Add to imports at top of bridge.rs if not present:

```rust
use crate::store::uuid_simple;
```

If `uuid_simple` is not public, you can use a simple timestamp-based ID instead:

```rust
let id = chrono::Local::now().timestamp_millis().to_string();
```

- [ ] **Step 7: Compile check**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/bridge.rs
git commit -m "feat: add command message type to bridge client"
```

---

### Task 8: Update Recording Pipeline

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Add CommandRecordingResult struct**

Add after `RecordingResult` (around line 96):

```rust
#[derive(Clone, Serialize)]
struct CommandRecordingResult {
    #[serde(rename = "rawTranscript")]
    raw_transcript: String,
    #[serde(rename = "refinedText")]
    refined_text: String,
    category: Option<String>,
    title: Option<String>,
    action: Option<String>,
    #[serde(rename = "actionParams")]
    action_params: Option<HashMap<String, String>>,
}
```

- [ ] **Step 2: Update process_recording_result to use command flow**

Replace the bridge refinement section in `process_recording_result` (the block starting around line 120 where `bridge::refine_text` is called) with the new command flow:

```rust
    // Read clipboard for voice commands
    let clipboard = read_clipboard();

    let settings = get_settings_internal(&app);
    let style = if settings.default_style.is_empty() {
        None
    } else {
        Some(settings.default_style.clone())
    };
    let overrides = if settings.style_overrides.is_empty() {
        None
    } else {
        Some(settings.style_overrides.clone())
    };
    let code_mode = if settings.code_mode { Some(true) } else { None };

    // Try command flow first, fall back to refine
    let (refined_text, category, title, action, action_params) =
        match bridge::send_command(
            processed.clone(),
            clipboard,
            style.clone(),
            overrides.clone(),
            code_mode,
        )
        .await
        {
            Ok(cmd_result) => {
                let action_name = cmd_result.action.clone();
                let params = cmd_result.params.clone();

                // For dictation, use the result's embedded category/title
                let (cat, ttl) = if action_name == "dictation" {
                    (
                        params.as_ref().and_then(|p| p.get("category").cloned()),
                        params.as_ref().and_then(|p| p.get("title").cloned()),
                    )
                } else {
                    // For commands, set category to the action name
                    (Some(capitalize_first(&action_name)), None)
                };

                (cmd_result.result, cat, ttl, Some(action_name), params)
            }
            Err(e) => {
                log::warn!("Command bridge failed, trying refine: {}", e);
                // Fall back to old refine path
                match bridge::refine_text(&processed, style, overrides, code_mode).await {
                    Ok(r) => (
                        r.refined_text,
                        r.category,
                        r.title,
                        None,
                        None,
                    ),
                    Err(e2) => {
                        log::warn!("Refine also failed: {}", e2);
                        app.emit("refinement-skipped", RefinementSkipped {
                            reason: "Bridge unavailable".to_string(),
                        })
                        .ok();
                        (raw_transcript.clone(), None, None, None, None)
                    }
                }
            }
        };
```

- [ ] **Step 3: Add capitalize_first helper**

Add near the top of commands.rs:

```rust
fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().to_string() + chars.as_str(),
    }
}
```

- [ ] **Step 4: Update the history save call**

Update the `history::add_entry` call in `process_recording_result` to pass the new action fields. This requires updating `history::add_entry` — see Task 9. For now, update the call site:

```rust
    history::add_entry(
        &app,
        &raw_transcript,
        &refined_text,
        category.as_deref(),
        title.as_deref(),
        Some(duration_secs),
        action.as_deref(),
        action_params.as_ref(),
    )
    .ok();
```

- [ ] **Step 5: Update the event emission to include action**

Update the `refinement-complete` event to emit `CommandRecordingResult`:

```rust
    app.emit(
        "refinement-complete",
        CommandRecordingResult {
            raw_transcript: raw_transcript.clone(),
            refined_text: refined_text.clone(),
            category: category.clone(),
            title: title.clone(),
            action: action.clone(),
            action_params: action_params.clone(),
        },
    )
    .ok();
```

- [ ] **Step 6: Compile check (will fail — history changes needed in Task 9)**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Errors about `history::add_entry` signature mismatch — resolved in Task 9

- [ ] **Step 7: Commit (after Task 9)**

Commit together with Task 9.

---

### Task 9: Add Action Metadata to History

**Files:**
- Modify: `apps/desktop/src-tauri/src/history.rs`

- [ ] **Step 1: Add action fields to HistoryEntry**

Add after `duration_seconds` field (around line 38):

```rust
    #[serde(rename = "action", skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(rename = "actionParams", skip_serializing_if = "Option::is_none")]
    pub action_params: Option<HashMap<String, String>>,
```

Add the import at the top:

```rust
use std::collections::HashMap;
```

- [ ] **Step 2: Update add_entry signature**

Update the `add_entry` function (line 45) to accept action metadata:

```rust
pub fn add_entry(
    app: &tauri::AppHandle,
    raw_transcript: &str,
    refined_text: &str,
    category: Option<&str>,
    title: Option<&str>,
    duration_seconds: Option<u64>,
    action: Option<&str>,
    action_params: Option<&HashMap<String, String>>,
) -> Result<(), String> {
```

- [ ] **Step 3: Set the new fields in the entry creation**

In the `HistoryEntry` construction inside `add_entry`, add:

```rust
        action: action.map(|a| a.to_string()),
        action_params: action_params.cloned(),
```

- [ ] **Step 4: Update HistoryEntry Default impl**

If using `..Default::default()`, ensure the Default implementation includes the new fields. Add to the Default implementation (or if it's derived, the fields already default to None since they're `Option`). If HistoryEntry derives Default, no change needed. If there's a manual Default, add:

```rust
            action: None,
            action_params: None,
```

- [ ] **Step 5: Compile check**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: No errors (both Task 8 and Task 9 changes should compile together)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/history.rs apps/desktop/src-tauri/src/commands.rs
git commit -m "feat: update recording pipeline to use command flow with action metadata"
```

---

### Task 10: Update Widget Feedback

**Files:**
- Modify: `apps/desktop/src/widget.tsx`

- [ ] **Step 1: Add action state tracking**

Add a new state variable in the widget component:

```typescript
const [actionLabel, setActionLabel] = useState<string | null>(null);
```

- [ ] **Step 2: Listen for refinement-complete events to capture action**

Add a new event listener in the existing `useEffect` block:

```typescript
const unlistenAction = listen<{action?: string}>("refinement-complete", (event) => {
  const action = event.payload?.action;
  if (action && action !== "dictation") {
    const labels: Record<string, string> = {
      translate: "Translating",
      summarize: "Summarizing",
      draft: "Drafting",
      explain: "Explaining",
      chain: "Processing",
      unknown: "Processing",
    };
    setActionLabel(labels[action] || "Processing");
    // Clear after 2 seconds
    setTimeout(() => setActionLabel(null), 2000);
  }
});
```

Clean up in the return function:

```typescript
return () => {
  // ... existing cleanup
  unlistenAction.then(fn => fn());
};
```

- [ ] **Step 3: Display action label during processing state**

In the processing state rendering section (where the hue wave animation is), add the action label. Find the processing state JSX and add a text overlay:

```tsx
{isProcessing && (
  <motion.div
    key="processing-content"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 3,
    }}
  >
    {actionLabel && (
      <span
        style={{
          color: "white",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          textShadow: "0 1px 3px rgba(0,0,0,0.5)",
        }}
      >
        {actionLabel}...
      </span>
    )}
  </motion.div>
)}
```

- [ ] **Step 4: Compile check**

Run: `cd apps/desktop && bunx tsc --noEmit`
Expected: No errors (or use `bun dev` to verify)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/widget.tsx
git commit -m "feat: show action label in widget during processing"
```

---

### Task 11: Add Action Badges to History Cards

**Files:**
- Modify: `apps/desktop/src/app/components/HistoryCard.tsx`
- Modify: `apps/desktop/src/app/lib/types.ts` (or wherever HistoryItem is defined)

- [ ] **Step 1: Update HistoryItem type**

Add the new fields to the `HistoryItem` interface:

```typescript
  action?: string;
  actionParams?: Record<string, string>;
```

- [ ] **Step 2: Update HistoryCardProps**

Add to the `HistoryCardProps` interface:

```typescript
  action?: string;
  actionParams?: Record<string, string>;
```

- [ ] **Step 3: Add action badge rendering**

In the `HistoryCard` component, in the header row where the category badge is rendered, add an action badge. Find the category badge JSX and add an action badge alongside it:

```tsx
{props.action && props.action !== "dictation" && (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      padding: "2px 6px",
      borderRadius: 4,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      background: props.variant === "pinned"
        ? "rgba(255,255,255,0.2)"
        : "rgba(218,119,86,0.12)",
      color: props.variant === "pinned"
        ? "rgba(255,255,255,0.9)"
        : "#DA7756",
    }}
  >
    {formatActionLabel(props.action, props.actionParams)}
  </span>
)}
```

- [ ] **Step 4: Add formatActionLabel helper**

Add inside the file (before the component or as a utility):

```typescript
function formatActionLabel(action: string, params?: Record<string, string>): string {
  switch (action) {
    case "translate":
      return params?.targetLang ? `Translated to ${params.targetLang}` : "Translated";
    case "summarize":
      return "Summarized";
    case "draft":
      return params?.type ? `Drafted ${params.type}` : "Drafted";
    case "explain":
      return "Explained";
    case "chain":
      return params?.steps ? params.steps.split(" + ").map(s =>
        s.charAt(0).toUpperCase() + s.slice(1)
      ).join(" + ") : "Chained";
    default:
      return action.charAt(0).toUpperCase() + action.slice(1);
  }
}
```

- [ ] **Step 5: Pass action props from MainWindow**

In `MainWindow.tsx`, update the `HistoryCard` rendering to pass the new props:

```tsx
<HistoryCard
  // ... existing props
  action={item.action}
  actionParams={item.actionParams}
/>
```

- [ ] **Step 6: Compile check**

Run: `cd apps/desktop && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/components/HistoryCard.tsx apps/desktop/src/app/components/MainWindow.tsx apps/desktop/src/app/lib/types.ts
git commit -m "feat: show action badges on history cards"
```

---

### Task 12: Add Action Type Filter to History

**Files:**
- Modify: `apps/desktop/src/app/components/MainWindow.tsx`

- [ ] **Step 1: Add filter state**

Add a new state variable:

```typescript
const [actionFilter, setActionFilter] = useState<string | null>(null);
```

- [ ] **Step 2: Compute available actions from history**

Add a memo to extract unique actions:

```typescript
const availableActions = useMemo(() => {
  const actions = new Set<string>();
  historyItems.forEach(item => {
    if (item.action && item.action !== "dictation") {
      actions.add(item.action);
    }
  });
  return Array.from(actions).sort();
}, [historyItems]);
```

- [ ] **Step 3: Apply filter in filteredItems**

Update the `filteredItems` memo to incorporate the action filter. After the existing search/sort logic, add a filter step:

```typescript
  // Apply action filter
  if (actionFilter) {
    items = items.filter(item => item.action === actionFilter);
  }
```

- [ ] **Step 4: Add filter chips UI**

In the sort toolbar area (between the search bar and the card list), add filter chips when actions are available:

```tsx
{availableActions.length > 0 && (
  <div style={{
    display: "flex",
    gap: 6,
    padding: "0 16px 8px",
    flexWrap: "wrap",
  }}>
    <button
      onClick={() => setActionFilter(null)}
      style={{
        padding: "4px 10px",
        borderRadius: 12,
        border: "none",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        background: !actionFilter ? "#DA7756" : "var(--surface-secondary)",
        color: !actionFilter ? "white" : "var(--text-secondary)",
        transition: "all 0.15s",
      }}
    >
      All
    </button>
    {availableActions.map(action => (
      <button
        key={action}
        onClick={() => setActionFilter(actionFilter === action ? null : action)}
        style={{
          padding: "4px 10px",
          borderRadius: 12,
          border: "none",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          background: actionFilter === action ? "#DA7756" : "var(--surface-secondary)",
          color: actionFilter === action ? "white" : "var(--text-secondary)",
          transition: "all 0.15s",
        }}
      >
        {action.charAt(0).toUpperCase() + action.slice(1)}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 5: Compile check**

Run: `cd apps/desktop && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/components/MainWindow.tsx
git commit -m "feat: add action type filter chips to history"
```

---

### Task 13: End-to-End Verification

- [ ] **Step 1: Compile everything**

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cd extensions/vscode-bridge && bun run compile
```

Expected: Both pass with no errors.

- [ ] **Step 2: Run the app**

```bash
cd /Users/kdb/Developer/Yapper && bun dev
```

- [ ] **Step 3: Manual test — regular dictation**

Press the dictation hotkey and say something normal like "I need to send a follow-up email to the team." Verify it still refines and pastes as before.

- [ ] **Step 4: Manual test — translate command**

Say "translate hello world to Spanish." Verify Spanish text is pasted.

- [ ] **Step 5: Manual test — summarize command**

Copy a paragraph of text to clipboard. Say "summarize this." Verify a summary is pasted.

- [ ] **Step 6: Manual test — draft command**

Say "draft an email about tomorrow's standup meeting." Verify an email draft is pasted.

- [ ] **Step 7: Manual test — explain command**

Copy a code snippet. Say "explain this code." Verify an explanation is pasted.

- [ ] **Step 8: Manual test — chaining**

Copy text. Say "translate this to French and then summarize it." Verify a French summary is pasted.

- [ ] **Step 9: Manual test — widget feedback**

During any command, verify the widget shows the action label ("Translating...", etc.) during processing.

- [ ] **Step 10: Manual test — history**

Open the history dashboard. Verify:
- Action badges appear on command entries (e.g., "Translated to Spanish")
- Filter chips appear and filtering works
- Regular dictation entries look unchanged

- [ ] **Step 11: Final commit**

If any fixes were needed during testing, commit them:

```bash
git add -p
git commit -m "fix: address issues found during voice commands E2E testing"
```
