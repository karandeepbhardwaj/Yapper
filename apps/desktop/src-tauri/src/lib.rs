mod hotkey;
mod stt;
mod bridge;
mod autopaste;
mod history;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "autoStopAfterSilence")]
    pub auto_stop_after_silence: bool,
    #[serde(rename = "showFloatingWidget")]
    pub show_floating_widget: bool,
    pub language: String,
    #[serde(rename = "refinementStyle")]
    pub refinement_style: String,
    pub hotkey: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_stop_after_silence: true,
            show_floating_widget: true,
            language: "en-US".to_string(),
            refinement_style: "Professional".to_string(),
            hotkey: "Alt+Space".to_string(),
        }
    }
}

#[tauri::command]
async fn start_recording(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("stt-state-changed", "listening").map_err(|e| e.to_string())?;
    stt::start(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_recording(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("stt-state-changed", "processing").map_err(|e| e.to_string())?;

    let raw_transcript = stt::stop().await.map_err(|e| e.to_string())?;

    // Send to VS Code extension for refinement
    let refined_text = bridge::refine_text(&raw_transcript)
        .await
        .unwrap_or_else(|_| raw_transcript.clone());

    // Auto-paste must run on the main thread (macOS requires it for keyboard APIs)
    let text_for_paste = refined_text.clone();
    std::thread::spawn(move || {
        // Dispatch to main thread via a short sleep to let the main run loop pick it up
        // On macOS, enigo keyboard simulation needs the main dispatch queue
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            // Use pbcopy + AppleScript for reliable main-thread paste
            if let Ok(mut child) = Command::new("pbcopy")
                .stdin(std::process::Stdio::piped())
                .spawn()
            {
                if let Some(stdin) = child.stdin.as_mut() {
                    use std::io::Write;
                    let _ = stdin.write_all(text_for_paste.as_bytes());
                }
                let _ = child.wait();
                // Simulate Cmd+V via AppleScript (runs on main thread safely)
                let _ = Command::new("osascript")
                    .args(["-e", "tell application \"System Events\" to keystroke \"v\" using command down"])
                    .output();
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            if let Err(e) = autopaste::paste_text(&text_for_paste) {
                log::warn!("Auto-paste failed: {}", e);
            }
        }
    });

    // Save to history
    history::add_entry(&app, &raw_transcript, &refined_text)?;

    // Notify frontend
    #[derive(Clone, Serialize)]
    struct RefinementResult {
        #[serde(rename = "rawTranscript")]
        raw_transcript: String,
        #[serde(rename = "refinedText")]
        refined_text: String,
    }

    app.emit("refinement-complete", RefinementResult {
        raw_transcript,
        refined_text,
    }).map_err(|e| e.to_string())?;

    app.emit("stt-state-changed", "idle").map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_history(app: tauri::AppHandle) -> Result<Vec<history::HistoryEntry>, String> {
    history::get_all(&app).map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    history::clear(&app).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    if settings_path.exists() {
        let data = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}

#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, data).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Register global hotkey
            hotkey::register(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            get_history,
            clear_history,
            get_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
