# Yapper — AI Agent Guidelines

Instructions for AI coding agents (Claude Code, Cursor, Copilot, Windsurf, etc.) working on this project.

## Quick Context

- **Stack**: Tauri v2 (Rust) + React 18 + TypeScript + Vite + Tailwind CSS v4
- **Monorepo**: pnpm workspaces — `apps/desktop` (main app), `extensions/vscode-bridge` (VS Code extension)
- **Platform**: macOS-first (NSPanel, SFSpeechRecognizer, AVAudioRecorder)

## Do

- Read `CLAUDE.md` and `DESIGN.md` before making changes — they describe architecture and constraints
- Run `cargo check` after Rust changes (warnings from `cocoa` crate deprecations are expected)
- Run `npm run compile` after VS Code extension changes
- Use `pnpm dev` to test the full app (starts both Vite and Tauri)
- Keep the widget (`widget.tsx`) self-contained — it runs in a separate webview with no shared React state
- Use Tauri events for widget ↔ backend communication
- Use `motion/react` for all animations (not raw CSS transitions)
- Use inline styles for precise UI control (the codebase prefers this over Tailwind for custom components)
- Stage specific files when committing (not `git add -A`)

## Don't

- Don't add `Co-Authored-By` lines to git commits
- Don't use `enigo` for keyboard input on macOS — it crashes. Use `pbcopy` + `osascript`
- Don't call AppKit APIs from background threads — use `run_on_main_thread`
- Don't try to fix `cocoa` crate deprecation warnings — they require a full migration to `objc2`
- Don't use Web Speech API — it doesn't work in WKWebView (Tauri's webview on macOS)
- Don't add network calls to the desktop app — zero egress is a design constraint
- Don't resize the NSPanel dynamically — it causes crashes. The widget handles visual size changes via CSS/motion within the fixed 180×34 webview
- Don't create documentation files unless explicitly asked
- Don't add error handling or validation for internal function calls — only validate at system boundaries

## Architecture Rules

### State Machine
The recording pipeline is a strict state machine: `Idle → Recording → Processing → Idle`. Transitions are guarded by a `Mutex<State>`. Don't bypass the state machine or use boolean flags.

### Bridge Fallback
The VS Code bridge is optional. If it's unavailable (timeout, not running), the app must gracefully fall back to raw transcript. Never block the UI waiting for the bridge.

### Widget Independence
The widget webview (`widget.html`) is a separate context from the main window. They share no React state. Communication is via:
- `stt-state-changed` event (backend → widget)
- `yapper-hover` CustomEvent (Rust polling → widget JS)
- Tauri `invoke` commands (widget → backend)

### Swift Subprocesses
STT uses runtime-compiled Swift scripts in `/tmp/`. This is intentional — it avoids the complexity of ObjC bridge crates for audio/speech APIs. The 2-second first-run delay is the Swift compiler, not a bug.

## File Guide

| File | Purpose | When to Edit |
|------|---------|-------------|
| `src-tauri/src/lib.rs` | NSPanel, hover detection, Tauri commands | Adding new commands, fixing widget behavior |
| `src-tauri/src/stt/macos.rs` | Swift-based STT | Changing recording/transcription behavior |
| `src-tauri/src/bridge.rs` | WebSocket client to VS Code | Changing refinement protocol |
| `src/widget.tsx` | Floating pill UI | Changing widget appearance/interaction |
| `src/app/components/MainWindow.tsx` | History dashboard | Changing main window layout |
| `src/app/components/HistoryCard.tsx` | History item cards | Changing card design |
| `src/styles/theme.css` | CSS tokens, dark mode | Changing colors/typography |
| `extensions/vscode-bridge/src/copilot-bridge.ts` | Copilot prompt + refinement | Changing AI behavior |
| `extensions/vscode-bridge/src/extension.ts` | WebSocket server | Changing bridge protocol |

## Testing Workflow

No automated tests yet. Manual verification:

```bash
# 1. Start dev server
pnpm dev

# 2. Test recording
#    - Click widget or press Cmd+Shift+.
#    - Speak, then click stop
#    - Verify text pastes at cursor

# 3. Test with VS Code bridge
#    - Open extensions/vscode-bridge in VS Code
#    - Press F5 to launch Extension Development Host
#    - Record in Yapper → verify refined text appears

# 4. Test widget visibility
#    - Open a full-screen app
#    - Verify widget appears over it
#    - Switch Spaces — widget should follow
```

## Common Tasks

### Adding a new Tauri command
1. Define in `lib.rs` with `#[tauri::command]`
2. Register in the `invoke_handler` macro call
3. Call from frontend with `invoke("command_name", { args })`

### Changing the refinement prompt
Edit `extensions/vscode-bridge/src/copilot-bridge.ts` — the `SYSTEM_PROMPT` constant and `STYLE_MODIFIERS` map.

### Adding a new widget state
1. Add to `WidgetState` type in `widget.tsx`
2. Add visual rendering in the `AnimatePresence` block
3. Emit the state from Rust via `stt-state-changed` event

### Adding a new history field
1. Add to `RefinementResult` in `bridge.rs`
2. Add to the event payload in `stt/mod.rs`
3. Add to `HistoryItem` type in `useHistory.ts`
4. Display in `HistoryCard.tsx`
