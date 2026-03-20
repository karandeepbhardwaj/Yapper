#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use std::sync::atomic::{AtomicBool, Ordering};

static IS_RECORDING: AtomicBool = AtomicBool::new(false);

pub async fn start(app: &tauri::AppHandle) -> Result<(), String> {
    if IS_RECORDING.swap(true, Ordering::SeqCst) {
        return Err("Already recording".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        macos::start_recognition(app).await
    }

    #[cfg(target_os = "windows")]
    {
        windows::start_recognition(app).await
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        Err("Speech recognition not available on this platform".to_string())
    }
}

pub async fn stop() -> Result<String, String> {
    if !IS_RECORDING.swap(false, Ordering::SeqCst) {
        return Err("Not recording".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        macos::stop_recognition().await
    }

    #[cfg(target_os = "windows")]
    {
        windows::stop_recognition().await
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Speech recognition not available on this platform".to_string())
    }
}
