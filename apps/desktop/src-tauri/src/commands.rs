use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{Emitter, Manager};

use crate::{ai_provider, autopaste, bridge, conversation, dictionary, history, model_manager, snippets, stt};
use crate::providers::SttProvider;
use crate::providers::VisionProvider;
use crate::providers::stt_whisper::WhisperCppProvider;
use crate::providers::stt_native::NativeOsProvider;
use crate::providers::vision_anthropic::AnthropicVisionProvider;
use crate::providers::vision_bridge::CopilotVisionProvider;
use crate::providers::vision_native::NativeOcrProvider;

static RECORDING_START: Mutex<Option<Instant>> = Mutex::new(None);

static ACTIVE_STT: Lazy<Mutex<Option<Box<dyn SttProvider>>>> = Lazy::new(|| Mutex::new(None));

pub static HOLD_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn create_stt_provider(settings: &AppSettings) -> Result<Box<dyn SttProvider>, String> {
    if settings.stt_provider == "whisper" && !settings.whisper_model.is_empty() {
        match WhisperCppProvider::new(
            &settings.whisper_model,
            &settings.whisper_language,
            settings.streaming_enabled,
        ) {
            Ok(provider) => return Ok(Box::new(provider)),
            Err(e) => {
                log::warn!("Whisper not available, falling back to native: {}", e);
            }
        }
    }
    Ok(Box::new(NativeOsProvider::new()))
}

fn create_vision_provider(settings: &AppSettings) -> Box<dyn VisionProvider> {
    if settings.ai_provider_mode == "vscode" {
        // Quick TCP check to see if the bridge is reachable
        let bridge_available = std::net::TcpStream::connect_timeout(
            &"127.0.0.1:9147".parse().unwrap(),
            std::time::Duration::from_millis(300),
        )
        .is_ok();
        if bridge_available {
            return Box::new(CopilotVisionProvider::new());
        }
    } else if !settings.ai_api_key.is_empty() && settings.ai_provider == "anthropic" {
        let api_key = decrypt_key(&settings.ai_api_key);
        return Box::new(AnthropicVisionProvider::new(
            &api_key,
            &settings.ai_model,
        ));
    }
    Box::new(NativeOcrProvider::new())
}

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
    #[serde(default = "default_ai_provider_mode")]
    pub ai_provider_mode: String,     // "vscode" | "apikey"
    #[serde(default)]
    pub ai_provider: String,          // "groq" | "anthropic"
    #[serde(default)]
    pub ai_api_key: String,           // the actual key (decrypted in memory)
    #[serde(default)]
    pub vscode_model: String,
    #[serde(default)]
    pub ai_model: String,
    #[serde(default = "default_theme")]
    pub theme: String,                // "light" | "dark" | "system"
    #[serde(default = "default_stt_provider")]
    pub stt_provider: String,
    #[serde(default)]
    pub whisper_model: String,
    #[serde(default = "default_whisper_language")]
    pub whisper_language: String,
    #[serde(default = "default_streaming_enabled")]
    pub streaming_enabled: bool,
    #[serde(default = "default_screen_capture_hotkey")]
    pub screen_capture_hotkey: String,
    #[serde(default = "default_save_screenshots")]
    pub save_screenshots: bool,
}

fn read_clipboard() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("pbpaste").output() {
            Ok(output) => {
                let text = String::from_utf8_lossy(&output.stdout).to_string();
                if text.is_empty() {
                    None
                } else {
                    Some(text.chars().take(10_000).collect())
                }
            }
            Err(_) => None,
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        match Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-Clipboard"])
            .output()
        {
            Ok(output) => {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if text.is_empty() {
                    None
                } else {
                    Some(text.chars().take(10_000).collect())
                }
            }
            Err(_) => None,
        }
    }
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().to_string() + chars.as_str(),
    }
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

fn default_ai_provider_mode() -> String { "vscode".to_string() }
fn default_theme() -> String { "system".to_string() }
fn default_stt_provider() -> String { "whisper".to_string() }
fn default_whisper_language() -> String { "auto".to_string() }
fn default_streaming_enabled() -> bool { true }
fn default_screen_capture_hotkey() -> String {
    if cfg!(target_os = "macos") { "Cmd+Shift+S".to_string() }
    else { "Ctrl+Shift+S".to_string() }
}
fn default_save_screenshots() -> bool { true }

fn default_true() -> bool { true }
fn default_false() -> bool { false }

