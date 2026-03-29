# Yapper — AI Agent Guidelines

Instructions for AI coding agents (Claude Code, Cursor, Copilot, Windsurf, etc.) working on this project.

## Quick Context

- **Stack**: Tauri v2 (Rust) + React 18 + TypeScript + Vite + Tailwind CSS v4
- **Monorepo**: bun workspaces — `apps/desktop` (main app), `extensions/vscode-bridge` (VS Code extension)
- **Platform**: Cross-platform (macOS primary, Windows supported). Platform code is isolated in `widget/macos.rs` vs `widget/windows.rs` and `stt/macos.rs` vs `stt/windows.rs`.
- **macOS interop**: `objc2` + `objc2-app-kit` + `block2` (NOT the deprecated `cocoa`/`objc` crates)
- **LLM providers**: Groq, Gemini, Anthropic, GitHub Copilot (via VS Code extension)

## Do

- Read `CLAUDE.md` and `DESIGN.md` before making changes — they describe architecture and constraints
- Run `cargo check` after Rust changes
- Run `npm run compile` in `extensions/vscode-bridge/` after extension changes
- Use `bun dev` to test the full app (starts both Vite and Tauri)
- Keep the widget (`widget.tsx`) self-contained — it runs in a separate webview with no shared React state
- Use Tauri events for widget ↔ backend communication
- Use `motion/react` for all animations (not raw CSS transitions)
- Use inline styles for precise UI control (the codebase prefers this over Tailwind for custom components)
- Stage specific files when committing (not `git add -A`)
- Use `#[cfg(target_os = "...")]` for platform-specific code in Rust
- Use `const isMac = navigator.platform.toUpperCase().includes("MAC")` for platform checks in frontend

## Don't

