# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also: `AGENTS.md` (full agent guidelines), `DESIGN.md` (design principles + architecture).

## Project Overview

Yapper is a cross-platform voice-to-text desktop app built with Tauri v2 (Rust backend) + React 18 (frontend). It captures speech via native OS APIs, optionally refines transcripts through AI (multi-provider: Groq, Gemini, Claude, Copilot) via a VS Code extension bridge, and auto-pastes refined text at the active cursor. Includes conversation mode for back-and-forth AI chat, dictionary/snippets for text expansion, per-category style settings, metrics tracking, and code reference detection.

## Commands

```bash
bun install                 # Install all dependencies
bun dev                     # Run desktop app in dev mode (Vite + Tauri)
bun tauri dev               # Same as above
bun tauri build             # Build .dmg / .app / .exe / .msi

# After Rust changes:
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

# After VS Code extension changes:
cd extensions/vscode-bridge && bun run compile
```

### Prerequisites

Rust 1.75+, Node.js 20+, Bun (latest). macOS requires Xcode CLI Tools (`xcode-select --install`).

## Architecture

```
apps/desktop/          — Tauri desktop app
  src/                 — React frontend (Vite + Tailwind CSS v4)
    app/components/    — UI components:
      MainWindow.tsx   — History dashboard with search, sort, cards
      ConversationView.tsx — Chat mode with AI
      SettingsView.tsx — Settings page (style, metrics, code mode, hotkey)
      DictionaryView.tsx — Text replacement management
      SnippetsView.tsx — Text expansion management
      HistoryCard.tsx  — History item cards (pinned, conversation, normal)
      MetricsBadges.tsx — Usage statistics display
    app/hooks/         — Custom hooks (useTauriEvents, useHistory, useSettings)
    app/lib/           — Tauri bridge, types
    widget.tsx         — Floating pill widget (separate webview)
    styles/            — CSS custom properties + dark mode tokens + DM Serif Display font
  src-tauri/src/       — Rust backend
    lib.rs             — Entry point: mod declarations + run()
    commands.rs        — All Tauri commands, toggle_recording, AppSettings (hotkey, stt_engine, default_style, style_overrides, metrics_enabled, code_mode, recording_mode, conversation_hotkey), change_recording_mode, change_conversation_hotkey
    conversation.rs    — Conversation mode: start/send_turn/end/discard sessions
    dictionary.rs      — Dictionary CRUD + text replacement before AI refinement (handles trailing punctuation)
    snippets.rs        — Snippets CRUD + trigger detection using word boundary matching (bypasses AI)
    metrics.rs         — Computed usage stats (streak, words, WPM) from history
    store.rs           — Generic JSON persistence: atomic file writes (write-to-tmp-then-rename), shared load/save/data_path, uuid_simple()
    widget/mod.rs      — Platform dispatcher for widget setup
    widget/macos.rs    — NSPanel creation, hover/click polling, setIgnoresMouseEvents passthrough, dock-aware positioning (visibleFrame + full-screen detection via currentSystemPresentationOptions)
    widget/windows.rs  — Win32 positioning, hover/click polling
    stt/mod.rs         — STT state machine dispatcher
    stt/macos.rs       — Speech-to-text via Swift subprocess
    stt/windows.rs     — Speech-to-text via Windows.Media.SpeechRecognition
    bridge.rs          — WebSocket client to VS Code extension (127.0.0.1:9147), supports refine/conversation/summarize with style + code mode, authenticated via random token from ~/.yapper/bridge-token, circuit breaker (3 failures → 30s cooldown)
    hotkey.rs          — Global shortcut + Fn key monitoring (macOS), separate conversation hotkey (Cmd+Shift+Y / Ctrl+Shift+Y)
    history.rs         — History persistence (JSON, supports conversation entries with turns/keyPoints/duration)
    autopaste.rs       — Cross-platform paste: pbcopy+osascript (macOS) / PowerShell (Windows)

extensions/vscode-bridge/  — VS Code extension
  src/extension.ts         — WebSocket server, routes refine/conversation/summarize messages
  src/copilot-bridge.ts    — Multi-provider LLM (vscode.lm, Groq, Gemini, Anthropic), conversation handler, summarize handler, code reference detection, style overrides
  src/protocol.ts          — Message types: RefineRequest (with styleOverrides, codeMode), ConversationRequest, SummarizeRequest
```

## Key Constraints

