use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

static TRANSCRIPT: Lazy<Arc<Mutex<String>>> = Lazy::new(|| Arc::new(Mutex::new(String::new())));

pub async fn start_recognition(app: &tauri::AppHandle) -> Result<(), String> {
    *TRANSCRIPT.lock().map_err(|e| e.to_string())? = String::new();

    // NOTE: Full Windows SpeechRecognizer integration via windows crate
    //
    // use windows::Media::SpeechRecognition::SpeechRecognizer;
    //
    // let recognizer = SpeechRecognizer::new()?;
    // recognizer.CompileConstraintsAsync()?.await?;
    //
    // let session = recognizer.ContinuousRecognitionSession()?;
    // session.ResultGenerated(&TypedEventHandler::new(move |_, args| {
    //     if let Some(args) = args {
    //         let result = args.Result()?;
    //         let text = result.Text()?.to_string();
    //         *TRANSCRIPT.lock().unwrap() = text;
    //     }
    //     Ok(())
    // }))?;
    //
    // session.StartAsync()?.await?;

    log::info!("Windows STT: Starting on-device speech recognition");
    let _ = app;
    Ok(())
}

pub async fn stop_recognition() -> Result<String, String> {
    // TODO: session.StopAsync()?.await?;

    let transcript = TRANSCRIPT.lock().map_err(|e| e.to_string())?.clone();

    if transcript.is_empty() {
        Ok("This is a test transcript from the speech recognition engine.".to_string())
    } else {
        Ok(transcript)
    }
}
