<p align="center">
  <h1 align="center">Yapper</h1>
  <p align="center">Voice-to-text desktop app that captures speech, refines transcripts with AI, and auto-pastes at your cursor</p>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build Status" /></a>
  <a href="#"><img src="https://img.shields.io/badge/version-0.0.1-blue" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-macOS-lightgrey" alt="Platform" /></a>
  <a href="#contributing"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" /></a>
</p>

<!-- TODO: Add screenshot/demo GIF here -->
<!-- ![Yapper Demo](docs/assets/demo.gif) -->

---

## :sparkles: Features

- **Voice capture** -- press a global hotkey and start talking
- **On-device speech recognition** via macOS `SFSpeechRecognizer` (fully offline)
- **AI transcript refinement** through GitHub Copilot (VS Code extension bridge)
- **Auto-paste** refined text at your active cursor position
- **Floating widget** that follows you across macOS Spaces
- **History dashboard** with bento grid layout, fuzzy search (Fuse.js), pin/copy/expand
- **Dark/light mode** with smooth transitions
- **Landing/onboarding page** for first-time users
- **Global hotkey** (`Cmd+Shift+.`) to start/stop recording from anywhere
- **Zero egress** -- the desktop app makes no external network requests

---

## :building_construction: Architecture

```
┌─────────────────────────────┐   WebSocket (127.0.0.1:9147)   ┌─────────────────────────┐
│     Desktop App (Tauri)     │ ◄────────────────────────────► │   VS Code Extension     │
│                             │         local only              │                         │
│  ┌───────────────────────┐  │                                 │  ┌───────────────────┐  │
│  │   React Frontend      │  │                                 │  │  WebSocket Server │  │
│  │   (Tailwind + Radix)  │  │                                 │  │  (ws, 127.0.0.1)  │  │
│  └──────────┬────────────┘  │                                 │  └─────────┬─────────┘  │
│             │ IPC           │                                 │            │             │
│  ┌──────────┴────────────┐  │                                 │  ┌─────────┴─────────┐  │
│  │   Rust Backend        │  │                                 │  │   vscode.lm API   │  │
│  │   - Global Hotkey     │  │                                 │  │   (Copilot LLM)   │  │
│  │   - Native STT        │  │                                 │  └───────────────────┘  │
│  │   - Auto-paste        │  │                                 │                         │
│  │   - History           │  │                                 └─────────────────────────┘
│  └───────────────────────┘  │
└──────────────┬──────────────┘
               ▼
        ┌──────────────┐
        │  macOS Native │
        │  STT APIs     │
        │  (offline)    │
        └──────────────┘
```

---

## :rocket: Quick Start

### Prerequisites

| Dependency | Version | Install |
|---|---|---|
| Rust | 1.75+ | [rustup.rs](https://rustup.rs) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm` |
| Xcode CLI Tools | latest | `xcode-select --install` |
| VS Code | latest | With GitHub Copilot extension active |

### Build & Run

```bash
# Clone the repo
git clone https://github.com/your-org/yapper.git
cd yapper

# Install dependencies
pnpm install

# Run in development mode (hot reload)
pnpm tauri dev

# Production build
pnpm tauri build
```

The production `.app` bundle will be in `apps/desktop/src-tauri/target/release/bundle/`.

---

## :gear: How It Works

Yapper follows a five-stage pipeline:

```
 🎙 Speak  ──►  🔴 Record  ──►  📝 Transcribe  ──►  ✨ Refine  ──►  📋 Paste
   │               │                  │                   │               │
   │          Microphone         SFSpeech           Copilot LLM      Keystroke
   │          capture            Recognizer         via VS Code      simulation
   │                             (on-device)        extension        (auto-paste)
```

1. **Speak** -- press `Cmd+Shift+.` (or click the floating widget) to begin
2. **Record** -- audio is captured from the microphone in real time
3. **Transcribe** -- macOS `SFSpeechRecognizer` converts speech to text on-device
4. **Refine** -- the raw transcript is sent over a local WebSocket to the VS Code extension, which uses the `vscode.lm` API (GitHub Copilot) to clean up grammar, filler words, and formatting
5. **Paste** -- the refined text is automatically typed at your current cursor position via keystroke simulation

---

## :jigsaw: VS Code Extension Setup

The companion extension (`extensions/vscode-bridge/`) bridges Yapper to GitHub Copilot.

```bash
cd extensions/vscode-bridge

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package as .vsix
npm run package
```

Install the `.vsix` in VS Code: **Extensions panel** > `...` menu > **Install from VSIX...**

The extension auto-starts on VS Code launch and exposes these commands:

| Command | Description |
|---|---|
| `Yapper: Start Bridge` | Start the WebSocket server |
| `Yapper: Stop Bridge` | Stop the WebSocket server |
| `Yapper: Show Status` | Show connection status |

---

## :wrench: Configuration

### Settings

Settings are persisted to the macOS app config directory:

```
~/Library/Application Support/com.prompt-refinement.services/settings.json
```

Available settings:

| Setting | Default | Description |
|---|---|---|
| Auto-stop after silence | `true` | Stop recording when silence is detected |
| Show floating widget | `true` | Show the always-on-top recording button |
| Language | English | Recognition language |
| Refinement style | Professional | Professional, Casual, Technical, or Creative |

### Global Hotkey

| Action | Shortcut |
|---|---|
| Start / Stop Recording | `Cmd + Shift + .` |

The hotkey works globally across all macOS applications and Spaces.

---

## :art: Widget States

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│          │     │          │     │          │
│   IDLE   │────►│ LISTENING│────►│PROCESSING│
│          │     │          │     │          │
│  ⚪ Mic  │     │  🟠 Wave │     │  🟠 Spin │
│  (gray)  │     │ (orange) │     │  (dark)  │
└──────────┘     └──────────┘     └──────────┘
     ▲                                 │
     └─────────────────────────────────┘
                 done / error
```

| State | Appearance | Meaning |
|---|---|---|
| Idle | Gray button with mic icon | Ready to record |
| Listening | Orange button with waveform | Recording speech |
| Processing | Dark orange with spinner | Refining through Copilot |

---

## :toolbox: Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | [Tauri 2](https://v2.tauri.app) (Rust) |
| Frontend | React 18, TypeScript, Tailwind CSS 4 |
| UI components | Radix UI, shadcn/ui, Motion (Framer) |
| Speech-to-text | macOS `SFSpeechRecognizer` (on-device) |
| AI refinement | GitHub Copilot via `vscode.lm` API |
| Bridge protocol | WebSocket (`ws`) on `127.0.0.1:9147` |
| Search | Fuse.js (fuzzy search) |
| Charts | Recharts |
| Build tooling | Vite, pnpm workspaces |

---

## :handshake: Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for details on setting up the development environment, code style, and how to submit pull requests.

---

## :page_facing_up: License

This project is licensed under the **MIT License** -- see the [LICENSE](LICENSE) file for details.

Copyright 2026 Yapper contributors.
