# Prompt Refinement Services

A secure, offline-first desktop utility for Windows and macOS that captures speech, refines transcripts through GitHub Copilot, and auto-pastes results at the active cursor position.

## Architecture

```
┌─────────────────────────┐     WebSocket (127.0.0.1:9147)     ┌──────────────────────┐
│   Desktop App (Tauri)   │ ◄──────────────────────────────► │  VS Code Extension   │
│                         │          local only                │                      │
│  ┌───────────────────┐  │                                    │  ┌────────────────┐  │
│  │  React Frontend   │  │                                    │  │ WebSocket Srv  │  │
│  │  (Figma UI)       │  │                                    │  │ (ws, 127.0.0.1)│  │
│  └────────┬──────────┘  │                                    │  └───────┬────────┘  │
│           │ IPC         │                                    │          │           │
│  ┌────────┴──────────┐  │                                    │  ┌───────┴────────┐  │
│  │  Rust Backend     │  │                                    │  │  vscode.lm API │  │
│  │  - Global Hotkey  │  │                                    │  │  (Copilot)     │  │
│  │  - Native STT     │  │                                    │  └────────────────┘  │
│  │  - Auto-paste     │  │                                    │                      │
│  └───────────────────┘  │                                    └──────────────────────┘
└─────────────────────────┘
         │
         ▼
  ┌──────────────┐
  │ OS Native    │
  │ STT APIs     │
  │ (offline)    │
  └──────────────┘
```

## Security Model

- **Zero Egress**: The desktop application makes NO external network requests
- **No Bundled AI Models**: Uses strictly native OS offline dictation APIs
  - macOS: `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true`
  - Windows: `Windows.Media.SpeechRecognition.SpeechRecognizer`
- **Local-Only Bridge**: WebSocket communication bound exclusively to `127.0.0.1`
- **Enterprise AI**: Text refinement routes through the organization's pre-authorized GitHub Copilot connection via VS Code
- **Memory Safe**: Rust backend (Tauri) ensures no buffer overflows or memory corruption
- **Minimal CSP**: Content Security Policy restricts frontend to self-origin only

## Prerequisites

- **Rust** (1.75+): [rustup.rs](https://rustup.rs)
- **Node.js** (20+): [nodejs.org](https://nodejs.org)
- **pnpm** (9+): `npm install -g pnpm`
- **VS Code** with GitHub Copilot extension installed and activated
- **Platform SDKs**:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio Build Tools with C++ workload

## Project Structure

```
prompt-refinement-services/
├── apps/desktop/                 # Tauri desktop application
│   ├── src/                      # React frontend (Figma UI)
│   │   ├── app/
│   │   │   ├── components/       # UI components
│   │   │   ├── hooks/            # Tauri event hooks
│   │   │   └── lib/              # Bridge + types
│   │   └── styles/               # Tailwind + theme CSS
│   └── src-tauri/                # Rust backend
│       └── src/
│           ├── stt/              # Native STT (macOS/Windows)
│           ├── bridge.rs         # WebSocket client
│           ├── autopaste.rs      # Keystroke simulation
│           ├── hotkey.rs         # Global shortcut
│           └── history.rs        # Transcript history
├── extensions/vscode-bridge/     # VS Code companion extension
│   └── src/
│       ├── extension.ts          # WebSocket server + lifecycle
│       ├── copilot-bridge.ts     # vscode.lm API integration
│       └── protocol.ts           # Shared message types
└── docs/                         # Implementation plans
```

## Building

### Desktop Application

```bash
# Install dependencies
pnpm install

# Development mode (with hot reload)
pnpm tauri dev

# Production build
pnpm tauri build
```

The production binary will be in `apps/desktop/src-tauri/target/release/bundle/`.

### VS Code Extension

```bash
cd extensions/vscode-bridge

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package as .vsix
npm run package
```

Install the `.vsix` file in VS Code: Extensions panel → `...` menu → "Install from VSIX..."

## Usage

### Quick Start

1. Install and launch the desktop app
2. Install the VS Code extension (ensure GitHub Copilot is active)
3. The VS Code extension auto-starts the WebSocket bridge on activation
4. Press **Alt+Space** (or **Option+Space** on macOS) to start recording
5. Speak your transcript
6. Press the hotkey again (or click the widget) to stop
7. The refined text is automatically pasted at your cursor position

### Keyboard Shortcuts

| Action               | Shortcut                     |
| -------------------- | ---------------------------- |
| Start/Stop Recording | `Alt+Space` / `Option+Space` |
| Open Settings        | `Cmd+,` / `Ctrl+,`          |

### Settings

- **Auto-stop after silence**: Automatically stop recording after detecting silence
- **Show floating widget**: Toggle the always-on-top recording button
- **Language**: Recognition language (English, Spanish, French, German, Japanese)
- **Refinement Style**: Professional, Casual, Technical, or Creative

### Widget States

| State      | Appearance                      | Meaning                    |
| ---------- | ------------------------------- | -------------------------- |
| Idle       | Gray button with mic icon       | Ready to record            |
| Listening  | Orange button with waveform     | Recording speech           |
| Processing | Dark orange with spinning icon  | Refining through Copilot   |

## Configuration

### Desktop App

Settings are persisted to the OS app config directory:
- macOS: `~/Library/Application Support/com.prompt-refinement.services/settings.json`
- Windows: `%APPDATA%\com.prompt-refinement.services\settings.json`

### VS Code Extension

The extension auto-starts on VS Code launch. Commands available:
- `Prompt Refinement: Start Bridge` — Start the WebSocket server
- `Prompt Refinement: Stop Bridge` — Stop the WebSocket server
- `Prompt Refinement: Show Status` — Show connection status

The bridge uses port `9147` on `127.0.0.1` by default.

## Offline Operation

The desktop app operates fully offline. No runtime network requests are made:
- Speech recognition uses on-device models provided by the OS
- Fonts are loaded from the system (Inter, with system font fallbacks)
- No telemetry, analytics, or update checks

The only network activity is the VS Code extension communicating with GitHub Copilot through VS Code's built-in, enterprise-authorized channel.

## Permissions Required

### macOS
- **Microphone Access**: Required for speech recognition
- **Speech Recognition**: Required for on-device transcription
- **Accessibility**: Required for auto-paste (keystroke simulation)

### Windows
- **Microphone Access**: Required for speech recognition
- **Speech Recognition**: Required for dictation

## Troubleshooting

### "No Copilot models available"
Ensure GitHub Copilot is installed, activated, and your organization's license is valid in VS Code.

### Auto-paste not working
- macOS: Grant Accessibility permission in System Settings → Privacy & Security → Accessibility
- Windows: Run as administrator if paste simulation fails

### Bridge connection failed
- Check that VS Code is running with the extension active
- Verify port 9147 is not blocked by firewall or another process
- Run "Show Prompt Refinement Bridge Status" command in VS Code

### Speech recognition not available
- macOS: Ensure on-device speech recognition models are downloaded (System Settings → Keyboard → Dictation)
- Windows: Ensure speech recognition language packs are installed

## License

© 2026 Prompt Refinement Services. All rights reserved.
