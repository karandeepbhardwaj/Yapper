#![allow(unexpected_cfgs)]

mod hotkey;
mod stt;
mod bridge;
#[cfg(not(target_os = "macos"))]
mod autopaste;
mod history;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

// Global state for widget click detection from NSEvent callback
#[cfg(target_os = "macos")]
static mut GLOBAL_APP_HANDLE: Option<tauri::AppHandle> = None;

#[cfg(target_os = "macos")]
struct WidgetCenter {
    x: std::sync::atomic::AtomicU64,
    y: std::sync::atomic::AtomicU64,
}

#[cfg(target_os = "macos")]
impl WidgetCenter {
    const fn new() -> Self {
        Self {
            x: std::sync::atomic::AtomicU64::new(0),
            y: std::sync::atomic::AtomicU64::new(0),
        }
    }
    fn store_pos(&self, x: f64, y: f64) {
        self.x.store(x.to_bits(), std::sync::atomic::Ordering::Relaxed);
        self.y.store(y.to_bits(), std::sync::atomic::Ordering::Relaxed);
    }
    fn load_pos(&self) -> (f64, f64) {
        (
            f64::from_bits(self.x.load(std::sync::atomic::Ordering::Relaxed)),
            f64::from_bits(self.y.load(std::sync::atomic::Ordering::Relaxed)),
        )
    }
}

#[cfg(target_os = "macos")]
static WIDGET_CENTER: WidgetCenter = WidgetCenter::new();

