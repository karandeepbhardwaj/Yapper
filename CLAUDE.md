# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also: `AGENTS.md` (full agent guidelines), `DESIGN.md` (design principles + architecture).

## Project Overview

Yapper is a cross-platform voice-to-text desktop app built with Tauri v2 (Rust backend) + React 18 (frontend). It captures speech, transcribes it **fully on-device** with whisper.cpp, optionally refines the transcript through a **local LLM (Ollama)**, and auto-pastes the result at the active cursor.

**As of v0.5.0 everything runs locally — there is no cloud, no API keys, and no external app dependency.** Speech-to-text is on-device (whisper.cpp via `whisper-rs`); AI refinement goes to a local Ollama server over `localhost:11434`. If Ollama isn't running, dictation still works and the raw transcript is pasted.

> **History note:** Earlier versions (≤0.4.x) supported a VS Code/Copilot bridge and a direct Groq/Anthropic "API key" mode. Both were removed in the v0.5.0 migration to the local stack. Some Groq/Anthropic helper code still lingers in `ai_provider.rs` (`call_groq`, `call_anthropic`) and `providers/ai_direct.rs` (`DirectAiProvider`), but it is **dead/legacy** — not referenced by the live pipeline, which hardcodes the `"ollama"` provider. The `extensions/vscode-bridge/` directory only contains stale build artifacts.

Features: voice commands (translate, summarize, draft, explain, chain) detected by an AI-first intent classifier, screen-capture commands routed to vision/OCR, conversation mode for back-and-forth chat, dictionary/snippets for text expansion, per-category style settings, usage metrics, and code-reference detection.

## Commands

```bash
bun install                 # Install all dependencies
bun dev                     # Run desktop app in dev mode (Vite + Tauri)
bun tauri dev               # Same as above
bun tauri build             # Build .dmg / .app / .exe / .msi

# After Rust changes:
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

# Start with sample history data (dev/demos):
YAPPER_SAMPLE_DATA=1 bun tauri dev
```

### Prerequisites

Rust 1.75+, Node.js 20+, Bun (latest), **CMake** (required to compile whisper.cpp on first build — `brew install cmake`). macOS requires Xcode CLI Tools (`xcode-select --install`). **Ollama** must be installed and running for AI refinement (`ollama pull llama3.2`, `ollama serve`).

## Architecture

```
apps/desktop/          — Tauri desktop app
  src/                 — React frontend (Vite 6 + Tailwind CSS v4 + Motion)
    app/App.tsx        — Router: history | conversation | settings | dictionary | snippets | help
    app/components/    — UI components:
      MainWindow.tsx       — History dashboard: Fuse.js search, sort, category filter, action badges
      ConversationView.tsx — Chat mode with the local LLM
      SettingsView.tsx     — Settings: Speech Recognition (Whisper model/language), Local AI (Ollama
                             model + server URL + live status), Screen Capture, theme, hotkeys,
                             recording mode, style, dictionary, snippets, metrics, code mode
      DictionaryView.tsx   — Text replacement management
      SnippetsView.tsx     — Text expansion management
      HistoryCard.tsx      — History item cards (pinned / conversation / normal; action badges)
      MetricsBadges.tsx    — Usage statistics display
      HelpView.tsx         — "How to Yapp" help screen with voice command reference
    app/hooks/         — useTauriEvents, useHistory, useSettings
    app/lib/           — tauri-bridge.ts (IPC wrappers), types.ts, tokens.ts
    widget.tsx         — Floating pill widget (separate webview)
  src-tauri/src/       — Rust backend
    lib.rs             — Entry point: module declarations + run() + invoke_handler (command registry)
    main.rs            — Binary shim → yapper_lib::run()
    commands.rs        — All Tauri commands, recording pipeline, AppSettings (see below)
    ai_provider.rs     — Local Ollama calls (call_ollama → POST /v1/chat/completions); intent
                         classification + voice-command routing. (Legacy call_groq/call_anthropic unused.)
    conversation.rs    — Conversation mode: start / send_turn / end / discard sessions
    dictionary.rs      — Dictionary CRUD + replacement before AI refinement (handles trailing punctuation)
    snippets.rs        — Snippets CRUD + trigger detection via word-boundary matching (bypasses AI)
    metrics.rs         — Computed usage stats (streak, words, WPM) from history
    history.rs         — History persistence (JSON; supports conversation entries with turns/keyPoints)
    store.rs           — Generic JSON persistence: atomic write-to-tmp-then-rename, uuid_simple()
    hotkey.rs          — Global shortcuts + Fn-key monitoring (macOS); separate conversation hotkey
    autopaste.rs       — Cross-platform paste: pbcopy+osascript (macOS) / PowerShell (Windows)
    stt/mod.rs         — Recording STATE MACHINE only (Idle → Recording → Processing). No STT logic here.
    model_manager.rs   — Whisper model download / verify / status (downloads to ~/.yapper/models/)
    widget/mod.rs      — Platform dispatcher for widget setup
    widget/macos.rs    — NSPanel creation, hover/click polling, setIgnoresMouseEvents passthrough,
                         dock-aware positioning (visibleFrame + full-screen detection)
    widget/windows.rs  — Win32 positioning, hover/click polling
    providers/mod.rs            — Trait definitions: SttProvider, AiProvider, VisionProvider
    providers/stt_whisper.rs    — WhisperCppProvider: cpal capture (16 kHz mono) + whisper-rs streaming
    providers/ai_direct.rs      — DirectAiProvider (Groq/Anthropic). LEGACY — not wired into the pipeline.
    providers/vision_native.rs  — NativeOcrProvider (Apple Vision / Windows OCR)
    screen_capture/mod.rs       — Screen capture dispatcher
    screen_capture/macos.rs     — macOS screenshot (Swift subprocess)
    screen_capture/windows.rs   — Windows placeholder

extensions/vscode-bridge/  — DEAD: source removed in v0.5.0; only stale .vsix / out/*.js artifacts remain.
```

