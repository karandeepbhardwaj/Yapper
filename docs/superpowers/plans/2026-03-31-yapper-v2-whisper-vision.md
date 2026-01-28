# Yapper v2 — Whisper STT, Screen Capture & Vision AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace on-device native STT with local whisper.cpp (streaming), add screen capture with vision AI, and formalize the provider system behind traits.

**Architecture:** Three provider traits (`SttProvider`, `AiProvider`, `VisionProvider`) with swappable implementations. Whisper.cpp via `whisper-rs` crate with `cpal` audio capture replaces Swift/PowerShell subprocesses. Screen capture uses platform APIs (CGWindowList/GraphicsCapture) with a region-select overlay. Vision routes through existing dual-provider pattern (VS Code bridge or Anthropic API) with native OCR fallback.

**Tech Stack:** Rust (whisper-rs, cpal, image, sha2), Tauri v2 events, React 18 + motion/react, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-31-yapper-v2-cloud-stt-vision-design.md`

**Note:** This project has no automated test suite. Steps reference manual testing and `cargo check` for verification.

**Deferred to follow-up:** Region-select overlay (transparent window + crosshair cursor + drag-to-select rectangle). Initial implementation captures full screen on hotkey. Region select requires significant platform-specific overlay window management and will be added as a fast-follow.

---

## File Structure

### New Files (Rust Backend — `apps/desktop/src-tauri/src/`)

| File | Responsibility |
|------|---------------|
| `providers/mod.rs` | Provider trait definitions (`SttProvider`, `AiProvider`, `VisionProvider`) + shared types |
| `providers/stt_whisper.rs` | WhisperCppProvider — whisper-rs integration, cpal audio capture, streaming |
| `providers/stt_native.rs` | NativeOsProvider — wraps existing macOS/Windows STT behind SttProvider trait |
| `providers/ai_bridge.rs` | BridgeAiProvider — wraps existing bridge.rs behind AiProvider trait |
| `providers/ai_direct.rs` | DirectAiProvider — wraps existing ai_provider.rs behind AiProvider trait |
| `providers/vision_anthropic.rs` | AnthropicVisionProvider — Claude API with image content blocks |
| `providers/vision_bridge.rs` | CopilotVisionProvider — vision via VS Code bridge |
| `providers/vision_native.rs` | NativeOcrProvider — Apple Vision / Windows OCR |
| `model_manager.rs` | Whisper model download, verification, loading, status queries |
| `screen_capture/mod.rs` | Screen capture dispatcher + shared types |
| `screen_capture/macos.rs` | macOS: CGWindowListCreateImage + region overlay |
| `screen_capture/windows.rs` | Windows: GraphicsCapture + region overlay |

### Modified Files

| File | Changes |
|------|---------|
| `Cargo.toml` | Add whisper-rs, cpal, image, sha2, hound dependencies |
| `lib.rs` | Add `mod providers`, `mod model_manager`, `mod screen_capture`; register new commands |
| `commands.rs` | Add `AppSettings` fields, new commands, trait-based dispatch in `process_recording_result()` |
| `stt/mod.rs` | Emit `stt-partial` events, connect to provider trait |
| `hotkey.rs` | Register screen capture hotkey |
| `history.rs` | Add `screenshot_thumbnail` field to `HistoryEntry` |
| `bridge.rs` | Add `VisionRequest`/`VisionResponse` message types |

### Modified Files (Frontend — `apps/desktop/src/`)

| File | Changes |
|------|---------|
| `app/lib/types.ts` | Add STT/vision settings fields to `AppSettings`, `HistoryItem` |
| `widget.tsx` | Live transcript display during recording |
| `app/components/SettingsView.tsx` | Speech Recognition + Screen Capture settings sections |
| `app/components/HistoryCard.tsx` | Screenshot thumbnail display + Screen badge |
| `app/components/HelpView.tsx` | New voice commands documentation |

### Modified Files (VS Code Extension — `extensions/vscode-bridge/src/`)

| File | Changes |
|------|---------|
| `protocol.ts` | Add `VisionRequest`, `VisionResultResponse` types |
| `extension.ts` | Add `handleVisionMessage()` routing |
| `copilot-bridge.ts` | Add `handleVision()` function |

---

### Task 1: Add Rust Dependencies

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`

- [ ] **Step 1: Add new crate dependencies to Cargo.toml**

Open `apps/desktop/src-tauri/Cargo.toml` and add these dependencies after the existing ones (after line 27):

```toml
whisper-rs = "0.13"
cpal = "0.15"
hound = "3.5"
image = { version = "0.25", default-features = false, features = ["png", "jpeg"] }
sha2 = "0.10"
base64 = "0.22"
```

Under the `[target.'cfg(target_os = "macos")'.dependencies]` section (after line 37), add:

```toml
core-graphics = "0.24"
```

