use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Whether we're currently using the Fn key monitor (vs. standard global shortcut)
static USING_FN_KEY: AtomicBool = AtomicBool::new(false);

fn parse_hotkey(hotkey: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = hotkey.split('+').collect();
    if parts.len() < 2 {
        return Err(format!("Invalid hotkey (need modifier+key): {}", hotkey));
    }

    let mut modifiers = Modifiers::empty();
    for part in &parts[..parts.len() - 1] {
        match part.trim().to_lowercase().as_str() {
            "cmd" | "meta" | "super" => modifiers |= Modifiers::META,
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "alt" | "option" => modifiers |= Modifiers::ALT,
            "shift" => modifiers |= Modifiers::SHIFT,
            other => return Err(format!("Unknown modifier: {}", other)),
        }
    }

    if modifiers.is_empty() {
        return Err("Hotkey must have at least one modifier".to_string());
    }

    let key_str = parts.last().unwrap().trim();
    let code = parse_key_code(key_str)?;

    Ok(Shortcut::new(Some(modifiers), code))
}

fn parse_key_code(key: &str) -> Result<Code, String> {
    match key.to_lowercase().as_str() {
        "a" => Ok(Code::KeyA), "b" => Ok(Code::KeyB), "c" => Ok(Code::KeyC),
        "d" => Ok(Code::KeyD), "e" => Ok(Code::KeyE), "f" => Ok(Code::KeyF),
        "g" => Ok(Code::KeyG), "h" => Ok(Code::KeyH), "i" => Ok(Code::KeyI),
        "j" => Ok(Code::KeyJ), "k" => Ok(Code::KeyK), "l" => Ok(Code::KeyL),
        "m" => Ok(Code::KeyM), "n" => Ok(Code::KeyN), "o" => Ok(Code::KeyO),
        "p" => Ok(Code::KeyP), "q" => Ok(Code::KeyQ), "r" => Ok(Code::KeyR),
        "s" => Ok(Code::KeyS), "t" => Ok(Code::KeyT), "u" => Ok(Code::KeyU),
        "v" => Ok(Code::KeyV), "w" => Ok(Code::KeyW), "x" => Ok(Code::KeyX),
        "y" => Ok(Code::KeyY), "z" => Ok(Code::KeyZ),
        "0" => Ok(Code::Digit0), "1" => Ok(Code::Digit1), "2" => Ok(Code::Digit2),
        "3" => Ok(Code::Digit3), "4" => Ok(Code::Digit4), "5" => Ok(Code::Digit5),
        "6" => Ok(Code::Digit6), "7" => Ok(Code::Digit7), "8" => Ok(Code::Digit8),
        "9" => Ok(Code::Digit9),
        "." | "period" => Ok(Code::Period),
        "," | "comma" => Ok(Code::Comma),
        "/" | "slash" => Ok(Code::Slash),
        "\\" | "backslash" => Ok(Code::Backslash),
        ";" | "semicolon" => Ok(Code::Semicolon),
        "'" | "quote" => Ok(Code::Quote),
        "[" | "bracketleft" => Ok(Code::BracketLeft),
        "]" | "bracketright" => Ok(Code::BracketRight),
        "-" | "minus" => Ok(Code::Minus),
        "=" | "equal" => Ok(Code::Equal),
        "`" | "backquote" => Ok(Code::Backquote),
        "space" => Ok(Code::Space),
        "enter" | "return" => Ok(Code::Enter),
        "tab" => Ok(Code::Tab),
        "backspace" => Ok(Code::Backspace),
        "delete" => Ok(Code::Delete),
        "escape" | "esc" => Ok(Code::Escape),
        "up" | "arrowup" => Ok(Code::ArrowUp),
        "down" | "arrowdown" => Ok(Code::ArrowDown),
        "left" | "arrowleft" => Ok(Code::ArrowLeft),
        "right" | "arrowright" => Ok(Code::ArrowRight),
        "f1" => Ok(Code::F1), "f2" => Ok(Code::F2), "f3" => Ok(Code::F3),
        "f4" => Ok(Code::F4), "f5" => Ok(Code::F5), "f6" => Ok(Code::F6),
        "f7" => Ok(Code::F7), "f8" => Ok(Code::F8), "f9" => Ok(Code::F9),
        "f10" => Ok(Code::F10), "f11" => Ok(Code::F11), "f12" => Ok(Code::F12),
        other => Err(format!("Unknown key: {}", other)),
    }
}

fn is_fn_hotkey(hotkey: &str) -> bool {
    hotkey.trim().eq_ignore_ascii_case("fn")
}