// --- API key encryption helpers (XOR cipher with username-derived key) ---

fn xor_mask() -> [u8; 8] {
    let machine_id = format!("yapper-{}", std::env::var("USER").unwrap_or_else(|_| "user".to_string()));
    let mut hash: u64 = 5381;
    for b in machine_id.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(b as u64);
    }
    hash.to_le_bytes()
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((n >> 18) & 63) as usize] as char);
        result.push(CHARS[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 { result.push(CHARS[((n >> 6) & 63) as usize] as char); } else { result.push('='); }
        if chunk.len() > 2 { result.push(CHARS[(n & 63) as usize] as char); } else { result.push('='); }
    }
    result
}

fn base64_decode(s: &str) -> Vec<u8> {
    const DECODE: [u8; 128] = {
        let mut t = [255u8; 128];
        let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut i = 0;
        while i < 64 { t[chars[i] as usize] = i as u8; i += 1; }
        t
    };
    let bytes: Vec<u8> = s.bytes().filter(|&b| b != b'=').collect();
    let mut result = Vec::new();
    for chunk in bytes.chunks(4) {
        if chunk.len() < 2 { break; }
        let b0 = if chunk[0] < 128 { DECODE[chunk[0] as usize] as u32 } else { 0 };
        let b1 = if chunk[1] < 128 { DECODE[chunk[1] as usize] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 && chunk[2] < 128 { DECODE[chunk[2] as usize] as u32 } else { 0 };
        let b3 = if chunk.len() > 3 && chunk[3] < 128 { DECODE[chunk[3] as usize] as u32 } else { 0 };
        let n = (b0 << 18) | (b1 << 12) | (b2 << 6) | b3;
        result.push((n >> 16) as u8);
        if chunk.len() > 2 { result.push((n >> 8) as u8); }
        if chunk.len() > 3 { result.push(n as u8); }
    }
    result
}

fn encrypt_key(key: &str) -> String {
    let mask = xor_mask();
    let encrypted: Vec<u8> = key.bytes().enumerate().map(|(i, b)| b ^ mask[i % 8]).collect();
    format!("enc:{}", base64_encode(&encrypted))
}

fn decrypt_key(encrypted: &str) -> String {
    let mask = xor_mask();
    let bytes = base64_decode(encrypted);
    let decrypted: Vec<u8> = bytes.iter().enumerate().map(|(i, &b)| b ^ mask[i % 8]).collect();
    String::from_utf8_lossy(&decrypted).to_string()
}

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
            ai_provider_mode: "vscode".to_string(),
            ai_provider: String::new(),
            ai_api_key: String::new(),
            vscode_model: String::new(),
            ai_model: String::new(),
            theme: "system".to_string(),
            stt_provider: default_stt_provider(),
            whisper_model: String::new(),
            whisper_language: default_whisper_language(),
            streaming_enabled: default_streaming_enabled(),
            screen_capture_hotkey: default_screen_capture_hotkey(),
            save_screenshots: default_save_screenshots(),
        }
    }
}

pub fn get_settings_internal(app: &tauri::AppHandle) -> AppSettings {
    let path = match app.path().app_config_dir() {
        Ok(p) => p.join("settings.json"),
        Err(_) => return AppSettings::default(),
    };
    if !path.exists() { return AppSettings::default(); }
    match std::fs::read_to_string(&path) {
        Ok(data) => {
            let mut settings: AppSettings = serde_json::from_str(&data).unwrap_or_else(|e| {
                log::warn!("Settings corrupted, using defaults: {}", e);
                AppSettings::default()
            });
            // Decrypt API key if it's encrypted
            if settings.ai_api_key.starts_with("enc:") {
                settings.ai_api_key = decrypt_key(&settings.ai_api_key[4..]);
            }
            settings
        }
        Err(e) => {
            log::warn!("Failed to read settings: {}", e);
            AppSettings::default()
        }
    }
}

#[derive(Clone, Serialize)]
struct RefinementSkipped {
    reason: String,
}

