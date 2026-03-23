use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

use crate::{autopaste, bridge, history, hotkey, stt};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub hotkey: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            hotkey: "Cmd+Shift+.".to_string(),
            #[cfg(not(target_os = "macos"))]
            hotkey: "Ctrl+Shift+.".to_string(),
        }
    }
}

pub async fn toggle_recording(handle: &tauri::AppHandle) {
    let current = stt::get_state();
    match current {
        stt::State::Idle => {
            handle.emit("stt-state-changed", "listening").ok();
            if let Err(_) = stt::start(handle).await {
                stt::set_state(stt::State::Idle);
                handle.emit("stt-state-changed", "idle").ok();
            }
        }
        stt::State::Recording => {
            handle.emit("stt-state-changed", "processing").ok();
            handle.emit("stop-speech-recognition", ()).ok();
            let raw_transcript = match stt::stop().await {
                Ok(t) => t,
                Err(_) => {
                    stt::set_state(stt::State::Idle);
                    handle.emit("stt-state-changed", "idle").ok();
                    return;
                }
            };
            let bridge_result = bridge::refine_text(&raw_transcript).await;
            let (refined_text, category, title) = match bridge_result {
                Ok(r) => (r.refined_text, r.category, r.title),
                Err(_) => (raw_transcript.clone(), None, None),
            };
            // Auto-paste
            let text_for_paste = refined_text.clone();
            std::thread::spawn(move || {
                if let Err(e) = autopaste::paste_text(&text_for_paste) {
                    log::warn!("Auto-paste failed: {}", e);
                }
            });

            let _ = history::add_entry(handle, &raw_transcript, &refined_text, category.as_deref(), title.as_deref());

            #[derive(Clone, Serialize)]
            struct ToggleResult {
                #[serde(rename = "rawTranscript")]
                raw_transcript: String,
                #[serde(rename = "refinedText")]
                refined_text: String,
                category: Option<String>,
                title: Option<String>,
            }
            handle.emit("refinement-complete", ToggleResult {
                raw_transcript,
                refined_text,
                category,
                title,
            }).ok();
            stt::set_state(stt::State::Idle);
            handle.emit("stt-state-changed", "idle").ok();
        }
        stt::State::Processing => {}
    }
}

#[tauri::command]
pub async fn start_recording(app: tauri::AppHandle) -> Result<(), String> {
    if stt::get_state() != stt::State::Idle {
        return Err("Not idle".to_string());
    }
    app.emit("stt-state-changed", "listening").map_err(|e| e.to_string())?;
    stt::start(&app).await.map_err(|e| {
        stt::set_state(stt::State::Idle);
        app.emit("stt-state-changed", "idle").ok();
        e.to_string()
    })
}

#[tauri::command]
pub async fn stop_recording(app: tauri::AppHandle) -> Result<(), String> {
    if stt::get_state() != stt::State::Recording {
        return Err("Not recording".to_string());
    }
    app.emit("stt-state-changed", "processing").map_err(|e| e.to_string())?;
    app.emit("stop-speech-recognition", ()).ok();

    let raw_transcript = stt::stop().await.map_err(|e| {
        stt::set_state(stt::State::Idle);
        app.emit("stt-state-changed", "idle").ok();
        e.to_string()
    })?;

    let bridge_result = bridge::refine_text(&raw_transcript).await;
    let (refined_text, category, title) = match bridge_result {
        Ok(r) => (r.refined_text, r.category, r.title),
        Err(_) => (raw_transcript.clone(), None, None),
    };

    // Auto-paste
    let text_for_paste = refined_text.clone();
    std::thread::spawn(move || {
        if let Err(e) = autopaste::paste_text(&text_for_paste) {
            log::warn!("Auto-paste failed: {}", e);
        }
    });

    history::add_entry(&app, &raw_transcript, &refined_text, category.as_deref(), title.as_deref())?;

    #[derive(Clone, Serialize)]
    struct CmdResult {
        #[serde(rename = "rawTranscript")]
        raw_transcript: String,
        #[serde(rename = "refinedText")]
        refined_text: String,
        category: Option<String>,
        title: Option<String>,
    }

    app.emit("refinement-complete", CmdResult {
        raw_transcript,
        refined_text,
        category,
        title,
    }).map_err(|e| e.to_string())?;

    stt::set_state(stt::State::Idle);
    app.emit("stt-state-changed", "idle").map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn cancel_recording(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("stop-speech-recognition", ()).ok();
    let _ = stt::stop().await;
    stt::set_state(stt::State::Idle);
    app.emit("stt-state-changed", "idle").ok();
    Ok(())
}

#[tauri::command]
pub fn set_transcript(text: String) {
    #[cfg(target_os = "macos")]
    stt::macos::set_transcript(&text);
    #[cfg(target_os = "windows")]
    stt::windows::set_transcript(&text);
}

#[tauri::command]
pub async fn get_history(app: tauri::AppHandle) -> Result<Vec<history::HistoryEntry>, String> {
    history::get_all(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    history::clear(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_history_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    history::delete_entry(&app, &id)
}

#[tauri::command]
pub async fn toggle_pin_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    history::toggle_pin(&app, &id)
}

#[tauri::command]
pub async fn change_hotkey(app: tauri::AppHandle, hotkey_str: String) -> Result<(), String> {
    hotkey::update(&app, &hotkey_str)?;
    let settings = AppSettings { hotkey: hotkey_str };
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
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
pub async fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, data).map_err(|e| e.to_string())
}
