# Dynamic Model Selection

## Context

The app currently hardcodes AI models: `llama-3.3-70b-versatile` (Groq), `claude-sonnet-4-20250514` (Anthropic) in API Key mode, and `models[0]` (first available) in VS Code mode. Users cannot see or choose which model is used. This causes silent failures when the default model is deprecated or unavailable in the user's Copilot subscription.

## Goal

Let users select their AI model from the desktop app in both provider modes. In VS Code mode, dynamically query available models from the bridge extension. Default to Claude Haiku 4.5 for Anthropic API Key mode.

## Design

### 1. Protocol Changes (`protocol.ts`)

New message types for model discovery:

```typescript
interface ListModelsRequest {
  type: "list-models";
  id: string;
}

interface ModelInfo {
  id: string;
  name: string;
  vendor: string;
  family: string;
}

interface ListModelsResponse {
  type: "models-list";
  id: string;
  models: ModelInfo[];
}
```

Add optional `model` field to all existing request types:
- `RefineRequest` — add `model?: string`
- `CommandRequest` — add `model?: string`
- `ConversationRequest` — add `model?: string`
- `SummarizeRequest` — add `model?: string`

### 2. VS Code Extension (`extension.ts`, `copilot-bridge.ts`)

**Model listing** (`extension.ts`):
- Handle `list-models` message type in the WebSocket message handler
- Call `vscode.lm.selectChatModels()` with no filter to get all available models
- Return `models-list` response with id, name, vendor, family for each model

**Model selection** (`copilot-bridge.ts`):
- All functions that call `vscode.lm.selectChatModels()` accept an optional `model` parameter
- When `model` is provided, filter: `vscode.lm.selectChatModels({ family: model })`, falling back to `selectChatModels({ id: model })` if no family match
- When `model` is empty/undefined, use first available (backward compatible)
- Affected functions: `callVscodeLm()`, `classifyIntent()`, `refineWithCopilot()`, `handleConversation()`, `handleSummarize()`

### 3. Rust Backend

**Bridge client** (`bridge.rs`):
- Add `model` field to `RefineRequest`, `CommandRequest`, `ConversationRequest`, `SummarizeRequest` structs
- New `list_models()` async function: opens bridge socket, sends `list-models`, returns `Vec<ModelInfo>`
- New `ModelInfo` struct with id, name, vendor, family fields

**Settings** (`commands.rs`):
- Add `vscode_model: String` to `AppSettings` (default: empty string = auto)
- Add `ai_model: String` to `AppSettings` (default: empty string = provider default)
- New Tauri command: `list_bridge_models` — calls `bridge::list_models()`, returns model list to frontend
- Pass `settings.vscode_model` through all bridge calls
- Pass `settings.ai_model` to all `ai_provider` calls

**Direct API** (`ai_provider.rs`):
- `call_groq()` and `call_anthropic()` accept `model: &str` parameter instead of hardcoding
- Default models when `ai_model` is empty:
  - Anthropic: `claude-haiku-4-5-20251001`
  - Groq: `llama-3.3-70b-versatile`
- `call_provider_with_messages_blocking()` also accepts model parameter

### 4. Frontend

**Types** (`types.ts`):
- Add `vscode_model: string` and `ai_model: string` to the AppSettings interface

**Settings UI** (`SettingsView.tsx`):

VS Code mode — new "Model" row below the Status row:
- Dropdown populated by calling `list_bridge_models` Tauri command when bridge is connected
- Each option shows: `model.name (model.vendor)`
- First option: "Auto (first available)" with value ""
- Refresh button (rotate icon) to re-query models
- Disabled state with "Connect VS Code first" when bridge is disconnected

API Key mode — new "Model" row below the Provider toggle:
- Anthropic selected: dropdown with `claude-haiku-4-5-20251001` (default), `claude-sonnet-4-20250514`
- Groq selected: dropdown with `llama-3.3-70b-versatile` (default)
- Display names: "Claude Haiku 4.5", "Claude Sonnet 4", "Llama 3.3 70B"

### 5. Data Flow

```
Settings UI
  → user selects model
  → save_settings (persists vscode_model / ai_model)

Recording pipeline (commands.rs):
  → read settings.vscode_model or settings.ai_model
  → VS Code mode: pass model in bridge request JSON
  → API Key mode: pass model to call_groq/call_anthropic

VS Code bridge (extension.ts → copilot-bridge.ts):
  → receive model field from request
  → selectChatModels({ family: model }) or selectChatModels({ id: model })
  → use matched model for the operation
```

### 6. Error Handling

- If the selected model is no longer available: log warning, fall back to first available model, include the actual model used in the response
- If `list_bridge_models` fails (bridge not connected): return empty list, UI shows "Connect VS Code first"
- If API key mode model string is empty: use provider default

### 7. Backward Compatibility

- Empty `vscode_model` / `ai_model` = use defaults (same behavior as today)
- Bridge messages without `model` field: extension ignores it, uses first available
- Existing settings files without the new fields: serde defaults to empty string

## Verification

1. VS Code mode: Open Settings → verify model dropdown populates with available models
2. Select a specific model → record → verify the selected model is logged by the extension
3. API Key mode: Switch to Anthropic → verify Haiku 4.5 is default → switch to Sonnet → record → verify
4. Disconnect VS Code → verify model dropdown shows disabled state
5. Select unavailable model → verify fallback works with warning
