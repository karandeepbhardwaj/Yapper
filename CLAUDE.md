# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also: `AGENTS.md` (full agent guidelines), `DESIGN.md` (design principles + architecture).

## Project Overview

Yapper is a cross-platform voice-to-text desktop app built with Tauri v2 (Rust backend) + React 18 (frontend). It captures speech, transcribes it **fully on-device** with whisper.cpp, refines the transcript with a **bundled local LLM**, and auto-pastes the result at the active cursor.

**The app is fully self-contained and offline.** Both the Whisper model and the refinement LLM ship inside the app — there is no install step, no API keys, no internet, and no external Ollama dependency:
- **STT:** whisper.cpp via `whisper-rs`, using a bundled `ggml-base.bin`.
- **Refinement:** a bundled Ollama server runtime + **Qwen2.5-1.5B** (`qwen2.5:1.5b`), auto-started as a private sidecar on `127.0.0.1:11435`. If the sidecar isn't reachable, dictation still works and the raw transcript is pasted (`refinement-skipped`).

> **History note:** Earlier versions had a VS Code/Copilot bridge, a Groq/Anthropic API-key mode, a screen-capture/vision feature, and a Whisper model downloader/picker — **all removed**. The model is small for app-size reasons, so refinement is good-but-basic.

Features: voice commands (translate, summarize, draft, explain, chain) via an AI-first intent classifier, conversation mode, dictionary/snippets for text expansion, per-category style settings, usage metrics, code-reference detection.

## Commands

```bash
bun install                 # Install JS dependencies
apps/desktop/scripts/fetch-models.sh   # Fetch bundled assets (~1GB, once; git-ignored)
bun tauri dev               # Run desktop app in dev mode (Vite + Tauri)
bun tauri build             # Build .dmg / .app / .exe / .msi

# After Rust changes:
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

# Start with sample history data (dev/demos):
YAPPER_SAMPLE_DATA=1 bun tauri dev
```

### Prerequisites

Rust 1.75+, Node.js 20+, Bun, **CMake** (compiles whisper.cpp on first build — `brew install cmake`), Xcode CLI Tools (macOS). No Ollama install needed — it's bundled. `fetch-models.sh` needs internet **at build time only** (downloads the Whisper model, the Ollama runtime, and pulls `qwen2.5:1.5b` into a bundled store).

## Bundled assets (offline)

Fetched by `scripts/fetch-models.sh` into `src-tauri/resources/` (all git-ignored) and shipped via `tauri.conf.json` → `bundle.resources`:
- `resources/models/ggml-base.bin` — Whisper model.
- `resources/ollama/` — Ollama server runtime (binary + libs).
- `resources/ollama-models/` — pre-pulled `qwen2.5:1.5b` model store.

`bundle.resources` uses the **array + recursive-glob form** (`["resources/models/*.bin", "resources/ollama/**/*", "resources/ollama-models/**/*"]`). This preserves the nested model-store structure AND actually bundles into the production `.app`. Pitfalls learned the hard way: the **map form** (`{"resources/ollama":"ollama"}`) staged in `tauri dev` but silently bundled **nothing** in `tauri build`; the **map + `**/*` glob** form FLATTENS subdirectories and breaks the Ollama model store. At runtime the array form preserves the source path, so resources resolve under `app.path().resource_dir()/resources/...` (note the extra `resources/` segment).

## Architecture