#[derive(Clone, Serialize)]
struct RecordingResult {
    #[serde(rename = "rawTranscript")]
    raw_transcript: String,
    #[serde(rename = "refinedText")]
    refined_text: String,
    category: Option<String>,
    title: Option<String>,
    action: Option<String>,
    #[serde(rename = "actionParams", skip_serializing_if = "Option::is_none")]
    action_params: Option<HashMap<String, String>>,
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
        let _ = history::add_entry(app, &raw_transcript, &expansion, Some("Note"), None, Some(duration_secs), None, None);
        return Ok(());
    }

    // Apply dictionary replacements before sending to AI
    let processed_transcript = dictionary::apply_replacements(&raw_transcript, app);

    // Load style settings
    let settings = get_settings_internal(app);
    let clipboard = read_clipboard();

    // Dispatch to direct API or VS Code bridge based on settings
    let (refined_text, category, title, action, action_params) = if settings.ai_provider_mode == "apikey"
        && !settings.ai_api_key.is_empty()
        && !settings.ai_provider.is_empty()
    {
        // Direct API path
        match ai_provider::send_command(
            processed_transcript.clone(),
            clipboard,
            Some(settings.default_style.clone()),
            if settings.style_overrides.is_empty() { None } else { Some(settings.style_overrides.clone()) },
            if settings.code_mode { Some(true) } else { None },
            &settings.ai_provider,
            &settings.ai_api_key,
            &settings.ai_model,
        ).await {
            Ok(cmd) => {
                let (cat, ttl) = if cmd.action == "dictation" {
                    let cat = cmd.params.as_ref().and_then(|p| p.get("category")).cloned();
                    let ttl = cmd.params.as_ref().and_then(|p| p.get("title")).cloned();
                    (cat, ttl)
                } else {
                    (Some(capitalize_first(&cmd.action)), None)
                };
                log::info!("Direct API command succeeded: action={}", cmd.action);
                (cmd.result, cat, ttl, Some(cmd.action), cmd.params)
            }
            Err(e) => {
                let reason = if e.contains("401") || e.contains("403") || e.contains("Unauthorized") {
                    "Invalid API key. Check your key in Settings.".to_string()
                } else if e.contains("429") || e.contains("rate") {
                    "API rate limit reached. Wait a moment and try again.".to_string()
                } else {
                    format!("AI request failed. Check your API key and connection.")
                };
                app.emit("refinement-skipped", RefinementSkipped { reason: reason.clone() }).ok();
                log::warn!("{}", reason);
                (raw_transcript.clone(), Some("Unrefined".to_string()), None, Some("unrefined".to_string()), None)
            }
        }
    } else {
        // VS Code bridge path (existing)
        match bridge::send_command(
            processed_transcript.clone(),
            clipboard,
            Some(settings.default_style.clone()),
            if settings.style_overrides.is_empty() { None } else { Some(settings.style_overrides.clone()) },
            if settings.code_mode { Some(true) } else { None },
            if settings.vscode_model.is_empty() { None } else { Some(settings.vscode_model.clone()) },
        ).await {
            Ok(cmd) => {
                let (cat, ttl) = if cmd.action == "dictation" {
                    let cat = cmd.params.as_ref().and_then(|p| p.get("category")).cloned();
                    let ttl = cmd.params.as_ref().and_then(|p| p.get("title")).cloned();
                    (cat, ttl)
                } else {
                    (Some(capitalize_first(&cmd.action)), None)
                };
                log::info!("Command flow succeeded: action={}", cmd.action);
                (cmd.result, cat, ttl, Some(cmd.action), cmd.params)
            }
            Err(cmd_err) => {
                log::warn!("Command flow failed ({}), falling back to refine_text", cmd_err);
                match bridge::refine_text(
                    &processed_transcript,
                    Some(settings.default_style.clone()),
                    if settings.style_overrides.is_empty() { None } else { Some(settings.style_overrides.clone()) },
                    if settings.code_mode { Some(true) } else { None },
                    if settings.vscode_model.is_empty() { None } else { Some(settings.vscode_model.clone()) },
                ).await {
                    Ok(r) => (r.refined_text, r.category, r.title, None, None),
                    Err(e) => {
                        let reason = if e.contains("cooldown") {
                            "AI temporarily unavailable, try again shortly"
                        } else if e.contains("not available") || e.contains("Connection refused") {
                            "VS Code not connected. Open VS Code to enable AI"
                        } else {
                            "No AI provider available. Check VS Code extension"
                        };
                        app.emit("refinement-skipped", RefinementSkipped {
                            reason: reason.to_string(),
                        }).ok();
                        log::warn!("Bridge refinement failed: {}", e);
                        (raw_transcript.clone(), Some("Unrefined".to_string()), None, Some("unrefined".to_string()), None)
                    }
                }
            }
        }
    };

    // Handle screen capture voice commands
    let (refined_text, category, title, action, action_params) =
        if matches!(action.as_deref(), Some("screen_summarize") | Some("screen_extract") | Some("screen_explain")) {
            let screen_action = action.as_deref().unwrap_or("screen_summarize");
            log::info!("Screen voice command detected: {}", screen_action);

            let capture_result = tokio::task::spawn_blocking(|| {
                crate::screen_capture::capture_full_screen()
            }).await.map_err(|e| format!("Task error: {}", e))?;
            match capture_result {
                Ok(image_bytes) => {
                    let settings = get_settings_internal(app);
                    let vision = create_vision_provider(&settings);

                    let prompt = match screen_action {
                        "screen_extract" => "Extract all visible text from this image. Return only the extracted text, preserving the original layout as much as possible.".to_string(),
                        "screen_explain" => "Explain what is shown in this screenshot in detail. Describe the UI elements, content, and context.".to_string(),
                        _ => "Summarize what you see in this image.".to_string(),
                    };

                    match tokio::task::spawn_blocking(move || {
                        if vision.supports_ai_analysis() {
                            vision.analyze(&image_bytes, &prompt)
                        } else {
                            vision.ocr(&image_bytes)
                        }
                    })
                    .await
                    {
                        Ok(Ok(result)) => (
                            result,
                            Some("Screen Capture".to_string()),
                            Some("Screen Analysis".to_string()),
                            Some(screen_action.to_string()),
                            action_params,
                        ),
                        Ok(Err(e)) => {
                            log::error!("Vision analysis failed: {}", e);
                            (format!("Screen capture failed: {}", e), Some("Error".to_string()), None, Some(screen_action.to_string()), action_params)
                        }
                        Err(e) => {
                            log::error!("Vision task failed: {}", e);
                            (format!("Screen capture task failed: {}", e), Some("Error".to_string()), None, Some(screen_action.to_string()), action_params)
                        }
                    }
                }
                Err(e) => {
                    log::error!("Screen capture failed: {}", e);
                    (format!("Screen capture failed: {}", e), Some("Error".to_string()), None, Some(screen_action.to_string()), action_params)
                }
            }
        } else {
            (refined_text, category, title, action, action_params)
        };

    // Auto-paste
    let text_for_paste = refined_text.clone();
    std::thread::spawn(move || {
        if let Err(e) = autopaste::paste_text(&text_for_paste) {
            log::warn!("Auto-paste failed: {}", e);
        }
    });

    let _ = history::add_entry(
        app,
        &raw_transcript,
        &refined_text,
        category.as_deref(),
        title.as_deref(),
        Some(duration_secs),
        action.as_deref(),
        action_params.as_ref(),
    );

    app.emit("refinement-complete", RecordingResult {
        raw_transcript,
        refined_text,
        category,
        title,
        action,
        action_params,
    }).ok();

    Ok(())
}

