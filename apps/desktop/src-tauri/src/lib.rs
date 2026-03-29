#![allow(unexpected_cfgs)]

pub mod commands;
pub mod conversation;
pub mod store;
mod hotkey;
mod stt;
mod bridge;
mod autopaste;
mod history;
mod widget;
mod dictionary;
mod snippets;
mod metrics;

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
            hotkey::register(app)?;
            widget::setup(app);

            // Restore STT engine preference on Windows
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                if let Ok(path) = app.path().app_config_dir() {
                    let settings_path = path.join("settings.json");
                    if let Ok(data) = std::fs::read_to_string(&settings_path) {
                        if let Ok(settings) = serde_json::from_str::<commands::AppSettings>(&data) {
                            stt::windows::set_engine(settings.stt_engine == "modern");
                        }
                    }
                }
            }

            // Restore recording mode preference
            {
                use tauri::Manager;
                if let Ok(path) = app.path().app_config_dir() {
                    let settings_path = path.join("settings.json");
                    if let Ok(data) = std::fs::read_to_string(&settings_path) {
                        if let Ok(settings) = serde_json::from_str::<commands::AppSettings>(&data) {
                            commands::HOLD_MODE.store(
                                settings.recording_mode == "hold",
                                std::sync::atomic::Ordering::Relaxed,
                            );
                        }
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_recording,
            commands::stop_recording,
            commands::cancel_recording,
            commands::set_transcript,
            commands::get_history,
            commands::clear_history,
            commands::delete_history_item,
            commands::toggle_pin_item,
            commands::change_hotkey,
            commands::get_settings,
            commands::save_settings,
            commands::change_stt_engine,
            commands::change_recording_mode,
            commands::change_conversation_hotkey,
            commands::stop_recording_raw,
            commands::check_speech_permission,
            commands::debug_log,
            commands::open_main_window,
            commands::navigate_to,
            commands::paste_last_transcript,
            conversation::start_conversation,
            conversation::send_conversation_turn,
            conversation::end_conversation,
            conversation::is_conversation_active,
            conversation::discard_conversation,
            dictionary::get_all_entries,
            dictionary::add_entry,
            dictionary::update_entry,
            dictionary::delete_entry,
            dictionary::toggle_favorite,
            snippets::get_all_snippets,
            snippets::add_snippet,
            snippets::update_snippet,
            snippets::delete_snippet,
            snippets::toggle_snippet_favorite,
            metrics::get_metrics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