fn recording_handler(app: &tauri::AppHandle, _shortcut: &Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent) {
    let hold_mode = crate::commands::HOLD_MODE.load(Ordering::Relaxed);
    if hold_mode {
        let app = app.clone();
        match event.state {
            ShortcutState::Pressed => {
                tauri::async_runtime::spawn(async move {
                    if crate::stt::get_state() == crate::stt::State::Idle {
                        let _ = crate::commands::start_recording(app).await;
                    }
                });
            }
            ShortcutState::Released => {
                tauri::async_runtime::spawn(async move {
                    if crate::stt::get_state() == crate::stt::State::Recording {
                        let _ = crate::commands::stop_recording(app).await;
                    }
                });
            }
        }
    } else if event.state == ShortcutState::Pressed {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            crate::commands::toggle_recording(&app).await;
        });
    }
}

fn conversation_handler(app: &tauri::AppHandle, _shortcut: &Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent) {
    if event.state == ShortcutState::Pressed {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if crate::conversation::is_active() {
                let _ = crate::conversation::end_conversation(app).await;
            } else {
                let _ = crate::commands::open_main_window(app.clone()).await;
                let _ = crate::commands::navigate_to(app, "conversation".to_string()).await;
            }
        });
    }
}

fn screen_capture_handler(app: &tauri::AppHandle, _shortcut: &Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent) {
    eprintln!("[Hotkey] screen_capture_handler called, state={:?}", event.state);
    if event.state == ShortcutState::Pressed {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            use tauri::Emitter;
            eprintln!("[Hotkey] Screen capture triggered, calling capture_screen...");
            if let Err(e) = crate::commands::capture_screen(
                app.clone(),
                "full".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            {
                log::error!("[Hotkey] Screen capture failed: {}", e);
                let _ = app.emit("stt-error", format!("Screen capture failed: {}", e));
            }
        });
    }
}

/// Register the initial hotkeys at app startup.
pub fn register(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let settings = load_saved_settings(app);
    let hotkey_str = settings.0;
    let convo_hotkey_str = settings.1;

    log::info!("[Hotkey] Registering: {}, conversation: {}", hotkey_str, convo_hotkey_str);

    if is_fn_hotkey(&hotkey_str) {
        start_fn_key_monitor(app.handle());
        USING_FN_KEY.store(true, Ordering::Relaxed);
        log::info!("[Hotkey] Fn key monitor started");
    } else {
        let default_shortcut = if cfg!(target_os = "macos") {
            Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::Period)
        } else {
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Period)
        };
        let shortcut = parse_hotkey(&hotkey_str).unwrap_or_else(|e| {
            log::warn!("[Hotkey] Failed to parse '{}': {}, using default", hotkey_str, e);
            default_shortcut
        });
        app.global_shortcut().on_shortcut(shortcut, recording_handler)?;
    }

    if let Ok(convo_shortcut) = parse_hotkey(&convo_hotkey_str) {
        app.global_shortcut().on_shortcut(convo_shortcut, conversation_handler).ok();
        log::info!("[Hotkey] Conversation shortcut registered: {}", convo_hotkey_str);
    }

    // Screen capture hotkey
    let sc_hotkey = load_saved_screen_capture_hotkey_app(app)
        .unwrap_or_else(|| if cfg!(target_os = "macos") { "Cmd+Shift+S".to_string() } else { "Ctrl+Shift+S".to_string() });
    eprintln!("[Hotkey] Registering screen capture hotkey: {}", sc_hotkey);
    match parse_hotkey(&sc_hotkey) {
        Ok(sc_shortcut) => {
            match app.global_shortcut().on_shortcut(sc_shortcut, screen_capture_handler) {
                Ok(_) => eprintln!("[Hotkey] Screen capture shortcut registered OK: {}", sc_hotkey),
                Err(e) => eprintln!("[Hotkey] FAILED to register screen capture shortcut: {}", e),
            }
        }
        Err(e) => eprintln!("[Hotkey] FAILED to parse screen capture hotkey '{}': {}", sc_hotkey, e),
    }

    eprintln!("[Hotkey] All shortcuts registered");
    Ok(())
}

