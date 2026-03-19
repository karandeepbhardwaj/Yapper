# Voice Commands — Design Spec

## Context

Yapper is a voice-to-text app with a multi-provider Copilot bridge (vscode.lm, Groq, Gemini, Anthropic). Today the bridge only refines dictated text and handles conversation mode. This spec adds **voice commands** — users speak naturally to trigger AI-powered actions like translation, summarization, drafting, and explanation, all routed through the existing bridge infrastructure.

## Overview

Every transcript goes through an **AI intent classifier** before processing. The classifier determines whether the user is dictating text (normal refinement) or issuing a command. Commands route to dedicated action handlers with tailored system prompts. Basic chaining ("translate and then summarize") is supported.

## Architecture

### Unified Command Flow

```
User speaks → STT → Snippets/Dictionary → Desktop reads clipboard
    → {type: "command", rawText, clipboard} → Bridge
    → Fast model classifies intent → Route to handler
    → Handler generates result → Auto-paste
```

1. User presses the dictation hotkey and speaks
2. STT captures raw transcript; snippets and dictionary applied as usual
3. Desktop reads system clipboard (truncated to 10K chars)
4. Desktop sends `{type: "command", id, rawText, clipboard, style, codeMode}` to bridge
5. Bridge runs intent classifier on fastest available model
6. If `dictation`: normal refinement path (same as today's `{type: "refine"}`)
7. If known command: route to dedicated action handler
8. If unknown: route to generic handler with AI-extracted description
9. If chain: execute actions sequentially, piping output forward
10. Result auto-pasted at cursor and saved to history with action metadata

### Intent Classifier

Runs on the **fastest available model** (Groq preferred, then Gemini). This is classification, not generation — speed matters more than capability.

**System prompt:**
```
You are a voice command classifier. Given a transcript, determine the user's intent.
Return JSON only. Possible intents: dictation, translate, summarize, draft, explain, unknown.
For "unknown", include a description of what the user wants.
For chained requests (e.g., "translate and summarize"), return an actions array.
```

**Output format:**

```json
// Regular dictation
{"intent": "dictation"}

// Simple command
{"intent": "translate", "params": {"targetLang": "Spanish"}, "inputSource": "spoken"}

// Chained command
{"intent": "chain", "actions": [
  {"intent": "translate", "params": {"targetLang": "Spanish"}, "inputSource": "clipboard"},
  {"intent": "summarize", "params": {}, "inputSource": "previous"}
]}

// Freeform / unknown
{"intent": "unknown", "description": "User wants to rewrite this as a haiku"}
```

**`inputSource` values:**
- `"spoken"` — the user's words are the content (e.g., "translate hello world to Spanish")
- `"clipboard"` — act on clipboard content (e.g., "summarize this" with something copied)
- `"previous"` — in a chain, use the output of the previous action

### Action Handlers

Each handler gets its own tailored system prompt and can specify a model tier.

**Model tiers:** Handlers specify `"fast"` or `"quality"` tier. The classifier always uses `"fast"` (Groq preferred, then Gemini). Action handlers use whichever tier they specify:
- `"fast"` — uses the existing provider fallback chain as-is (Groq → Gemini → others)
- `"quality"` — skips Groq/Gemini, tries vscode.lm first, then Anthropic. Falls back to fast tier if quality providers are unavailable.

#### Translate
- **Prompt:** Translate text naturally, preserving tone and formatting
- **Params:** `targetLang` (extracted by classifier)
- **Input:** spoken text or clipboard
- **Model tier:** `"fast"` — translation is well-handled by all models

#### Summarize
- **Prompt:** Produce a concise summary with key points
- **Params:** None initially
- **Input:** Typically clipboard content
- **Model tier:** `"quality"` — nuanced summarization benefits from stronger models

#### Draft
- **Prompt:** Generate structured writing matching the requested type and topic
- **Params:** `type` ("email", "message", "PR description", "commit message", etc.), `topic` (from speech)
- **Input:** User's spoken description
- **Model tier:** `"quality"` — structured writing needs stronger models

#### Explain
- **Prompt:** Explain clearly, adapting to whether content is code or general text
- **Params:** None
- **Input:** Clipboard content
- **Model tier:** `"quality"` — especially important for code explanation

#### Unknown (AI Fallback)
- **Prompt:** Generic — "The user wants to: {description}. Process the following text accordingly."
- **Params:** `description` (from classifier)
- **Input:** Spoken text or clipboard, depending on classifier's `inputSource`
- **Model tier:** `"quality"` — flexible tasks benefit from capability

### Chaining

- Actions execute sequentially
- Each action's output becomes the next action's input when `inputSource: "previous"`
- Final action's output is what gets pasted
- Streaming: chunks stream from the final action only (intermediate results are not streamed)

## Bridge Protocol Changes

### New Desktop → Bridge Message

```json
{
  "type": "command",
  "id": "unique-id",
  "rawText": "translate this to Spanish",
  "clipboard": "text from clipboard or null",
  "style": "professional",
  "codeMode": false
}
```

- `clipboard`: Current clipboard contents (string or null), truncated to 10K chars
- `style` and `codeMode`: Passed through for when classifier determines regular dictation

### New Bridge → Desktop Message

```json
{
  "type": "command_result",
  "id": "unique-id",
  "result": "the generated text",
  "action": "translate",
  "params": {"targetLang": "Spanish"}
}
```

- `action`: Which action was executed (translate, summarize, draft, explain, dictation, unknown)
- `params`: Extracted parameters, saved to history for display

### Streaming

Same `{type: "chunk", id, refinedText}` pattern as today. Actions stream output as they generate.

### Backward Compatibility

- Old desktop sending `{type: "refine"}` to new bridge: works as today, no change
- New desktop sending `{type: "command"}` to old bridge: bridge returns error, desktop falls back to `{type: "refine"}`

## Desktop-Side Changes

### Clipboard Reading (Rust)

New function in `commands.rs` or `bridge.rs`:
- macOS: `pbpaste` via `std::process::Command`
- Windows: Win32 clipboard API (already have `windows` crate)
- Truncate to 10K chars to avoid oversized messages

### History Metadata

`history.rs` — add fields to history entries:
- `action: Option<String>` — which action was performed
- `action_params: Option<serde_json::Value>` — extracted parameters

### Widget Feedback

Widget states expanded:
- Idle → Listening → **Classifying** → Processing → Done
- During "Processing", show detected action: "Translating...", "Summarizing...", "Drafting...", "Explaining..."

### Frontend Changes

- `HistoryCard.tsx`: Show action type as a badge (e.g., "Translated to Spanish")
- `MainWindow.tsx`: Add action type filter to history
- No settings changes needed — commands work automatically via the dictation hotkey

## Files to Modify

### Bridge (VS Code Extension)
- `extensions/vscode-bridge/src/copilot-bridge.ts` — add intent classifier, action handlers, chaining logic
- `extensions/vscode-bridge/src/extension.ts` — handle new `{type: "command"}` message type
- `extensions/vscode-bridge/src/protocol.ts` — add new message type definitions

### Desktop (Rust)
- `apps/desktop/src-tauri/src/bridge.rs` — send `{type: "command"}` with clipboard, handle `command_result`
- `apps/desktop/src-tauri/src/commands.rs` — add clipboard reading, update recording pipeline
- `apps/desktop/src-tauri/src/history.rs` — add `action` and `action_params` fields

### Desktop (Frontend)
- `apps/desktop/src/app/components/HistoryCard.tsx` — action badge display
- `apps/desktop/src/app/components/MainWindow.tsx` — action type filter in history
- `apps/desktop/src/widget.tsx` — show action name during processing state

## Verification

This project has no automated test suite. All verification is manual via `bun dev`.

1. **Compile check:** `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` and `cd extensions/vscode-bridge && bun run compile` both pass
2. **Regular dictation still works:** Speak normally → refined text pastes as before (regression check)
3. **Translate:** Say "translate hello world to Spanish" → Spanish text pasted
4. **Summarize:** Copy a paragraph, say "summarize this" → summary pasted
5. **Draft:** Say "draft an email about tomorrow's meeting" → email draft pasted
6. **Explain:** Copy code, say "explain this function" → explanation pasted
7. **Unknown fallback:** Say something novel like "rewrite this as a haiku" → AI handles it
8. **Chaining:** Say "translate this to French and then summarize it" → translated summary pasted
9. **Widget feedback:** Verify widget shows "Translating..." / "Summarizing..." during processing
10. **History:** Verify action badges appear on history cards, action filter works
11. **Backward compat:** Old `{type: "refine"}` still works if sent directly
