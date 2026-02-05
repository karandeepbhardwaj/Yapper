# Yapper — Claude Code Instructions

## Project Overview

Yapper is a cross-platform voice-to-text desktop app built with Tauri v2 (Rust backend) + React 18 (frontend). It captures speech via native OS APIs, optionally refines transcripts through AI (multi-provider: Groq, Gemini, Claude, Copilot) via a VS Code extension bridge, and auto-pastes refined text at the active cursor.

## Architecture

```
apps/desktop/          — Tauri desktop app
  src/                 — React frontend (Vite + Tailwind CSS v4)
    app/components/    — Main window UI (MainWindow, LandingPage, HistoryCard)
    app/hooks/         — Custom hooks (useTauriEvents, useHistory, useSettings)
    app/lib/           — Tauri bridge, types
    widget.tsx         — Floating pill widget (separate webview)
    styles/            — CSS custom properties + dark mode tokens
  src-tauri/src/       — Rust backend
    lib.rs             — Slim entry point (~44 lines): mod declarations + run()
    commands.rs        — All Tauri commands, toggle_recording, AppSettings
    widget/mod.rs      — Platform dispatcher for widget setup
    widget/macos.rs    — NSPanel creation, hover/click polling (objc2 + block2)
    widget/windows.rs  — Win32 positioning, hover/click polling (GetCursorPos + GetAsyncKeyState)
    stt/mod.rs         — STT state machine dispatcher
    stt/macos.rs       — Speech-to-text via Swift subprocess (AVAudioRecorder + SFSpeechRecognizer)
    stt/windows.rs     — Speech-to-text via Windows.Media.SpeechRecognition
    bridge.rs          — WebSocket client to VS Code extension (127.0.0.1:9147)
    hotkey.rs          — Global shortcut + Fn key monitoring (macOS)
    history.rs         — History persistence (JSON file in app data dir)
    autopaste.rs       — Cross-platform paste: pbcopy+osascript (macOS) / PowerShell (Windows)

extensions/vscode-bridge/  — VS Code extension
  src/extension.ts         — WebSocket server on 127.0.0.1:9147
  src/copilot-bridge.ts    — Multi-provider LLM refinement (vscode.lm, Groq, Gemini, Anthropic)
  src/protocol.ts          — Shared message types
```

## Monorepo Commands

```bash
pnpm dev              # Run desktop app in dev mode (Vite + Tauri)
pnpm build            # Production frontend build
pnpm tauri build      # Build .dmg / .app / .exe / .msi
pnpm tauri dev        # Dev mode with hot reload
```

## Key Constraints

- **Zero network egress** from the desktop app. All STT is on-device. AI refinement calls go through the local VS Code extension bridge only.
- **Cross-platform**: macOS (primary) and Windows. Platform-specific code is isolated in `widget/macos.rs` vs `widget/windows.rs` and `stt/macos.rs` vs `stt/windows.rs`.
- **macOS interop**: Uses `objc2` + `objc2-app-kit` + `block2` crates (NOT the deprecated `cocoa`/`objc` crates). NSPanel for cross-Space widget, NSEvent monitors for hover/click/Fn key.
- **Windows interop**: Uses `windows` crate for Win32 APIs (GetCursorPos, MonitorFromPoint, GetAsyncKeyState) and WinRT (SpeechRecognizer).
- **Swift subprocesses** (macOS only): STT uses inline Swift scripts compiled at runtime (`/tmp/yapper_recorder.swift`, `/tmp/yapper_transcriber.swift`). First run has ~2s compilation delay.
- **Main thread requirement** (macOS): All AppKit calls (NSPanel, NSWindow) must run on the main thread via `run_on_main_thread`. The objc2 crate enforces this with `MainThreadMarker`.
- **Widget is a separate webview** (`widget.html` / `widget.tsx`) — it communicates with the Rust backend via Tauri events, not shared React state.

## Code Style

- **Rust**: Standard rustfmt. No deprecation warnings expected (cocoa→objc2 migration is complete).
- **TypeScript/React**: Functional components, hooks-only. No class components. Inline styles + Tailwind (no CSS modules).
- **Animations**: Use `motion/react` (framer-motion). Spring animations for interactive elements, ease curves for layout transitions.
- **Platform detection** (frontend): `const isMac = navigator.platform.toUpperCase().includes("MAC");` — used to conditionally show Fn key option and adjust title bar padding.

## Common Pitfalls

- Don't use `enigo` for keyboard simulation — it crashes on macOS (`dispatch_assert_queue_fail`). Use `pbcopy` + `osascript` (macOS) or PowerShell `SendKeys` (Windows).
- Don't use `git add -A` — the repo has build artifacts in `target/` and `dist/`.
- Don't add `Co-Authored-By` lines to commits.
- The widget's hover detection uses Rust-side polling (NSEvent.mouseLocation on macOS, GetCursorPos on Windows) because WebView mouse events don't fire when the app is inactive.
- `SFSpeechRecognizer` callbacks require `CFRunLoopRun()` in CLI Swift scripts — without it, callbacks never fire.
- Swift signal handlers can't capture local variables. Use global `var` for signal flags.
- WAV files must be finalized by calling `recorder.stop()` before process exit, otherwise the header is invalid and transcription fails.
- The Fn key hotkey is macOS-only — the "use fn" button is hidden on Windows via `isMac` check in MainWindow.tsx.

## Testing

No automated test suite yet. Manual testing:
1. Click widget or press `Cmd+Shift+.` (macOS) / `Ctrl+Shift+.` (Windows) → mic permission prompt (first time)
2. Speak → wave animation plays
3. Stop → processing animation → text pastes at cursor
4. If VS Code + LLM provider running: refined text. Otherwise: raw transcript (fallback).
5. History card appears in main window with category/title.

## State Machine

```
Idle → start_recording → Recording → stop_recording → Processing → (paste + save) → Idle
                                    → cancel_recording → Idle (no paste)
```

Widget receives state via `stt-state-changed` Tauri event with payload: `"idle" | "listening" | "processing"`.