```
apps/desktop/          — Tauri desktop app
  src/                 — React frontend (Vite 6 + Tailwind CSS v4 + Motion)
    app/App.tsx        — Router: history | conversation | settings | dictionary | snippets | help
    app/components/    — UI: MainWindow (history dashboard, Fuse.js search), ConversationView,
                         SettingsView (General, Speech Recognition [language + live-transcript],
                         Style, Appearance, Code Mode, Metrics, Dictionary/Snippets nav),
                         DictionaryView, SnippetsView, HistoryCard, MetricsBadges, HelpView
    app/hooks/         — useTauriEvents, useHistory, useSettings
    app/lib/           — tauri-bridge.ts (IPC wrappers), types.ts, tokens.ts
    widget.tsx         — Floating pill widget (separate webview)
  src-tauri/src/       — Rust backend
    lib.rs             — Entry point: module decls + run() + invoke_handler; starts/stops the sidecar
    main.rs            — Binary shim → yapper_lib::run()
    commands.rs        — All Tauri commands, recording pipeline, AppSettings (see below)
    sidecar.rs         — Bundled Ollama lifecycle: stages model store to app-data, spawns
                         `ollama serve` on 127.0.0.1:11435, kills on exit. MODEL = "qwen2.5:1.5b".
    ai_provider.rs     — Local LLM calls (call_ollama → POST /v1/chat/completions on the sidecar);
                         intent classification + voice-command routing. Ollama-only.
    conversation.rs    — Conversation mode: start / send_turn / end / discard sessions
    dictionary.rs      — Dictionary CRUD + replacement before AI refinement
    snippets.rs        — Snippets CRUD + word-boundary trigger detection (bypasses AI)
    metrics.rs         — Computed usage stats (streak, words, WPM) from history
    history.rs         — History persistence (JSON; conversation entries with turns/keyPoints)
    store.rs           — Generic JSON persistence: atomic write-to-tmp-then-rename, uuid_simple()
    hotkey.rs          — Global shortcuts + Fn-key monitoring (macOS); separate conversation hotkey
    autopaste.rs       — Cross-platform paste: pbcopy+osascript (macOS) / PowerShell (Windows)
    stt/mod.rs         — Recording STATE MACHINE only (Idle → Recording → Processing)
    model_manager.rs   — Resolves the bundled Whisper model path (resource_dir, ~/.yapper fallback)
    widget/{mod,macos,windows}.rs — Floating widget (NSPanel on macOS; Win32 on Windows)
    providers/mod.rs            — SttProvider trait + ConversationTurnMsg / PartialTranscript
    providers/stt_whisper.rs    — WhisperCppProvider: cpal capture (16 kHz mono) + whisper-rs
```

### AppSettings (commands.rs)

`hotkey`, `default_style` (Professional), `style_overrides`, `metrics_enabled`, `code_mode`,
`recording_mode` ("toggle" default | "hold"), `conversation_hotkey` (Cmd/Ctrl+Shift+Y),
`theme` ("system"), `whisper_model` (unused legacy default; model is the bundled `base`),
`whisper_language` ("auto"), `streaming_enabled`. Persisted via `store.rs` atomic writes.
There are no AI/model/server settings — refinement is fixed to the bundled model.

## Key Constraints

- **100% local & offline.** STT on-device; refinement via the bundled Ollama sidecar at `127.0.0.1:11435/v1/chat/completions`. No cloud, no API keys, no downloads at runtime. Override the URL with `YAPPER_OLLAMA_URL` (dev only).
- **Sidecar lifecycle** (`sidecar.rs`): on `setup()` the app copies the read-only bundled model store to a writable app-data dir (first run), then spawns `ollama serve` on a **private** port (never 11434, so it can't clash with a user's own Ollama); killed on window close. `MODEL`/`OLLAMA_HOST` constants live here and are referenced by `ai_provider.rs`, `commands.rs`, `conversation.rs`.
- **Whisper STT only.** `whisper-rs` with the bundled `base` model resolved via `model_manager::resolve_model_path` (bundled resource first, `~/.yapper/models` fallback). No native STT, no downloader, no picker.
- **Cross-platform**: macOS (primary, current bundling target) and Windows. The bundled Ollama runtime is currently macOS; Windows sidecar is a follow-up. Platform code isolated in `widget/macos.rs` vs `widget/windows.rs`.
- **macOS interop**: `objc2` + `objc2-app-kit` + `block2` (NOT deprecated `cocoa`/`objc`). AppKit calls on the main thread via `run_on_main_thread`.
- **Widget is a separate webview** (`widget.html` / `widget.tsx`) — Tauri events; `pointer-events: none` on root, `setIgnoresMouseEvents` toggled by Rust hover detection.
- **Voice commands**: AI-first intent classification (translate / summarize / draft / explain / chain) before standard refinement.
- **Recording modes**: "toggle" (default) and "hold" (Fn-key release also stops on macOS).
- **Atomic writes**: history, dictionary, snippets, settings via write-to-tmp-then-rename.

