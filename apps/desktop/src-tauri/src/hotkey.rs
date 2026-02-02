use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use std::sync::atomic::{AtomicBool, Ordering};

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

/// Register the initial hotkey at app startup. Loads from saved settings if available.
pub fn register(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let hotkey_str = load_saved_hotkey(app).unwrap_or_else(|| "Cmd+Shift+.".to_string());

    if is_fn_hotkey(&hotkey_str) {
        start_fn_key_monitor(app.handle());
        USING_FN_KEY.store(true, Ordering::Relaxed);
    } else {
        let shortcut = parse_hotkey(&hotkey_str).unwrap_or_else(|_| {
            Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::Period)
        });

        app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    crate::toggle_recording(&app).await;
                });
            }
        })?;
    }

    Ok(())
}

/// Re-register the global shortcut at runtime when the user changes it.
pub fn update(app: &tauri::AppHandle, new_hotkey: &str) -> Result<(), String> {
    // Stop Fn key monitor if it was active
    if USING_FN_KEY.load(Ordering::Relaxed) {
        stop_fn_key_monitor();
        USING_FN_KEY.store(false, Ordering::Relaxed);
    }

    // Unregister all standard shortcuts
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;

    if is_fn_hotkey(new_hotkey) {
        start_fn_key_monitor(app);
        USING_FN_KEY.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        let new_shortcut = parse_hotkey(new_hotkey)?;
        app.global_shortcut().on_shortcut(new_shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    crate::toggle_recording(&app).await;
                });
            }
        }).map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn load_saved_hotkey(app: &tauri::App) -> Option<String> {
    let path = app.path().app_config_dir().ok()?.join("settings.json");
    let data = std::fs::read_to_string(path).ok()?;
    let settings: serde_json::Value = serde_json::from_str(&data).ok()?;
    settings.get("hotkey")?.as_str().map(|s| s.to_string())
}

// --- Fn key monitoring via NSEvent flagsChanged ---

/// Whether the Fn key monitor should fire toggle_recording.
/// Set to false to disable without removing the monitor.
static FN_MONITOR_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Store the AppHandle globally for the Fn key callback (same pattern as widget click).
static mut FN_APP_HANDLE: Option<tauri::AppHandle> = None;

#[cfg(target_os = "macos")]
fn start_fn_key_monitor(app: &tauri::AppHandle) {
    FN_MONITOR_ACTIVE.store(true, Ordering::Relaxed);
    let handle = app.clone();

    std::thread::spawn(move || {
        unsafe {
            FN_APP_HANDLE = Some(handle);
        }

        unsafe {
            use objc::*;
            use block::ConcreteBlock;

            // NSFlagsChangedMask = 1 << 12 (NSEventTypeFlagsChanged)
            let mask: u64 = 1 << 12;

            // Shared logic for handling Fn flagsChanged events
            fn handle_fn_event(event: cocoa::base::id) {
                unsafe {
                    use objc::*;
                    if !FN_MONITOR_ACTIVE.load(Ordering::Relaxed) {
                        return;
                    }

                    static FN_WAS_DOWN: AtomicBool = AtomicBool::new(false);

                    // NSEventModifierFlagFunction = 1 << 23
                    let flags: u64 = msg_send![event, modifierFlags];
                    let fn_down = (flags & (1 << 23)) != 0;
                    let was_down = FN_WAS_DOWN.swap(fn_down, Ordering::Relaxed);

                    // Shift=17, Ctrl=18, Alt=19, Cmd=20
                    let other_mods = flags & ((1 << 17) | (1 << 18) | (1 << 19) | (1 << 20));

                    // Fire on Fn key DOWN only, with no other modifiers held
                    if fn_down && !was_down && other_mods == 0 {
                        if let Some(ref handle) = FN_APP_HANDLE {
                            let h = handle.clone();
                            tauri::async_runtime::spawn(async move {
                                crate::toggle_recording(&h).await;
                            });
                        }
                    }
                }
            }

            // Global monitor: block returns void
            let global_block = ConcreteBlock::new(move |event: cocoa::base::id| {
                handle_fn_event(event);
            });
            let global_block = global_block.copy();

            let _monitor: cocoa::base::id = msg_send![
                class!(NSEvent),
                addGlobalMonitorForEventsMatchingMask: mask
                handler: &*global_block
            ];
            std::mem::forget(global_block);

            // Local monitor: block MUST return NSEvent* (the event to pass through)
            let local_block = ConcreteBlock::new(move |event: cocoa::base::id| -> cocoa::base::id {
                handle_fn_event(event);
                event // pass the event through
            });
            let local_block = local_block.copy();

            let _local_monitor: cocoa::base::id = msg_send![
                class!(NSEvent),
                addLocalMonitorForEventsMatchingMask: mask
                handler: &*local_block
            ];
            std::mem::forget(local_block);
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
