use std::sync::Mutex;
use once_cell::sync::Lazy;

static RECORDER_PROCESS: Lazy<Mutex<Option<std::process::Child>>> = Lazy::new(|| Mutex::new(None));
static AUDIO_FILE: &str = "/tmp/yapper_recording.wav";

// Swift recorder script — uses native sample rate, records until killed
static SWIFT_RECORDER: &str = r#"
import AVFoundation
import Foundation

// Global flag for signal handler (can't capture locals in C signal handlers)
var globalShouldStop = false
signal(SIGINT) { _ in globalShouldStop = true }
signal(SIGTERM) { _ in globalShouldStop = true }

let url = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.removeItem(at: url)

let engine = AVAudioEngine()
let nativeRate = engine.inputNode.outputFormat(forBus: 0).sampleRate

let settings: [String: Any] = [
    AVFormatIDKey: Int(kAudioFormatLinearPCM),
    AVSampleRateKey: nativeRate,
    AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false
]

do {
    let recorder = try AVAudioRecorder(url: url, settings: settings)
    guard recorder.record() else {
        fputs("Failed to start recording\n", stderr)
        exit(1)
    }
    fputs("Recording at \(nativeRate)Hz...\n", stderr)

    while !globalShouldStop {
        Thread.sleep(forTimeInterval: 0.05)
    }
    recorder.stop()
    fputs("Stopped and finalized\n", stderr)
} catch {
    fputs("Error: \(error)\n", stderr)
    exit(1)
}
"#;

// Swift transcriber — uses RunLoop so callbacks fire properly
static SWIFT_TRANSCRIBER: &str = r#"
import Speech
import Foundation

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
let request = SFSpeechURLRecognitionRequest(url: url)
var done = false

recognizer.recognitionTask(with: request) { result, error in
    if let result = result, result.isFinal {
        print(result.bestTranscription.formattedString)
        done = true
        CFRunLoopStop(CFRunLoopGetMain())
    }
    if let error = error {
        fputs("Error: \(error.localizedDescription)\n", stderr)
        done = true
        CFRunLoopStop(CFRunLoopGetMain())
    }
}

DispatchQueue.main.asyncAfter(deadline: .now() + 15.0) {
    if !done {
        fputs("Timeout\n", stderr)
        CFRunLoopStop(CFRunLoopGetMain())
    }
}
CFRunLoopRun()
"#;

pub async fn start_recognition(app: &tauri::AppHandle) -> Result<(), String> {
    let _ = app;

    // Kill any lingering recorder process from previous run
    if let Some(mut old) = RECORDER_PROCESS.lock().map_err(|e| e.to_string())?.take() {
        unsafe { libc::kill(old.id() as i32, libc::SIGKILL); }
        let _ = old.wait();
    }

    // Clean up old audio file
    let _ = std::fs::remove_file(AUDIO_FILE);

    // Write recorder script
    let script_path = "/tmp/yapper_recorder.swift";
    std::fs::write(script_path, SWIFT_RECORDER)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    // Start recording subprocess
    let child = std::process::Command::new("swift")
        .args([script_path, AUDIO_FILE])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start recorder: {}", e))?;

    // Give Swift time to compile (first run) and start recording
    std::thread::sleep(std::time::Duration::from_millis(2000));

    *RECORDER_PROCESS.lock().map_err(|e| e.to_string())? = Some(child);
    Ok(())
}

pub async fn stop_recognition() -> Result<String, String> {
    // Stop recording — send SIGINT so recorder.stop() is called to finalize WAV
    if let Some(mut child) = RECORDER_PROCESS.lock().map_err(|e| e.to_string())?.take() {
        unsafe { libc::kill(child.id() as i32, libc::SIGINT); }
        // Wait for process to finish (recorder.stop() needs time to finalize)
        match child.wait() {
            Ok(_) => {}
            Err(_) => {
                // Force kill if it didn't stop
                unsafe { libc::kill(child.id() as i32, libc::SIGKILL); }
                let _ = child.wait();
            }
        }
    } else {
        return Err("No recording in progress".to_string());
    }

    // Wait for file to be fully written
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Check file
    match std::fs::metadata(AUDIO_FILE) {
        Ok(m) if m.len() > 1000 => {}
        Ok(m) => return Err(format!("Recording too short ({} bytes)", m.len())),
        Err(_) => return Err("Recording file not found — recorder may not have started".to_string()),
    }

    // Write transcriber script
    let script_path = "/tmp/yapper_transcriber.swift";
    std::fs::write(script_path, SWIFT_TRANSCRIBER)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    // Run transcription
    let output = std::process::Command::new("swift")
        .args([script_path, AUDIO_FILE])
        .output()
        .map_err(|e| format!("Failed to run transcriber: {}", e))?;

    // Clean up audio file
    let _ = std::fs::remove_file(AUDIO_FILE);

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !stdout.is_empty() {
        Ok(stdout)
    } else if stderr.contains("No speech") {
        Err("No speech detected — try speaking louder".to_string())
    } else if !stderr.is_empty() {
        Err(format!("Transcription error: {}", stderr))
    } else {
        Err("No transcript returned".to_string())
    }
}

/// Called by the frontend (Web Speech API fallback)
pub fn set_transcript(text: &str) {
    // Not used in Swift subprocess approach, but keep for compatibility
    let _ = text;
}

extern crate libc;
