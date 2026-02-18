# Prompt Refinement Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, offline-first desktop utility (Tauri) + VS Code extension that captures speech via native OS APIs, refines transcripts through GitHub Copilot, and auto-pastes results at the cursor.

**Architecture:** Tauri v2 monorepo with React/TypeScript frontend (pre-built Figma UI), Rust backend for global hotkey capture, native offline STT (macOS `SFSpeechRecognizer`, Windows `SpeechRecognizer`), and local WebSocket IPC to a companion VS Code extension that bridges to GitHub Copilot via `vscode.lm` API. Zero external network egress from desktop app.

**Tech Stack:** Tauri v2 (Rust), React 18, TypeScript, Tailwind CSS v4, Motion (framer-motion), Lucide Icons, `enigo` (keystroke sim), `objc2-speech`/`windows` crate (native STT), VS Code Extension API, `ws` (WebSocket), `vscode.lm` API

---

## File Structure

```
prompt-refinement-services/
├── package.json                          # Root workspace config
├── pnpm-workspace.yaml                   # pnpm workspace definition
├── README.md                             # Build & usage docs
│
├── apps/desktop/                         # Tauri desktop application
│   ├── package.json                      # Frontend dependencies
│   ├── index.html                        # Frontend entry
│   ├── vite.config.ts                    # Vite + Tauri config
│   ├── postcss.config.mjs                # PostCSS config
│   ├── tsconfig.json                     # TypeScript config
│   ├── src/
│   │   ├── main.tsx                      # React entry point
│   │   ├── styles/
│   │   │   ├── index.css                 # Style aggregator
│   │   │   ├── fonts.css                 # Inter font
│   │   │   ├── tailwind.css              # Tailwind v4
│   │   │   └── theme.css                 # Light/dark theme vars
│   │   ├── app/
│   │   │   ├── App.tsx                   # Root component (wired to Tauri)
│   │   │   ├── hooks/
│   │   │   │   ├── useTauriEvents.ts     # Tauri event listeners
│   │   │   │   ├── useSettings.ts        # Settings persistence
│   │   │   │   └── useHistory.ts         # History state + persistence
│   │   │   ├── lib/
│   │   │   │   ├── tauri-bridge.ts       # invoke() wrappers
│   │   │   │   └── types.ts              # Shared TypeScript types
│   │   │   └── components/
│   │   │       ├── FloatingWidget.tsx     # Widget (from Figma, wired)
│   │   │       ├── MainWindow.tsx        # Main window (from Figma, wired)
│   │   │       ├── HistoryCard.tsx        # History entry (from Figma)
│   │   │       ├── SettingsDialog.tsx     # Settings (from Figma, wired)
│   │   │       ├── figma/
│   │   │       │   └── ImageWithFallback.tsx
│   │   │       └── ui/                   # shadcn/ui components (from Figma)
│   │   │           └── *.tsx
│   │   └── widget.tsx                    # Separate entry for widget window
│   │
│   └── src-tauri/
│       ├── Cargo.toml                    # Rust dependencies
│       ├── build.rs                      # Tauri build script
│       ├── tauri.conf.json               # Tauri config (2 windows)
│       ├── capabilities/
│       │   └── default.json              # Permissions
│       ├── icons/                        # App icons
│       └── src/
│           ├── main.rs                   # Desktop entry
│           ├── lib.rs                    # Plugin registration + commands
│           ├── hotkey.rs                 # Global hotkey management
│           ├── stt/
│           │   ├── mod.rs                # STT trait + platform dispatch
│           │   ├── macos.rs              # SFSpeechRecognizer bindings
│           │   └── windows.rs            # WinRT SpeechRecognizer bindings
│           ├── bridge.rs                 # WebSocket client to VS Code ext
│           ├── autopaste.rs              # enigo keystroke simulation
│           └── history.rs               # History persistence (JSON file)
│
├── extensions/vscode-bridge/             # VS Code companion extension
│   ├── package.json                      # Extension manifest
│   ├── tsconfig.json                     # TypeScript config
│   └── src/
│       ├── extension.ts                  # Activation + WebSocket server
│       ├── copilot-bridge.ts             # vscode.lm API integration
│       └── protocol.ts                   # Shared message types
│
└── docs/
    └── superpowers/plans/
        └── 2026-03-18-prompt-refinement-services.md
```

