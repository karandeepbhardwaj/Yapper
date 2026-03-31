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
        None
    }

    fn supports_streaming(&self) -> bool {
        false
    }

    fn cleanup(&self) {
        crate::stt::platform_cleanup();
    }
}
