<p align="center">
  <h1 align="center">Yapper</h1>
  <p align="center">Voice-to-text desktop app that captures speech, refines transcripts with AI, and auto-pastes at your cursor</p>
</p>

<p align="center">
  <a href="https://github.com/karandeepbhardwaj/Yapper/actions"><img src="https://github.com/karandeepbhardwaj/Yapper/actions/workflows/build.yml/badge.svg" alt="Build Status" /></a>
  <a href="https://github.com/karandeepbhardwaj/Yapper/releases"><img src="https://img.shields.io/badge/version-0.3.0-blue" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="Platform" /></a>
  <a href="#contributing"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" /></a>
</p>

### Onboarding Tutorial

<table>
<tr>
<td align="center"><strong>macOS</strong></td>
<td align="center"><strong>Windows</strong></td>
</tr>
<tr>
<td><img src="tutorial-mac.gif" alt="macOS Tutorial" width="400" /></td>
<td><img src="tutorial-windows.gif" alt="Windows Tutorial" width="400" /></td>
</tr>
</table>

---

## Features

- **100% local, private by design** -- speech recognition and AI refinement both run on your machine. No cloud APIs, no API keys, no external apps. Your audio and text never leave the device.
- **Voice capture** -- press a global hotkey and start talking
- **Voice commands** -- speak `translate`, `summarize`, `draft`, `explain`, or `chain` to trigger AI actions directly; classified before refinement
- **Local speech-to-text (Whisper)** -- on-device transcription via [whisper.cpp](https://github.com/ggerganov/whisper.cpp); pick a model size (tiny → large-v3) in Settings, downloaded once
- **Local AI refinement (Ollama)** -- transcripts are cleaned up by an open model (e.g. Llama 3.2) running in your local [Ollama](https://ollama.com) server; no API key in the app
- **Auto-paste** refined text at your active cursor position
- **Conversation mode** -- back-and-forth AI chat with a dedicated hotkey (`Cmd+Shift+Y` / `Ctrl+Shift+Y`), session summaries saved to history
- **Recording modes** -- "Press" (toggle, default) or "Hold" (press-and-hold to record, release to stop; Fn key release supported on macOS)
- **Help screen** -- "How to Yapp" in-app guide with voice command reference
- **Onboarding tutorial** -- platform-specific animated tutorial (macOS dock / Windows taskbar) showing widget lifecycle, email paste workflow, and history dashboard
- **Dictionary** -- user-defined text replacements applied before AI refinement (e.g., "btw" -> "by the way"), handles trailing punctuation
- **Snippets** -- reusable text templates that bypass AI using word boundary matching (e.g., "my email" -> expands to your email address)
- **Style settings** -- per-category refinement tone (Professional, Casual, Technical, Creative) for Email, Messages, Work, Personal
- **Code mode** -- preserves code references in backtick formatting during refinement
- **Metrics** -- usage tracking with streak days, word count, WPM, total recordings
- **Floating widget** -- follows you across macOS Spaces, positioned above dock/taskbar (dock-aware on macOS, drops to bottom in full-screen), click-through when not hovered; shows error messages on failure
- **History dashboard** -- fuzzy search (Fuse.js), pin/copy/delete with animations, sort by newest/oldest, multi-select category filter dropdown, action badges on cards
- **Theme persistence** -- Light / Dark / Auto theme with circle-reveal transition animation
- **iOS-style transitions** -- spring-based push/pop view transitions between app views
- **Settings page** -- Whisper model picker, local AI (Ollama) model + server URL with live status, theme, hotkeys, recording mode, style, dictionary, snippets, metrics, code mode; segmented controls and hint tooltips. iOS 26 style "< Back" navigation
- **Customizable hotkeys** -- dictation: `Cmd+Shift+.` (macOS) / `Ctrl+Shift+.` (Windows); conversation: `Cmd+Shift+Y` / `Ctrl+Shift+Y`
- **Fn key recording** (macOS) -- use the Globe/Fn key as your trigger; Fn release stops recording in Hold mode
- **Atomic file writes** -- all persistence uses write-to-tmp-then-rename to prevent data corruption

---

## Architecture

Everything runs locally — no network calls leave your machine.

```
+----------------------------------+
|        Desktop App (Tauri)       |
|  +----------------------------+  |
|  |  React Frontend            |  |
|  |  (Tailwind + Motion)       |  |
|  +-------------+--------------+  |
|                | IPC             |
|  +-------------+--------------+  |
|  |  Rust Backend              |  |
|  |  - Global Hotkey           |  |
|  |  - cpal audio capture      |  |
|  |  - Voice Cmd Classifier    |  |
|  |  - Auto-paste / History    |  |
|  |                            |  |
|  |  whisper.cpp  ai_provider  |  |
|  +------+-----------+---------+  |
+---------|-----------|------------+
          |           | HTTP (localhost:11434)
   +------v-----+  +--v---------------------+
   | Whisper    |  | Ollama (local LLM)     |
   | model      |  | e.g. llama3.2          |
   | (on-device)|  | OpenAI-compatible API  |
   +------------+  +------------------------+
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

**Windows permissions**: Grant microphone access in Settings > Privacy > Microphone.

### Required: local AI runtime (Ollama)

Yapper refines transcripts with a local LLM via [Ollama](https://ollama.com). One-time setup:

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2`
3. Make sure the server is running: `ollama serve` (the desktop app does the rest)

In Yapper's **Settings → Local AI (Ollama)** you can change the model name (default `llama3.2`) and server URL, and check live connection status. If Ollama isn't running, dictation still works — Yapper pastes the raw transcript and tells you AI refinement is unavailable.

### Required: a Whisper model

On first launch, open **Settings → Speech Recognition** and download a Whisper model (start with `base` or `small`). Transcription runs fully on-device; nothing is uploaded.

---

## Building from Source

### Prerequisites

| Dependency | Version | Install |
|---|---|---|
| Rust | 1.75+ | [rustup.rs](https://rustup.rs) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Bun | latest | [bun.sh](https://bun.sh) |
| CMake | latest | Required to build whisper.cpp (`brew install cmake`) |
| Xcode CLI Tools (macOS) | latest | `xcode-select --install` |
| Ollama | latest | [ollama.com](https://ollama.com) — local LLM runtime |

### Build & Run

```bash
git clone https://github.com/karandeepbhardwaj/Yapper.git
cd Yapper

bun install

# Development mode (hot reload)
bun tauri dev

# Production build
bun tauri build
```

Build output: `apps/desktop/src-tauri/target/release/bundle/`

---

## How It Works

```
 Speak  -->  Record  -->  Transcribe  -->  Classify  -->  Refine/Execute  -->  Paste
  |            |              |               |                 |                 |
  |       Microphone     whisper.cpp     Voice cmd?        local Ollama       Keystroke
  |       (cpal)         (on-device)    (translate,       (llama3.2)         simulation
  |                                      summarize,       on localhost      (auto-paste)
  |                                       draft…)
```

1. **Speak** -- press `Cmd+Shift+.` / `Ctrl+Shift+.` (or click the floating widget, or press `Cmd+Shift+Y` / `Ctrl+Shift+Y` for conversation mode)
2. **Record** -- audio is captured from the microphone via `cpal`
3. **Transcribe** -- whisper.cpp converts speech to text fully on-device
4. **Classify** -- AI-first intent classifier detects voice commands (translate, summarize, draft, explain, chain) and dispatches them; non-commands proceed to refinement
5. **Refine** -- the transcript is sent to your local Ollama model over `localhost:11434`
6. **Paste** -- the refined or command-executed text is automatically pasted at your current cursor position

---

## AI Model Configuration

Yapper refines text with a local model served by **[Ollama](https://ollama.com)** — no API keys, no cloud. Configure it in **Settings → Local AI (Ollama)**.

1. Install Ollama and pull a model: `ollama pull llama3.2`
2. (Optional) Set a different model name or server URL in Settings. Any chat model in your Ollama library works — e.g. `llama3.1`, `mistral`, `qwen2.5`.
3. Use **Test model** in Settings to confirm it responds.

| Setting | Default | Notes |
|---------|---------|-------|
| Model | `llama3.2` | Any model pulled into Ollama |
| Server URL | `http://localhost:11434` | Override with the `YAPPER_OLLAMA_URL` env var too |

> If Ollama isn't running, Yapper pastes the raw transcript unrefined and surfaces a "Local AI not running" notice.

### Voice Commands

Once AI is configured, you can use voice commands by starting your recording with:

| Command | Example phrase | Action |
|---------|---------------|--------|
| `translate` | "translate this to French: ..." | Translates the spoken content |
| `summarize` | "summarize: ..." | Produces a concise summary |
| `draft` | "draft an email to the team about..." | Generates a full draft |
| `explain` | "explain what a closure is" | Explains a concept |
| `chain` | "translate then summarize: ..." | Chains multiple actions |

---

## Configuration

### Hotkeys

| Function | macOS Default | Windows Default | Customizable |
|----------|---------------|-----------------|-------------|
| Dictation | `Cmd+Shift+.` | `Ctrl+Shift+.` | Yes -- in Settings |
| Conversation | `Cmd+Shift+Y` | `Ctrl+Shift+Y` | Yes -- in Settings |
| Fn key | `Fn` (Globe key) | N/A | macOS only |

### Recording Modes

| Mode | Behavior |
|------|----------|
| Press (default) | Press hotkey to start, press again to stop |
| Hold | Hold hotkey to record, release to stop (Fn key release also stops on macOS) |

Configurable in Settings.

### Settings

Settings are persisted per-platform in the app config directory using atomic file writes:
- macOS: `~/Library/Application Support/com.yapper.app/settings.json`
- Windows: `%APPDATA%/com.yapper.app/settings.json`

| Setting | Default | Description |
|---------|---------|-------------|
| `ollama_model` | `llama3.2` | Local LLM model name (must be pulled in Ollama) |
| `ollama_url` | `http://localhost:11434` | Local Ollama server URL |
| `whisper_model` | -- | Downloaded Whisper model (tiny → large-v3) |
| `whisper_language` | `auto` | Transcription language, or auto-detect |
| `theme` | `Auto` | UI theme: "Light", "Dark", or "Auto" |
| `hotkey` | `Cmd+Shift+.` / `Ctrl+Shift+.` | Dictation hotkey |
| `conversation_hotkey` | `Cmd+Shift+Y` / `Ctrl+Shift+Y` | Conversation mode hotkey |
| `recording_mode` | `Press` | "Press" (toggle) or "Hold" (press-and-hold) |
| `default_style` | `Professional` | Default refinement style |
| `style_overrides` | `{}` | Per-category style overrides |
| `metrics_enabled` | `true` | Usage metrics tracking |
| `code_mode` | `false` | Code reference detection |

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
| Speech-to-text | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) via `whisper-rs` (on-device, all platforms) |
| Audio capture | `cpal` (cross-platform, 16 kHz mono) |
| AI refinement | Local [Ollama](https://ollama.com) model over its OpenAI-compatible API |
| Search | Fuse.js (fuzzy search) |
| macOS interop | `objc2` + `objc2-app-kit` + `block2` |
| Windows interop | `windows` crate (Win32 + WinRT) |
| Build tooling | Vite, esbuild, bun workspaces |
| CI/CD | GitHub Actions (macOS + Windows builds) |

---

## Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for details on setting up the development environment, code style, and how to submit pull requests.

---

## License

This project is licensed under the **MIT License** -- see the [LICENSE](LICENSE) file for details.

Copyright 2026 Yapper contributors.