- [ ] **Step 2: Verify dependencies resolve**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully (warnings OK, no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml
git commit -m "chore: add whisper-rs, cpal, image, screen capture dependencies"
```

---

### Task 2: Define Provider Traits

**Files:**
- Create: `apps/desktop/src-tauri/src/providers/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Create providers module with trait definitions**

Create `apps/desktop/src-tauri/src/providers/mod.rs`:

```rust
pub mod stt_whisper;
pub mod stt_native;
pub mod ai_bridge;
pub mod ai_direct;
pub mod vision_anthropic;
pub mod vision_bridge;
pub mod vision_native;

use std::collections::HashMap;
use std::sync::mpsc::Receiver;

/// Partial transcript segment emitted during streaming STT.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PartialTranscript {
    pub text: String,
    pub is_final: bool,
}

/// Result of AI text refinement.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RefinementResult {
    pub refined_text: String,
    pub category: Option<String>,
    pub title: Option<String>,
}

/// Classified user intent from a voice command.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Intent {
    pub intent: String,
    pub params: Option<HashMap<String, String>>,
    pub input_source: Option<String>,
    pub description: Option<String>,
    pub actions: Option<Vec<IntentAction>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IntentAction {
    pub intent: String,
    pub params: Option<HashMap<String, String>>,
    pub input_source: Option<String>,
    pub description: Option<String>,
}

/// Result of a voice command execution.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CommandResult {
    pub result: String,
    pub action: String,
    pub params: Option<HashMap<String, String>>,
}

/// Result of a conversation turn.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConversationResponse {
    pub content: String,
}

/// Result of conversation summarization.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SummaryResult {
    pub summary: String,
    pub title: String,
    pub key_points: Vec<String>,
}

/// Style overrides per category.
pub type StyleOverrides = HashMap<String, String>;

/// Speech-to-text provider trait.
pub trait SttProvider: Send + Sync {
    /// Start audio capture and recognition.
    fn start(&self, app: &tauri::AppHandle) -> Result<(), String>;

    /// Stop recognition and return the final transcript.
    fn stop(&self) -> Result<String, String>;

    /// Get a receiver for partial transcript segments (streaming).
    /// Returns None if streaming is not supported.
    fn stream_receiver(&self) -> Option<Receiver<PartialTranscript>>;

    /// Whether this provider supports real-time streaming.
    fn supports_streaming(&self) -> bool;

    /// Clean up any resources (e.g., kill lingering subprocesses).
    fn cleanup(&self);
}

/// AI text refinement and conversation provider trait.
pub trait AiProvider: Send + Sync {
    /// Refine raw transcript text.
    fn refine(
        &self,
        raw_text: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<RefinementResult, String>;

    /// Classify user intent from transcript.
    fn classify_intent(&self, raw_text: &str) -> Result<Intent, String>;

    /// Execute a voice command.
    fn send_command(
        &self,
        raw_text: &str,
        clipboard: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<CommandResult, String>;

    /// Send a conversation turn and return AI response.
    fn converse(
        &self,
        history: &[crate::bridge::ConversationTurnMsg],
        user_message: &str,
        on_chunk: Option<Box<dyn Fn(&str) + Send>>,
    ) -> Result<ConversationResponse, String>;

    /// Summarize a conversation.
    fn summarize(
        &self,
        history: &[crate::bridge::ConversationTurnMsg],
    ) -> Result<SummaryResult, String>;
}

/// Vision / OCR provider trait.
pub trait VisionProvider: Send + Sync {
    /// Analyze an image with AI and return the analysis text.
    fn analyze(&self, image_bytes: &[u8], prompt: &str) -> Result<String, String>;

    /// Extract text from an image via OCR.
    fn ocr(&self, image_bytes: &[u8]) -> Result<String, String>;

    /// Whether this provider supports AI-powered analysis (not just OCR).
    fn supports_ai_analysis(&self) -> bool;
}
```

- [ ] **Step 2: Add providers module to lib.rs**

In `apps/desktop/src-tauri/src/lib.rs`, after the existing module declarations (after `mod metrics;` at line 15), add:

```rust
pub mod providers;
```

- [ ] **Step 3: Create stub files for all provider implementations**

Create these empty stub files so the module compiles:

`apps/desktop/src-tauri/src/providers/stt_whisper.rs`:
```rust
// WhisperCppProvider — implemented in Task 7
```

`apps/desktop/src-tauri/src/providers/stt_native.rs`:
```rust
// NativeOsProvider — implemented in Task 4
```

`apps/desktop/src-tauri/src/providers/ai_bridge.rs`:
```rust
// BridgeAiProvider — implemented in Task 5
```

`apps/desktop/src-tauri/src/providers/ai_direct.rs`:
```rust
// DirectAiProvider — implemented in Task 6
```

`apps/desktop/src-tauri/src/providers/vision_anthropic.rs`:
```rust
// AnthropicVisionProvider — implemented in Task 13
```

`apps/desktop/src-tauri/src/providers/vision_bridge.rs`:
```rust
// CopilotVisionProvider — implemented in Task 14
```

`apps/desktop/src-tauri/src/providers/vision_native.rs`:
```rust
// NativeOcrProvider — implemented in Task 12
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles (warnings about unused modules OK)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/providers/
git add apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: define SttProvider, AiProvider, VisionProvider traits"
```

---

### Task 3: Update Frontend Types

**Files:**
- Modify: `apps/desktop/src/app/lib/types.ts`

- [ ] **Step 1: Add new fields to AppSettings interface**

In `apps/desktop/src/app/lib/types.ts`, add new fields to the `AppSettings` interface (after `theme` at line 51):

```typescript
  stt_provider: "whisper" | "native";
  whisper_model: string;
  whisper_language: string;
  streaming_enabled: boolean;
  screen_capture_hotkey: string;
  save_screenshots: boolean;
```

- [ ] **Step 2: Add defaults for new fields in DEFAULT_SETTINGS**

In `DEFAULT_SETTINGS` (after the `theme` default at line 68):

```typescript
  stt_provider: "whisper",
  whisper_model: "",
  whisper_language: "auto",
  streaming_enabled: true,
  screen_capture_hotkey: "Cmd+Shift+S",
  save_screenshots: true,
```

- [ ] **Step 3: Add screenshot_thumbnail to HistoryItem**

In the `HistoryItem` interface (after `actionParams` at line 27):

```typescript
  screenshotThumbnail?: string;
```

- [ ] **Step 4: Add ModelDownloadStatus type**

At the end of the file, add:

```typescript
export interface ModelInfo {
  name: string;
  size: string;
  description: string;
}

export interface ModelDownloadProgress {
  model: string;
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
}

export const WHISPER_MODELS: ModelInfo[] = [
  { name: "tiny", size: "75 MB", description: "Fastest, decent accuracy" },
  { name: "base", size: "150 MB", description: "Good balance of speed and accuracy" },
  { name: "small", size: "500 MB", description: "Great accuracy, moderate speed" },
  { name: "medium", size: "1.5 GB", description: "Excellent accuracy, slower" },
  { name: "large-v3", size: "3 GB", description: "Best accuracy, slowest" },
];
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/lib/types.ts
git commit -m "feat: add STT, vision, and screen capture types to frontend"
```

---

### Task 4: NativeOsProvider — Wrap Existing STT

**Files:**
- Modify: `apps/desktop/src-tauri/src/providers/stt_native.rs`

This wraps the existing `stt::macos` and `stt::windows` modules behind the `SttProvider` trait as a fallback provider.

- [ ] **Step 1: Implement NativeOsProvider**

Replace `apps/desktop/src-tauri/src/providers/stt_native.rs` with:

```rust
use std::sync::mpsc::Receiver;
use crate::providers::{PartialTranscript, SttProvider};

/// Wraps the existing platform-native STT (macOS SFSpeechRecognizer / Windows SAPI)
/// behind the SttProvider trait. Used as fallback before a Whisper model is downloaded.
pub struct NativeOsProvider;

impl NativeOsProvider {
    pub fn new() -> Self {
        Self
    }
}

impl SttProvider for NativeOsProvider {
    fn start(&self, app: &tauri::AppHandle) -> Result<(), String> {
        crate::stt::platform_start(app)
    }

    fn stop(&self) -> Result<String, String> {
        crate::stt::platform_stop()
    }

    fn stream_receiver(&self) -> Option<Receiver<PartialTranscript>> {
        None // Native STT does not support streaming
    }

    fn supports_streaming(&self) -> bool {
        false
    }

    fn cleanup(&self) {
        crate::stt::platform_cleanup();
    }
}
```

- [ ] **Step 2: Expose platform functions from stt/mod.rs**

In `apps/desktop/src-tauri/src/stt/mod.rs`, rename the internal platform calls to avoid confusion with the public `start`/`stop` that manage state. Add these public functions after the existing code (after line 84):

```rust
/// Direct platform STT start (no state management). Used by NativeOsProvider.
pub fn platform_start(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let app = app.clone();
        tokio::runtime::Handle::current().block_on(macos::start_recognition(&app))
    }
    #[cfg(target_os = "windows")]
    {
        let app = app.clone();
        tokio::runtime::Handle::current().block_on(windows::start_recognition(&app))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("STT not supported on this platform".to_string())
}

/// Direct platform STT stop (no state management). Used by NativeOsProvider.
pub fn platform_stop() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        tokio::runtime::Handle::current().block_on(macos::stop_recognition())
    }
    #[cfg(target_os = "windows")]
    {
        tokio::runtime::Handle::current().block_on(windows::stop_recognition())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("STT not supported on this platform".to_string())
}

/// Direct platform cleanup. Used by NativeOsProvider.
pub fn platform_cleanup() {
    #[cfg(target_os = "macos")]
    macos::cleanup();
}
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/providers/stt_native.rs
git add apps/desktop/src-tauri/src/stt/mod.rs
git commit -m "feat: wrap native OS STT behind SttProvider trait"
```

---

### Task 5: BridgeAiProvider — Wrap Bridge Behind AiProvider Trait

**Files:**
- Modify: `apps/desktop/src-tauri/src/providers/ai_bridge.rs`

- [ ] **Step 1: Implement BridgeAiProvider**

Replace `apps/desktop/src-tauri/src/providers/ai_bridge.rs` with:

```rust
use crate::bridge;
use crate::providers::{
    AiProvider, CommandResult, ConversationResponse, Intent, RefinementResult,
    StyleOverrides, SummaryResult,
};

/// Routes AI calls through the VS Code extension bridge (Copilot).
pub struct BridgeAiProvider {
    model: String,
}

impl BridgeAiProvider {
    pub fn new(model: &str) -> Self {
        Self {
            model: model.to_string(),
        }
    }
}

impl AiProvider for BridgeAiProvider {
    fn refine(
        &self,
        raw_text: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<RefinementResult, String> {
        let result = tokio::runtime::Handle::current().block_on(bridge::refine_text(
            raw_text,
            style,
            style_overrides,
            code_mode,
            &self.model,
        ))?;
        Ok(RefinementResult {
            refined_text: result.refined_text,
            category: Some(result.category),
            title: Some(result.title),
        })
    }

    fn classify_intent(&self, _raw_text: &str) -> Result<Intent, String> {
        // Bridge handles classification internally via handleCommand.
        // Return dictation as default; actual classification happens in send_command.
        Ok(Intent {
            intent: "dictation".to_string(),
            params: None,
            input_source: None,
            description: None,
            actions: None,
        })
    }

    fn send_command(
        &self,
        raw_text: &str,
        clipboard: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<CommandResult, String> {
        let result = tokio::runtime::Handle::current().block_on(bridge::send_command(
            raw_text,
            clipboard,
            style,
            style_overrides,
            code_mode,
            &self.model,
        ))?;
        Ok(CommandResult {
            result: result.result,
            action: result.action,
            params: result.params,
        })
    }

    fn converse(
        &self,
        history: &[bridge::ConversationTurnMsg],
        user_message: &str,
        on_chunk: Option<Box<dyn Fn(&str) + Send>>,
    ) -> Result<ConversationResponse, String> {
        let result = tokio::runtime::Handle::current().block_on(bridge::send_conversation_turn(
            history,
            user_message,
            on_chunk,
            &self.model,
        ))?;
        Ok(ConversationResponse {
            content: result.content,
        })
    }

    fn summarize(
        &self,
        history: &[bridge::ConversationTurnMsg],
    ) -> Result<SummaryResult, String> {
        let result = tokio::runtime::Handle::current().block_on(
            bridge::summarize_conversation(history, &self.model),
        )?;
        Ok(SummaryResult {
            summary: result.summary,
            title: result.title,
            key_points: result.key_points.unwrap_or_default(),
        })
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/providers/ai_bridge.rs
git commit -m "feat: wrap VS Code bridge behind AiProvider trait"
```

---

### Task 6: DirectAiProvider — Wrap Existing API Provider

**Files:**
- Modify: `apps/desktop/src-tauri/src/providers/ai_direct.rs`

- [ ] **Step 1: Implement DirectAiProvider**

Replace `apps/desktop/src-tauri/src/providers/ai_direct.rs` with:

```rust
use crate::ai_provider;
use crate::bridge;
use crate::providers::{
    AiProvider, CommandResult, ConversationResponse, Intent, IntentAction,
    RefinementResult, StyleOverrides, SummaryResult,
};

/// Direct HTTPS calls to Groq or Anthropic APIs.
pub struct DirectAiProvider {
    provider: String,
    api_key: String,
    model: String,
}

impl DirectAiProvider {
    pub fn new(provider: &str, api_key: &str, model: &str) -> Self {
        Self {
            provider: provider.to_string(),
            api_key: api_key.to_string(),
            model: model.to_string(),
        }
    }
}

impl AiProvider for DirectAiProvider {
    fn refine(
        &self,
        raw_text: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<RefinementResult, String> {
        let result = tokio::runtime::Handle::current().block_on(ai_provider::refine_text(
            raw_text,
            style,
            style_overrides,
            code_mode,
            &self.provider,
            &self.api_key,
            &self.model,
        ))?;
        Ok(RefinementResult {
            refined_text: result.refined_text,
            category: Some(result.category),
            title: Some(result.title),
        })
    }

    fn classify_intent(&self, raw_text: &str) -> Result<Intent, String> {
        // Direct provider handles classification internally via send_command.
        Ok(Intent {
            intent: "dictation".to_string(),
            params: None,
            input_source: None,
            description: None,
            actions: None,
        })
    }

    fn send_command(
        &self,
        raw_text: &str,
        clipboard: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<CommandResult, String> {
        let result = tokio::runtime::Handle::current().block_on(ai_provider::send_command(
            raw_text,
            clipboard,
            style,
            style_overrides,
            code_mode,
            &self.provider,
            &self.api_key,
            &self.model,
        ))?;
        Ok(CommandResult {
            result: result.result,
            action: result.action,
            params: result.params,
        })
    }

    fn converse(
        &self,
        history: &[bridge::ConversationTurnMsg],
        user_message: &str,
        on_chunk: Option<Box<dyn Fn(&str) + Send>>,
    ) -> Result<ConversationResponse, String> {
        let result =
            tokio::runtime::Handle::current().block_on(ai_provider::send_conversation_turn(
                history,
                user_message,
                &self.provider,
                &self.api_key,
                &self.model,
                on_chunk,
            ))?;
        Ok(ConversationResponse {
            content: result.content,
        })
    }

    fn summarize(
        &self,
        history: &[bridge::ConversationTurnMsg],
    ) -> Result<SummaryResult, String> {
        let result =
            tokio::runtime::Handle::current().block_on(ai_provider::summarize_conversation(
                history,
                &self.provider,
                &self.api_key,
                &self.model,
            ))?;
        Ok(SummaryResult {
            summary: result.summary,
            title: result.title,
            key_points: result.key_points.unwrap_or_default(),
        })
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/providers/ai_direct.rs
git commit -m "feat: wrap direct Groq/Anthropic API behind AiProvider trait"
```

---

### Task 7: Model Manager

**Files:**
- Create: `apps/desktop/src-tauri/src/model_manager.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Create model_manager.rs**

Create `apps/desktop/src-tauri/src/model_manager.rs`:

```rust
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_PROGRESS: Mutex<Option<DownloadProgress>> = Mutex::new(None);

#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub model: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelStatus {
    pub available_models: Vec<ModelInfo>,
    pub current_model: Option<String>,
    pub is_downloading: bool,
    pub download_progress: Option<DownloadProgress>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub description: String,
    pub downloaded: bool,
}