- Don't add `Co-Authored-By` lines to git commits
- Don't use `enigo` for keyboard input — it crashes on macOS. Use `autopaste.rs` (pbcopy+osascript on macOS, PowerShell on Windows)
- Don't call AppKit APIs from background threads — use `run_on_main_thread` with `MainThreadMarker`
- Don't use the deprecated `cocoa`, `objc`, or `block` crates — use `objc2`, `objc2-app-kit`, `block2`
- Don't use Web Speech API — it doesn't work in WKWebView (Tauri's webview on macOS)
- Don't add network calls to the desktop app — zero egress is a design constraint. Network calls for LLM refinement happen in the VS Code extension only
- Don't resize the NSPanel dynamically — it causes crashes. The widget handles visual size changes via CSS/motion within the fixed 180x34 webview
- Don't create documentation files unless explicitly asked
- Don't add error handling or validation for internal function calls — only validate at system boundaries

## Architecture Rules

### State Machine
The recording pipeline is a strict state machine: `Idle -> Recording -> Processing -> Idle`. Transitions are guarded by a `Mutex<State>`. Don't bypass the state machine or use boolean flags.

### Bridge Fallback
The VS Code bridge is optional. If it's unavailable (timeout, not running), the app must gracefully fall back to raw transcript. Never block the UI waiting for the bridge.

### Widget Independence
The widget webview (`widget.html`) is a separate context from the main window. They share no React state. Communication is via:
- `stt-state-changed` event (backend -> widget)
- `yapper-hover` CustomEvent (Rust polling -> widget JS)
- Tauri `invoke` commands (widget -> backend)

### Platform Isolation
All platform-specific code lives in dedicated files:
- `widget/macos.rs` / `widget/windows.rs` — dispatched by `widget/mod.rs`
- `stt/macos.rs` / `stt/windows.rs` — dispatched by `stt/mod.rs`
- `autopaste.rs` — uses `#[cfg]` internally for macOS/Windows branches
- `hotkey.rs` — Fn key monitoring is macOS-only via `#[cfg]`

### Swift Subprocesses (macOS)
STT uses runtime-compiled Swift scripts in `/tmp/`. This is intentional — it avoids the complexity of ObjC bridge crates for audio/speech APIs. The 2-second first-run delay is the Swift compiler, not a bug.

## File Guide

| File | Purpose | When to Edit |
|------|---------|-------------|
| `src-tauri/src/lib.rs` | Entry point: plugins, command registration, STT engine restore | Adding new modules/commands |
| `src-tauri/src/commands.rs` | All Tauri commands: AppSettings (hotkey, stt_engine, default_style, style_overrides, metrics_enabled, code_mode, recording_mode, conversation_hotkey), recording, history, hotkey, STT engine, speech permission, change_recording_mode, change_conversation_hotkey | Adding/changing commands |
| `src-tauri/src/store.rs` | Generic JSON persistence: atomic file writes (write-to-tmp-then-rename), load/save/data_path, uuid_simple() | Persistence changes |
| `src-tauri/src/widget/macos.rs` | NSPanel, hover/click detection (objc2), dock-aware positioning (visibleFrame + full-screen detection) | macOS widget behavior |
| `src-tauri/src/widget/windows.rs` | Win32 positioning, hover/click polling | Windows widget behavior |
| `src-tauri/src/stt/macos.rs` | Swift-based STT | macOS recording/transcription |
| `src-tauri/src/stt/windows.rs` | Dual-engine: Classic (SAPI5 PowerShell) + Modern (WinRT) | Windows recording/transcription |
| `src-tauri/src/bridge.rs` | WebSocket client to VS Code, authenticated via ~/.yapper/bridge-token, circuit breaker (3 failures → 30s cooldown) | Changing refinement protocol |
| `src-tauri/src/autopaste.rs` | Cross-platform paste | Paste behavior |
| `src-tauri/src/hotkey.rs` | Global shortcut + Fn key + conversation hotkey (Cmd+Shift+Y / Ctrl+Shift+Y) | Hotkey behavior |
| `src/widget.tsx` | Floating pill UI | Widget appearance/interaction |
| `src/app/components/MainWindow.tsx` | History dashboard | Main window layout |
| `src/app/components/HistoryCard.tsx` | History item cards | Card design |
| `src/styles/theme.css` | CSS tokens, dark mode | Colors/typography |
| `extensions/vscode-bridge/src/copilot-bridge.ts` | Multi-provider LLM refinement | AI behavior, adding providers |
| `extensions/vscode-bridge/src/extension.ts` | WebSocket server | Bridge protocol |

## Testing Workflow

No automated tests yet. Manual verification:

```bash
# 1. Start dev server
bun dev

# 2. Test recording (Press mode)
#    - Click widget or press Cmd+Shift+. (macOS) / Ctrl+Shift+. (Windows)
#    - Speak, then click stop or press hotkey again
#    - Verify text pastes at cursor

# 3. Test recording (Hold mode)
#    - In Settings, switch recording mode to "Hold"
#    - Hold hotkey or Fn key → speak → release to stop
#    - Verify text pastes at cursor

# 4. Test conversation hotkey
#    - Press Cmd+Shift+Y (macOS) / Ctrl+Shift+Y (Windows)
#    - Verify conversation mode opens

# 5. Test with VS Code bridge
#    - Open extensions/vscode-bridge in VS Code
#    - Press F5 to launch Extension Development Host
#    - Record in Yapper -> verify refined text appears

# 6. Test widget visibility
#    macOS: Open a full-screen app, verify widget appears, switch Spaces
#    Windows: Verify widget appears above taskbar
#    Tooltip should show "press fn to yapp"
```

## Common Tasks

### Adding a new Tauri command
1. Define in `commands.rs` with `#[tauri::command]` and `pub`
2. Register in `lib.rs` invoke_handler: `commands::my_command`
3. Add a wrapper in `src/app/lib/tauri-bridge.ts`
4. Call from frontend with `invoke("my_command", { args })`

**Important**: Rust parameter names must exactly match JS invoke argument keys. A mismatch (e.g., Rust `hotkey_str` vs JS `hotkey`) causes a silent failure — the command never executes.

### Changing the refinement prompt
Edit `extensions/vscode-bridge/src/copilot-bridge.ts` — the `SYSTEM_PROMPT` constant and `STYLE_MODIFIERS` map.

### Adding a new LLM provider
Add a `refineWith<Provider>` function in `copilot-bridge.ts`, add the API key setting to `package.json`, and add it to the `providers` array in `refineWithCopilot()`.

### Adding a new widget state
1. Add to `WidgetState` type in `widget.tsx`
2. Add visual rendering in the `AnimatePresence` block
3. Emit the state from Rust via `stt-state-changed` event

### Adding a new history field
1. Add to `HistoryEntry` struct in `history.rs`
2. Add to the event payload in `commands.rs`
3. Add to `HistoryItem` type in `types.ts`
4. Display in `HistoryCard.tsx`

### Adding a new settings field
1. Add to `AppSettings` struct in `commands.rs` with `#[serde(default = "default_fn")]`
2. Add the default function in `commands.rs`
3. Add to the settings UI in `SettingsView.tsx`
4. If it needs a dedicated command, add a `change_*` command and register in `lib.rs`
5. All persistence goes through atomic writes via `store.rs`

### Notes
- **Conversation hotkey** — separate from the dictation hotkey, defaults to `Cmd+Shift+Y` (macOS) / `Ctrl+Shift+Y` (Windows). Changed via `change_conversation_hotkey` command.
- **Recording mode** — "Press" (toggle, default) or "Hold" (press-and-hold). Changed via `change_recording_mode` command. In Hold mode, Fn key release also stops recording.
- **Bridge authentication** — random token in `~/.yapper/bridge-token`. The desktop app reads this token and includes it in WebSocket messages. The VS Code extension validates it.
- **Atomic file writes** — all persistence uses `store.rs` which writes to a `.json.tmp` file then renames to the final path.
- **Logging** — use `log` macros (`log::info!`, `log::error!`, etc.), never `println!`.
- **Sample data** — `YAPPER_SAMPLE_DATA=1 bun tauri dev` seeds 8 history entries for dev/demos. Controlled via env var check in `lib.rs` setup, calls `history::seed_sample_data()`.
- **Scroll performance** — HistoryCard root is a plain `div` (not `motion.div`). Use `contain: layout style paint` on cards. Don't wrap scroll items with unnecessary Framer Motion components.
