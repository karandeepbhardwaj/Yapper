use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use tauri::{Emitter, Manager};

use crate::{autopaste, bridge, conversation, dictionary, history, snippets, stt};

static RECORDING_START: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);

pub static HOLD_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub hotkey: String,
    #[serde(default = "default_stt_engine")]
    pub stt_engine: String,
    #[serde(default = "default_style")]
    pub default_style: String,
    #[serde(default)]
    pub style_overrides: HashMap<String, String>,
    #[serde(default = "default_true")]
    pub metrics_enabled: bool,
    #[serde(default = "default_false")]
    pub code_mode: bool,
    #[serde(default = "default_recording_mode")]
    pub recording_mode: String,
    #[serde(default = "default_conversation_hotkey")]
    pub conversation_hotkey: String,
}

fn default_stt_engine() -> String {
    "classic".to_string()
}

fn default_style() -> String {
    "Professional".to_string()
}

fn default_recording_mode() -> String { "toggle".to_string() }

fn default_conversation_hotkey() -> String {
    if cfg!(target_os = "macos") {
        "Cmd+Shift+Y".to_string()
    } else {
        "Ctrl+Shift+Y".to_string()
    }
}

fn default_true() -> bool { true }
fn default_false() -> bool { false }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            hotkey: "Cmd+Shift+.".to_string(),
            #[cfg(not(target_os = "macos"))]
            hotkey: "Ctrl+Shift+.".to_string(),
            stt_engine: default_stt_engine(),
            default_style: default_style(),
            style_overrides: HashMap::new(),
            metrics_enabled: true,
            code_mode: false,
            recording_mode: default_recording_mode(),
            conversation_hotkey: default_conversation_hotkey(),
        }
    }
}

fn get_settings_internal(app: &tauri::AppHandle) -> AppSettings {
    let path = match app.path().app_config_dir() {
        Ok(p) => p.join("settings.json"),
        Err(_) => return AppSettings::default(),
    };
    if !path.exists() { return AppSettings::default(); }
    match std::fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_else(|e| {
            log::warn!("Settings corrupted, using defaults: {}", e);
            AppSettings::default()
        }),
        Err(e) => {
            log::warn!("Failed to read settings: {}", e);
            AppSettings::default()
        }
    }
}

#[derive(Clone, Serialize)]
struct RecordingResult {
    #[serde(rename = "rawTranscript")]
    raw_transcript: String,
    #[serde(rename = "refinedText")]
    refined_text: String,
    category: Option<String>,
    title: Option<String>,
}

async fn process_recording_result(
    app: &tauri::AppHandle,
    raw_transcript: String,
    duration_secs: u64,
) -> Result<(), String> {
    // Check snippets first -- if match, paste directly and skip AI
    if let Some(expansion) = snippets::detect_and_expand(&raw_transcript, app) {
        let text_for_paste = expansion.clone();
        std::thread::spawn(move || {
            if let Err(e) = autopaste::paste_text(&text_for_paste) {
                log::warn!("Auto-paste failed: {}", e);
            }
        });
        let _ = history::add_entry(app, &raw_transcript, &expansion, Some("Note"), None, Some(duration_secs));
        return Ok(());
    }

    // Apply dictionary replacements before sending to AI
    let processed_transcript = dictionary::apply_replacements(&raw_transcript, app);

    // Load style settings
    let settings = get_settings_internal(app);
    let bridge_result = bridge::refine_text(
        &processed_transcript,
        Some(settings.default_style.clone()),
        if settings.style_overrides.is_empty() { None } else { Some(settings.style_overrides.clone()) },
        if settings.code_mode { Some(true) } else { None },
    ).await;

    let (refined_text, category, title) = match bridge_result {
        Ok(r) => (r.refined_text, r.category, r.title),
        Err(e) => {
            // Emit refinement-skipped event and fall back to raw transcript
            #[derive(Clone, Serialize)]
            struct RefinementSkipped {
                reason: String,
            }
            app.emit("refinement-skipped", RefinementSkipped {
                reason: "Bridge unavailable".to_string(),
            }).ok();
            log::warn!("Bridge refinement failed, using raw transcript: {}", e);
            (raw_transcript.clone(), None, None)
        }
    };

    // Auto-paste
    let text_for_paste = refined_text.clone();
    std::thread::spawn(move || {
        if let Err(e) = autopaste::paste_text(&text_for_paste) {
            log::warn!("Auto-paste failed: {}", e);
        }
    });

    let _ = history::add_entry(app, &raw_transcript, &refined_text, category.as_deref(), title.as_deref(), Some(duration_secs));

    app.emit("refinement-complete", RecordingResult {
        raw_transcript,
        refined_text,
        category,
        title,
    }).ok();

    Ok(())
}