const MODELS: &[(&str, u64, &str, &str)] = &[
    ("tiny", 75_000_000, "75 MB", "Fastest, decent accuracy"),
    ("base", 150_000_000, "150 MB", "Good balance of speed and accuracy"),
    ("small", 500_000_000, "500 MB", "Great accuracy, moderate speed"),
    ("medium", 1_500_000_000, "1.5 GB", "Excellent accuracy, slower"),
    ("large-v3", 3_000_000_000, "3 GB", "Best accuracy, slowest"),
];

/// Get the models directory path.
pub fn models_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot find home directory");
    home.join(".yapper").join("models")
}

/// Get the path for a specific model file.
pub fn model_path(model_name: &str) -> PathBuf {
    models_dir().join(format!("ggml-{}.bin", model_name))
}

/// Check if a model is downloaded.
pub fn is_model_downloaded(model_name: &str) -> bool {
    model_path(model_name).exists()
}

/// Get the currently configured model if it's downloaded.
pub fn get_available_model(configured: &str) -> Option<PathBuf> {
    let path = model_path(configured);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

/// Get status of all models.
pub fn get_status(current_model: &str) -> ModelStatus {
    let available_models = MODELS
        .iter()
        .map(|(name, size, display, desc)| ModelInfo {
            name: name.to_string(),
            size_bytes: *size,
            size_display: display.to_string(),
            description: desc.to_string(),
            downloaded: is_model_downloaded(name),
        })
        .collect();

    let current = if is_model_downloaded(current_model) {
        Some(current_model.to_string())
    } else {
        None
    };

    ModelStatus {
        available_models,
        current_model: current,
        is_downloading: DOWNLOADING.load(Ordering::Relaxed),
        download_progress: DOWNLOAD_PROGRESS.lock().unwrap().clone(),
    }
}

/// Download a whisper model from Hugging Face. Emits progress events.
pub fn download_model(
    model_name: &str,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    if DOWNLOADING.load(Ordering::Relaxed) {
        return Err("A download is already in progress".to_string());
    }

    let valid = MODELS.iter().any(|(n, _, _, _)| *n == model_name);
    if !valid {
        return Err(format!("Unknown model: {}", model_name));
    }

    DOWNLOADING.store(true, Ordering::Relaxed);

    let dir = models_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create models dir: {}", e))?;

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin",
        model_name
    );

    let dest = model_path(model_name);
    let tmp_dest = dest.with_extension("bin.tmp");

    let result = (|| -> Result<(), String> {
        let resp = ureq::get(&url)
            .call()
            .map_err(|e| format!("Download failed: {}", e))?;

        let total_bytes = resp
            .header("content-length")
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);

        let mut reader = resp.into_reader();
        let mut file = fs::File::create(&tmp_dest)
            .map_err(|e| format!("Failed to create temp file: {}", e))?;

        let mut downloaded: u64 = 0;
        let mut buf = [0u8; 65536];
        let mut last_emit: u64 = 0;

        loop {
            let n = reader
                .read(&mut buf)
                .map_err(|e| format!("Read error: {}", e))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n])
                .map_err(|e| format!("Write error: {}", e))?;
            downloaded += n as u64;

            // Emit progress every 1MB
            if downloaded - last_emit > 1_000_000 || downloaded == total_bytes {
                last_emit = downloaded;
                let percent = if total_bytes > 0 {
                    (downloaded as f64 / total_bytes as f64) * 100.0
                } else {
                    0.0
                };
                let progress = DownloadProgress {
                    model: model_name.to_string(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    percent,
                };
                *DOWNLOAD_PROGRESS.lock().unwrap() = Some(progress.clone());
                let _ = app.emit("model-download-progress", &progress);
            }
        }

        file.flush().map_err(|e| format!("Flush error: {}", e))?;
        drop(file);

        // Rename tmp to final
        fs::rename(&tmp_dest, &dest)
            .map_err(|e| format!("Failed to finalize download: {}", e))?;

        Ok(())
    })();

    DOWNLOADING.store(false, Ordering::Relaxed);
    *DOWNLOAD_PROGRESS.lock().unwrap() = None;

    if let Err(ref e) = result {
        // Clean up tmp file on failure
        let _ = fs::remove_file(&tmp_dest);
        let _ = app.emit("model-download-error", e.to_string());
    } else {
        let _ = app.emit("model-download-complete", model_name);
    }

    result
}

/// Delete a downloaded model.
pub fn delete_model(model_name: &str) -> Result<(), String> {
    let path = model_path(model_name);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete model: {}", e))?;
    }
    Ok(())
}
```

- [ ] **Step 2: Add dirs dependency to Cargo.toml**

In `apps/desktop/src-tauri/Cargo.toml` dependencies section, add:

```toml
dirs = "6"
```

- [ ] **Step 3: Register module and commands**

In `apps/desktop/src-tauri/src/lib.rs`, add after the providers module declaration:

```rust
pub mod model_manager;
```

In `apps/desktop/src-tauri/src/commands.rs`, add these new command functions at the end of the file (before the closing):

```rust
#[tauri::command]
pub async fn get_model_status(app: tauri::AppHandle) -> Result<model_manager::ModelStatus, String> {
    let settings = get_settings_internal(&app)?;
    Ok(model_manager::get_status(&settings.whisper_model))
}

