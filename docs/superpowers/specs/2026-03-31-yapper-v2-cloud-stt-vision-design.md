# Yapper v2 — Local Whisper STT, Screen Capture & Vision AI

**Date**: 2026-03-31
**Status**: Design approved

## Summary

Major architectural overhaul of Yapper removing the air-gap constraint and on-device native STT. Introduces three changes:

1. **Local whisper.cpp STT** with real-time streaming transcription (replacing macOS SFSpeechRecognizer and Windows SAPI/WinRT)
2. **Screen capture + Vision AI** with both hotkey region-select and voice-triggered full-screen capture
3. **Modular plugin architecture** — `SttProvider`, `AiProvider`, and `VisionProvider` traits with swappable implementations

## Architecture

### Plugin System (Approach C)

Three core traits define the provider abstraction layer:

```rust
trait SttProvider: Send + Sync {
    fn start(&self, app: AppHandle) -> Result<()>;
    fn stop(&self) -> Result<String>;
    fn stream_receiver(&self) -> Option<Receiver<PartialTranscript>>;
    fn supports_streaming(&self) -> bool;
}

trait AiProvider: Send + Sync {
    fn refine(&self, text: &str, style: &str, style_overrides: &StyleOverrides, code_mode: bool) -> Result<RefinementResult>;
    fn classify_intent(&self, text: &str) -> Result<Intent>;
    fn converse(&self, history: &[ConversationTurn], message: &str) -> Result<String>;
    fn summarize(&self, text: &str) -> Result<SummaryResult>;
}

trait VisionProvider: Send + Sync {
    fn analyze(&self, image: &[u8], prompt: &str) -> Result<String>;
    fn ocr(&self, image: &[u8]) -> Result<String>;
    fn supports_ai_analysis(&self) -> bool;
}
```

### Provider Implementations

| Trait | Implementation | Description |
|-------|---------------|-------------|
| `SttProvider` | `WhisperCppProvider` | Primary. whisper-rs in-process, streaming via sliding window |
| `SttProvider` | `NativeOsProvider` | Fallback. Existing macOS/Windows native STT (before model download) |
| `AiProvider` | `BridgeProvider` | VS Code / Copilot via WebSocket bridge |
| `AiProvider` | `AnthropicProvider` | Direct Anthropic API (Claude) |
| `AiProvider` | `GroqProvider` | Direct Groq API |
| `VisionProvider` | `CopilotVisionProvider` | Image analysis via VS Code bridge |
| `VisionProvider` | `AnthropicVisionProvider` | Claude API with image content blocks |
| `VisionProvider` | `NativeOcrProvider` | Apple Vision / Windows OCR, text extraction only |

The `commands.rs` orchestrator dispatches to the active provider instance. Provider selection follows `AppSettings` — same dual-mode pattern as today (VS Code mode vs API Key mode) but formalized behind traits.

## STT: whisper.cpp with Real-Time Streaming

### Audio Capture

Replace platform-specific subprocess spawning (Swift on macOS, PowerShell on Windows) with the `cpal` crate for cross-platform in-process audio capture.

- Records at 16kHz, mono, f32 samples
- Audio fed into an in-memory ring buffer (no temp WAV files)
- Cross-platform: single implementation for macOS and Windows

### Transcription

Use `whisper-rs` (Rust bindings to whisper.cpp) compiled into the Tauri binary.

- CoreML acceleration on macOS Apple Silicon
- CUDA optional on Windows (CPU fallback always available)
- Model loaded once at startup, reused across recordings

### Streaming

Sliding window approach for real-time partial transcripts:

1. Audio capture thread fills ring buffer continuously
2. Whisper streaming thread consumes 2-second chunks with 0.5s overlap
3. Each chunk → `whisper_full()` → partial transcript segments
4. Partial segments emitted as `stt-partial` Tauri events → frontend shows live text in widget
5. On stop: final pass on complete audio buffer for best accuracy → `stt-final` event

### Model Management

Models stored in `~/.yapper/models/`. Downloaded from Hugging Face on first use.