pub async fn toggle_recording(handle: &tauri::AppHandle) {
    let current = stt::get_state();
    match current {
        stt::State::Idle => {
            let settings = get_settings_internal(handle);
            let provider = match create_stt_provider(&settings) {
                Ok(p) => p,
                Err(e) => {
                    log::error!("STT provider creation failed: {}", e);
                    handle.emit("stt-error", e).ok();
                    return;
                }
            };

            *RECORDING_START.lock().unwrap() = Some(Instant::now());
            stt::set_state(stt::State::Recording);
            handle.emit("stt-state-changed", "listening").ok();

            if let Err(e) = provider.start(handle) {
                log::error!("STT start failed: {}", e);
                *RECORDING_START.lock().unwrap() = None;
                stt::set_state(stt::State::Idle);
                handle.emit("stt-state-changed", "idle").ok();
                handle.emit("stt-error", e).ok();
                return;
            }

            *ACTIVE_STT.lock().unwrap() = Some(provider);
        }
        stt::State::Recording => {
            let duration_secs = RECORDING_START.lock().unwrap().take()
                .map(|s| s.elapsed().as_secs())
                .unwrap_or(0);

            stt::set_state(stt::State::Processing);
            handle.emit("stt-state-changed", "processing").ok();
            handle.emit("stop-speech-recognition", ()).ok();

            let provider = ACTIVE_STT.lock().unwrap().take();
            let raw_transcript = if let Some(provider) = provider {
                match provider.stop() {
                    Ok(t) => t,
                    Err(_) => {
                        stt::set_state(stt::State::Idle);
                        handle.emit("stt-state-changed", "idle").ok();
                        return;
                    }
                }
            } else {
                match stt::stop().await {
                    Ok(t) => t,
                    Err(_) => {
                        stt::set_state(stt::State::Idle);
                        handle.emit("stt-state-changed", "idle").ok();
                        return;
                    }
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

    let settings = get_settings_internal(&app);
    let provider = create_stt_provider(&settings)?;

    *RECORDING_START.lock().unwrap() = Some(Instant::now());
    stt::set_state(stt::State::Recording);
    app.emit("stt-state-changed", "listening").map_err(|e| e.to_string())?;

    if let Err(e) = provider.start(&app) {
        *RECORDING_START.lock().unwrap() = None;
        stt::set_state(stt::State::Idle);
        app.emit("stt-state-changed", "idle").ok();
        return Err(e);
    }

    *ACTIVE_STT.lock().unwrap() = Some(provider);
    Ok(())
}

#[tauri::command]
pub async fn stop_recording(app: tauri::AppHandle) -> Result<(), String> {
    if stt::get_state() != stt::State::Recording {
        return Err("Not recording".to_string());
    }
    let duration_secs = RECORDING_START.lock().unwrap().take()
        .map(|s| s.elapsed().as_secs())
        .unwrap_or(0);

    stt::set_state(stt::State::Processing);
    app.emit("stt-state-changed", "processing").map_err(|e| e.to_string())?;
    app.emit("stop-speech-recognition", ()).ok();

    let provider = ACTIVE_STT.lock().unwrap().take();
    let raw_transcript = if let Some(provider) = provider {
        provider.stop().map_err(|e| {
            stt::set_state(stt::State::Idle);
            app.emit("stt-state-changed", "idle").ok();
            e
        })?
    } else {
        stt::stop().await.map_err(|e| {
            stt::set_state(stt::State::Idle);
            app.emit("stt-state-changed", "idle").ok();
            e.to_string()
        })?
    };

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
    stt::set_state(stt::State::Processing);
    app.emit("stt-state-changed", "processing").map_err(|e| e.to_string())?;
    app.emit("stop-speech-recognition", ()).ok();

    let provider = ACTIVE_STT.lock().unwrap().take();
    let raw_transcript = if let Some(provider) = provider {
        provider.stop().map_err(|e| {
            stt::set_state(stt::State::Idle);
            app.emit("stt-state-changed", "idle").ok();
            e
        })?
    } else {
        stt::stop().await.map_err(|e| {
            stt::set_state(stt::State::Idle);
            app.emit("stt-state-changed", "idle").ok();
            e.to_string()
        })?
    };

    stt::set_state(stt::State::Idle);
    app.emit("stt-state-changed", "idle").map_err(|e| e.to_string())?;

    Ok(raw_transcript)
}

#[tauri::command]
pub async fn cancel_recording(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("stop-speech-recognition", ()).ok();

    let provider = ACTIVE_STT.lock().unwrap().take();
    if let Some(provider) = provider {
        provider.cleanup();
    } else {
        let _ = stt::stop().await;
    }

    *RECORDING_START.lock().unwrap() = None;
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
    Ok(get_settings_internal(&app))
}

#[tauri::command]
pub async fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    HOLD_MODE.store(settings.recording_mode == "hold", std::sync::atomic::Ordering::Relaxed);
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let settings_path = path.join("settings.json");
    // Encrypt API key before writing to disk
    let mut settings_to_save = settings;
    if !settings_to_save.ai_api_key.is_empty() && !settings_to_save.ai_api_key.starts_with("enc:") {
        settings_to_save.ai_api_key = encrypt_key(&settings_to_save.ai_api_key);
    }
    let data = serde_json::to_string_pretty(&settings_to_save).map_err(|e| e.to_string())?;
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

#[tauri::command]
pub async fn list_bridge_models() -> Result<Vec<bridge::BridgeModelInfo>, String> {
    bridge::list_models().await
}

#[tauri::command]
pub fn check_bridge_status() -> bool {
    use std::net::TcpStream;
    use std::time::Duration;
    TcpStream::connect_timeout(
        &"127.0.0.1:9147".parse().unwrap(),
        Duration::from_millis(300),
    )
    .is_ok()
}

#[tauri::command]
pub fn open_vscode() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "Visual Studio Code"])
            .spawn()
            .map_err(|e| format!("Failed to open VS Code: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "code"])
            .spawn()
            .map_err(|e| format!("Failed to open VS Code: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn test_api_key(provider: String, api_key: String) -> Result<bool, String> {
    let p = provider.clone();
    let k = api_key.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::ai_provider::test_key(&p, &k)
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))?
}

static SCREEN_CAPTURE_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn cancel_screen_capture(app: tauri::AppHandle) -> Result<(), String> {
    log::info!("[ScreenCapture] Cancelled by user");
    SCREEN_CAPTURE_CANCEL.store(true, Ordering::Relaxed);
    let _ = app.emit("stt-state-changed", "idle");
    Ok(())
}

#[tauri::command]
pub async fn capture_screen(
    app: tauri::AppHandle,
    mode: String,
    prompt: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<String, String> {
    log::info!("[ScreenCapture] Starting capture, mode={}", mode);
    SCREEN_CAPTURE_CANCEL.store(false, Ordering::Relaxed);
    let _ = app.emit("stt-state-changed", "processing");

    // Run screen capture in a blocking thread (Swift subprocess blocks)
    let capture_mode = mode.clone();
    let image_bytes = tokio::task::spawn_blocking(move || {
        if capture_mode == "region" {
            let x = x.ok_or("Region capture requires x coordinate")?;
            let y = y.ok_or("Region capture requires y coordinate")?;
            let w = width.ok_or("Region capture requires width")?;
            let h = height.ok_or("Region capture requires height")?;
            crate::screen_capture::capture_region(x, y, w, h)
        } else {
            crate::screen_capture::capture_full_screen()
        }
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?;

    let image_bytes = match image_bytes {
        Ok(bytes) => {
            log::info!("[ScreenCapture] Captured {} bytes", bytes.len());
            bytes
        }
        Err(e) => {
            log::error!("[ScreenCapture] Capture failed: {}", e);
            let _ = app.emit("stt-state-changed", "idle");
            let _ = app.emit("stt-error", format!("Screen capture failed: {}", e));
            return Err(e);
        }
    };

    if SCREEN_CAPTURE_CANCEL.load(Ordering::Relaxed) {
        log::info!("[ScreenCapture] Cancelled after capture");
        let _ = app.emit("stt-state-changed", "idle");
        return Err("Screen capture cancelled".to_string());
    }

    let settings = get_settings_internal(&app);
    let vision = create_vision_provider(&settings);

    let prompt_text = prompt.unwrap_or_else(|| "Summarize what you see in this image.".to_string());
    log::info!("[ScreenCapture] Sending to vision provider, prompt: {}", &prompt_text[..prompt_text.len().min(50)]);

    let analysis_result = tokio::task::spawn_blocking(move || {
        if vision.supports_ai_analysis() {
            vision.analyze(&image_bytes, &prompt_text)
        } else {
            vision.ocr(&image_bytes)
        }
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?;

    let analysis_result = match analysis_result {
        Ok(result) => {
            log::info!("[ScreenCapture] Analysis complete: {} chars", result.len());
            result
        }
        Err(e) => {
            log::error!("[ScreenCapture] Vision analysis failed: {}", e);
            let _ = app.emit("stt-state-changed", "idle");
            let _ = app.emit("stt-error", format!("Vision analysis failed: {}", e));
            return Err(e);
        }
    };

    // Auto-paste result
    let paste_text = analysis_result.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if let Err(e) = autopaste::paste_text(&paste_text) {
            log::warn!("Auto-paste failed: {}", e);
        }
    });

    // Save to history
    let _ = history::add_entry(
        &app,
        "Screen capture",
        &analysis_result,
        Some("Screen Capture"),
        Some("Screen Analysis"),
        None,
        Some("screen"),
        None,
    );

    let _ = app.emit("stt-state-changed", "idle");
    let _ = app.emit("refinement-complete", serde_json::json!({ "action": "screen" }));

    Ok(analysis_result)
}

#[tauri::command]
pub async fn get_model_status(app: tauri::AppHandle) -> Result<model_manager::ModelStatus, String> {
    let settings = get_settings_internal(&app);
    Ok(model_manager::get_status(&settings.whisper_model))
}

#[tauri::command]
pub async fn download_whisper_model(app: tauri::AppHandle, model: String) -> Result<(), String> {
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        model_manager::download_model(&model, &app_clone)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn delete_whisper_model(model: String) -> Result<(), String> {
    model_manager::delete_model(&model)
}
