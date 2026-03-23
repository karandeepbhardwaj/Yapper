use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

use windows::Foundation::TypedEventHandler;
use windows::Media::SpeechRecognition::{
    SpeechContinuousRecognitionResultGeneratedEventArgs,
    SpeechContinuousRecognitionSession, SpeechRecognizer,
    SpeechRecognitionResultStatus,
};

static TRANSCRIPT: Lazy<Arc<Mutex<String>>> = Lazy::new(|| Arc::new(Mutex::new(String::new())));
static RECOGNIZER: Lazy<Mutex<Option<SpeechRecognizer>>> = Lazy::new(|| Mutex::new(None));
static SESSION: Lazy<Mutex<Option<SpeechContinuousRecognitionSession>>> =
    Lazy::new(|| Mutex::new(None));

pub async fn start_recognition(app: &tauri::AppHandle) -> Result<(), String> {
    let _ = app;

    // Clear previous transcript
    if let Ok(mut t) = TRANSCRIPT.lock() {
        t.clear();
    }

    // Create recognizer — fails if no microphone or speech recognition disabled
    let recognizer = SpeechRecognizer::new().map_err(|e| {
        format!(
            "Speech recognition not available. Check Windows Settings > Privacy > Speech. ({})",
            e
        )
    })?;

    // Compile constraints (required before starting)
    let compile_result = recognizer
        .CompileConstraintsAsync()
        .map_err(|e| format!("Failed to compile speech constraints: {}", e))?
        .get()
        .map_err(|e| format!("Failed to compile speech constraints: {}", e))?;

    if compile_result.Status().unwrap_or(SpeechRecognitionResultStatus::Unknown)
        != SpeechRecognitionResultStatus::Success
    {
        return Err("Failed to initialize speech recognition".to_string());
    }

    // Get continuous recognition session
    let session = recognizer
        .ContinuousRecognitionSession()
        .map_err(|e| format!("Failed to get recognition session: {}", e))?;

    // Register result handler — appends recognized text to TRANSCRIPT
    let transcript_ref = TRANSCRIPT.clone();
    session
        .ResultGenerated(&TypedEventHandler::new(
            move |_session: &Option<SpeechContinuousRecognitionSession>,
                  args: &Option<SpeechContinuousRecognitionResultGeneratedEventArgs>| {
                if let Some(args) = args {
                    if let Ok(result) = args.Result() {
                        if let Ok(text) = result.Text() {
                            let text = text.to_string();
                            if !text.is_empty() {
                                if let Ok(mut t) = transcript_ref.lock() {
                                    if !t.is_empty() {
                                        t.push(' ');
                                    }
                                    t.push_str(&text);
                                }
                            }
                        }
                    }
                }
                Ok(())
            },
        ))
        .map_err(|e| format!("Failed to register result handler: {}", e))?;

    // Start listening
    session
        .StartAsync()
        .map_err(|e| format!("Failed to start recording: {}", e))?
        .get()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    // Store recognizer and session to keep them alive
    if let Ok(mut r) = RECOGNIZER.lock() {
        *r = Some(recognizer);
    }
    if let Ok(mut s) = SESSION.lock() {
        *s = Some(session);
    }

    log::info!("Windows STT: Started continuous recognition");
    Ok(())
}

pub async fn stop_recognition() -> Result<String, String> {
    // Stop the session
    let session = SESSION
        .lock()
        .map_err(|e| e.to_string())?
        .take();

    if let Some(session) = session {
        if let Err(e) = session.StopAsync().and_then(|op| op.get()) {
            log::warn!("Failed to stop recognition session: {}", e);
        }
    }

    // Drop the recognizer (releases microphone)
    if let Ok(mut r) = RECOGNIZER.lock() {
        r.take();
    }

    // Return accumulated transcript
    let transcript = TRANSCRIPT
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    log::info!("Windows STT: Stopped. Transcript length: {}", transcript.len());

    if transcript.is_empty() {
        Err("No speech was recognized".to_string())
    } else {
        Ok(transcript)
    }
}

pub fn set_transcript(text: &str) {
    if let Ok(mut t) = TRANSCRIPT.lock() {
        *t = text.to_string();
    }
}
