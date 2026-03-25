<p align="center">
  <h1 align="center">Yapper</h1>
  <p align="center">Voice-to-text desktop app that captures speech, refines transcripts with AI, and auto-pastes at your cursor</p>
</p>

<p align="center">
  <a href="https://github.com/karandeepbhardwaj/Yapper/actions"><img src="https://github.com/karandeepbhardwaj/Yapper/actions/workflows/build.yml/badge.svg" alt="Build Status" /></a>
  <a href="https://github.com/karandeepbhardwaj/Yapper/releases"><img src="https://img.shields.io/badge/version-0.0.9-blue" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="Platform" /></a>
  <a href="#contributing"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" /></a>
</p>

---

## Features

- **Voice capture** -- press a global hotkey and start talking
- **On-device speech recognition** -- macOS `SFSpeechRecognizer` (offline) / Windows dual-engine: Classic (SAPI5 offline) or Modern (WinRT, higher accuracy)
- **AI transcript refinement** -- multi-provider support (Groq, Gemini, Claude, GitHub Copilot) via VS Code extension bridge
- **Auto-paste** refined text at your active cursor position
- **Floating widget** -- follows you across macOS Spaces, positioned above taskbar on Windows
- **History dashboard** with bento grid layout, fuzzy search (Fuse.js), pin/copy/expand
- **Dark/light mode** with smooth transitions
- **Customizable hotkey** -- `Cmd+Shift+.` (macOS) / `Ctrl+Shift+.` (Windows), or set your own
- **Fn key recording** (macOS) -- use the Globe/Fn key as your trigger
- **STT engine selection** (Windows) -- toggle between Classic (offline, no setup) and Modern (cloud-assisted, higher accuracy) with in-app permission guidance
- **Zero egress** -- the desktop app makes no external network requests

---

## Architecture

```
+--------------------------+   WebSocket (127.0.0.1:9147)   +-------------------------+
|    Desktop App (Tauri)   | <----------------------------> |   VS Code Extension     |
|                          |         local only              |                         |
|  +--------------------+  |                                 |  +-------------------+  |
|  |  React Frontend    |  |                                 |  | WebSocket Server  |  |
|  |  (Tailwind+Motion) |  |                                 |  | (ws, 127.0.0.1)   |  |
|  +---------+----------+  |                                 |  +--------+----------+  |
|            | IPC          |                                 |           |              |
|  +---------+----------+  |                                 |  +--------+----------+  |
|  |  Rust Backend       |  |                                 |  | LLM Providers     |  |
|  |  - Global Hotkey    |  |                                 |  | Groq / Gemini /   |  |
|  |  - Native STT       |  |                                 |  | Claude / Copilot  |  |
|  |  - Auto-paste       |  |                                 |  +-------------------+  |
|  |  - History          |  |                                 |                         |
|  +--------------------+  |                                 +-------------------------+
+-----------+--------------+
            |
     +------+-------+
     | Native STT          |
     | macOS: Swift         |
     | Win: Classic (SAPI5) |
     |   or Modern (WinRT)  |
     | (on-device)          |
     +----------------------+
```

---

## Installation

### Desktop App