## Recording Pipeline

```
1. Hotkey / widget click → start_recording → cpal capture → whisper-rs (stt-partial events)
2. stop_recording →
   a. Snippets check (word-boundary) → if match, paste directly, skip AI
   b. Dictionary replacements
   c. AI-first intent classification → voice command? → dispatch handler → paste result
   d. (Non-command) Refine via the bundled sidecar (ai_provider::send_command, MODEL)
      → refinedText + category + title; if sidecar down → `refinement-skipped`, paste raw
   e. Auto-paste → save to history with duration_seconds
```

## Conversation Mode

`start_conversation` → `send_conversation_turn` (refine + send history to the sidecar, stream) →
`end_conversation` (summarize, save with turns/keyPoints) / `discard_conversation`.
Widget emits `conversation-raw-transcript` when recording stops during an active conversation.

## Tauri Commands (registered in lib.rs)

Recording: `start_recording`, `stop_recording`, `cancel_recording`, `stop_recording_raw`, `paste_last_transcript`.
History: `get_history`, `clear_history`, `delete_history_item`, `toggle_pin_item`.
Settings/hotkeys: `get_settings`, `save_settings`, `change_hotkey`, `change_recording_mode`, `change_conversation_hotkey`.
Conversation: `start_conversation`, `send_conversation_turn`, `end_conversation`, `is_conversation_active`, `discard_conversation`.
Dictionary: `get_all_entries`, `add_entry`, `update_entry`, `delete_entry`, `toggle_favorite`.
Snippets: `get_all_snippets`, `add_snippet`, `update_snippet`, `delete_snippet`, `toggle_snippet_favorite`.
Misc: `get_metrics`, `check_speech_permission`, `debug_log`, `open_main_window`, `navigate_to`.

## Code Style

- **Rust**: rustfmt. Use `log` macros, not `println!`.
- **TypeScript/React**: functional components, hooks-only. Inline styles + Tailwind (no CSS modules).
- **Animations**: `motion/react`; spring animations for interactive elements.
- **Brand font**: DM Serif Display (bundled TTF). **Accent**: `#DA7756`.
- **Platform detection** (frontend): `navigator.platform.toUpperCase().includes("MAC")`.

## Common Pitfalls

- Don't add `Co-Authored-By` lines to commits.
- Don't use `git add -A` blindly — `target/`, `dist/`, and the large bundled assets in `resources/` are git-ignored.
- Bundled `resources/` use the array + `**/*` glob form in `tauri.conf.json` (preserves structure AND bundles in `tauri build`). Don't switch to the map form — it silently bundles nothing in production; and the map+glob form flattens the model store.
- Don't use `enigo` (crashes on macOS) — use `autopaste.rs`. Don't use the Web Speech API (no WKWebView support).
- whisper-rs requires **CMake** on first build. cpal needs microphone permission (macOS).
- Don't resize the NSPanel dynamically — crashes. Widget is fixed at 220×80 (recording height 62).
- Widget `pointer-events: none` on root; `setIgnoresMouseEvents` toggled by Rust hover detection.
- Dictionary replacements run BEFORE AI refinement; snippets bypass AI entirely.

## Testing

No automated test suite. Manual testing:
1. `apps/desktop/scripts/fetch-models.sh` (once), then `bun tauri dev`.
2. Confirm the sidecar is up: `curl 127.0.0.1:11435/api/tags` lists `qwen2.5:1.5b`.
3. Click widget or press hotkey → speak → stop → verify transcript pastes **refined** (no `unrefined` badge).
4. Conversation mode: `Cmd+Shift+Y` → record turns → End to save.
5. Settings: language / hotkeys / style / dictionary / snippets.
6. Recording modes: "toggle" vs "hold" (Fn-key release stops in hold mode on macOS).
