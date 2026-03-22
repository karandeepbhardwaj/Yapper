# Yapper — Design Document

## Vision

A minimal, always-available voice capture tool for macOS that treats spoken words as first-class input. Speak naturally, get polished text at your cursor. No cloud dependency from the app itself — all speech recognition happens on-device, and AI refinement runs through your local VS Code instance.

## Design Principles

1. **Invisible until needed** — The widget is a thin 40×5px pill at the bottom of the screen. It expands on hover, records on click, and collapses when done. Zero cognitive overhead.
2. **Zero egress** — The desktop app makes no external network requests. STT is on-device (SFSpeechRecognizer). AI refinement goes through the local VS Code extension bridge only.
3. **Works everywhere** — The widget uses NSPanel with `canJoinAllSpaces` + `fullScreenAuxiliary` to appear across all macOS Spaces, including full-screen apps.
4. **Graceful degradation** — If VS Code isn't running or Copilot isn't available, raw transcripts are pasted instead. The app never blocks on missing dependencies.

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    macOS Desktop                     │
│                                                     │
│  ┌─────────────┐     ┌──────────────────────────┐   │
│  │   Widget     │     │     Main Window           │   │
│  │  (NSPanel)   │     │   (History Dashboard)     │   │
│  │  widget.tsx  │     │   MainWindow.tsx          │   │
│  └──────┬──────┘     └────────────┬─────────────┘   │
│         │    Tauri Events         │                  │
│  ┌──────┴─────────────────────────┴─────────────┐   │
│  │              Rust Backend (Tauri v2)           │   │
│  │                                               │   │
│  │  ┌──────────┐  ┌─────────┐  ┌─────────────┐  │   │
│  │  │ STT      │  │ Bridge  │  │ Auto-paste   │  │   │
│  │  │ (Swift)  │  │ (WS)    │  │ (osascript)  │  │   │
│  │  └────┬─────┘  └────┬────┘  └──────────────┘  │   │
│  └───────┼──────────────┼────────────────────────┘   │
│          │              │                            │
│  ┌───────┴───────┐  ┌──┴──────────────────────┐     │
│  │ AVAudioRecorder│  │ VS Code Extension       │     │
│  │ SFSpeech       │  │ (WebSocket :9147)       │     │
│  │ (on-device)    │  │ → vscode.lm → Copilot   │     │
│  └────────────────┘  └─────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

## Pipeline

### Recording Phase
1. User triggers recording (widget click or `Cmd+Shift+.`)
2. Rust spawns Swift subprocess: `swift /tmp/yapper_recorder.swift /tmp/yapper_recording.wav`
3. Swift uses `AVAudioRecorder` at native sample rate (typically 48kHz), mono 16-bit PCM
4. Widget shows wave animation bars
5. User stops → Rust sends SIGINT → Swift calls `recorder.stop()` to finalize WAV header

### Transcription Phase
1. Rust spawns second Swift subprocess: `swift /tmp/yapper_transcriber.swift /tmp/yapper_recording.wav`
2. Swift uses `SFSpeechURLRecognitionRequest` with `SFSpeechRecognizer(locale: "en-US")`
3. `CFRunLoopRun()` keeps the process alive until callback fires
4. Transcript returned via stdout

### Refinement Phase (optional)
1. Rust connects to WebSocket at `127.0.0.1:9147` (500ms TCP timeout)
2. Sends `{type: "refine", id, rawText, style}` to VS Code extension
3. Extension calls `vscode.lm.selectChatModels({vendor: "copilot"})` → sends to Copilot
4. Copilot returns `{refinedText, category, title}` as JSON
5. If bridge unavailable → raw transcript used as fallback

### Output Phase
1. Refined (or raw) text copied to clipboard via `pbcopy`
2. `osascript -e 'tell application "System Events" to keystroke "v" using command down'` pastes at cursor
3. Result saved to history with timestamp, category, title

## Widget States

```
State 1: Collapsed (idle)
┌────────────────────┐
│ ════                │  40×5px pill, 50% opacity
└────────────────────┘

State 2: Hover
┌────────────────────┐
│     🎤             │  52×24px pill with mic icon
└────────────────────┘

State 3: Recording
┌────────────────────────────────────┐
│  ✕  ▏▎▍▌▋▊▋▌▍▎▏▎▍  ⬛            │  160×32px with X, waves, stop
└────────────────────────────────────┘

State 4: Processing
┌────────────────────────────────────┐
│  ═══════ hue gradient wave ══════  │  160×32px animated gradient
└────────────────────────────────────┘
```

## Widget Positioning

The widget positions itself centered horizontally on whichever screen the mouse is on, placed just above the dock:

```rust
let dock_h = screen.frame.height - screen.visibleFrame.height - screen.visibleFrame.origin.y;
let y = dock_h + 8.0;  // 8px above dock
let x = (screen.frame.width - widget_width) / 2.0;
```

## Data Model

### History Item
```typescript
{
  id: string;            // crypto.randomUUID()
  rawTranscript: string; // Original speech text
  refinedText: string;   // AI-refined text (or raw if no bridge)
  category: string;      // Auto-assigned: Interview, Thought, Work, Email, etc.
  title: string;         // AI-generated 3-8 word title
  timestamp: number;     // Date.now()
  pinned: boolean;       // User can pin items
}
```

### Refinement Modes (auto-detected by Copilot)
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

- No API keys stored in the app
- No network requests from the desktop app
- WebSocket bridge is localhost-only (127.0.0.1, not 0.0.0.0)
- Audio files are temporary (`/tmp/yapper_recording.wav`) and deleted after transcription
- History stored in `localStorage` (client-side only)
- Copilot authentication is handled entirely by VS Code

## macOS Permissions Required

| Permission | Purpose | Configured In |
|-----------|---------|---------------|
| Microphone | Audio recording | Info.plist `NSMicrophoneUsageDescription` |
| Speech Recognition | On-device STT | Info.plist `NSSpeechRecognitionUsageDescription` |
| Accessibility | Auto-paste via keystroke simulation | System Settings (manual) |

## Future Considerations

- Windows STT implementation (currently a stub)
- Linux support (PipeWire audio + Whisper.cpp for STT)
- On-device refinement (local LLM instead of Copilot)
- Multi-language support (SFSpeechRecognizer supports many locales)
- Audio playback from history
- Export history as markdown/JSON
- Customizable widget position (drag to reposition)
- Plugin system for custom refinement backends