- **Zero network egress** from the desktop app. All STT is on-device. AI refinement calls go through the local VS Code extension bridge only.
- **Cross-platform**: macOS (primary) and Windows. Platform-specific code isolated in `widget/macos.rs` vs `widget/windows.rs` and `stt/macos.rs` vs `stt/windows.rs`.
- **macOS interop**: Uses `objc2` + `objc2-app-kit` + `block2` crates (NOT deprecated `cocoa`/`objc`).
- **Windows interop**: Uses `windows` crate for Win32 APIs and WinRT.
- **Swift subprocesses** (macOS only): STT uses runtime-compiled Swift scripts in `/tmp/`.
- **Main thread requirement** (macOS): All AppKit calls via `run_on_main_thread` with `MainThreadMarker`. Widget position calculation also runs on the main thread for accurate `visibleFrame()` values.
- **Widget is a separate webview** (`widget.html` / `widget.tsx`) — communicates via Tauri events, `pointer-events: none` on root for click passthrough, `setIgnoresMouseEvents` toggled by hover detection. `useSettings` hook listens for `hotkey-changed` events to keep the UI in sync when hotkeys are changed.
- **Bridge is optional**: Falls back to raw transcript if VS Code isn't running. Circuit breaker skips bridge attempts for 30s after 3 consecutive failures. Authentication via random token in `~/.yapper/bridge-token`.
- **Recording modes**: "Press" (toggle, default) starts/stops on hotkey press. "Hold" starts on press, stops on release (including Fn key release on macOS).
- **Conversation hotkey**: Separate hotkey for starting conversations, default `Cmd+Shift+Y` (macOS) / `Ctrl+Shift+Y` (Windows). Configurable in settings.
- **Atomic writes**: All persistence (history, dictionary, snippets, settings) uses write-to-tmp-then-rename via `store.rs` to prevent data corruption on crash.

## Recording Pipeline

```
1. User triggers hotkey/widget click
2. start_recording → STT begins
3. stop_recording →
   a. Check snippets (detect_and_expand, word boundary matching) → if match, paste directly, skip AI
   b. Apply dictionary replacements (word-by-word, handles trailing punctuation)
   c. Send to bridge with style + styleOverrides + codeMode (bridge authenticated via token)
   d. Bridge refines via LLM → returns refinedText + category + title
   e. If bridge unavailable → emit `refinement-skipped` event, fall back to raw transcript
   f. Auto-paste refined text
   g. Save to history with duration_seconds
```

## Conversation Mode

```
start_conversation → create session
send_conversation_turn → refine user text, send history + message to AI, stream response
end_conversation → summarize via AI, save to history with turns/keyPoints
discard_conversation → clear session without saving
```

Widget emits `conversation-raw-transcript` event when recording stops during active conversation.

## State Machine

```
Idle → start_recording → Recording → stop_recording → Processing → (paste + save) → Idle
                                    → cancel_recording → Idle (no paste)
```

## Code Style

- **Rust**: Standard rustfmt.
- **TypeScript/React**: Functional components, hooks-only. Inline styles + Tailwind (no CSS modules).
- **Animations**: Use `motion/react` (framer-motion). Spring animations for interactive elements.
- **Brand font**: DM Serif Display (bundled TTF) for "Yapper." logo.
- **Accent color**: `#DA7756` (Anthropic terracotta) — single orange throughout.
- **Design language**: Isomorphic 3D shadows (inset highlights, drop shadows, card depth).
- **Platform detection** (frontend): `const isMac = navigator.platform.toUpperCase().includes("MAC");`

## Common Pitfalls

- Don't use `enigo` for keyboard simulation — crashes on macOS. Use `autopaste.rs`.
- Don't use `git add -A` — repo has build artifacts in `target/` and `dist/`.
- Use `YAPPER_SAMPLE_DATA=1 bun tauri dev` to start with sample history data for development/demos.
- Don't add `Co-Authored-By` lines to commits.
- Use `log` macros (`log::info!`, `log::error!`, etc.) instead of `println!` — all println! has been replaced with structured logging.
- Don't resize the NSPanel dynamically — crashes. Widget is fixed at 220x80.
- Don't use Web Speech API — doesn't work in WKWebView.
- Widget `pointer-events: none` on root, `auto` only on pill/tooltip. `setIgnoresMouseEvents` toggled by Rust hover detection for dock click passthrough.
- CSS can't transition between gradients — use overlays or instant switch for background gradient changes.
- `user-select: none` on all elements except inputs to prevent text selection.
- Dictionary replacements happen BEFORE AI refinement. Snippets bypass AI entirely.

## App Views

App.tsx router: `history | conversation | settings | dictionary | snippets`

## Testing

No automated test suite. Manual testing:
1. `bun dev` to start the app
2. Click widget or press hotkey → speak → stop → verify text pastes
3. Conversation mode: press Cmd+Shift+Y → record turns → End to save
4. Settings: gear icon → configure style/hotkey/dictionary/snippets
5. Widget: hover shows tooltip "press fn to yapp", click records, right area passes clicks through to dock
6. Recording modes: Settings → recording mode "Press" (toggle) vs "Hold" (press-and-hold); Fn key release stops recording in hold mode