pub async fn toggle_recording(handle: &tauri::AppHandle) {
    let current = stt::get_state();
    match current {
        stt::State::Idle => {
            *RECORDING_START.lock().unwrap() = Some(Instant::now());
            handle.emit("stt-state-changed", "listening").ok();
            if let Err(e) = stt::start(handle).await {
                log::error!("STT start failed: {}", e);
                *RECORDING_START.lock().unwrap() = None;
                stt::set_state(stt::State::Idle);
                handle.emit("stt-state-changed", "idle").ok();
                handle.emit("stt-error", e).ok();
            }
        }
        stt::State::Recording => {
            let duration_secs = RECORDING_START.lock().unwrap().take()
                .map(|s| s.elapsed().as_secs())
                .unwrap_or(0);

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

            // If conversation mode is active, emit raw transcript for the conversation view
            if conversation::is_active() {
                stt::set_state(stt::State::Idle);
                handle.emit("stt-state-changed", "idle").ok();
                handle.emit("conversation-raw-transcript", raw_transcript).ok();
                return;
            }

            let _ = process_recording_result(handle, raw_transcript, duration_secs).await;
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
    *RECORDING_START.lock().unwrap() = Some(Instant::now());
    app.emit("stt-state-changed", "listening").map_err(|e| e.to_string())?;
    stt::start(&app).await.map_err(|e| {
        *RECORDING_START.lock().unwrap() = None;
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
    let duration_secs = RECORDING_START.lock().unwrap().take()
        .map(|s| s.elapsed().as_secs())
        .unwrap_or(0);

    app.emit("stt-state-changed", "processing").map_err(|e| e.to_string())?;
    app.emit("stop-speech-recognition", ()).ok();

    let raw_transcript = stt::stop().await.map_err(|e| {
        stt::set_state(stt::State::Idle);
        app.emit("stt-state-changed", "idle").ok();
        e.to_string()
    })?;

    process_recording_result(&app, raw_transcript, duration_secs).await?;

    stt::set_state(stt::State::Idle);
    app.emit("stt-state-changed", "idle").map_err(|e| e.to_string())?;

    Ok(())
}

/// Stop recording and return just the raw transcript (no refinement, no paste, no history).
/// Used by conversation mode which handles its own AI pipeline.
#[tauri::command]
pub async fn stop_recording_raw(app: tauri::AppHandle) -> Result<String, String> {
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

    stt::set_state(stt::State::Idle);
    app.emit("stt-state-changed", "idle").map_err(|e| e.to_string())?;

    Ok(raw_transcript)
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
pub async fn change_hotkey(app: tauri::AppHandle, hotkey: String) -> Result<(), String> {
    log::info!("Changing hotkey to: '{}'", hotkey);
    if let Err(e) = crate::hotkey::update(&app, &hotkey) {
        log::error!("Hotkey update failed: {}", e);
        return Err(e);
    }
    log::info!("Hotkey updated successfully");
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    let mut settings = if settings_path.exists() {
        let data = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<AppSettings>(&data).unwrap_or_default()
    } else {
        AppSettings::default()
    };
    settings.hotkey = hotkey.clone();
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, data).map_err(|e| e.to_string())?;
    app.emit("hotkey-changed", hotkey).ok();
    Ok(())
}

#[tauri::command]
pub fn debug_log(msg: String) {
    log::debug!("[FE] {}", msg);
}

#[tauri::command]
pub async fn open_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn navigate_to(app: tauri::AppHandle, view: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    app.emit("navigate-to", view).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paste_last_transcript(app: tauri::AppHandle) -> Result<(), String> {
    let entries = history::get_all(&app)?;
    if let Some(entry) = entries.first() {
        let text = entry.refined_text.clone();
        std::thread::spawn(move || {
            if let Err(e) = autopaste::paste_text(&text) {
                log::warn!("Paste last failed: {}", e);
            }
        });
        Ok(())
    } else {
        Err("No history entries".to_string())
    }
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
    HOLD_MODE.store(settings.recording_mode == "hold", std::sync::atomic::Ordering::Relaxed);
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, data).map_err(|e| e.to_string())
}

/// Check if Windows Online Speech Recognition privacy setting is enabled.
/// Returns true if enabled or if not on Windows.
#[tauri::command]
pub async fn check_speech_permission() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Registry::*;
        use windows::core::PCWSTR;

        let subkey: Vec<u16> = "Software\\Microsoft\\Speech_OneCore\\Settings\\OnlineSpeechPrivacy\0"
            .encode_utf16().collect();
        let value_name: Vec<u16> = "HasAccepted\0".encode_utf16().collect();

        let mut hkey = HKEY::default();
        let result = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                0,
                KEY_READ,
                &mut hkey,
            )
        };

        if result.is_err() {
            return Ok(false);
        }

        let mut data: u32 = 0;
        let mut data_size: u32 = std::mem::size_of::<u32>() as u32;
        let query = unsafe {
            RegQueryValueExW(
                hkey,
                PCWSTR(value_name.as_ptr()),
                None,
                None,
                Some(&mut data as *mut u32 as *mut u8),
                Some(&mut data_size),
            )
        };
        let _ = unsafe { RegCloseKey(hkey) };

        if query.is_err() {
            return Ok(false);
        }

        Ok(data == 1)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(true)
    }
}

#[tauri::command]
pub async fn change_stt_engine(app: tauri::AppHandle, engine: String) -> Result<(), String> {
    let is_modern = engine == "modern";
    #[cfg(target_os = "windows")]
    stt::windows::set_engine(is_modern);
    #[cfg(not(target_os = "windows"))]
    let _ = is_modern;

    // Persist to settings
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    let mut settings = if settings_path.exists() {
        let data = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<AppSettings>(&data).unwrap_or_default()
    } else {
        AppSettings::default()
    };
    settings.stt_engine = engine;
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn change_recording_mode(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    HOLD_MODE.store(mode == "hold", std::sync::atomic::Ordering::Relaxed);
    // Persist to settings
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    let mut settings = if settings_path.exists() {
        let data = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<AppSettings>(&data).unwrap_or_default()
    } else {
        AppSettings::default()
    };
    settings.recording_mode = mode;
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn change_conversation_hotkey(app: tauri::AppHandle, hotkey: String) -> Result<(), String> {
    log::info!("Changing conversation hotkey to: '{}'", hotkey);
    crate::hotkey::update_conversation(&app, &hotkey)?;
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    let mut settings = if settings_path.exists() {
        let data = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<AppSettings>(&data).unwrap_or_default()
    } else {
        AppSettings::default()
    };
    settings.conversation_hotkey = hotkey.clone();
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, data).map_err(|e| e.to_string())?;
    app.emit("hotkey-changed", settings.hotkey).ok();
    Ok(())
}