/// Re-register the recording shortcut at runtime when the user changes it.
pub fn update(app: &tauri::AppHandle, new_hotkey: &str) -> Result<(), String> {
    if USING_FN_KEY.load(Ordering::Relaxed) {
        stop_fn_key_monitor();
        USING_FN_KEY.store(false, Ordering::Relaxed);
    }

    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;

    if is_fn_hotkey(new_hotkey) {
        start_fn_key_monitor(app);
        USING_FN_KEY.store(true, Ordering::Relaxed);
    } else {
        let new_shortcut = parse_hotkey(new_hotkey)?;
        app.global_shortcut().on_shortcut(new_shortcut, recording_handler).map_err(|e| e.to_string())?;
    }

    // Re-register conversation hotkey
    let convo_hotkey = load_saved_conversation_hotkey(app)
        .unwrap_or_else(|| if cfg!(target_os = "macos") { "Cmd+Shift+Y".to_string() } else { "Ctrl+Shift+Y".to_string() });
    if let Ok(convo_shortcut) = parse_hotkey(&convo_hotkey) {
        app.global_shortcut().on_shortcut(convo_shortcut, conversation_handler).ok();
    }

    // Re-register screen capture hotkey
    let sc_hotkey = load_saved_screen_capture_hotkey(app)
        .unwrap_or_else(|| if cfg!(target_os = "macos") { "Cmd+Shift+S".to_string() } else { "Ctrl+Shift+S".to_string() });
    if let Ok(sc_shortcut) = parse_hotkey(&sc_hotkey) {
        app.global_shortcut().on_shortcut(sc_shortcut, screen_capture_handler).ok();
    }

    Ok(())
}

/// Re-register the conversation shortcut at runtime when user changes it.
pub fn update_conversation(app: &tauri::AppHandle, new_convo_hotkey: &str) -> Result<(), String> {
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;

    // Re-register main recording hotkey
    let main_hotkey = load_saved_main_hotkey(app)
        .unwrap_or_else(|| if cfg!(target_os = "macos") { "Cmd+Shift+.".to_string() } else { "Ctrl+Shift+.".to_string() });

    if USING_FN_KEY.load(Ordering::Relaxed) || is_fn_hotkey(&main_hotkey) {
        if !USING_FN_KEY.load(Ordering::Relaxed) {
            start_fn_key_monitor(app);
            USING_FN_KEY.store(true, Ordering::Relaxed);
        }
    } else {
        let shortcut = parse_hotkey(&main_hotkey).map_err(|e| e.to_string())?;
        app.global_shortcut().on_shortcut(shortcut, recording_handler).map_err(|e| e.to_string())?;
    }

    let convo_shortcut = parse_hotkey(new_convo_hotkey)?;
    app.global_shortcut().on_shortcut(convo_shortcut, conversation_handler).map_err(|e| e.to_string())?;

    // Re-register screen capture hotkey
    let sc_hotkey = load_saved_screen_capture_hotkey(app)
        .unwrap_or_else(|| if cfg!(target_os = "macos") { "Cmd+Shift+S".to_string() } else { "Ctrl+Shift+S".to_string() });
    if let Ok(sc_shortcut) = parse_hotkey(&sc_hotkey) {
        app.global_shortcut().on_shortcut(sc_shortcut, screen_capture_handler).ok();
    }

    Ok(())
}

fn load_saved_settings(app: &tauri::App) -> (String, String) {
    let default_hotkey = if cfg!(target_os = "macos") { "Cmd+Shift+." } else { "Ctrl+Shift+." };
    let default_convo = if cfg!(target_os = "macos") { "Cmd+Shift+Y" } else { "Ctrl+Shift+Y" };

    let path = match app.path().app_config_dir() {
        Ok(p) => p.join("settings.json"),
        Err(_) => return (default_hotkey.to_string(), default_convo.to_string()),
    };
    let data = match std::fs::read_to_string(&path) {
        Ok(d) => d,
        Err(_) => return (default_hotkey.to_string(), default_convo.to_string()),
    };
    let settings: serde_json::Value = match serde_json::from_str(&data) {
        Ok(v) => v,
        Err(_) => return (default_hotkey.to_string(), default_convo.to_string()),
    };

    let hotkey = settings.get("hotkey")
        .and_then(|v| v.as_str())
        .unwrap_or(default_hotkey)
        .to_string();
    let convo = settings.get("conversation_hotkey")
        .and_then(|v| v.as_str())
        .unwrap_or(default_convo)
        .to_string();

    (hotkey, convo)
}

fn load_saved_main_hotkey(app: &tauri::AppHandle) -> Option<String> {
    let path = app.path().app_config_dir().ok()?.join("settings.json");
    let data = std::fs::read_to_string(path).ok()?;
    let settings: serde_json::Value = serde_json::from_str(&data).ok()?;
    settings.get("hotkey")?.as_str().map(|s| s.to_string())
}

fn load_saved_conversation_hotkey(app: &tauri::AppHandle) -> Option<String> {
    let path = app.path().app_config_dir().ok()?.join("settings.json");
    let data = std::fs::read_to_string(path).ok()?;
    let settings: serde_json::Value = serde_json::from_str(&data).ok()?;
    settings.get("conversation_hotkey")?.as_str().map(|s| s.to_string())
}

