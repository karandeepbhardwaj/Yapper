use tauri::Emitter;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                // Toggle recording state
                // Check current state and toggle
                if let Err(e) = app.emit("hotkey-pressed", ()) {
                    log::error!("Failed to emit hotkey event: {}", e);
                }
            });
        }
    })?;

    Ok(())
}