| Model | Size | Accuracy | Speed (M1) |
|-------|------|----------|-------------|
| `tiny` | 75MB | Decent | ~30x realtime |
| `base` | 150MB | Good | ~15x realtime |
| `small` | 500MB | Great | ~6x realtime |
| `medium` | 1.5GB | Excellent | ~2x realtime |
| `large-v3` | 3GB | Best | ~1x realtime |

First-launch flow:
1. App detects no model in `~/.yapper/models/`
2. Settings opens to "Speech Recognition" section
3. User picks model size (with size/accuracy info)
4. Download with progress bar
5. SHA256 verification
6. Model loaded, STT ready

Until a model is downloaded, recording falls back to native OS STT (`NativeOsProvider`).

### Language Support

Whisper supports 99 languages. Setting `whisper_language` defaults to `"auto"` (auto-detect). User can pin a specific language in Settings for faster/more accurate recognition.

## Screen Capture + Vision AI

### Two Entry Points

**Hotkey region select** (default `Cmd+Shift+S` / `Ctrl+Shift+S`):
1. Full-screen transparent overlay window appears
2. Screen dims to ~50% opacity, cursor becomes crosshair
3. User drags rectangle to select region
4. On mouse release: capture region, dismiss overlay
5. Route captured image to VisionProvider with default prompt ("summarize this")
6. Can combine with voice: select region, then speak to specify action

**Voice-triggered full screen**:
- During recording, user says "what's on my screen", "summarize what I see", etc.
- Intent classifier detects `screen_*` command
- Captures entire visible screen
- Sends screenshot + spoken prompt to VisionProvider

New voice commands:
- `screen summarize` — capture and summarize screen content
- `screen extract text` / `screen extract` — OCR, return raw text
- `screen explain` — capture and explain what's visible

### Platform Screen Capture

| Feature | macOS | Windows |
|---------|-------|---------|
| Screen capture | `CGWindowListCreateImage` | `Windows.Graphics.Capture` |
| Region overlay | `NSWindow` (level: overlay, transparent) | Layered `HWND` (WS_EX_LAYERED + WS_EX_TOPMOST) |
| Native OCR | `VNRecognizeTextRequest` (Vision framework) | `Windows.Media.Ocr.OcrEngine` |
| Permission | Screen Recording permission prompt | No special permission |

### Vision Provider Routing

Follows the same `ai_provider_mode` setting:
- **VS Code mode** → `CopilotVisionProvider`: extends bridge protocol with `VisionRequest` message type, sends base64 PNG + prompt
- **API Key mode** → `AnthropicVisionProvider`: Claude API with image content blocks in the messages array
- **Offline / no provider** → `NativeOcrProvider`: raw text extraction only, no AI analysis

## Updated Recording Pipeline

```
User triggers hotkey / widget click
  │
  ▼
1. START RECORDING
   cpal audio capture begins
   whisper-rs streaming thread starts
   Widget → recording state (wave + live transcript)

2. WHILE RECORDING
   Audio chunks → whisper_full() → partial segments
   Emit "stt-partial" events → widget shows live text

3. STOP RECORDING
   Final whisper pass on full audio buffer
   Full transcript ready
  │
  ▼
4. POST-PROCESSING
   a. Check snippets → if match, paste directly, done
   b. Apply dictionary replacements
   c. Intent classification (expanded):
      - Existing: translate, summarize, draft, explain, chain
      - New: screen_summarize, screen_extract, screen_explain
      - Default: dictation
   d. If screen command → ScreenCapture → VisionProvider
      Else → AiProvider (refine / voice command)
   e. Auto-paste result
   f. Save to history (with optional screenshot thumbnail)
```

## Settings Changes

### New Fields in AppSettings

```rust
// STT
stt_provider: String,          // "whisper" | "native"
whisper_model: String,          // "tiny" | "base" | "small" | "medium" | "large-v3"
whisper_language: String,       // language code or "auto"
streaming_enabled: bool,        // default: true

// Screen Capture
screen_capture_hotkey: String,  // default: "Cmd+Shift+S" / "Ctrl+Shift+S"
save_screenshots: bool,         // save thumbnails in history, default: true
```

### Settings UI