fn load_saved_screen_capture_hotkey(app: &tauri::AppHandle) -> Option<String> {
    let path = app.path().app_config_dir().ok()?.join("settings.json");
    let data = std::fs::read_to_string(path).ok()?;
    let settings: serde_json::Value = serde_json::from_str(&data).ok()?;
    settings.get("screen_capture_hotkey")?.as_str().map(|s| s.to_string())
}

fn load_saved_screen_capture_hotkey_app(app: &tauri::App) -> Option<String> {
    use tauri::Manager;
    let path = app.path().app_config_dir().ok()?.join("settings.json");
    let data = std::fs::read_to_string(path).ok()?;
    let settings: serde_json::Value = serde_json::from_str(&data).ok()?;
    settings.get("screen_capture_hotkey")?.as_str().map(|s| s.to_string())
}

// --- Fn key monitoring via NSEvent flagsChanged ---

/// Whether the Fn key monitor should fire toggle_recording.
static FN_MONITOR_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Store the AppHandle globally for the Fn key callback.
static FN_APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);

#[cfg(target_os = "macos")]
fn start_fn_key_monitor(app: &tauri::AppHandle) {
    use std::ptr::NonNull;
    use objc2_app_kit::{NSEvent, NSEventMask};
    use block2::RcBlock;

    FN_MONITOR_ACTIVE.store(true, Ordering::Relaxed);
    let handle = app.clone();

    std::thread::spawn(move || {
        {
            let mut guard = FN_APP_HANDLE.lock().unwrap();
            *guard = Some(handle);
        }

        let mask = NSEventMask::FlagsChanged;

        fn handle_fn_event(event: &NSEvent) {
            if !FN_MONITOR_ACTIVE.load(Ordering::Relaxed) {
                return;
            }

            static FN_WAS_DOWN: AtomicBool = AtomicBool::new(false);

            let flags = event.modifierFlags();
            let raw_flags: usize = unsafe { std::mem::transmute(flags) };
            let fn_down = (raw_flags & (1 << 23)) != 0;
            let was_down = FN_WAS_DOWN.swap(fn_down, Ordering::Relaxed);

            // Shift=17, Ctrl=18, Alt=19, Cmd=20
            let other_mods = raw_flags & ((1 << 17) | (1 << 18) | (1 << 19) | (1 << 20));

            if fn_down && !was_down && other_mods == 0 {
                let hold_mode = crate::commands::HOLD_MODE.load(Ordering::Relaxed);
                let guard = FN_APP_HANDLE.lock().unwrap();
                if let Some(ref handle) = *guard {
                    let h = handle.clone();
                    if hold_mode {
                        tauri::async_runtime::spawn(async move {
                            if crate::stt::get_state() == crate::stt::State::Idle {
                                let _ = crate::commands::start_recording(h).await;
                            }
                        });
                    } else {
                        tauri::async_runtime::spawn(async move {
                            crate::commands::toggle_recording(&h).await;
                        });
                    }
                }
            }

            if !fn_down && was_down && other_mods == 0 {
                let hold_mode = crate::commands::HOLD_MODE.load(Ordering::Relaxed);
                if hold_mode {
                    if let Ok(guard) = FN_APP_HANDLE.lock() {
                        if let Some(ref handle) = *guard {
                            let h = handle.clone();
                            tauri::async_runtime::spawn(async move {
                                if crate::stt::get_state() == crate::stt::State::Recording {
                                    let _ = crate::commands::stop_recording(h).await;
                                }
                            });
                        }
                    }
                }
            }
        }

        // Global monitor
        let global_block = RcBlock::new(|event: NonNull<NSEvent>| {
            handle_fn_event(unsafe { event.as_ref() });
        });

        let _monitor = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &global_block);
        std::mem::forget(global_block);
        if let Some(m) = _monitor {
            std::mem::forget(m);
        }

        // Local monitor
        let local_block: RcBlock<dyn Fn(NonNull<NSEvent>) -> *mut NSEvent> =
            RcBlock::new(|event: NonNull<NSEvent>| {
                handle_fn_event(unsafe { event.as_ref() });
                event.as_ptr() as *mut NSEvent
            });

        let _local_monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &local_block) };
        std::mem::forget(local_block);
        if let Some(m) = _local_monitor {
            std::mem::forget(m);
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn start_fn_key_monitor(_app: &tauri::AppHandle) {
    // Fn key monitoring only supported on macOS
}

fn stop_fn_key_monitor() {
    FN_MONITOR_ACTIVE.store(false, Ordering::Relaxed);
}