#[tauri::command]
pub async fn download_whisper_model(app: tauri::AppHandle, model: String) -> Result<(), String> {
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        model_manager::download_model(&model, &app_clone)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn delete_whisper_model(model: String) -> Result<(), String> {
    model_manager::delete_model(&model)
}
```

Add the `use crate::model_manager;` import at the top of commands.rs.

Register these commands in `lib.rs` in the `invoke_handler` call — add `get_model_status`, `download_whisper_model`, `delete_whisper_model` to the existing list.

- [ ] **Step 4: Add new AppSettings fields to commands.rs**

In `apps/desktop/src-tauri/src/commands.rs`, add these fields to the `AppSettings` struct (after `theme: String` at line 40):

```rust
    #[serde(default = "default_stt_provider")]
    pub stt_provider: String,
    #[serde(default)]
    pub whisper_model: String,
    #[serde(default = "default_whisper_language")]
    pub whisper_language: String,
    #[serde(default = "default_streaming_enabled")]
    pub streaming_enabled: bool,
    #[serde(default = "default_screen_capture_hotkey")]
    pub screen_capture_hotkey: String,
    #[serde(default = "default_save_screenshots")]
    pub save_screenshots: bool,
```

Add the corresponding default functions (near the other `default_*` functions around line 86):

```rust
fn default_stt_provider() -> String { "whisper".to_string() }
fn default_whisper_language() -> String { "auto".to_string() }
fn default_streaming_enabled() -> bool { true }
fn default_screen_capture_hotkey() -> String {
    if cfg!(target_os = "macos") { "Cmd+Shift+S".to_string() }
    else { "Ctrl+Shift+S".to_string() }
}
fn default_save_screenshots() -> bool { true }
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/model_manager.rs
git add apps/desktop/src-tauri/src/commands.rs
git add apps/desktop/src-tauri/src/lib.rs
git add apps/desktop/src-tauri/Cargo.toml
git commit -m "feat: model manager for whisper model download/status"
```

---

### Task 8: WhisperCppProvider — Audio Capture + Streaming STT

**Files:**
- Modify: `apps/desktop/src-tauri/src/providers/stt_whisper.rs`

This is the core STT implementation using cpal for audio capture and whisper-rs for transcription with streaming.

- [ ] **Step 1: Implement WhisperCppProvider**

Replace `apps/desktop/src-tauri/src/providers/stt_whisper.rs` with:

```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::model_manager;
use crate::providers::{PartialTranscript, SttProvider};

/// Audio sample rate required by Whisper.
const WHISPER_SAMPLE_RATE: u32 = 16000;

/// How often (in seconds) to run streaming inference on accumulated audio.
const STREAM_INTERVAL_SECS: f32 = 2.0;

pub struct WhisperCppProvider {
    model_path: String,
    language: String,
    streaming: bool,
    /// Shared audio buffer written by cpal callback, read by whisper thread.
    audio_buffer: Arc<Mutex<Vec<f32>>>,
    /// Signals recording threads to stop.
    stop_signal: Arc<AtomicBool>,
    /// Sender for partial transcripts (streaming mode).
    partial_tx: Mutex<Option<Sender<PartialTranscript>>>,
    /// Receiver for partial transcripts — handed to the orchestrator.
    partial_rx: Mutex<Option<Receiver<PartialTranscript>>>,
    /// cpal stream handle (kept alive during recording).
    stream_handle: Mutex<Option<cpal::Stream>>,
    /// Final transcript after stop().
    final_transcript: Arc<Mutex<Option<String>>>,
    /// Streaming thread join handle.
    stream_thread: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl WhisperCppProvider {
    pub fn new(model_name: &str, language: &str, streaming: bool) -> Result<Self, String> {
        let path = model_manager::model_path(model_name);
        if !path.exists() {
            return Err(format!(
                "Whisper model '{}' not found. Download it in Settings.",
                model_name
            ));
        }

        let (tx, rx) = mpsc::channel();

        Ok(Self {
            model_path: path.to_string_lossy().to_string(),
            language: language.to_string(),
            streaming,
            audio_buffer: Arc::new(Mutex::new(Vec::new())),
            stop_signal: Arc::new(AtomicBool::new(false)),
            partial_tx: Mutex::new(Some(tx)),
            partial_rx: Mutex::new(Some(rx)),
            stream_handle: Mutex::new(None),
            final_transcript: Arc::new(Mutex::new(None)),
            stream_thread: Mutex::new(None),
        })
    }

    /// Run whisper inference on audio samples and return transcript.
    fn transcribe(model_path: &str, samples: &[f32], language: &str) -> Result<String, String> {
        let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
            .map_err(|e| format!("Failed to load whisper model: {}", e))?;

        let mut state = ctx
            .create_state()
            .map_err(|e| format!("Failed to create whisper state: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_print_special_tokens(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_suppress_non_speech_tokens(true);

        if language != "auto" {
            params.set_language(Some(language));
        }

        state
            .full(params, samples)
            .map_err(|e| format!("Whisper inference failed: {}", e))?;

        let num_segments = state.full_n_segments()
            .map_err(|e| format!("Failed to get segments: {}", e))?;

        let mut transcript = String::new();
        for i in 0..num_segments {
            if let Ok(text) = state.full_get_segment_text(i) {
                transcript.push_str(text.trim());
                transcript.push(' ');
            }
        }

        Ok(transcript.trim().to_string())
    }
}

impl SttProvider for WhisperCppProvider {
    fn start(&self, app: &tauri::AppHandle) -> Result<(), String> {
        self.stop_signal.store(false, Ordering::Relaxed);
        self.audio_buffer.lock().unwrap().clear();
        *self.final_transcript.lock().unwrap() = None;

        // Start cpal audio capture
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No audio input device found")?;

        let config = cpal::StreamConfig {
            channels: 1,
            sample_rate: cpal::SampleRate(WHISPER_SAMPLE_RATE),
            buffer_size: cpal::BufferSize::Default,
        };

        let buffer = self.audio_buffer.clone();
        let err_fn = |err: cpal::StreamError| {
            log::error!("Audio capture error: {}", err);
        };

        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    buffer.lock().unwrap().extend_from_slice(data);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build audio stream: {}", e))?;

        stream
            .play()
            .map_err(|e| format!("Failed to start audio stream: {}", e))?;

        *self.stream_handle.lock().unwrap() = Some(stream);

        // Start streaming inference thread if streaming is enabled
        if self.streaming {
            let stop = self.stop_signal.clone();
            let audio_buf = self.audio_buffer.clone();
            let model_path = self.model_path.clone();
            let language = self.language.clone();
            let tx = self.partial_tx.lock().unwrap().clone();
            let app_handle = app.clone();

            let handle = std::thread::spawn(move || {
                let interval = std::time::Duration::from_secs_f32(STREAM_INTERVAL_SECS);
                let mut last_len: usize = 0;

                while !stop.load(Ordering::Relaxed) {
                    std::thread::sleep(interval);
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }

                    let samples: Vec<f32> = audio_buf.lock().unwrap().clone();
                    if samples.len() <= last_len + (WHISPER_SAMPLE_RATE as usize / 2) {
                        continue; // Not enough new audio
                    }
                    last_len = samples.len();

                    match Self::transcribe(&model_path, &samples, &language) {
                        Ok(text) if !text.is_empty() => {
                            let partial = PartialTranscript {
                                text: text.clone(),
                                is_final: false,
                            };
                            if let Some(ref tx) = tx {
                                let _ = tx.send(partial.clone());
                            }
                            let _ = app_handle.emit("stt-partial", &partial);
                        }
                        Err(e) => {
                            log::warn!("Streaming transcription error: {}", e);
                        }
                        _ => {}
                    }
                }
            });

            *self.stream_thread.lock().unwrap() = Some(handle);
        }

        Ok(())
    }

    fn stop(&self) -> Result<String, String> {
        // Signal threads to stop
        self.stop_signal.store(true, Ordering::Relaxed);

        // Stop audio capture
        if let Some(stream) = self.stream_handle.lock().unwrap().take() {
            drop(stream);
        }

        // Wait for streaming thread
        if let Some(handle) = self.stream_thread.lock().unwrap().take() {
            let _ = handle.join();
        }

        // Final transcription pass on complete audio
        let samples: Vec<f32> = self.audio_buffer.lock().unwrap().clone();

        if samples.len() < (WHISPER_SAMPLE_RATE as usize / 2) {
            return Err("No speech detected — recording too short".to_string());
        }

        let transcript = Self::transcribe(&self.model_path, &samples, &self.language)?;

        if transcript.is_empty() {
            return Err("No speech detected".to_string());
        }

        // Send final partial
        if let Some(ref tx) = *self.partial_tx.lock().unwrap() {
            let _ = tx.send(PartialTranscript {
                text: transcript.clone(),
                is_final: true,
            });
        }

        *self.final_transcript.lock().unwrap() = Some(transcript.clone());
        Ok(transcript)
    }

    fn stream_receiver(&self) -> Option<Receiver<PartialTranscript>> {
        self.partial_rx.lock().unwrap().take()
    }

    fn supports_streaming(&self) -> bool {
        self.streaming
    }

    fn cleanup(&self) {
        self.stop_signal.store(true, Ordering::Relaxed);
        if let Some(stream) = self.stream_handle.lock().unwrap().take() {
            drop(stream);
        }
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles (whisper-rs may take a while to build C++ code the first time)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/providers/stt_whisper.rs
git commit -m "feat: WhisperCppProvider with cpal audio capture and streaming"
```

---

### Task 9: Integrate Provider Traits into Commands Pipeline

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/stt/mod.rs`

This is the critical wiring task — connecting the new provider system to the existing recording pipeline.

- [ ] **Step 1: Add provider factory functions to commands.rs**

At the top of `commands.rs`, add these imports and the provider factory:

```rust
use crate::providers::{self, SttProvider, AiProvider, VisionProvider};
use crate::providers::stt_whisper::WhisperCppProvider;
use crate::providers::stt_native::NativeOsProvider;
use crate::providers::ai_bridge::BridgeAiProvider;
use crate::providers::ai_direct::DirectAiProvider;
```

Add a function to create the current STT provider based on settings:

```rust
fn create_stt_provider(settings: &AppSettings) -> Result<Box<dyn SttProvider>, String> {
    if settings.stt_provider == "whisper" && !settings.whisper_model.is_empty() {
        match WhisperCppProvider::new(
            &settings.whisper_model,
            &settings.whisper_language,
            settings.streaming_enabled,
        ) {
            Ok(provider) => return Ok(Box::new(provider)),
            Err(e) => {
                log::warn!("Whisper not available, falling back to native: {}", e);
            }
        }
    }
    Ok(Box::new(NativeOsProvider::new()))
}

fn create_ai_provider(settings: &AppSettings) -> Box<dyn AiProvider> {
    if settings.ai_provider_mode == "vscode" {
        Box::new(BridgeAiProvider::new(&settings.vscode_model))
    } else {
        let api_key = decrypt_key(&settings.ai_api_key);
        Box::new(DirectAiProvider::new(
            &settings.ai_provider,
            &api_key,
            &settings.ai_model,
        ))
    }
}
```

- [ ] **Step 2: Add static provider storage**

Add a static to hold the active STT provider (needed because start/stop are separate commands):

```rust
use once_cell::sync::Lazy;

static ACTIVE_STT: Lazy<Mutex<Option<Box<dyn SttProvider>>>> = Lazy::new(|| Mutex::new(None));
```

- [ ] **Step 3: Update start_recording to use provider**

Modify `start_recording()` (around line 432) to create and store the provider:

```rust
#[tauri::command]
pub async fn start_recording(app: tauri::AppHandle) -> Result<(), String> {
    let settings = get_settings_internal(&app)?;
    let provider = create_stt_provider(&settings)?;

    if !stt::transition(stt::State::Idle, stt::State::Recording) {
        return Err("Already recording".to_string());
    }

    *RECORDING_START.lock().unwrap() = Some(std::time::Instant::now());
    let _ = app.emit("stt-state-changed", "listening");

    provider.start(&app)?;
    *ACTIVE_STT.lock().unwrap() = Some(provider);

    Ok(())
}
```

- [ ] **Step 4: Update stop_recording to use provider**

Modify `stop_recording()` (around line 447) to stop via the active provider:

```rust
#[tauri::command]
pub async fn stop_recording(app: tauri::AppHandle) -> Result<(), String> {
    if !stt::transition(stt::State::Recording, stt::State::Processing) {
        return Err("Not recording".to_string());
    }

    let duration_secs = RECORDING_START
        .lock()
        .unwrap()
        .take()
        .map(|start| start.elapsed().as_secs_f64())
        .unwrap_or(0.0);

    let _ = app.emit("stt-state-changed", "processing");
    let _ = app.emit("stop-speech-recognition", ());

    let transcript = {
        let mut provider_lock = ACTIVE_STT.lock().unwrap();
        if let Some(provider) = provider_lock.take() {
            provider.stop()
        } else {
            // Fallback to old path if no provider stored
            stt::stop().await
        }
    };

    match transcript {
        Ok(text) => {
            let app_clone = app.clone();
            tokio::spawn(async move {
                if let Err(e) = process_recording_result(&app_clone, &text, duration_secs).await {
                    log::error!("Processing error: {}", e);
                    let _ = app_clone.emit("stt-error", e.to_string());
                }
                stt::set_state(stt::State::Idle);
                let _ = app_clone.emit("stt-state-changed", "idle");
            });
        }
        Err(e) => {
            stt::set_state(stt::State::Idle);
            let _ = app.emit("stt-state-changed", "idle");
            let _ = app.emit("stt-error", e.to_string());
        }
    }
    Ok(())
}
```

- [ ] **Step 5: Update stop_recording_raw similarly**

Modify `stop_recording_raw()` (around line 475):

```rust
#[tauri::command]
pub async fn stop_recording_raw(app: tauri::AppHandle) -> Result<String, String> {
    if !stt::transition(stt::State::Recording, stt::State::Processing) {
        return Err("Not recording".to_string());
    }

    let _ = app.emit("stt-state-changed", "processing");

    let transcript = {
        let mut provider_lock = ACTIVE_STT.lock().unwrap();
        if let Some(provider) = provider_lock.take() {
            provider.stop()
        } else {
            stt::stop().await
        }
    };

    stt::set_state(stt::State::Idle);
    let _ = app.emit("stt-state-changed", "idle");

    transcript
}
```

- [ ] **Step 6: Update cancel_recording**

Modify `cancel_recording()` (around line 495):

```rust
#[tauri::command]
pub async fn cancel_recording(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(provider) = ACTIVE_STT.lock().unwrap().take() {
        provider.cleanup();
    }
    stt::set_state(stt::State::Idle);
    let _ = app.emit("stt-state-changed", "idle");
    Ok(())
}
```

- [ ] **Step 7: Update toggle_recording**

Modify the `toggle_recording()` function (around line 386) to use the same provider pattern as `start_recording` / `stop_recording`.

- [ ] **Step 8: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 9: Manual test — native fallback**

Run: `bun tauri dev`
- Widget should appear, hotkey should work
- Recording should work as before (native STT fallback since no Whisper model downloaded yet)
- Stop and verify text pastes

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs
git add apps/desktop/src-tauri/src/stt/mod.rs
git commit -m "feat: integrate provider traits into recording pipeline"
```

---

### Task 10: Widget Live Transcript Display

**Files:**
- Modify: `apps/desktop/src/widget.tsx`

- [ ] **Step 1: Add partial transcript state and event listener**

In `widget.tsx`, inside the `WidgetApp` component (after the existing state declarations around line 26), add:

```typescript
const [partialText, setPartialText] = useState<string>("");
```

Add a new event listener in the existing useEffect (after the existing event listeners, around line 96):

```typescript
const unlistenPartial = listen<{ text: string; is_final: boolean }>(
  "stt-partial",
  (event) => {
    setPartialText(event.payload.text);
  }
);
```

Add cleanup in the return function:

```typescript
unlistenPartial.then((fn) => fn());
```

Clear partial text when state changes away from listening (in the `stt-state-changed` listener):

```typescript
if (event.payload !== "listening") {
  setPartialText("");
}
```

- [ ] **Step 2: Update widget recording dimensions**

Update the recording height constant (around line 14) to accommodate the transcript line:

```typescript
const RECORDING_H = 62; // was 42, now taller for transcript
```

- [ ] **Step 3: Add live transcript text below wave animation**

In the recording state JSX (inside the `isListening && ...` block, after the wave/sparkle animation and before the buttons), add a transcript row:

```typescript
{partialText && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 0.7 }}
    style={{
      position: "absolute",
      bottom: 4,
      left: 12,
      right: 48,
      fontSize: 10,
      color: "var(--yapper-text-secondary, #aaa)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      direction: "rtl",
      textAlign: "left",
      pointerEvents: "none",
      fontStyle: "italic",
    }}
  >
    <span style={{ unicodeBidi: "plaintext" }}>
      {partialText.length > 50 ? "..." + partialText.slice(-50) : partialText}
    </span>
  </motion.div>
)}
```

The `direction: "rtl"` trick makes the text truncate from the left, showing the most recent words.

- [ ] **Step 4: Verify in dev mode**

Run: `bun dev`
- Start recording with widget
- If Whisper model is configured, live text should appear below the wave animation
- With native STT (no whisper), no partial text appears (expected — native doesn't stream)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/widget.tsx
git commit -m "feat: live transcript display in widget during recording"
```

---

### Task 11: Settings UI — Speech Recognition Section

**Files:**
- Modify: `apps/desktop/src/app/components/SettingsView.tsx`

- [ ] **Step 1: Add state for model management**

Inside the `SettingsView` component, add new state variables (after the existing state declarations around line 562):

```typescript
const [modelStatus, setModelStatus] = useState<{
  available_models: { name: string; size_display: string; description: string; downloaded: boolean }[];
  current_model: string | null;
  is_downloading: boolean;
  download_progress: { model: string; percent: number; downloaded_bytes: number; total_bytes: number } | null;
} | null>(null);
```

- [ ] **Step 2: Add model status fetching**

Add a `useEffect` to load model status and listen for download events:

```typescript
useEffect(() => {
  invoke("get_model_status").then((status: any) => setModelStatus(status));

  const unlisten1 = listen<any>("model-download-progress", (event) => {
    setModelStatus((prev) =>
      prev ? { ...prev, is_downloading: true, download_progress: event.payload } : prev
    );
  });
  const unlisten2 = listen("model-download-complete", () => {
    invoke("get_model_status").then((status: any) => setModelStatus(status));
  });
  const unlisten3 = listen("model-download-error", () => {
    invoke("get_model_status").then((status: any) => setModelStatus(status));
  });

  return () => {
    unlisten1.then((fn) => fn());
    unlisten2.then((fn) => fn());
    unlisten3.then((fn) => fn());
  };
}, []);
```

- [ ] **Step 3: Add Speech Recognition section**

In the Settings JSX, add a new section after the "General" section (after the recording mode segmented control, around line 810). Place it before the "AI Provider" section:

```tsx
{/* Speech Recognition */}
<SectionCard>
  <SectionHeader>Speech Recognition</SectionHeader>

  <SettingRow label="Whisper Model" hint="Larger models are more accurate but slower. Download required.">
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      {modelStatus?.available_models.map((m) => (
        <div
          key={m.name}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${settings.whisper_model === m.name ? "#DA7756" : "var(--yapper-border)"}`,
            background: settings.whisper_model === m.name ? "rgba(218,119,86,0.1)" : "transparent",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              {m.size_display} — {m.description}
            </div>
          </div>
          {m.downloaded ? (
            <PillButton
              label={settings.whisper_model === m.name ? "Active" : "Select"}
              selected={settings.whisper_model === m.name}
              onClick={() => update({ whisper_model: m.name, stt_provider: "whisper" })}
            />
          ) : modelStatus?.is_downloading &&
            modelStatus?.download_progress?.model === m.name ? (
            <div style={{ fontSize: 11, color: "#DA7756" }}>
              {Math.round(modelStatus.download_progress!.percent)}%
            </div>
          ) : (
            <PillButton
              label="Download"
              selected={false}
              onClick={() => invoke("download_whisper_model", { model: m.name })}
            />
          )}
        </div>
      ))}
    </div>
  </SettingRow>

  <SettingRow label="Language" hint="Auto-detect works well for most languages.">
    <StyleDropdown
      value={settings.whisper_language}
      onChange={(v) => update({ whisper_language: v })}
    />
  </SettingRow>

  <SettingRow label="Live Transcription">
    <Toggle
      checked={settings.streaming_enabled}
      onChange={(v) => update({ streaming_enabled: v })}
      label="Show text while speaking"
    />
  </SettingRow>
