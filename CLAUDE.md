# Yapper — Claude Code Instructions

## Project Overview

Yapper is a voice-to-text desktop app built with Tauri v2 (Rust backend) + React 18 (frontend). It captures speech via native OS APIs, optionally refines transcripts through GitHub Copilot via a VS Code extension bridge, and auto-pastes refined text at the active cursor.

## Architecture

```
apps/desktop/          — Tauri desktop app
  src/                 — React frontend (Vite + Tailwind CSS v4)
    app/components/    — Main window UI (MainWindow, LandingPage, HistoryCard)
    app/hooks/         — Custom hooks (useTauriEvents, useHistory, useSettings)
    widget.tsx         — Floating pill widget (separate webview)
    styles/theme.css   — CSS custom properties + dark mode tokens
  src-tauri/src/       — Rust backend
    lib.rs             — Core: NSPanel creation, hover/click polling, Tauri commands
    stt/macos.rs       — Speech-to-text via Swift subprocess (AVAudioRecorder + SFSpeechRecognizer)
    stt/windows.rs     — Windows STT stub (not yet implemented)
    bridge.rs          — WebSocket client to VS Code extension (127.0.0.1:9147)
    hotkey.rs          — Global shortcut (Cmd+Shift+.)
    history.rs         — History persistence
    autopaste.rs       — pbcopy + osascript paste at cursor

extensions/vscode-bridge/  — VS Code extension
  src/extension.ts         — WebSocket server on 127.0.0.1:9147
  src/copilot-bridge.ts    — vscode.lm API calls to Copilot for refinement
  src/protocol.ts          — Shared message types
```

## Monorepo Commands

```bash
pnpm dev              # Run desktop app in dev mode (Vite + Tauri)
pnpm build            # Production build
pnpm tauri build      # Build .dmg / .app
cd extensions/vscode-bridge && npm run compile   # Build VS Code extension
cd extensions/vscode-bridge && npx vsce package  # Package .vsix
```

## Key Constraints

- **Zero network egress** from the desktop app. All STT is on-device. Copilot calls go through the local VS Code extension bridge only.
- **macOS-specific**: NSPanel (cross-Space widget), SFSpeechRecognizer, AVAudioRecorder, pbcopy/osascript paste. All macOS interop uses the `cocoa`/`objc` crates.
- **Swift subprocesses**: STT uses inline Swift scripts compiled at runtime (`/tmp/yapper_recorder.swift`, `/tmp/yapper_transcriber.swift`). First run has ~2s compilation delay.
- **Main thread requirement**: All AppKit calls (NSPanel, NSWindow) must run on the main thread via `run_on_main_thread`.
- **Widget is a separate webview** (`widget.html` / `widget.tsx`) — it communicates with the Rust backend via Tauri events, not shared React state.

## Code Style

- **Rust**: Standard rustfmt. The `cocoa` crate causes deprecation warnings (recommends objc2 migration) — these are expected, don't try to fix them.
- **TypeScript/React**: Functional components, hooks-only. No class components. Inline styles + Tailwind (no CSS modules).
- **Animations**: Use `motion/react` (framer-motion). Spring animations for interactive elements, ease curves for layout transitions.
- **UI components**: shadcn/ui components exist in `src/app/components/ui/` but most UI is custom-built with inline styles for precise control.

## Common Pitfalls

- Don't use `enigo` for keyboard simulation — it crashes on macOS (`dispatch_assert_queue_fail`). Use `pbcopy` + `osascript` instead.
- Don't use `git add -A` — the repo has build artifacts in `target/` and `dist/`.
- Don't add `Co-Authored-By` lines to commits.
- The widget's hover detection uses Rust-side `NSEvent.mouseLocation` polling because WebView mouse events don't fire when the app is inactive.
- `SFSpeechRecognizer` callbacks require `CFRunLoopRun()` in CLI Swift scripts — without it, callbacks never fire.
- Swift signal handlers can't capture local variables. Use global `var` for signal flags.
- WAV files must be finalized by calling `recorder.stop()` before process exit, otherwise the header is invalid and transcription fails.

## Testing

No automated test suite yet. Manual testing:
1. Click widget or press `Cmd+Shift+.` → mic permission prompt (first time)
2. Speak → wave animation plays
3. Stop → processing animation → text pastes at cursor
4. If VS Code + Copilot running: refined text. Otherwise: raw transcript (fallback).
5. History card appears in main window with category/title.

## State Machine

```
Idle → start_recording → Recording → stop_recording → Processing → (paste + save) → Idle
                                    → cancel_recording → Idle (no paste)
```

Widget receives state via `stt-state-changed` Tauri event with payload: `"idle" | "listening" | "processing"`.
