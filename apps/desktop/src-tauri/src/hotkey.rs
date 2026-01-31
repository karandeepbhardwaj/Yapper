use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::Period);

    app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::toggle_recording(&app).await;
            });
        }
    })?;

    Ok(())
}