</SectionCard>
```

Note: The `StyleDropdown` for language needs to be replaced with a proper language dropdown. For now, use a simple select or reuse the pattern. The key languages to show: `auto`, `en`, `es`, `fr`, `de`, `zh`, `ja`, `ko`, `pt`, `ru`, `ar`, `hi`.

- [ ] **Step 4: Download progress bar**

If `modelStatus?.is_downloading`, show a progress bar at the top of the Speech Recognition section:

```tsx
{modelStatus?.is_downloading && modelStatus?.download_progress && (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.7 }}>
      Downloading {modelStatus.download_progress.model}... {Math.round(modelStatus.download_progress.percent)}%
    </div>
    <div style={{
      height: 4,
      borderRadius: 2,
      background: "var(--yapper-border)",
      overflow: "hidden",
    }}>
      <div style={{
        height: "100%",
        width: `${modelStatus.download_progress.percent}%`,
        background: "#DA7756",
        borderRadius: 2,
        transition: "width 0.3s ease",
      }} />
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify in dev mode**

Run: `bun dev`
- Open Settings (gear icon)
- Speech Recognition section should appear
- Model list should show with Download buttons
- Clicking Download should start download with progress

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/components/SettingsView.tsx
git commit -m "feat: speech recognition settings with model download UI"
```

---

### Task 12: Native OCR Provider

**Files:**
- Modify: `apps/desktop/src-tauri/src/providers/vision_native.rs`

- [ ] **Step 1: Implement NativeOcrProvider**

Replace `apps/desktop/src-tauri/src/providers/vision_native.rs` with:

```rust
use crate::providers::VisionProvider;

pub struct NativeOcrProvider;

impl NativeOcrProvider {
    pub fn new() -> Self {
        Self
    }
}

impl VisionProvider for NativeOcrProvider {
    fn analyze(&self, image_bytes: &[u8], _prompt: &str) -> Result<String, String> {
        // Native OCR only extracts text, no AI analysis
        self.ocr(image_bytes)
    }

    fn ocr(&self, image_bytes: &[u8]) -> Result<String, String> {
        platform_ocr(image_bytes)
    }

    fn supports_ai_analysis(&self) -> bool {
        false
    }
}

