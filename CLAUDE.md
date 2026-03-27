# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also: `AGENTS.md` (full agent guidelines), `DESIGN.md` (design principles + architecture).

## Project Overview

Yapper is a cross-platform voice-to-text desktop app built with Tauri v2 (Rust backend) + React 18 (frontend). It captures speech via native OS APIs, optionally refines transcripts through AI (multi-provider: Groq, Gemini, Claude, Copilot) via a VS Code extension bridge, and auto-pastes refined text at the active cursor.

## Commands

```bash
pnpm install                # Install all dependencies
pnpm dev                    # Run desktop app in dev mode (Vite + Tauri)
pnpm tauri dev              # Same as above
pnpm tauri build            # Build .dmg / .app / .exe / .msi

# After Rust changes:
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

# After VS Code extension changes:
cd extensions/vscode-bridge && npm run compile
```

### Prerequisites

Rust 1.75+, Node.js 20+, pnpm 9+. macOS requires Xcode CLI Tools (`xcode-select --install`).

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
    lib.rs             — Slim entry point: mod declarations + run()
    commands.rs        — All Tauri commands, toggle_recording, AppSettings
    widget/mod.rs      — Platform dispatcher for widget setup
    widget/macos.rs    — NSPanel creation, hover/click polling (objc2 + block2)
    widget/windows.rs  — Win32 positioning, hover/click polling
    stt/mod.rs         — STT state machine dispatcher
    stt/macos.rs       — Speech-to-text via Swift subprocess
    stt/windows.rs     — Speech-to-text via Windows.Media.SpeechRecognition
    bridge.rs          — WebSocket client to VS Code extension (127.0.0.1:9147)
    hotkey.rs          — Global shortcut + Fn key monitoring (macOS)
    history.rs         — History persistence (JSON file in app data dir)
    autopaste.rs       — Cross-platform paste: pbcopy+osascript (macOS) / PowerShell (Windows)

extensions/vscode-bridge/  — VS Code extension
  src/extension.ts         — WebSocket server on 127.0.0.1:9147
  src/copilot-bridge.ts    — Multi-provider LLM refinement
  src/protocol.ts          — Shared message types
```

## Key Constraints

- **Zero network egress** from the desktop app. All STT is on-device. AI refinement calls go through the local VS Code extension bridge only.
- **Cross-platform**: macOS (primary) and Windows. Platform-specific code is isolated in `widget/macos.rs` vs `widget/windows.rs` and `stt/macos.rs` vs `stt/windows.rs`.
- **macOS interop**: Uses `objc2` + `objc2-app-kit` + `block2` crates (NOT the deprecated `cocoa`/`objc` crates).
- **Windows interop**: Uses `windows` crate for Win32 APIs and WinRT.
- **Swift subprocesses** (macOS only): STT uses runtime-compiled Swift scripts in `/tmp/`. First run has ~2s compilation delay (the Swift compiler, not a bug).
- **Main thread requirement** (macOS): All AppKit calls must run on the main thread via `run_on_main_thread`. The objc2 crate enforces this with `MainThreadMarker`.
- **Widget is a separate webview** (`widget.html` / `widget.tsx`) — communicates with Rust backend via Tauri events, not shared React state.
- **Bridge is optional**: If VS Code isn't running, the app gracefully falls back to raw transcript. Never block UI waiting for the bridge.

## State Machine

```
Idle → start_recording → Recording → stop_recording → Processing → (paste + save) → Idle
                                    → cancel_recording → Idle (no paste)
```

Transitions are guarded by a `Mutex<State>`. Don't bypass the state machine or use boolean flags. Widget receives state via `stt-state-changed` Tauri event with payload: `"idle" | "listening" | "processing"`.

## Code Style

- **Rust**: Standard rustfmt.
- **TypeScript/React**: Functional components, hooks-only. No class components. Inline styles + Tailwind (no CSS modules).
- **Animations**: Use `motion/react` (framer-motion). Spring animations for interactive elements, ease curves for layout transitions.
- **Platform detection** (frontend): `const isMac = navigator.platform.toUpperCase().includes("MAC");`

## Common Pitfalls

- Don't use `enigo` for keyboard simulation — it crashes on macOS. Use `autopaste.rs` (pbcopy+osascript on macOS, PowerShell on Windows).
- Don't use `git add -A` — the repo has build artifacts in `target/` and `dist/`.
- Don't add `Co-Authored-By` lines to commits.
- Don't resize the NSPanel dynamically — it causes crashes. Handle visual size changes in CSS/motion within the fixed 180x34 webview.
- Don't use Web Speech API — it doesn't work in WKWebView (Tauri's webview on macOS).
- The widget's hover detection uses Rust-side polling because WebView mouse events don't fire when the app is inactive.
- `SFSpeechRecognizer` callbacks require `CFRunLoopRun()` in CLI Swift scripts — without it, callbacks never fire.
- Swift signal handlers can't capture local variables. Use global `var` for signal flags.
- WAV files must be finalized by calling `recorder.stop()` before process exit, otherwise the header is invalid.
- The Fn key hotkey is macOS-only — hidden on Windows via `isMac` check.

## Common Tasks

### Adding a new Tauri command
1. Define in `commands.rs` with `#[tauri::command]` and `pub`
2. Register in `lib.rs` invoke_handler: `commands::my_command`
3. Call from frontend with `invoke("my_command", { args })`

### Adding a new LLM provider
Add a `refineWith<Provider>` function in `copilot-bridge.ts`, add the API key setting to the extension's `package.json`, and add it to the `providers` array in `refineWithCopilot()`.

### Changing the refinement prompt
Edit `extensions/vscode-bridge/src/copilot-bridge.ts` — the `SYSTEM_PROMPT` constant and `STYLE_MODIFIERS` map.

## Testing

No automated test suite. Manual testing:
1. `pnpm dev` to start the app
2. Click widget or press `Cmd+Shift+.` (macOS) / `Ctrl+Shift+.` (Windows) → speak → stop
3. Verify text pastes at cursor
4. With VS Code bridge running: verify refined text appears
5. History card appears in main window