### AppSettings (commands.rs)

`hotkey`, `default_style` (Professional), `style_overrides`, `metrics_enabled`, `code_mode`,
`recording_mode` ("toggle" default | "hold"), `conversation_hotkey` (Cmd/Ctrl+Shift+Y),
`ollama_model` ("llama3.2"), `ollama_url` ("http://localhost:11434"), `theme` ("system" default),
`whisper_model`, `whisper_language` ("auto"), `screen_capture_hotkey` (Cmd/Ctrl+Shift+0),
plus streaming + save-screenshots toggles. Persisted via `store.rs` atomic writes.

## Key Constraints

- **100% local.** STT is on-device (whisper.cpp); AI refinement is a local Ollama HTTP call to `localhost:11434/v1/chat/completions` (OpenAI-compatible). No cloud, no API keys. Override the server with `YAPPER_OLLAMA_URL`.
- **Ollama is optional at runtime.** If `ollama serve` isn't running, the pipeline emits `refinement-skipped` and pastes the raw transcript with a "Local AI not running" notice.
- **Whisper STT only.** Primary (and only) STT is `whisper-rs`. Native OS STT was removed — there is no longer a native fallback. Models download from Hugging Face to `~/.yapper/models/` on first use; a model must be selected in Settings → Speech Recognition before transcription works.
- **Provider traits.** STT / AI / Vision use trait-based dispatch (`providers/mod.rs`) via factory functions in `commands.rs`.
- **Cross-platform**: macOS (primary) and Windows. Platform code is isolated in `widget/macos.rs` vs `widget/windows.rs` and `screen_capture/macos.rs` vs `screen_capture/windows.rs`.
- **macOS interop**: `objc2` + `objc2-app-kit` + `block2` (NOT deprecated `cocoa`/`objc`). All AppKit calls run on the main thread via `run_on_main_thread` with `MainThreadMarker`.
- **Windows interop**: `windows` crate (Win32 + WinRT).
- **Swift subprocesses** (macOS): screen capture compiles/runs a Swift script.
- **Widget is a separate webview** (`widget.html` / `widget.tsx`) — talks to the backend via Tauri events; `pointer-events: none` on root for click passthrough, `setIgnoresMouseEvents` toggled by Rust hover detection.
- **Voice commands**: AI-first intent classification detects translate / summarize / draft / explain / chain (+ screen_summarize / screen_extract / screen_explain) before standard refinement.
- **Recording modes**: "toggle" (default — press to start, press to stop) and "hold" (press-and-hold; Fn-key release also stops on macOS).
- **Atomic writes**: history, dictionary, snippets, and settings all persist via write-to-tmp-then-rename.
- **Screen Capture**: macOS uses a Swift subprocess; requires Screen Recording permission. Vision routes to native OCR (`vision_native.rs`).

## Recording Pipeline

