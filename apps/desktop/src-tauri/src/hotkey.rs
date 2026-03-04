use tauri::Emitter;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::Period);

    app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let app = app.clone();

            tauri::async_runtime::spawn(async move {
                let current = crate::stt::get_state();

                match current {
                    crate::stt::State::Idle => {
                        app.emit("stt-state-changed", "listening").ok();
                        if let Err(_e) = crate::stt::start(&app).await {
                            crate::stt::set_state(crate::stt::State::Idle);
                            app.emit("stt-state-changed", "idle").ok();
                        }
                    }
                    crate::stt::State::Recording => {
                        app.emit("stt-state-changed", "processing").ok();

                        let raw_transcript = match crate::stt::stop().await {
                            Ok(t) => t,
                            Err(_e) => {
                                crate::stt::set_state(crate::stt::State::Idle);
                                app.emit("stt-state-changed", "idle").ok();
                                return;
                            }
                        };

                        let bridge_result = crate::bridge::refine_text(&raw_transcript).await;
                        let (refined_text, category, title) = match bridge_result {
                            Ok(r) => (r.refined_text, r.category, r.title),
                            Err(_) => (raw_transcript.clone(), None, None),
                        };

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
                        });

                        let _ = crate::history::add_entry(&app, &raw_transcript, &refined_text);

                        #[derive(Clone, serde::Serialize)]
                        struct HotkeyResult {
                            #[serde(rename = "rawTranscript")]
                            raw_transcript: String,
                            #[serde(rename = "refinedText")]
                            refined_text: String,
                            category: Option<String>,
                            title: Option<String>,
                        }

                        app.emit("refinement-complete", HotkeyResult {
                            raw_transcript,
                            refined_text,
                            category,
                            title,
                        }).ok();

                        crate::stt::set_state(crate::stt::State::Idle);
                        app.emit("stt-state-changed", "idle").ok();
                    }
                    crate::stt::State::Processing => {}
                }
            });
        }
    })?;

    Ok(())
}