New "Speech Recognition" section:
- Model picker dropdown (shows size + accuracy level)
- Download progress bar (during model download)
- Language selector dropdown
- Streaming toggle

New "Screen Capture" section:
- Hotkey configuration (same pattern as existing hotkey pickers)
- Save screenshots toggle

## UI Changes

### Widget (Recording State)
- Expands vertically to show live transcript text below wave animation
- Text truncates to last ~50 characters, scrolls as new words arrive
- Same discard (X) and stop (■) buttons

### History Cards
- Screen capture entries show a small thumbnail of the captured region
- New "Screen" action badge alongside existing badges (Translate, Summarize, etc.)

### Help View
- Document new voice commands: `screen summarize`, `screen extract text`, `screen explain`
- Update STT section to reference Whisper model selection

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `stt/traits.rs` | `SttProvider` trait definition |
| `stt/whisper.rs` | whisper-rs integration, streaming, model loading |
| `ai/traits.rs` | `AiProvider` trait definition |
| `vision/mod.rs` | `VisionProvider` trait + dispatcher |
| `vision/copilot.rs` | Bridge-based vision (Copilot) |
| `vision/anthropic.rs` | Claude API vision |
| `vision/native_ocr.rs` | Platform OCR (macOS VNRecognizeTextRequest / Windows OcrEngine) |
| `screen_capture/mod.rs` | Screen capture dispatcher |
| `screen_capture/macos.rs` | CGWindowListCreateImage + NSWindow overlay |
| `screen_capture/windows.rs` | GraphicsCapture + layered HWND overlay |
| `model_manager.rs` | Download, verify, load whisper models |

### Modified Files

| File | Changes |
|------|---------|
| `commands.rs` | New commands (capture_screen, download_model, get_model_status), trait-based dispatch |
| `lib.rs` | New module declarations |
| `stt/mod.rs` | Refactor to use SttProvider trait, add provider selection |
| `ai_provider.rs` | Implement AiProvider trait |
| `bridge.rs` | Add VisionRequest message type, implement AiProvider + VisionProvider traits |
| `hotkey.rs` | Register screen capture hotkey |
| `history.rs` | Support screenshot thumbnails in history entries |
| `widget.tsx` | Live transcript display in recording state |
| `SettingsView.tsx` | New STT and Screen Capture settings sections |
| `HistoryCard.tsx` | Screenshot thumbnail display + Screen badge |
| `HelpView.tsx` | Document new voice commands |
| `Cargo.toml` | Add whisper-rs, cpal, image crates |

### Removed (Eventually)

| File | Reason |
|------|--------|
| `stt/macos.rs` | Replaced by whisper.rs (kept initially as NativeOsProvider fallback) |
| `stt/windows.rs` | Replaced by whisper.rs (kept initially as NativeOsProvider fallback) |

These files are kept for the `NativeOsProvider` fallback but can be removed once whisper.cpp is stable and model download is mandatory.

## Dependencies

### New Rust Crates

| Crate | Purpose |
|-------|---------|
| `whisper-rs` | Rust bindings to whisper.cpp |
| `cpal` | Cross-platform audio capture |
| `image` | Image processing for screenshots/thumbnails |
| `reqwest` (already present) | Model downloads from Hugging Face |
| `sha2` | SHA256 verification of downloaded models |

### VS Code Extension Changes

New `VisionRequest` message type in the bridge protocol:

```typescript
interface VisionRequest {
    type: "vision";
    image: string;     // base64 PNG
    prompt: string;    // user's query
    token: string;     // auth token
}
```

Extension routes this to Copilot's vision-capable model and returns the analysis text.

## Error Handling

- **No whisper model**: Falls back to NativeOsProvider, prompts user to download in Settings
- **Model download fails**: Retry with exponential backoff, show error in Settings UI
- **Screen capture permission denied (macOS)**: Show system prompt, guide user to System Settings > Privacy > Screen Recording
- **Vision provider unavailable**: Fall back to NativeOcrProvider (raw text only), emit event explaining limited functionality
- **cpal audio device error**: Show error in widget tooltip, suggest checking microphone permissions