---

### Task 1: Monorepo Scaffold + Figma Integration

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`
- Create: `apps/desktop/package.json`, `apps/desktop/tsconfig.json`
- Copy: All Figma UI files into `apps/desktop/src/`
- Create: `apps/desktop/src/widget.tsx` (widget window entry)

- [ ] **Step 1: Initialize root workspace**

Create root `package.json` and `pnpm-workspace.yaml` defining the monorepo.

- [ ] **Step 2: Set up desktop app package**

Create `apps/desktop/package.json` with Tauri v2, React 18, Tailwind CSS v4, Motion, Lucide dependencies. Copy Figma source files into place.

- [ ] **Step 3: Configure Vite for Tauri**

Update `vite.config.ts` with Tauri-specific settings (clearScreen, server port, host).

- [ ] **Step 4: Create widget entry point**

Create `apps/desktop/src/widget.tsx` — a separate React root for the always-on-top floating widget window.

- [ ] **Step 5: Verify frontend builds**

Run `pnpm install && pnpm --filter desktop build` to confirm the frontend compiles.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: scaffold monorepo with Figma UI integration"
```

---

### Task 2: Tauri Backend Scaffold

**Files:**
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/capabilities/default.json`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Create Cargo.toml**

Define dependencies: `tauri`, `tauri-plugin-global-shortcut`, `tauri-plugin-clipboard-manager`, `serde`, `serde_json`, `enigo`, `tungstenite` (WebSocket client), platform-specific STT crates.

- [ ] **Step 2: Create tauri.conf.json with dual windows**

Configure two windows:
- `main` — 480x700, decorations on, centered
- `widget` — 64x64, decorations off, always-on-top, transparent, URL points to widget.html

- [ ] **Step 3: Create capabilities/default.json**

Grant permissions for global-shortcut, clipboard, window management, and IPC events.

- [ ] **Step 4: Create main.rs and lib.rs stubs**

Wire up Tauri builder with plugin registration and empty command handlers.

- [ ] **Step 5: Create build.rs**

Standard Tauri build script.

- [ ] **Step 6: Verify Tauri compiles**

Run `cd apps/desktop && pnpm tauri build --debug` (or `cargo check` in src-tauri).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: scaffold Tauri v2 backend with dual-window config"
```

---

### Task 3: Frontend-Backend IPC Wiring

**Files:**
- Create: `apps/desktop/src/app/lib/types.ts`
- Create: `apps/desktop/src/app/lib/tauri-bridge.ts`
- Create: `apps/desktop/src/app/hooks/useTauriEvents.ts`
- Create: `apps/desktop/src/app/hooks/useHistory.ts`
- Create: `apps/desktop/src/app/hooks/useSettings.ts`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/components/FloatingWidget.tsx`
- Modify: `apps/desktop/src/app/components/SettingsDialog.tsx`

- [ ] **Step 1: Define shared types**

Create `types.ts` with `WidgetState`, `HistoryItem`, `AppSettings`, and Tauri event payload types.

- [ ] **Step 2: Create Tauri bridge module**

Wrap `invoke()` calls: `startRecording()`, `stopRecording()`, `getHistory()`, `saveSettings()`, `getSettings()`.

- [ ] **Step 3: Create useTauriEvents hook**

Listen for Tauri events: `stt-state-changed`, `stt-transcript-ready`, `refinement-complete`, `stt-error`.

- [ ] **Step 4: Create useHistory hook**

Manage history state, load from backend on mount, append on new transcripts.

- [ ] **Step 5: Create useSettings hook**

Load/save settings through Tauri commands, persist to disk.

- [ ] **Step 6: Wire App.tsx to Tauri**

Replace mock data with hooks. Remove hardcoded timeouts. Connect widget state to real Tauri events.

- [ ] **Step 7: Wire FloatingWidget to real state**

Remove simulated timeouts. State driven purely by Tauri events (idle → listening → processing → idle).

- [ ] **Step 8: Wire SettingsDialog to persistence**

Connect checkboxes and selects to `useSettings` hook so values persist.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: wire frontend components to Tauri IPC"
```

---

### Task 4: Global Hotkey + STT Engine (Rust)

