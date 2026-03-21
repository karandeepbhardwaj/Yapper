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

                        let refined_text = crate::bridge::refine_text(&raw_transcript)
                            .await
                            .unwrap_or_else(|_| raw_transcript.clone());

                        let text_for_paste = refined_text.clone();
                        std::thread::spawn(move || {
                            #[cfg(target_os = "macos")]
                            {
                                use std::process::Command;
                                // Set clipboard
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
                                // Small delay then activate the frontmost app and paste
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
                        struct RefinementResult {
                            #[serde(rename = "rawTranscript")]
                            raw_transcript: String,
                            #[serde(rename = "refinedText")]
                            refined_text: String,
                        }

                        app.emit("refinement-complete", RefinementResult {
                            raw_transcript,
                            refined_text,
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
