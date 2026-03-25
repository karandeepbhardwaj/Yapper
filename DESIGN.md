# Yapper — Design Document

## Vision

A minimal, always-available voice capture tool that treats spoken words as first-class input. Speak naturally, get polished text at your cursor. No cloud dependency from the app itself — all speech recognition happens on-device, and AI refinement runs through your local VS Code instance with multi-provider support.

## Design Principles

1. **Invisible until needed** — The widget is a thin pill at the bottom of the screen. It expands on hover, records on click, and collapses when done. Zero cognitive overhead.
2. **Zero egress** — The desktop app makes no external network requests. STT is on-device. AI refinement goes through the local VS Code extension bridge only.
3. **Works everywhere** — macOS: NSPanel with `canJoinAllSpaces` appears across all Spaces. Windows: always-on-top transparent window above taskbar.
4. **Graceful degradation** — If VS Code isn't running or no AI provider is available, raw transcripts are pasted instead. The app never blocks on missing dependencies.
5. **Cross-platform** — Platform-specific code is isolated in dedicated modules. Shared logic lives in `commands.rs`, `bridge.rs`, `history.rs`.

## System Architecture

```
+-----------------------------------------------------+
|                    Desktop App                        |
|                                                       |
|  +-------------+     +--------------------------+     |
|  |   Widget    |     |     Main Window           |     |
|  |  (NSPanel / |     |   (History Dashboard)     |     |
|  |   Win32)    |     |   MainWindow.tsx          |     |
|  +------+------+     +------------+-------------+     |
|         |    Tauri Events         |                    |
|  +------+--------------------------+--------------+    |
|  |              Rust Backend (Tauri v2)            |    |
|  |                                                 |    |
|  |  +--------+  +---------+  +-------------+      |    |
|  |  | STT    |  | Bridge  |  | Auto-paste   |      |    |
|  |  | (plat) |  | (WS)    |  | (plat)       |      |    |
|  |  +---+----+  +----+----+  +--------------+      |    |
|  +------+-------------+---------------------------+    |
|         |              |                               |
|  +------+--------+  +--+-------------------------+     |
|  | Native STT    |  | VS Code Extension          |     |
|  | macOS: Swift   |  | (WebSocket :9147)          |     |
|  | Win: WinRT     |  | -> Groq / Gemini / Claude  |     |
|  | (on-device)    |  |    / Copilot               |     |
|  +----------------+  +----------------------------+     |
+-----------------------------------------------------+
```

## Pipeline