**Files:**
- Create: `apps/desktop/src-tauri/src/hotkey.rs`
- Create: `apps/desktop/src-tauri/src/stt/mod.rs`
- Create: `apps/desktop/src-tauri/src/stt/macos.rs`
- Create: `apps/desktop/src-tauri/src/stt/windows.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Implement hotkey module**

Register configurable global shortcut (default: `Alt+Space` / `Option+Space`). Toggle recording on press.

- [ ] **Step 2: Define STT trait**

```rust
pub trait SpeechRecognizer: Send + Sync {
    fn start(&self, app: AppHandle) -> Result<(), SttError>;
    fn stop(&self) -> Result<String, SttError>;
    fn is_available() -> bool;
}
```

- [ ] **Step 3: Implement macOS STT**

Use `objc2-speech` for `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true`. Use `objc2-avf-audio` for `AVAudioEngine` microphone capture. Emit `stt-state-changed` and `stt-transcript-ready` events.

- [ ] **Step 4: Implement Windows STT**

Use `windows` crate for `Windows::Media::SpeechRecognition::SpeechRecognizer`. Set up continuous dictation. Emit same events.

- [ ] **Step 5: Wire into lib.rs**

Register hotkey plugin, create STT instance based on platform, expose `start_recording` and `stop_recording` Tauri commands.

- [ ] **Step 6: Test on macOS**

Run app, press hotkey, verify STT captures speech and emits transcript.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: global hotkey and native offline STT (macOS + Windows)"
```

---

### Task 5: VS Code Extension (Copilot Bridge)

**Files:**
- Create: `extensions/vscode-bridge/package.json`
- Create: `extensions/vscode-bridge/tsconfig.json`
- Create: `extensions/vscode-bridge/src/protocol.ts`
- Create: `extensions/vscode-bridge/src/copilot-bridge.ts`
- Create: `extensions/vscode-bridge/src/extension.ts`

- [ ] **Step 1: Scaffold VS Code extension**

Create `package.json` with extension manifest, activation events, commands, and `ws` dependency.

- [ ] **Step 2: Define protocol types**

Shared message format: `{ type: "refine", id: string, rawText: string }` → `{ type: "result", id: string, refinedText: string }`.

- [ ] **Step 3: Implement copilot-bridge**

Use `vscode.lm.selectChatModels({ vendor: 'copilot' })` to get model. Send refinement prompt with raw transcript. Collect streamed response.

- [ ] **Step 4: Implement WebSocket server**

Bind to `127.0.0.1:9147`. On message: parse, call copilot-bridge, send result back.

- [ ] **Step 5: Wire extension.ts**

On activate: start WebSocket server, register commands. On deactivate: close server.

- [ ] **Step 6: Test extension**

Launch in Extension Development Host. Send test WebSocket message. Verify Copilot response.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: VS Code extension with Copilot bridge over local WebSocket"
```

---

### Task 6: Desktop WebSocket Client + Auto-Paste

**Files:**
- Create: `apps/desktop/src-tauri/src/bridge.rs`
- Create: `apps/desktop/src-tauri/src/autopaste.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Implement WebSocket client**

Connect to `ws://127.0.0.1:9147`. Send raw transcript. Receive refined text. Emit `refinement-complete` event to frontend.

- [ ] **Step 2: Implement auto-paste**

Use `enigo` crate. On refined text received: simulate Cmd+V (macOS) or Ctrl+V (Windows) to paste at cursor position. Set clipboard first, then simulate paste keystroke.

- [ ] **Step 3: Wire pipeline in lib.rs**

Hotkey → STT start → transcript ready → send to VS Code → receive refined → auto-paste + update history.

- [ ] **Step 4: Add history persistence**

Create `apps/desktop/src-tauri/src/history.rs`. Save history to JSON file in app data dir. Expose `get_history` command.

- [ ] **Step 5: End-to-end test**

Full pipeline: press hotkey → speak → transcript → Copilot refines → paste at cursor.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: WebSocket client, auto-paste, and history persistence"
```

---

### Task 7: README + Build Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Document: project overview, architecture diagram (ASCII), prerequisites (Rust, Node, pnpm), build steps for desktop app and VS Code extension, security model (zero egress), configuration options, keyboard shortcuts.

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: add build and usage documentation"
```