#[cfg(target_os = "macos")]
fn platform_ocr(image_bytes: &[u8]) -> Result<String, String> {
    // Use a Swift subprocess for VNRecognizeTextRequest
    // Similar pattern to existing STT Swift subprocess
    use std::io::Write;
    use std::process::Command;

    let swift_code = r#"
import Foundation
import Vision

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let cgImage = CGImage(
    pngDataProviderSource: CGDataProvider(data: data as CFData)!,
    decode: nil, shouldInterpolate: false, intent: .defaultIntent
) else {
    fputs("Failed to create image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

var results: [String] = []
if let observations = request.results {
    for observation in observations {
        if let candidate = observation.topCandidates(1).first {
            results.append(candidate.string)
        }
    }
}

print(results.joined(separator: "\n"))
"#;

    let tmp = tempfile::Builder::new()
        .suffix(".swift")
        .tempfile()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    std::fs::write(tmp.path(), swift_code)
        .map_err(|e| format!("Failed to write Swift script: {}", e))?;

    let mut child = Command::new("swift")
        .arg(tmp.path())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Swift: {}", e))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(image_bytes)
            .map_err(|e| format!("Failed to write image to stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Swift process failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn platform_ocr(image_bytes: &[u8]) -> Result<String, String> {
    // Windows OCR via PowerShell with Windows.Media.Ocr
    use std::io::Write;
    use std::process::Command;

    let tmp_img = tempfile::Builder::new()
        .suffix(".png")
        .tempfile()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    std::fs::write(tmp_img.path(), image_bytes)
        .map_err(|e| format!("Failed to write temp image: {}", e))?;

    let ps_script = format!(
        r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$imagePath = '{}'
$bitmap = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync(
    [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
).GetAwaiter().GetResult()
# Simplified: use tesseract or built-in OCR
# For now, return placeholder
Write-Host "OCR not yet implemented on Windows"
"#,
        tmp_img.path().display()
    );

    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", &ps_script])
        .output()
        .map_err(|e| format!("PowerShell failed: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_ocr(_image_bytes: &[u8]) -> Result<String, String> {
    Err("OCR not supported on this platform".to_string())
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/providers/vision_native.rs
git commit -m "feat: native OCR provider (macOS Vision framework, Windows placeholder)"
```

---

### Task 13: Anthropic Vision Provider

**Files:**
- Modify: `apps/desktop/src-tauri/src/providers/vision_anthropic.rs`

- [ ] **Step 1: Implement AnthropicVisionProvider**

Replace `apps/desktop/src-tauri/src/providers/vision_anthropic.rs` with:

```rust
use crate::providers::VisionProvider;
use base64::Engine;

pub struct AnthropicVisionProvider {
    api_key: String,
    model: String,
}

impl AnthropicVisionProvider {
    pub fn new(api_key: &str, model: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: if model.is_empty() {
                "claude-haiku-4-5-20251001".to_string()
            } else {
                model.to_string()
            },
        }
    }
}

impl VisionProvider for AnthropicVisionProvider {
    fn analyze(&self, image_bytes: &[u8], prompt: &str) -> Result<String, String> {
        let b64 = base64::engine::general_purpose::STANDARD.encode(image_bytes);

        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 2048,
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": b64,
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    }
                ]
            }]
        });

        let resp = ureq::post("https://api.anthropic.com/v1/messages")
            .set("x-api-key", &self.api_key)
            .set("anthropic-version", "2023-06-01")
            .set("content-type", "application/json")
            .send_bytes(serde_json::to_vec(&body).unwrap().as_slice())
            .map_err(|e| format!("Anthropic vision API error: {}", e))?;

        let json: serde_json::Value = resp
            .into_json()
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let text = json["content"][0]["text"]
            .as_str()
            .unwrap_or("No analysis returned")
            .to_string();

        Ok(text)
    }

    fn ocr(&self, image_bytes: &[u8]) -> Result<String, String> {
        self.analyze(
            image_bytes,
            "Extract all visible text from this image. Return only the extracted text, preserving the original layout as much as possible.",
        )
    }

    fn supports_ai_analysis(&self) -> bool {
        true
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/providers/vision_anthropic.rs
git commit -m "feat: Anthropic vision provider (Claude API with image content)"
```

---

### Task 14: Copilot Vision Provider + Bridge Extension Update

**Files:**
- Modify: `apps/desktop/src-tauri/src/providers/vision_bridge.rs`
- Modify: `apps/desktop/src-tauri/src/bridge.rs`
- Modify: `extensions/vscode-bridge/src/protocol.ts`
- Modify: `extensions/vscode-bridge/src/extension.ts`
- Modify: `extensions/vscode-bridge/src/copilot-bridge.ts`

- [ ] **Step 1: Add VisionRequest/VisionResponse to bridge.rs**

In `apps/desktop/src-tauri/src/bridge.rs`, add the new request/response structs (after the existing `CommandRequest` struct around line 90):

```rust
#[derive(Debug, serde::Serialize)]
pub struct VisionRequest {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: String,
    pub image: String,      // base64 PNG
    pub prompt: String,
    pub token: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VisionResponse {
    pub analysis: String,
}
```

Add a public async function for vision requests:

```rust
pub async fn send_vision_request(
    image_base64: &str,
    prompt: &str,
) -> Result<VisionResponse, String> {
    tokio::task::spawn_blocking({
        let image = image_base64.to_string();
        let prompt = prompt.to_string();
        move || send_vision_blocking(&image, &prompt)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn send_vision_blocking(image_base64: &str, prompt: &str) -> Result<VisionResponse, String> {
    let mut socket = open_bridge_socket()?;
    let token = read_bridge_token()?;

    let req = VisionRequest {
        msg_type: "vision".to_string(),
        id: format!("vision-{}", uuid::Uuid::new_v4()),
        image: image_base64.to_string(),
        prompt: prompt.to_string(),
        token,
    };

    let json = serde_json::to_string(&req).map_err(|e| format!("Serialize error: {}", e))?;
    socket
        .send(tungstenite::Message::Text(json))
        .map_err(|e| format!("Send error: {}", e))?;

    let msg = socket
        .read()
        .map_err(|e| format!("Read error: {}", e))?;

    let resp: BridgeResponse =
        serde_json::from_str(&msg.to_string()).map_err(|e| format!("Parse error: {}", e))?;

    if let Some(err) = resp.error {
        return Err(err);
    }

    Ok(VisionResponse {
        analysis: resp.refined_text.unwrap_or_default(),
    })
}
```

Note: You'll need to extract `read_bridge_token()` as a helper from `open_bridge_socket()` or inline the token reading. Check the existing `open_bridge_socket` function for how token auth works.

- [ ] **Step 2: Implement CopilotVisionProvider**

Replace `apps/desktop/src-tauri/src/providers/vision_bridge.rs` with:

```rust
use crate::bridge;
use crate::providers::VisionProvider;
use base64::Engine;

pub struct CopilotVisionProvider;

impl CopilotVisionProvider {
    pub fn new() -> Self {
        Self
    }
}

impl VisionProvider for CopilotVisionProvider {
    fn analyze(&self, image_bytes: &[u8], prompt: &str) -> Result<String, String> {
        let b64 = base64::engine::general_purpose::STANDARD.encode(image_bytes);
        let result = tokio::runtime::Handle::current()
            .block_on(bridge::send_vision_request(&b64, prompt))?;
        Ok(result.analysis)
    }

    fn ocr(&self, image_bytes: &[u8]) -> Result<String, String> {
        self.analyze(
            image_bytes,
            "Extract all visible text from this image. Return only the extracted text.",
        )
    }

    fn supports_ai_analysis(&self) -> bool {
        true
    }
}
```

- [ ] **Step 3: Add VisionRequest to VS Code extension protocol**

In `extensions/vscode-bridge/src/protocol.ts`, add after `CommandRequest` (around line 93):

```typescript
export interface VisionRequest {
  type: "vision";
  id: string;
  image: string;     // base64 PNG
  prompt: string;
  token: string;
}

export interface VisionResultResponse {
  type: "vision_result";
  id: string;
  refinedText: string;  // analysis result
}
```

Add `VisionRequest` to the `IncomingMessage` union type and `VisionResultResponse` to `OutgoingMessage`.

- [ ] **Step 4: Add vision handler to extension.ts**

In `extensions/vscode-bridge/src/extension.ts`, add a new case in the message type routing (around line 128):

```typescript
case "vision":
  handleVisionMessage(ws, message as VisionRequest, tokenSource);
  break;
```

Add the handler function (after `handleCommandMessage`, around line 328):

```typescript
async function handleVisionMessage(
  ws: WebSocket,
  message: VisionRequest,
  tokenSource: vscode.CancellationTokenSource
) {
  try {
    if (!message.image || !message.prompt) {
      sendError(ws, message.id, "Missing image or prompt");
      return;
    }
    const result = await handleVision(
      message.image,
      message.prompt,
      tokenSource.token
    );
    const response: VisionResultResponse = {
      type: "vision_result",
      id: message.id,
      refinedText: result,
    };
    ws.send(JSON.stringify(response));
  } catch (error: any) {
    sendError(ws, message.id, error.message || "Vision analysis failed");
  }
}
```

- [ ] **Step 5: Add handleVision to copilot-bridge.ts**

In `extensions/vscode-bridge/src/copilot-bridge.ts`, add at the end of the file:

```typescript
export async function handleVision(
  imageBase64: string,
  prompt: string,
  token: vscode.CancellationToken
): Promise<string> {
  // Select a vision-capable model
  const models = await vscode.lm.selectChatModels();
  const model = models[0];
  if (!model) {
    throw new Error("No language model available for vision analysis");
  }

  const messages = [
    vscode.LanguageModelChatMessage.User([
      new vscode.LanguageModelChatMessageImagePart(
        `data:image/png;base64,${imageBase64}`
      ),
      prompt,
    ]),
  ];

  const response = await model.sendRequest(messages, {}, token);
  let result = "";
  for await (const chunk of response.text) {
    result += chunk;
  }
  return result;
}
```

Note: The exact `vscode.lm` API for image inputs may vary. Check the VS Code extension API docs for `LanguageModelChatMessage` image support. If images are not supported via `vscode.lm` yet, fall back to returning an error message suggesting the user use API Key mode for vision.

- [ ] **Step 6: Compile VS Code extension**

```bash
cd extensions/vscode-bridge && bun run compile
```

Expected: Compiles successfully

- [ ] **Step 7: Verify Rust compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/providers/vision_bridge.rs
git add apps/desktop/src-tauri/src/bridge.rs
git add extensions/vscode-bridge/src/protocol.ts
git add extensions/vscode-bridge/src/extension.ts
git add extensions/vscode-bridge/src/copilot-bridge.ts
git commit -m "feat: vision provider via VS Code bridge + Copilot"
```

---

### Task 15: Screen Capture — macOS

**Files:**
- Create: `apps/desktop/src-tauri/src/screen_capture/mod.rs`
- Create: `apps/desktop/src-tauri/src/screen_capture/macos.rs`
- Create: `apps/desktop/src-tauri/src/screen_capture/windows.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Create screen_capture module dispatcher**

Create `apps/desktop/src-tauri/src/screen_capture/mod.rs`:

```rust
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

/// Capture the entire visible screen as PNG bytes.
pub fn capture_full_screen() -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    {
        macos::capture_full_screen()
    }
    #[cfg(target_os = "windows")]
    {
        windows::capture_full_screen()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("Screen capture not supported on this platform".to_string())
}

/// Capture a region of the screen as PNG bytes.
/// Coordinates are in screen pixels (origin top-left).
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    {
        macos::capture_region(x, y, width, height)
    }
    #[cfg(target_os = "windows")]
    {
        windows::capture_region(x, y, width, height)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("Screen capture not supported on this platform".to_string())
}
```

- [ ] **Step 2: Implement macOS screen capture**

Create `apps/desktop/src-tauri/src/screen_capture/macos.rs`:

```rust
use core_graphics::display::{CGDisplay, CGRect, CGPoint, CGSize};
use image::ImageEncoder;
use std::io::Cursor;

pub fn capture_full_screen() -> Result<Vec<u8>, String> {
    let display = CGDisplay::main();
    let cg_image = CGDisplay::screenshot(
        display.bounds(),
        core_graphics::display::kCGWindowListOptionOnScreenOnly,
        core_graphics::display::kCGNullWindowID,
        core_graphics::display::kCGWindowImageDefault,
    )
    .ok_or("Failed to capture screen")?;

    cg_image_to_png(&cg_image)
}

pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let rect = CGRect::new(
        &CGPoint::new(x as f64, y as f64),
        &CGSize::new(width as f64, height as f64),
    );

    let cg_image = CGDisplay::screenshot(
        rect,
        core_graphics::display::kCGWindowListOptionOnScreenOnly,
        core_graphics::display::kCGNullWindowID,
        core_graphics::display::kCGWindowImageDefault,
    )
    .ok_or("Failed to capture screen region")?;

    cg_image_to_png(&cg_image)
}

fn cg_image_to_png(cg_image: &core_graphics::image::CGImage) -> Result<Vec<u8>, String> {
    let width = cg_image.width();
    let height = cg_image.height();
    let bytes_per_row = cg_image.bytes_per_row();
    let data = cg_image.data();
    let raw_bytes = data.bytes();

    // CGImage data is typically BGRA
    let mut rgba = Vec::with_capacity(width * height * 4);
    for y in 0..height {
        for x in 0..width {
            let offset = y * bytes_per_row + x * 4;
            if offset + 3 < raw_bytes.len() {
                rgba.push(raw_bytes[offset + 2]); // R
                rgba.push(raw_bytes[offset + 1]); // G
                rgba.push(raw_bytes[offset]);     // B
                rgba.push(raw_bytes[offset + 3]); // A
            }
        }
    }

    let mut png_buf = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(Cursor::new(&mut png_buf));
    encoder
        .write_image(&rgba, width as u32, height as u32, image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("PNG encode error: {}", e))?;

    Ok(png_buf)
}
```

- [ ] **Step 3: Create Windows stub**

Create `apps/desktop/src-tauri/src/screen_capture/windows.rs`:

```rust
pub fn capture_full_screen() -> Result<Vec<u8>, String> {
    // TODO: Implement using Windows.Graphics.Capture
    Err("Screen capture on Windows not yet implemented".to_string())
}

pub fn capture_region(_x: i32, _y: i32, _width: u32, _height: u32) -> Result<Vec<u8>, String> {
    Err("Screen capture on Windows not yet implemented".to_string())
}
```

- [ ] **Step 4: Register module in lib.rs**

In `apps/desktop/src-tauri/src/lib.rs`, add:

```rust
pub mod screen_capture;
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/screen_capture/
git add apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: screen capture module (macOS CGWindowList, Windows stub)"
```

---

### Task 16: Screen Capture Commands + Vision Routing

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/hotkey.rs`

- [ ] **Step 1: Add vision provider factory to commands.rs**

Add a function to create the active vision provider:

```rust
use crate::providers::vision_anthropic::AnthropicVisionProvider;
use crate::providers::vision_bridge::CopilotVisionProvider;
use crate::providers::vision_native::NativeOcrProvider;

fn create_vision_provider(settings: &AppSettings) -> Box<dyn VisionProvider> {
    if settings.ai_provider_mode == "vscode" {
        if crate::bridge::check_status() {
            return Box::new(CopilotVisionProvider::new());
        }
    } else if !settings.ai_api_key.is_empty() {
        let api_key = decrypt_key(&settings.ai_api_key);
        if settings.ai_provider == "anthropic" {
            return Box::new(AnthropicVisionProvider::new(&api_key, &settings.ai_model));
        }
    }
    // Fallback to native OCR
    Box::new(NativeOcrProvider::new())
}
```

- [ ] **Step 2: Add capture_screen command**

Add to `commands.rs`:

```rust
#[tauri::command]
pub async fn capture_screen(
    app: tauri::AppHandle,
    mode: String,          // "full" or "region"
    prompt: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<String, String> {
    let _ = app.emit("stt-state-changed", "processing");

    let image_bytes = if mode == "region" {
        let x = x.ok_or("Region capture requires x coordinate")?;
        let y = y.ok_or("Region capture requires y coordinate")?;
        let w = width.ok_or("Region capture requires width")?;
        let h = height.ok_or("Region capture requires height")?;
        crate::screen_capture::capture_region(x, y, w, h)?
    } else {
        crate::screen_capture::capture_full_screen()?
    };

    let settings = get_settings_internal(&app)?;
    let vision = create_vision_provider(&settings);

    let prompt_text = prompt.unwrap_or_else(|| "Summarize what you see in this image.".to_string());

    let result = if vision.supports_ai_analysis() {
        tokio::task::spawn_blocking(move || vision.analyze(&image_bytes, &prompt_text))
            .await
            .map_err(|e| format!("Task error: {}", e))??
    } else {
        tokio::task::spawn_blocking(move || vision.ocr(&image_bytes))
            .await
            .map_err(|e| format!("Task error: {}", e))??
    };

    // Auto-paste result
    let paste_text = result.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        crate::autopaste::paste(&paste_text);
    });

    // Save to history
    let _ = crate::history::add_entry(
        &app,
        &prompt_text,
        &result,
        Some("Screen Capture".to_string()),
        Some("Screen Analysis".to_string()),
        None,
        Some("screen".to_string()),
        None,
    );

    let _ = app.emit("stt-state-changed", "idle");
    let _ = app.emit("refinement-complete", serde_json::json!({ "action": "screen" }));

    Ok(result)
}
```

- [ ] **Step 3: Add screen_capture voice commands to process_recording_result**

In the `process_recording_result()` function (around line 241), after the intent classification check, add handling for screen commands. In the section where intents are routed (the match on `action`), add:

```rust
"screen_summarize" | "screen_extract" | "screen_explain" => {
    // Capture full screen and route to vision provider
    let image_bytes = crate::screen_capture::capture_full_screen()?;
    let vision = create_vision_provider(&settings);

    let prompt = match action.as_str() {
        "screen_extract" => "Extract all visible text from this image.".to_string(),
        "screen_explain" => "Explain what is shown in this screenshot in detail.".to_string(),
        _ => "Summarize the content shown in this screenshot.".to_string(),
    };

    let result = vision.analyze(&image_bytes, &prompt)?;
    return Ok((result, Some("Screen Capture".to_string()), Some("Screen Analysis".to_string()), Some(action), None));
}
```

Also add "screen_summarize", "screen_extract", "screen_explain" to the intent classifier's known intents. This requires updating the `CLASSIFY_SYSTEM_PROMPT` in `ai_provider.rs` (around line 47) to include these new intents.

- [ ] **Step 4: Register new commands in lib.rs**

Add `capture_screen` to the `invoke_handler` list in `lib.rs`.

- [ ] **Step 5: Register screen capture hotkey**

In `apps/desktop/src-tauri/src/hotkey.rs`, add screen capture hotkey registration. In the `register()` function (around line 127), after registering the conversation hotkey, add:

```rust
// Screen capture hotkey
let settings = load_saved_settings();
if let Some(sc_hotkey) = settings.get("screen_capture_hotkey") {
    if let Ok(shortcut) = parse_hotkey(sc_hotkey) {
        let app_handle = app.handle().clone();
        app.global_shortcut().on_shortcut(shortcut, move |_, _, _| {
            let app = app_handle.clone();
            tokio::spawn(async move {
                if let Err(e) = crate::commands::capture_screen(
                    app, "full".to_string(), None, None, None, None, None,
                ).await {
                    log::error!("Screen capture failed: {}", e);
                }
            });
        }).map_err(|e| format!("Failed to register screen capture hotkey: {}", e))?;
    }
}
```

- [ ] **Step 6: Verify compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs
git add apps/desktop/src-tauri/src/hotkey.rs
git add apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: screen capture commands, vision routing, voice commands"
```

---

### Task 17: History Cards — Screenshot Thumbnails + Screen Badge

**Files:**
- Modify: `apps/desktop/src-tauri/src/history.rs`
- Modify: `apps/desktop/src/app/components/HistoryCard.tsx`

- [ ] **Step 1: Add screenshot_thumbnail to HistoryEntry**

In `apps/desktop/src-tauri/src/history.rs`, add to the `HistoryEntry` struct (after `action_params` around line 43):

```rust
    #[serde(default)]
    pub screenshot_thumbnail: Option<String>,  // base64 PNG thumbnail
```

- [ ] **Step 2: Update HistoryCard to show screenshot thumbnail**

In `apps/desktop/src/app/components/HistoryCard.tsx`, add the `screenshotThumbnail` prop to `HistoryCardProps` (after `actionParams` around line 431):

```typescript
  screenshotThumbnail?: string;
```

In the component, add thumbnail rendering in the header area (after the category badge, around line 570):

```tsx
{props.screenshotThumbnail && (
  <div style={{
    width: 48,
    height: 36,
    borderRadius: 6,
    overflow: "hidden",
    flexShrink: 0,
    border: "1px solid var(--yapper-border)",
  }}>
    <img
      src={`data:image/png;base64,${props.screenshotThumbnail}`}
      alt="Screenshot"
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </div>
)}
```

- [ ] **Step 3: Add "Screen" to action badge formatting**

In the `formatActionLabel` function (around line 395), add:

```typescript
case "screen":
case "screen_summarize":
case "screen_extract":
case "screen_explain":
  return "Screen";
```

- [ ] **Step 4: Verify in dev mode**

Run: `bun dev`
- Screen capture entries should show with a thumbnail (once screen capture is functional)
- The "Screen" badge should appear on history cards with screen actions

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/history.rs
git add apps/desktop/src/app/components/HistoryCard.tsx
git commit -m "feat: screenshot thumbnails and Screen badge in history cards"
```

---

### Task 18: Help View — New Voice Commands

**Files:**
- Modify: `apps/desktop/src/app/components/HelpView.tsx`

- [ ] **Step 1: Add Screen Capture section to HelpView**

In `apps/desktop/src/app/components/HelpView.tsx`, add a new section after the "Explain" section (around line 220) and before the "Chaining" section:

```tsx
<SectionCard>
  <SectionHeader icon={
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  }>
    Screen Capture
  </SectionHeader>
  <ExampleRow command="What's on my screen" description="Captures and summarizes visible screen" />
  <ExampleRow command="Screen summarize" description="Same as above — summarize screen content" />
  <ExampleRow command="Screen extract text" description="OCR — extracts text from screen" />
  <ExampleRow command="Screen explain" description="Detailed explanation of what's visible" />
  <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8, paddingLeft: 12 }}>
    You can also use {formatHotkey(props.hotkey === "fn" ? "Cmd+Shift+S" : "Cmd+Shift+S")} to select a screen region.
  </div>
</SectionCard>
```

- [ ] **Step 2: Verify in dev mode**

Run: `bun dev`
- Navigate to Help view
- New "Screen Capture" section should appear with voice command examples

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/app/components/HelpView.tsx
git commit -m "feat: screen capture voice commands in help view"
```

---

### Task 19: Settings UI — Screen Capture Section

**Files:**
- Modify: `apps/desktop/src/app/components/SettingsView.tsx`

- [ ] **Step 1: Add Screen Capture settings section**

In `SettingsView.tsx`, add a new section after the Speech Recognition section:

```tsx
{/* Screen Capture */}
<SectionCard>
  <SectionHeader>Screen Capture</SectionHeader>

  <SettingRow label="Capture Hotkey" hint="Press this hotkey to capture a screen region for AI analysis.">
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      <div style={{
        padding: "6px 12px",
        borderRadius: 8,
        background: "var(--yapper-surface-lowest)",
        border: "1px solid var(--yapper-border)",
        fontSize: 13,
        fontFamily: "monospace",
      }}>
        {isMac
          ? settings.screen_capture_hotkey.replace("Cmd", "\u2318").replace("Shift", "\u21E7").replace("+", "")
          : settings.screen_capture_hotkey}
      </div>
    </div>
  </SettingRow>

  <SettingRow label="Save Screenshots">
    <Toggle
      checked={settings.save_screenshots}
      onChange={(v) => update({ save_screenshots: v })}
      label="Save thumbnails in history"
    />
  </SettingRow>
</SectionCard>
```

- [ ] **Step 2: Verify in dev mode**

Run: `bun dev`
- Open Settings
- Screen Capture section should appear with hotkey display and screenshots toggle

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/app/components/SettingsView.tsx
git commit -m "feat: screen capture settings section"
```

---

### Task 20: Update Intent Classifier for Screen Commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/ai_provider.rs`

- [ ] **Step 1: Update CLASSIFY_SYSTEM_PROMPT**

In `apps/desktop/src-tauri/src/ai_provider.rs`, update the `CLASSIFY_SYSTEM_PROMPT` (around line 47) to include the new screen intents. Add to the intent list:

```
- "screen_summarize": User wants to capture and summarize what's on their screen. Triggers: "what's on my screen", "summarize my screen", "screen summarize", "summarize what I see", "what am I looking at"
- "screen_extract": User wants to extract/OCR text from the screen. Triggers: "screen extract text", "read my screen", "extract text from screen", "OCR this"
- "screen_explain": User wants a detailed explanation of screen content. Triggers: "screen explain", "explain what's on my screen", "explain this screen"
```

- [ ] **Step 2: Update the intent match in send_command**

In the `send_command_blocking()` function (or wherever intents are matched), ensure screen intents are passed through without modification. They don't need the same refinement treatment — they trigger screen capture instead.

- [ ] **Step 3: Similarly update copilot-bridge.ts**

In `extensions/vscode-bridge/src/copilot-bridge.ts`, update the `CLASSIFY_SYSTEM_PROMPT` (around line 47) with the same screen intent additions.

Also update the `ClassifiedIntent` type in `protocol.ts` to include the new intents:

```typescript
intent: "dictation" | "translate" | "summarize" | "draft" | "explain" | "unknown" | "chain" | "screen_summarize" | "screen_extract" | "screen_explain",
```

- [ ] **Step 4: Verify Rust compilation**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: Compiles successfully

- [ ] **Step 5: Compile VS Code extension**

```bash
cd extensions/vscode-bridge && bun run compile
```
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/ai_provider.rs
git add extensions/vscode-bridge/src/copilot-bridge.ts
git add extensions/vscode-bridge/src/protocol.ts
git commit -m "feat: add screen_summarize, screen_extract, screen_explain intents"
```

---

### Task 21: End-to-End Integration Verification

**Files:** None (manual testing)

- [ ] **Step 1: Full build check**

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cd extensions/vscode-bridge && bun run compile
```

Both must pass.

- [ ] **Step 2: Run dev mode**

```bash
bun tauri dev
```

Verify app launches without errors.

- [ ] **Step 3: Test Whisper model download**

1. Open Settings → Speech Recognition
2. Click Download on "base" model
3. Verify progress bar appears and model downloads
4. Verify model shows as "Active" after download

- [ ] **Step 4: Test recording with Whisper**

1. Click widget or press hotkey
2. Speak a sentence
3. If streaming is working, live text should appear in widget
4. Stop recording
5. Verify refined text auto-pastes
6. Verify history entry appears

- [ ] **Step 5: Test screen capture hotkey**

1. Press Cmd+Shift+S (or configured hotkey)
2. Verify screen capture triggers
3. If Anthropic API key is configured, verify AI analysis
4. If no API key, verify native OCR fallback

- [ ] **Step 6: Test screen voice command**

1. Press recording hotkey
2. Say "what's on my screen"
3. Stop recording
4. Verify screen capture + analysis triggers
5. Verify result pastes

- [ ] **Step 7: Test fallback to native STT**

1. In Settings, switch STT provider to "native" (or delete the whisper model)
2. Record and verify native STT still works
3. Switch back to "whisper"

- [ ] **Step 8: Commit any fixes**

If any issues found during testing, fix and commit:

```bash
git add -u
git commit -m "fix: integration fixes from end-to-end testing"
```

---

### Task 22: Update CLAUDE.md and DESIGN.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `DESIGN.md` (if it exists)

- [ ] **Step 1: Update CLAUDE.md architecture section**

Update the Architecture section to reflect:
- New `providers/` module with trait definitions
- `model_manager.rs` for whisper model management
- `screen_capture/` module for platform screen capture
- Updated recording pipeline with streaming STT
- New voice commands (screen_summarize, screen_extract, screen_explain)
- New settings fields (stt_provider, whisper_model, etc.)

- [ ] **Step 2: Update Key Constraints**

Remove the "Zero network egress" constraint for VS Code mode (no longer accurate since whisper downloads models from Hugging Face).

Add:
- **Whisper STT**: Primary STT via whisper-rs (local). Models downloaded from Hugging Face on first use to `~/.yapper/models/`.
- **Screen Capture**: macOS uses CGWindowListCreateImage, Windows uses GraphicsCapture. Region select via platform overlay window.
- **Vision AI**: Routes through same dual-provider pattern as text refinement. Native OCR fallback for offline use.

- [ ] **Step 3: Update Recording Pipeline section**

Replace with the new pipeline from the spec.

- [ ] **Step 4: Update Common Pitfalls**

Add:
- whisper-rs requires C++ toolchain for first build (whisper.cpp compiled from source by build script)
- cpal audio capture requires microphone permission on macOS
- Screen capture requires Screen Recording permission on macOS (System Settings → Privacy)
- Don't resize widget beyond 220x80 for idle state; recording state height increased to 62 for transcript display

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for v2 architecture (whisper, vision, providers)"
```