```
1. User triggers hotkey/widget click
2. start_recording → cpal audio capture → whisper-rs streaming → stt-partial events → final pass on stop
3. stop_recording →
   a. Snippets check (word-boundary match) → if match, paste directly, skip AI
   b. Dictionary replacements (word-by-word, handles trailing punctuation)
   c. AI-first intent classification → detect voice/screen commands
      - Voice command → dispatch handler → execute → paste result
      - Screen command → capture screen → route to vision/OCR provider
   d. (Non-command) Refine via local Ollama (ai_provider::send_command, "ollama")
      → returns refinedText + category + title
      → if Ollama unavailable → emit `refinement-skipped`, fall back to raw transcript
   e. Auto-paste
   f. Save to history with duration_seconds
```

## Conversation Mode

```
start_conversation       → create session
send_conversation_turn   → refine user text, send history + message to Ollama, stream response
end_conversation         → summarize via Ollama, save to history with turns/keyPoints
discard_conversation     → clear session without saving
```

Widget emits `conversation-raw-transcript` when recording stops during an active conversation.

## State Machine

```
Idle → start_recording → Recording → stop_recording → Processing → (paste + save) → Idle
                                    → cancel_recording → Idle (no paste)
```

## Tauri Commands (registered in lib.rs)

Recording: `start_recording`, `stop_recording`, `cancel_recording`, `stop_recording_raw`, `paste_last_transcript`.
History: `get_history`, `clear_history`, `delete_history_item`, `toggle_pin_item`.
Settings/hotkeys: `get_settings`, `save_settings`, `change_hotkey`, `change_recording_mode`, `change_conversation_hotkey`.
Ollama: `check_ollama_status`, `test_ollama`.
Whisper models: `get_model_status`, `download_whisper_model`, `delete_whisper_model`.
Screen capture: `capture_screen`, `cancel_screen_capture`.
Conversation: `start_conversation`, `send_conversation_turn`, `end_conversation`, `is_conversation_active`, `discard_conversation`.
Dictionary: `get_all_entries`, `add_entry`, `update_entry`, `delete_entry`, `toggle_favorite`.
Snippets: `get_all_snippets`, `add_snippet`, `update_snippet`, `delete_snippet`, `toggle_snippet_favorite`.
Misc: `get_metrics`, `check_speech_permission`, `debug_log`, `open_main_window`, `navigate_to`.

## Code Style

- **Rust**: standard rustfmt. Use `log` macros (`log::info!`, etc.) — not `println!`.
- **TypeScript/React**: functional components, hooks-only. Inline styles + Tailwind (no CSS modules).
- **Animations**: `motion/react` (framer-motion); spring animations for interactive elements.
- **Brand font**: DM Serif Display (bundled TTF) for the "Yapper." logo.
- **Accent color**: `#DA7756` (Anthropic terracotta) — single orange throughout.
- **Platform detection** (frontend): `const isMac = navigator.platform.toUpperCase().includes("MAC");`

## Common Pitfalls

- Don't add `Co-Authored-By` lines to commits.
- Don't use `git add -A` — repo has build artifacts in `target/` and `dist/`.
- Don't use `enigo` for keyboard simulation — crashes on macOS. Use `autopaste.rs`.
- Don't use the Web Speech API — doesn't work in WKWebView. STT is whisper-rs only.
- whisper-rs requires **CMake** for the first build (it compiles whisper.cpp C++).
- cpal audio capture needs microphone permission; screen capture needs Screen Recording permission (macOS).
- Don't resize the NSPanel dynamically — crashes. Widget is fixed at 220×80 (recording height 62).
- Widget `pointer-events: none` on root, `auto` only on pill/tooltip; `setIgnoresMouseEvents` toggled by Rust hover detection.
- CSS can't transition between gradients — use overlays or instant switch.
- `user-select: none` everywhere except inputs.
- Dictionary replacements run BEFORE AI refinement; snippets bypass AI entirely.

## Testing

No automated test suite. Manual testing:
1. Ensure `ollama serve` is running and a model is pulled (`ollama pull llama3.2`); download a Whisper model in Settings.
2. `bun dev` → click widget or press hotkey → speak → stop → verify text pastes.
3. Conversation mode: `Cmd+Shift+Y` → record turns → End to save.
4. Settings: configure style / hotkeys / dictionary / snippets / Whisper model / Ollama model.
5. Widget: hover shows tooltip, click records, right area passes clicks through to dock.
6. Recording modes: "toggle" vs "hold" (Fn-key release stops in hold mode on macOS).
