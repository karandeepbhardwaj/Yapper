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
    assets/            — Static images (fn-key-settings.png, windows-speech-settings.png)
  src-tauri/src/       — Rust backend
    lib.rs             — Entry point (~61 lines): mod declarations, plugin setup, STT engine restore, command registration
    commands.rs        — All Tauri commands (~317 lines): AppSettings, toggle_recording, CRUD, hotkey/engine/settings
    widget/mod.rs      — Platform dispatcher for widget setup
    widget/macos.rs    — NSPanel creation, hover/click polling (objc2 + block2)
    widget/windows.rs  — Win32 positioning, DPI-aware hover/click polling (GetCursorPos + GetAsyncKeyState)
    stt/mod.rs         — STT state machine (Idle/Recording/Processing) with atomic transitions
    stt/macos.rs       — Speech-to-text via Swift subprocess (AVAudioRecorder + SFSpeechRecognizer)
    stt/windows.rs     — Dual-engine STT (~453 lines): Classic (SAPI5 via PowerShell) + Modern (WinRT SpeechRecognizer)
    bridge.rs          — WebSocket client to VS Code extension (ws://127.0.0.1:9147)
    hotkey.rs          — Global shortcut registration/update + Fn key monitoring (macOS)
    history.rs         — History persistence (JSON file in app data dir, max 100 entries)
    autopaste.rs       — Cross-platform paste: pbcopy+osascript (macOS) / PowerShell SendKeys (Windows)

extensions/vscode-bridge/  — VS Code extension
  src/extension.ts         — WebSocket server on 127.0.0.1:9147
  src/copilot-bridge.ts    — Multi-provider LLM refinement (vscode.lm, Groq, Gemini, Anthropic)
  src/protocol.ts          — Shared message types
```

## Tauri Commands (registered in lib.rs)

| Command | Parameters | Description |
|---------|-----------|-------------|
| `start_recording` | — | Begin STT capture (Idle → Recording) |
| `stop_recording` | — | Stop capture, refine, paste, save history (Recording → Processing → Idle) |
| `cancel_recording` | — | Abort without pasting (→ Idle) |
| `set_transcript` | `text` | Set transcript from WebSpeech API fallback |
| `get_history` | — | Return all history entries |
| `clear_history` | — | Delete all history |
| `delete_history_item` | `id` | Delete single entry |
| `toggle_pin_item` | `id` | Toggle pin on entry |
| `change_hotkey` | `hotkey` | Re-register global shortcut + persist to settings.json |
| `get_settings` | — | Read AppSettings from settings.json |
| `save_settings` | `settings` | Write full AppSettings to settings.json |
| `change_stt_engine` | `engine` | Switch STT engine ("classic"/"modern"), persist to settings |
| `check_speech_permission` | — | Check Windows registry for Online Speech Recognition privacy setting |
| `debug_log` | `msg` | Print frontend message to Rust stdout for debugging |

## AppSettings

```rust
pub struct AppSettings {
    pub hotkey: String,        // e.g., "Cmd+Shift+." or "Ctrl+Shift+A"
    pub stt_engine: String,    // "classic" (default) or "modern"
}
```

Persisted to `{app_config_dir}/settings.json`. The `stt_engine` field uses `#[serde(default)]` for backward compatibility with old settings files.

## Windows STT Dual-Engine Architecture

Windows has two STT engines selectable at runtime via a UI toggle:

### Classic (SAPI5) — Default
- **Mechanism**: Spawns PowerShell subprocess with inline C# using `System.Speech.Recognition`
- **Grammars**: DictationGrammar (weight 1.0) + spelling grammar (weight 0.2)
- **Timeouts**: InitialSilence=30s, EndSilence=1.5s, EndSilenceAmbiguous=2.0s
- **Stop flow**: Writes "stop" to temp file; C# polls for it, calls `RecognizeAsyncStop()` (processes pending audio, unlike `RecognizeAsyncCancel()` which discards it)
- **Race condition handling**: C# deletes stale stop file before entering poll loop; Rust `stop_recognition` polls mutex for up to 20s waiting for child process to be stored by `start_recognition`
- **Readiness**: Rust reads stderr line-by-line waiting for "LISTENING" (15s timeout)
- **Pros**: Offline, no settings required
- **Cons**: Lower accuracy

### Modern (WinRT)
- **Mechanism**: Direct `windows::Media::SpeechRecognition::SpeechRecognizer` via WinRT
- **Setup**: COM initialization (`CoInitializeEx`), `SpeechRecognitionTopicConstraint::Dictation`, `ContinuousRecognitionSession`
- **Results**: `TypedEventHandler` on `ResultGenerated` event appends to `Arc<Mutex<String>>`
- **Stop flow**: Sets `AtomicBool` stop signal; thread calls `StopAsync()` on session
- **Prerequisite**: Windows Settings → Privacy & security → Speech → "Online speech recognition" must be ON
- **Detection**: `check_speech_permission` command reads `HKCU\Software\Microsoft\Speech_OneCore\Settings\OnlineSpeechPrivacy\HasAccepted` (DWORD, 1=enabled)
- **Pros**: Higher accuracy
- **Cons**: Requires privacy setting, sends audio to Microsoft

### Engine Selection
- `stt::windows::set_engine(modern: bool)` — stored in `AtomicU8`
- `start_recognition`/`stop_recognition` dispatch to `classic::start`/`modern::start` based on current engine
- Restored from `settings.json` on app startup in `lib.rs`

## Frontend STT Engine UI (Windows only)

- Segmented toggle ("Classic" / "Modern") in title bar, visible only on Windows (`isWindows` check)
- Sliding highlight pill animated with `motion.div` (`layout="position"`, spring transition)
- When switching to Modern: calls `checkSpeechPermission()` — if disabled, shows tooltip with screenshot (`windows-speech-settings.png`) explaining how to enable it
- Similar pattern to macOS Fn key tooltip (`fn-key-settings.png`)

## Hotkey System

### Frontend (MainWindow.tsx)
- Click hotkey badge → enters recording mode → `keydown` listener captures shortcut
- `keyEventToHotkey(e)` uses `e.code` (physical key) to avoid Shift changing "/" to "?" etc.
- Requires at least one modifier (Ctrl/Cmd/Alt/Shift) + one non-modifier key
- Maps physical codes: KeyA-KeyZ, Digit0-9, Period, Comma, Slash, arrows, F1-F12, etc.
- macOS: "use fn" button sets hotkey to "Fn" and shows setup tooltip

### Backend (hotkey.rs)
- `register(app)` — called during setup; loads saved hotkey from settings.json, registers global shortcut via `tauri_plugin_global_shortcut`
- `update(app, new_hotkey)` — unregisters all shortcuts, re-registers new one
- `parse_hotkey(str)` — splits "Ctrl+Shift+A" into modifiers + key code
- Fn key (macOS only): `start_fn_key_monitor()` spawns thread using `NSEvent` global+local monitors for `FlagsChanged`, detects Fn via bit 23 of raw modifier flags

## Monorepo Commands

```bash
pnpm dev              # Run desktop app in dev mode (Vite + Tauri)
pnpm build            # Production frontend build
pnpm tauri build      # Build .dmg / .app / .exe / .msi
pnpm tauri dev        # Dev mode with hot reload
```

### Windows Build Environment

Source edits on network share `\\Mac\Home\Downloads\test\Yapper\`, copied to `C:\Users\kdb\Yapper\` for building. Build from `apps/desktop/` directory with cargo and pnpm in PATH:

```bash
cd C:/Users/kdb/Yapper/apps/desktop
export PATH="/c/Users/kdb/AppData/Roaming/npm:/c/Program Files/nodejs:/c/Users/kdb/.cargo/bin:$PATH"
npx tauri dev
```

Kill stale processes before rebuilding: `taskkill.exe //F //IM yapper.exe` and `taskkill.exe //F //IM node.exe`.

## Key Constraints

- **Zero network egress** from the desktop app. All STT is on-device. AI refinement calls go through the local VS Code extension bridge only.
- **Cross-platform**: macOS (primary) and Windows. Platform-specific code is isolated in `widget/macos.rs` vs `widget/windows.rs` and `stt/macos.rs` vs `stt/windows.rs`.
- **macOS interop**: Uses `objc2` + `objc2-app-kit` + `block2` crates (NOT the deprecated `cocoa`/`objc` crates). NSPanel for cross-Space widget, NSEvent monitors for hover/click/Fn key.
- **Windows interop**: Uses `windows` crate v0.58 for Win32 APIs (GetCursorPos, MonitorFromPoint, GetAsyncKeyState, Registry) and WinRT (SpeechRecognizer, COM). DPI-aware widget positioning via `GetDpiForMonitor`.
- **Swift subprocesses** (macOS only): STT uses inline Swift scripts compiled at runtime (`/tmp/yapper_recorder.swift`, `/tmp/yapper_transcriber.swift`). First run has ~2s compilation delay.
- **Main thread requirement** (macOS): All AppKit calls (NSPanel, NSWindow) must run on the main thread via `run_on_main_thread`. The objc2 crate enforces this with `MainThreadMarker`.
- **Widget is a separate webview** (`widget.html` / `widget.tsx`) — it communicates with the Rust backend via Tauri events, not shared React state.

## Code Style

- **Rust**: Standard rustfmt. No deprecation warnings expected (cocoa→objc2 migration is complete).
- **TypeScript/React**: Functional components, hooks-only. No class components. Inline styles + Tailwind (no CSS modules).
- **Animations**: Use `motion/react` (framer-motion). Spring animations for interactive elements, ease curves for layout transitions. Use `layout="position"` (not bare `layout`) to avoid triggering layout recalculation on siblings.
- **Platform detection** (frontend): `const isMac = navigator.platform.toUpperCase().includes("MAC");` and `const isWindows = !isMac;` — used to conditionally show Fn key option, STT engine toggle, and adjust title bar padding.

## Common Pitfalls

- **Tauri command parameter names must match JS invoke keys exactly.** If Rust has `hotkey: String`, JS must send `{ hotkey: "..." }`. A mismatch like `hotkey_str` vs `hotkey` silently fails — the command never executes on the Rust side.
- Don't use `enigo` for keyboard simulation — it crashes on macOS (`dispatch_assert_queue_fail`). Use `pbcopy` + `osascript` (macOS) or PowerShell `SendKeys` (Windows).
- Don't use `git add -A` — the repo has build artifacts in `target/` and `dist/`.
- Don't add `Co-Authored-By` lines to commits.
- The widget's hover detection uses Rust-side polling (NSEvent.mouseLocation on macOS, GetCursorPos on Windows) because WebView mouse events don't fire when the app is inactive.
- `SFSpeechRecognizer` callbacks require `CFRunLoopRun()` in CLI Swift scripts — without it, callbacks never fire.
- Swift signal handlers can't capture local variables. Use global `var` for signal flags.
- WAV files must be finalized by calling `recorder.stop()` before process exit, otherwise the header is invalid and transcription fails.
- The Fn key hotkey is macOS-only — the "use fn" button is hidden on Windows via `isMac` check in MainWindow.tsx.
- **SAPI5 `RecognizeAsyncStop()` vs `RecognizeAsyncCancel()`**: Stop processes pending audio (returns final result), Cancel discards it. Always use Stop for dictation.
- **SAPI5 race condition**: `stop_recognition` can be called while `start_recognition` is still initializing the PowerShell subprocess. The C# code must delete stale stop files before entering the poll loop, and Rust must poll the mutex waiting for the process handle.
- **WinRT SpeechRecognizer requires COM init** (`CoInitializeEx`) on the thread that creates it. The recognizer runs on a dedicated spawned thread, not the async runtime.
- **Windows Online Speech Recognition**: Modern STT engine fails silently if the "Online speech recognition" privacy setting is not enabled. Always check the registry key before using Modern engine.
- **`e.code` vs `e.key` for hotkey recording**: Use `e.code` (physical key position) to avoid Shift modifying the key value (e.g., Shift+/ producing "?" with `e.key`).
- **Settings clobbering**: When updating a single field in `settings.json` (e.g., hotkey or stt_engine), always read existing settings first, modify the field, then write back — otherwise other fields get reset to defaults.

## Testing

No automated test suite yet. Manual testing:
1. Click widget or press `Cmd+Shift+.` (macOS) / `Ctrl+Shift+.` (Windows) → mic permission prompt (first time)
2. Speak → wave animation plays
3. Stop → processing animation → text pastes at cursor
4. If VS Code + LLM provider running: refined text. Otherwise: raw transcript (fallback).
5. History card appears in main window with category/title.
6. **Hotkey change**: Click hotkey badge → press new shortcut → verify it appears in badge and triggers recording.
7. **STT engine toggle (Windows)**: Switch between Classic/Modern → verify tooltip appears when Modern selected without privacy setting → verify recognition works with each engine.
8. **History management**: Pin/unpin items, delete items, clear all, verify fuzzy search works.

## State Machine

```
Idle → start_recording → Recording → stop_recording → Processing → (paste + save) → Idle
                                    → cancel_recording → Idle (no paste)
```

Transitions use atomic compare-and-swap (`transition(expected, new)`) for thread safety. Widget receives state via `stt-state-changed` Tauri event with payload: `"idle" | "listening" | "processing"`.

## Data Flow

```
User speaks → STT engine (platform-specific) → raw transcript
  → bridge.rs WebSocket → VS Code extension → LLM refinement
  → refined text + category + title
  → autopaste (clipboard + simulated Ctrl/Cmd+V)
  → history.rs (JSON persistence)
  → frontend event (refinement-complete) → HistoryCard UI
```

If VS Code bridge is unavailable (TCP check fails within 500ms), raw transcript is used as-is for both paste and history.
