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
    fn start(&self, app: &tauri::AppHandle) -> Result<(), String>;
    fn stop(&self) -> Result<String, String>;
    fn stream_receiver(&self) -> Option<Receiver<PartialTranscript>>;
    fn supports_streaming(&self) -> bool;
    fn cleanup(&self);
}

/// AI text refinement and conversation provider trait.
pub trait AiProvider: Send + Sync {
    fn refine(
        &self,
        raw_text: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<RefinementResult, String>;

    fn classify_intent(&self, raw_text: &str) -> Result<Intent, String>;

    fn send_command(
        &self,
        raw_text: &str,
        clipboard: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<CommandResult, String>;

    fn converse(
        &self,
        history: &[crate::bridge::ConversationTurnMsg],
        user_message: &str,
        on_chunk: Option<Box<dyn Fn(&str) + Send>>,
    ) -> Result<ConversationResponse, String>;

    fn summarize(
        &self,
        history: &[crate::bridge::ConversationTurnMsg],
    ) -> Result<SummaryResult, String>;
}

/// Vision / OCR provider trait.
pub trait VisionProvider: Send + Sync {
    fn analyze(&self, image_bytes: &[u8], prompt: &str) -> Result<String, String>;
    fn ocr(&self, image_bytes: &[u8]) -> Result<String, String>;
    fn supports_ai_analysis(&self) -> bool;
}