### Recording Phase
1. User triggers recording (widget click or hotkey)
2. **macOS**: Rust spawns Swift subprocess with AVAudioRecorder at native sample rate, mono 16-bit PCM
3. **Windows (Classic)**: Rust spawns PowerShell subprocess with inline C# using `System.Speech.Recognition` (SAPI5). Offline, no setup needed.
3. **Windows (Modern)**: Rust starts `SpeechRecognizer` via `windows::Media::SpeechRecognition` (WinRT, in-process). Higher accuracy but requires "Online speech recognition" privacy setting.
4. Widget shows wave animation bars
5. User stops -> macOS: SIGINT to Swift, Windows Classic: writes stop file (C# calls `RecognizeAsyncStop()`), Windows Modern: `StopAsync()`

### Transcription Phase
1. **macOS**: Rust spawns second Swift subprocess using `SFSpeechURLRecognitionRequest`. `CFRunLoopRun()` keeps process alive until callback. Transcript returned via stdout.
2. **Windows (Classic)**: Transcript returned via PowerShell stdout after `RecognizeAsyncStop()` finishes processing pending audio. Uses DictationGrammar + spelling grammar.
2. **Windows (Modern)**: Transcript accumulated in-process via `ResultGenerated` event handler on `ContinuousRecognitionSession` during recording.

### Refinement Phase (optional)
1. Rust connects to WebSocket at `127.0.0.1:9147` (500ms TCP timeout)
2. Sends `{type: "refine", id, rawText, style}` to VS Code extension
3. Extension tries providers in order: vscode.lm -> Groq -> Gemini -> Anthropic
4. Provider returns `{refinedText, category, title}` as JSON
5. If bridge unavailable -> raw transcript used as fallback

### Output Phase
1. Refined (or raw) text copied to clipboard (pbcopy on macOS, PowerShell Set-Clipboard on Windows)
2. Keystroke simulation pastes at cursor (osascript Cmd+V on macOS, PowerShell SendKeys Ctrl+V on Windows)
3. Result saved to history with timestamp, category, title

## Widget States

```
State 1: Collapsed (idle)
+--------------------+
| ====                |  40x5px pill, 50% opacity
+--------------------+

State 2: Hover
+--------------------+
|     mic             |  52x24px pill with mic icon
+--------------------+

State 3: Recording
+------------------------------------+
|  X  |||||||||||||||||  stop        |  160x32px with X, waves, stop
+------------------------------------+

State 4: Processing
+------------------------------------+
|  ======= hue gradient wave ======  |  160x32px animated gradient
+------------------------------------+
```

## Widget Positioning

**macOS**: Centered on the screen containing the mouse cursor, 4px above the dock. Uses `NSEvent.mouseLocation` + `NSScreen.screens` for multi-monitor support. Repositioned every ~480ms.

**Windows**: Centered in the work area of the monitor containing the cursor, 4px above the taskbar. Uses `GetCursorPos` + `MonitorFromPoint` + `GetMonitorInfoW`. Same repositioning interval.

## Data Model

### History Item
```typescript
{
  id: string;            // timestamp-based
  rawTranscript: string; // Original speech text
  refinedText: string;   // AI-refined text (or raw if no bridge)
  category: string;      // Auto-assigned: Interview, Thought, Work, Email, etc.
  title: string;         // AI-generated 3-8 word title
  timestamp: string;     // ISO timestamp
  isPinned: boolean;     // User can pin items
}
```

### Refinement Modes (auto-detected by AI)
| Mode | Trigger Phrases | Output |
|------|----------------|--------|
| General | Default | Cleaned-up transcript |
| Email | "write me an email", "draft an email" | Full email with greeting/sign-off |
| Message | "write a response", "reply to" | Concise message/response |

### Style Modifiers
| Style | Behavior |
|-------|----------|
| Professional | Concise, clear, no colloquialisms |
| Casual | Natural, conversational, still grammatically correct |
| Technical | Precise terminology, structured for clarity |
| Creative | Vivid, expressive, varied sentence structure |

## Security Model

- No API keys stored in the desktop app
- No network requests from the desktop app
- WebSocket bridge is localhost-only (127.0.0.1, not 0.0.0.0)
- Audio files are temporary (`/tmp/yapper_recording.wav`) and overwritten each recording
- History stored as JSON in app data directory
- LLM API keys are stored in VS Code settings (extension-side only)
- AI provider authentication is handled by the VS Code extension

## Permissions Required

### macOS
| Permission | Purpose | Configured In |
|-----------|---------|---------------|
| Microphone | Audio recording | Info.plist `NSMicrophoneUsageDescription` |
| Speech Recognition | On-device STT | Info.plist `NSSpeechRecognitionUsageDescription` |
| Accessibility | Auto-paste via keystroke simulation | System Settings (manual) |

### Windows
| Permission | Purpose | Configured In |
|-----------|---------|---------------|
| Microphone | Audio recording | Settings > Privacy > Microphone |
| Online speech recognition | Modern STT engine (WinRT) | Settings > Privacy & security > Speech (detected via registry key `HKCU\...\OnlineSpeechPrivacy\HasAccepted`) |

> **Note:** The Classic STT engine (SAPI5) requires no additional permissions beyond microphone access. The app detects the privacy setting and shows a setup tooltip when the user switches to Modern engine.

### AppSettings
```json
{
  "hotkey": "Ctrl+Shift+.",
  "stt_engine": "classic"
}
```
Persisted to `{app_config_dir}/settings.json`. The `stt_engine` field ("classic" or "modern") controls which Windows STT engine is used. Restored on startup.