async fn toggle_recording(handle: &tauri::AppHandle) {
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
            let _ = history::add_entry(handle, &raw_transcript, &refined_text);

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

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn get_primary_screen_height() -> f64 {
    unsafe {
        use objc::*;
        let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
        let main_screen: cocoa::base::id = msg_send![screens, objectAtIndex: 0_usize];
        let frame: cocoa::foundation::NSRect = msg_send![main_screen, frame];
        frame.size.height
    }
}

/// Calculate widget position based on which screen the mouse is on.
/// Returns (x, y) in Tauri logical coordinates (top-left origin).
/// Positions the widget centered horizontally, just above the dock/taskbar.
#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn get_widget_position(widget_size: f64) -> Option<(f64, f64)> {
    use cocoa::foundation::{NSPoint, NSRect};
    use objc::*;

    unsafe {
        let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];
        let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
        let count: usize = msg_send![screens, count];
        let primary_height = get_primary_screen_height();

        for i in 0..count {
            let screen: cocoa::base::id = msg_send![screens, objectAtIndex: i];
            let frame: NSRect = msg_send![screen, frame];
            let visible: NSRect = msg_send![screen, visibleFrame];

            // Check if mouse is on this screen (bottom-left coords)
            if mouse_loc.x >= frame.origin.x
                && mouse_loc.x < frame.origin.x + frame.size.width
                && mouse_loc.y >= frame.origin.y
                && mouse_loc.y < frame.origin.y + frame.size.height
            {
                // Center horizontally within the visible frame
                let x_bl = visible.origin.x + (visible.size.width - widget_size) / 2.0;
                // Position just above the bottom of the visible area (8pt padding)
                let y_bl = visible.origin.y + 8.0;

                // Convert from macOS bottom-left to Tauri top-left coordinates
                let x_tl = x_bl;
                let y_tl = primary_height - y_bl - widget_size;

                return Some((x_tl, y_tl));
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn is_mouse_near(center_x_logical: f64, center_y_logical: f64, radius_logical: f64) -> bool {
    use cocoa::foundation::NSPoint;
    use objc::*;

    unsafe {
        let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];
        let primary_height = get_primary_screen_height();

        // Convert center from Tauri top-left to macOS bottom-left
        let center_y_bl = primary_height - center_y_logical;

        let dx = mouse_loc.x - center_x_logical;
        let dy = mouse_loc.y - center_y_bl;

        (dx * dx + dy * dy).sqrt() <= radius_logical
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
    let bridge_result = bridge::refine_text(&raw_transcript).await;
    let (refined_text, category, title) = match bridge_result {
        Ok(r) => (r.refined_text, r.category, r.title),
        Err(_) => (raw_transcript.clone(), None, None),
    };

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
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    std::process::exit(0);
                }
            }
        })
        .setup(|app| {
            // Register global hotkey
            hotkey::register(app)?;

            // Configure widget: position at center bottom + convert to NSPanel
            #[cfg(target_os = "macos")]
            {
                if let Some(widget) = app.get_webview_window("widget") {
                    // Initial position — will be updated dynamically
                    if let Some((x, y)) = get_widget_position(110.0) {
                        let _ = widget.set_position(tauri::LogicalPosition::new(x, y));
                        WIDGET_CENTER.store_pos(x + 55.0, y + 55.0);
                    }

                    // Make widget clickable without needing to activate the app first.
                    // Override acceptsFirstMouse: on all views in the hierarchy so macOS
                    // passes the activation click through to the webview content.
                    #[allow(deprecated)]
                    {
                        let ns_window = widget.ns_window().unwrap() as cocoa::base::id;
                        unsafe {
                            use objc::*;
                            use objc::declare::ClassDecl;
                            use objc::runtime::{Class, Object, Sel, BOOL, YES};

                            // Window properties
                            let _: () = msg_send![ns_window, setHidesOnDeactivate: false];
                            // NSStatusWindowLevel (25) — above all normal + floating windows
                            let _: () = msg_send![ns_window, setLevel: 25_i64];
                            let _: () = msg_send![ns_window, setAcceptsMouseMovedEvents: true];
                            // NSWindowCollectionBehavior:
                            // canJoinAllSpaces (1<<0) — appear on every Space
                            // ignoresCycle (1<<6) — skip in Cmd+Tab
                            // fullScreenAuxiliary (1<<8) — appear over full-screen apps
                            let _: () = msg_send![ns_window, setCollectionBehavior:
                                (1u64 | (1u64 << 6) | (1u64 << 8))];

                            // Swizzle acceptsFirstMouse: on the content view's class
                            // so the first click passes through instead of being consumed for activation
                            extern "C" fn accepts_first_mouse(_this: &Object, _cmd: Sel, _event: cocoa::base::id) -> BOOL {
                                YES
                            }

                            let content_view: cocoa::base::id = msg_send![ns_window, contentView];
                            let class = (*content_view).class();
                            let sel = sel!(acceptsFirstMouse:);

                            // Add or replace the method
                            let method_added = class_addMethod(
                                class as *const _ as *mut _,
                                sel,
                                accepts_first_mouse as extern "C" fn(&Object, Sel, cocoa::base::id) -> BOOL as *const _,
                                b"B@:@\0".as_ptr() as *const _,
                            );

                            if !method_added {
                                // Method already exists — replace it
                                let _old = class_replaceMethod(
                                    class as *const _ as *mut _,
                                    sel,
                                    accepts_first_mouse as extern "C" fn(&Object, Sel, cocoa::base::id) -> BOOL as *const _,
                                    b"B@:@\0".as_ptr() as *const _,
                                );
                            }

                            // Also do the same for all subviews (WKWebView has nested views)
                            fn swizzle_subviews(view: cocoa::base::id) {
                                unsafe {
                                    use objc::*;
                                    use objc::runtime::{Object, Sel, BOOL, YES};

                                    extern "C" fn afm(_this: &Object, _cmd: Sel, _event: cocoa::base::id) -> BOOL {
                                        YES
                                    }

                                    let class = (*view).class();
                                    let sel = sel!(acceptsFirstMouse:);
                                    let added = class_addMethod(
                                        class as *const _ as *mut _,
                                        sel,
                                        afm as extern "C" fn(&Object, Sel, cocoa::base::id) -> BOOL as *const _,
                                        b"B@:@\0".as_ptr() as *const _,
                                    );
                                    if !added {
                                        let _ = class_replaceMethod(
                                            class as *const _ as *mut _,
                                            sel,
                                            afm as extern "C" fn(&Object, Sel, cocoa::base::id) -> BOOL as *const _,
                                            b"B@:@\0".as_ptr() as *const _,
                                        );
                                    }

                                    let subviews: cocoa::base::id = msg_send![view, subviews];
                                    let count: usize = msg_send![subviews, count];
                                    for i in 0..count {
                                        let subview: cocoa::base::id = msg_send![subviews, objectAtIndex: i];
                                        swizzle_subviews(subview);
                                    }
                                }
                            }

                            swizzle_subviews(content_view);
                        }

                        // Extern declarations for ObjC runtime functions
                        extern "C" {
                            fn class_addMethod(
                                cls: *mut std::ffi::c_void,
                                name: objc::runtime::Sel,
                                imp: *const std::ffi::c_void,
                                types: *const std::ffi::c_char,
                            ) -> bool;
                            fn class_replaceMethod(
                                cls: *mut std::ffi::c_void,
                                name: objc::runtime::Sel,
                                imp: *const std::ffi::c_void,
                                types: *const std::ffi::c_char,
                            ) -> *const std::ffi::c_void;
                        }
                    }

                    let app_handle = app.handle().clone();

                    // Combined thread: dynamic repositioning + hover detection
                    let hover_handle = app_handle.clone();
                    std::thread::spawn(move || {
                        use std::sync::atomic::{AtomicBool, Ordering};
                        static WAS_HOVERING: AtomicBool = AtomicBool::new(false);

                        std::thread::sleep(std::time::Duration::from_secs(1));

                        let mut last_x = 0.0f64;
                        let mut last_y = 0.0f64;
                        let mut tick = 0u32;
                        let widget_size = 110.0;

                        loop {
                            std::thread::sleep(std::time::Duration::from_millis(80));
                            tick = tick.wrapping_add(1);

                            // Reposition every ~480ms (every 6th tick)
                            // Follows the mouse to whichever screen it's on
                            #[cfg(target_os = "macos")]
                            if tick % 6 == 0 {
                                if let Some((x, y)) = get_widget_position(widget_size) {
                                    if (x - last_x).abs() > 2.0 || (y - last_y).abs() > 2.0 {
                                        if let Some(w) = hover_handle.get_webview_window("widget") {
                                            let _ = w.set_position(tauri::LogicalPosition::new(x, y));
                                        }
                                        last_x = x;
                                        last_y = y;
                                        WIDGET_CENTER.store_pos(x + widget_size / 2.0, y + widget_size / 2.0);
                                    }
                                }
                            }

                            // Hover detection every tick
                            let (cx, cy) = WIDGET_CENTER.load_pos();
                            if cx == 0.0 && cy == 0.0 { continue; }

                            let hovering = {
                                #[cfg(target_os = "macos")]
                                { is_mouse_near(cx, cy, 40.0) }
                                #[cfg(not(target_os = "macos"))]
                                { false }
                            };
                            let was = WAS_HOVERING.load(Ordering::Relaxed);
                            if hovering != was {
                                WAS_HOVERING.store(hovering, Ordering::Relaxed);
                                if let Some(w) = hover_handle.get_webview_window("widget") {
                                    let js = format!(
                                        "window.dispatchEvent(new CustomEvent('yapper-hover', {{detail: {}}}))",
                                        hovering
                                    );
                                    let _ = w.eval(&js);
                                }
                            }
                        }
                    });

                    // 2) Click detection — NSEvent global monitor (fires exactly once per click)
                    {
                        use block::ConcreteBlock;
                        use std::sync::atomic::{AtomicBool, Ordering};

                        // Store app handle in a static for the callback
                        static CLICK_READY: AtomicBool = AtomicBool::new(false);

                        let click_handle = app_handle.clone();

                        // We need to set up the monitor on the main thread
                        // Use a separate thread that dispatches to main
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            CLICK_READY.store(true, Ordering::Relaxed);

                            // Store the handle globally so the block can access it
                            unsafe {
                                GLOBAL_APP_HANDLE = Some(click_handle);
                            }

                            unsafe {
                                use objc::*;
                                // NSLeftMouseDownMask = 1 << 1
                                let mask: u64 = 1 << 1;

                                let block = ConcreteBlock::new(move |event: cocoa::base::id| {
                                    if !CLICK_READY.load(Ordering::Relaxed) { return; }

                                    // Get click location (screen coords, bottom-left origin)
                                    let loc: cocoa::foundation::NSPoint = msg_send![event, locationInWindow];
                                    // For global events, locationInWindow is actually screen location
                                    let (cx, cy) = WIDGET_CENTER.load_pos();
                                    if cx == 0.0 && cy == 0.0 { return; }

                                    // Get screen height for coordinate conversion
                                    let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
                                    let main_screen: cocoa::base::id = msg_send![screens, objectAtIndex: 0_usize];
                                    let frame: cocoa::foundation::NSRect = msg_send![main_screen, frame];
                                    let screen_height = frame.size.height;
                                    let cy_bl = screen_height - cy;

                                    let dx = loc.x - cx;
                                    let dy = loc.y - cy_bl;
                                    let dist = (dx * dx + dy * dy).sqrt();

                                    if dist <= 35.0 {
                                        // Click is on the widget — toggle recording
                                        if let Some(ref handle) = GLOBAL_APP_HANDLE {
                                            let h = handle.clone();
                                            tauri::async_runtime::spawn(async move {
                                                toggle_recording(&h).await;
                                            });
                                        }
                                    }
                                });
                                let block = block.copy();

                                let _monitor: cocoa::base::id = msg_send![
                                    class!(NSEvent),
                                    addGlobalMonitorForEventsMatchingMask: mask
                                    handler: &*block
                                ];

                                // Keep the block alive forever (leaked intentionally)
                                std::mem::forget(block);
                            }
                        });
                    }
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