Download from the [latest release](https://github.com/karandeepbhardwaj/Yapper/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Yapper_x.x.x_aarch64.dmg` |
| macOS (Intel) | `Yapper_x.x.x_x64.dmg` |
| Windows (installer) | `Yapper_x.x.x_x64-setup.exe` |
| Windows (MSI) | `Yapper_x.x.x_x64_en-US.msi` |

**macOS Gatekeeper fix** (unsigned app):
```bash
xattr -cr /Applications/Yapper.app
```

**Windows permissions**: Grant microphone access in Settings > Privacy > Microphone. For the Modern STT engine, enable Settings > Privacy & security > Speech > "Online speech recognition" (the app will guide you with a tooltip when needed).

### VS Code Extension

1. Download `yapper-bridge-x.x.x.vsix` from the [latest release](https://github.com/karandeepbhardwaj/Yapper/releases)
2. In VS Code: `Cmd+Shift+P` / `Ctrl+Shift+P` > **Extensions: Install from VSIX...** > select the `.vsix` file
3. The bridge auto-starts when VS Code opens -- look for the radio tower icon in the status bar

> **Note:** VS Code must be open for AI refinement to work. Without it, Yapper still captures and pastes raw transcripts.

---

## Building from Source

### Prerequisites

| Dependency | Version | Install |
|---|---|---|
| Rust | 1.75+ | [rustup.rs](https://rustup.rs) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm` |
| Xcode CLI Tools (macOS) | latest | `xcode-select --install` |
| VS Code | latest | For testing the bridge |

### Build & Run

```bash
git clone https://github.com/karandeepbhardwaj/Yapper.git
cd Yapper

pnpm install

# Development mode (hot reload)
pnpm tauri dev

# Production build
pnpm tauri build
```

Build output: `apps/desktop/src-tauri/target/release/bundle/`

---

## How It Works

```
 Speak  -->  Record  -->  Transcribe  -->  Refine  -->  Paste
  |            |              |               |            |
  |       Microphone     Native STT       LLM via      Keystroke
  |       capture        (on-device)      VS Code      simulation
  |                                       extension    (auto-paste)
```

1. **Speak** -- press `Cmd+Shift+.` / `Ctrl+Shift+.` (or click the floating widget)
2. **Record** -- audio is captured from the microphone
3. **Transcribe** -- native speech recognition converts speech to text on-device
4. **Refine** -- the raw transcript is sent over a local WebSocket to the VS Code extension, which refines it with an AI model
5. **Paste** -- the refined text is automatically pasted at your current cursor position

---

## AI Model Configuration

The VS Code extension supports multiple LLM providers with automatic fallback:

| Priority | Provider | Model | Setup |
|----------|----------|-------|-------|
| 1 | vscode.lm | Any registered model | Install GitHub Copilot or Claude for VS Code |
| 2 | Groq | Llama 3.3 70B | Set `yapper.groqApiKey` (free at [console.groq.com](https://console.groq.com)) |
| 3 | Gemini | Gemini 2.0 Flash | Set `yapper.geminiApiKey` (free at [aistudio.google.com](https://aistudio.google.com/apikey)) |
| 4 | Anthropic | Claude Sonnet 4 | Set `yapper.anthropicApiKey` |

Configure in VS Code Settings (`Cmd+,` / `Ctrl+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `yapper.modelFamily` | `gemini-2.0-flash` | Preferred model family |
| `yapper.groqApiKey` | -- | Groq API key (free, fast) |
| `yapper.geminiApiKey` | -- | Gemini API key |
| `yapper.anthropicApiKey` | -- | Anthropic API key |

If no API keys are set and Copilot is unavailable, raw transcripts are pasted without refinement.

---

## Configuration

### Global Hotkey

| Platform | Default | Customizable |
|----------|---------|-------------|
| macOS | `Cmd+Shift+.` | Yes -- click the hotkey badge in the title bar |
| macOS | `Fn` key | Yes -- use the "use fn" button |
| Windows | `Ctrl+Shift+.` | Yes -- click the hotkey badge in the title bar |

### Settings

Settings are persisted per-platform in the app config directory:
- macOS: `~/Library/Application Support/com.yapper.app/settings.json`
- Windows: `%APPDATA%/com.yapper.app/settings.json`

---

## Widget States

```
+----------+       +----------+       +----------+
|          |       |          |       |          |
|   IDLE   | ----> |LISTENING | ----> |PROCESSING|
|          |       |          |       |          |
|  (gray)  |       | (orange) |       | (gradient)|
+----------+       +----------+       +----------+
     ^                                      |
     +--------------------------------------+
                  done / error
```

| State | Appearance | Meaning |
|---|---|---|
| Idle | Thin gray pill, expands on hover | Ready to record |
| Listening | Orange with wave bars + stop/cancel | Recording speech |
| Processing | Animated hue gradient | Refining through AI |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | [Tauri 2](https://v2.tauri.app) (Rust) |
| Frontend | React 18, TypeScript, Tailwind CSS 4 |
| Animations | Motion (Framer Motion) |
| Speech-to-text (macOS) | `SFSpeechRecognizer` via Swift subprocess |
| Speech-to-text (Windows) | Classic: SAPI5 via PowerShell, Modern: `Windows.Media.SpeechRecognition` |
| AI refinement | Multi-provider: Groq, Gemini, Claude, Copilot |
| Bridge protocol | WebSocket (`ws`) on `127.0.0.1:9147` |
| Search | Fuse.js (fuzzy search) |
| macOS interop | `objc2` + `objc2-app-kit` + `block2` |
| Windows interop | `windows` crate (Win32 + WinRT) |
| Build tooling | Vite, esbuild, pnpm workspaces |
| CI/CD | GitHub Actions (macOS + Windows builds) |

---

## Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for details on setting up the development environment, code style, and how to submit pull requests.

---

## License

This project is licensed under the **MIT License** -- see the [LICENSE](LICENSE) file for details.

Copyright 2026 Yapper contributors.
