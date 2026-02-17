pub mod stt_whisper;

use std::sync::mpsc::Receiver;

/// A single turn in a conversation history (role + content).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConversationTurnMsg {
    pub role: String,
    pub content: String,
}

/// Partial transcript segment emitted during streaming STT.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PartialTranscript {
    pub text: String,
    pub is_final: bool,
}

/// Speech-to-text provider trait.
pub trait SttProvider: Send + Sync {
    fn start(&self, app: &tauri::AppHandle) -> Result<(), String>;
    fn stop(&self) -> Result<String, String>;
    fn stream_receiver(&self) -> Option<Receiver<PartialTranscript>>;
    fn supports_streaming(&self) -> bool;
    fn cleanup(&self);
}
