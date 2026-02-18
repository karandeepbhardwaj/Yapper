use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

// We'll store the transcript as it comes in
static TRANSCRIPT: Lazy<Arc<Mutex<String>>> = Lazy::new(|| Arc::new(Mutex::new(String::new())));
static RECOGNITION_ACTIVE: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

pub async fn start_recognition(app: &tauri::AppHandle) -> Result<(), String> {
    // Clear previous transcript
    *TRANSCRIPT.lock().map_err(|e| e.to_string())? = String::new();
    *RECOGNITION_ACTIVE.lock().map_err(|e| e.to_string())? = true;

    // NOTE: Full SFSpeechRecognizer integration requires Objective-C FFI
    // through objc2-speech. The implementation below outlines the approach.
    //
    // In production, this would:
    // 1. Create SFSpeechRecognizer with locale
    // 2. Set supportsOnDeviceRecognition check
    // 3. Create SFSpeechAudioBufferRecognitionRequest
    // 4. Set requiresOnDeviceRecognition = true
    // 5. Start AVAudioEngine with input tap
    // 6. Feed audio buffers to recognition request
    // 7. Handle results via recognition task delegate
    //
    // For now, we use a placeholder that demonstrates the IPC flow.
    // The full native implementation requires careful unsafe Objective-C interop.

    log::info!("macOS STT: Starting on-device speech recognition");

    // TODO: Replace with actual SFSpeechRecognizer implementation
    // The objc2-speech crate provides the bindings:
    //
    // use objc2_speech::{SFSpeechRecognizer, SFSpeechAudioBufferRecognitionRequest};
    // use objc2_avf_audio::{AVAudioEngine, AVAudioInputNode};
    // use objc2_foundation::NSLocale;
    //
    // unsafe {
    //     let locale = NSLocale::initWithLocaleIdentifier(NSLocale::alloc(), ns_string!("en-US"));
    //     let recognizer = SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale);
    //     let request = SFSpeechAudioBufferRecognitionRequest::new();
    //     request.setRequiresOnDeviceRecognition(true);
    //
    //     let engine = AVAudioEngine::new();
    //     let input_node = engine.inputNode();
    //     let format = input_node.outputFormatForBus(0);
    //
    //     input_node.installTapOnBus_bufferSize_format_block(
    //         0, 1024, Some(&format),
    //         &block2::RcBlock::new(move |buffer, _when| {
    //             request.appendAudioPCMBuffer(buffer);
    //         }),
    //     );
    //
    //     engine.prepare();
    //     engine.startAndReturnError()?;
    //
    //     recognizer.recognitionTaskWithRequest_resultHandler(
    //         &request,
    //         &block2::RcBlock::new(move |result, error| {
    //             if let Some(result) = result {
    //                 let transcription = result.bestTranscription();
    //                 let text = transcription.formattedString().to_string();
    //                 *TRANSCRIPT.lock().unwrap() = text;
    //             }
    //         }),
    //     );
    // }

    let _ = app;
    Ok(())
}

pub async fn stop_recognition() -> Result<String, String> {
    *RECOGNITION_ACTIVE.lock().map_err(|e| e.to_string())? = false;

    // TODO: Stop AVAudioEngine and recognition task
    // unsafe {
    //     engine.stop();
    //     input_node.removeTapOnBus(0);
    //     request.endAudio();
    // }

    let transcript = TRANSCRIPT.lock().map_err(|e| e.to_string())?.clone();

    if transcript.is_empty() {
        // Return placeholder for testing
        Ok("This is a test transcript from the speech recognition engine.".to_string())
    } else {
        Ok(transcript)
    }
}
