mod hotkey;
mod stt;
mod bridge;
mod autopaste;
mod history;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};


#[cfg(target_os = "macos")]
fn is_mouse_near(center_x_logical: f64, center_y_logical: f64, radius_logical: f64) -> bool {
    use cocoa::foundation::NSPoint;
    use objc::*;

    unsafe {
        // NSEvent.mouseLocation returns points in screen coordinates (bottom-left origin)
        let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];

        let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
        let main_screen: cocoa::base::id = msg_send![screens, objectAtIndex: 0_usize];
        let frame: cocoa::foundation::NSRect = msg_send![main_screen, frame];
        let screen_height = frame.size.height;

        // NSEvent mouseLocation is in points (logical), bottom-left origin
        // Our center_y_logical is top-left origin, convert to bottom-left
        let center_y_bl = screen_height - center_y_logical;

        let dx = mouse_loc.x - center_x_logical;
        let dy = mouse_loc.y - center_y_bl;

        (dx * dx + dy * dy).sqrt() <= radius_logical
    }
}

#[allow(dead_code)]
fn is_mouse_over_window_with_padding(window: &tauri::WebviewWindow, padding: f64) -> bool {
    #[cfg(target_os = "macos")]
    {
        use cocoa::foundation::NSPoint;
        use objc::*;

        unsafe {
            let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];
            if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                let scale = window.scale_factor().unwrap_or(1.0);
                let wx = pos.x as f64 - padding;
                let wy = pos.y as f64;
                let ww = size.width as f64 / scale + padding * 2.0;
                let wh = size.height as f64 / scale + padding * 2.0;

                let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
                let main_screen: cocoa::base::id = msg_send![screens, objectAtIndex: 0_usize];
                let frame: cocoa::foundation::NSRect = msg_send![main_screen, frame];
                let screen_height = frame.size.height;

                let wy_flipped = screen_height - wy - wh + padding;

                mouse_loc.x >= wx
                    && mouse_loc.x <= wx + ww
                    && mouse_loc.y >= wy_flipped
                    && mouse_loc.y <= wy_flipped + wh
            } else {
                false
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, padding);
        false
    }
}

#[allow(dead_code)]
fn is_mouse_over_window(window: &tauri::WebviewWindow) -> bool {
    #[cfg(target_os = "macos")]
    {
        use cocoa::base::nil;
        use cocoa::foundation::NSPoint;
        use objc::*;

        unsafe {
            let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];
            if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                let scale = window.scale_factor().unwrap_or(1.0);
                let wx = pos.x as f64;
                let wy = pos.y as f64;
                let ww = size.width as f64 / scale;
                let wh = size.height as f64 / scale;

                // macOS screen coords: origin at bottom-left
                // Get screen height for conversion
                let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
                let main_screen: cocoa::base::id = msg_send![screens, objectAtIndex: 0_usize];
                let frame: cocoa::foundation::NSRect = msg_send![main_screen, frame];
                let screen_height = frame.size.height;

                // Convert window position (top-left origin) to bottom-left origin
                let wy_flipped = screen_height - wy - wh;

                mouse_loc.x >= wx
                    && mouse_loc.x <= wx + ww
                    && mouse_loc.y >= wy_flipped
                    && mouse_loc.y <= wy_flipped + wh
            } else {
                false
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        false
    }
}

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
async fn stop_recording(app: tauri::AppHandle) -> Result<(), String> {
    if stt::get_state() != stt::State::Recording {
        return Err("Not recording".to_string());
    }
    app.emit("stt-state-changed", "processing").map_err(|e| e.to_string())?;

    let raw_transcript = stt::stop().await.map_err(|e| {
        stt::set_state(stt::State::Idle);
        app.emit("stt-state-changed", "idle").ok();
        e.to_string()
    })?;

    // Send to VS Code extension for refinement
    let refined_text = bridge::refine_text(&raw_transcript)
        .await
        .unwrap_or_else(|_| raw_transcript.clone());

    // Auto-paste
    let text_for_paste = refined_text.clone();
    std::thread::spawn(move || {
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            if let Ok(mut child) = Command::new("pbcopy")
                .stdin(std::process::Stdio::piped())
                .spawn()
            {
                if let Some(stdin) = child.stdin.as_mut() {
                    use std::io::Write;
                    let _ = stdin.write_all(text_for_paste.as_bytes());
                }
                let _ = child.wait();
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
            let _ = Command::new("osascript")
                .args(["-e", r#"
                    tell application "System Events"
                        set frontApp to name of first application process whose frontmost is true
                        tell application process frontApp
                            keystroke "v" using command down
                        end tell
                    end tell
                "#])
                .output();
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

    stt::set_state(stt::State::Idle);
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

            // Configure widget: position at center bottom + convert to NSPanel
            #[cfg(target_os = "macos")]
            {
                if let Some(widget) = app.get_webview_window("widget") {
                    // Position at center bottom
                    if let Ok(Some(monitor)) = app.primary_monitor() {
                        let sf = monitor.scale_factor();
                        let sw = monitor.size().width as f64 / sf;
                        let sh = monitor.size().height as f64 / sf;
                        let win_size = 110.0;
                        let x = (sw - win_size) / 2.0;
                        let y = sh - win_size - 80.0;
                        let _ = widget.set_position(tauri::LogicalPosition::new(x, y));
                    }

                    // Poll mouse position globally to detect hover even when app is inactive
                    let app_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        use std::sync::atomic::{AtomicBool, Ordering};
                        static WAS_HOVERING: AtomicBool = AtomicBool::new(false);

                        // Wait for window to settle after positioning
                        std::thread::sleep(std::time::Duration::from_secs(2));

                        // Get the center position (in logical coords)
                        let Some(widget) = app_handle.get_webview_window("widget") else { return };
                        let scale = widget.scale_factor().unwrap_or(2.0);
                        let Ok(pos) = widget.outer_position() else { return };
                        let Ok(size) = widget.outer_size() else { return };
                        let cx = pos.x as f64 / scale + (size.width as f64 / scale) / 2.0;
                        let cy = pos.y as f64 / scale + (size.height as f64 / scale) / 2.0;
                        println!("[HOVER] Widget center: ({:.0}, {:.0}), scale: {}", cx, cy, scale);

                        loop {
                            std::thread::sleep(std::time::Duration::from_millis(80));

                            let hovering = {
                                #[cfg(target_os = "macos")]
                                { is_mouse_near(cx, cy, 70.0) }
                                #[cfg(not(target_os = "macos"))]
                                { false }
                            };
                            let was = WAS_HOVERING.load(Ordering::Relaxed);

                            if hovering != was {
                                WAS_HOVERING.store(hovering, Ordering::Relaxed);
                                println!("[HOVER] Mouse hover: {}", hovering);
                                if let Some(w) = app_handle.get_webview_window("widget") {
                                    let js = format!(
                                        "window.dispatchEvent(new CustomEvent('yapper-hover', {{detail: {}}}))",
                                        hovering
                                    );
                                    let _ = w.eval(&js);
                                }
                            }
                        }
                    });
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(widget) = app.get_webview_window("widget") {
                    if let Ok(Some(monitor)) = app.primary_monitor() {
                        let sf = monitor.scale_factor();
                        let sw = monitor.size().width as f64 / sf;
                        let sh = monitor.size().height as f64 / sf;
                        let win_size = 110.0;
                        let _ = widget.set_position(tauri::LogicalPosition::new(
                            (sw - win_size) / 2.0,
                            sh - win_size - 80.0,
                        ));
                    }
                }
            }

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
