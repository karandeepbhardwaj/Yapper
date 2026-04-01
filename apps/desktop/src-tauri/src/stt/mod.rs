#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

use std::sync::Mutex;
use once_cell::sync::Lazy;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum State {
    Idle,
    Recording,
    Processing,
}

static STATE: Lazy<Mutex<State>> = Lazy::new(|| Mutex::new(State::Idle));

pub fn get_state() -> State {
    *STATE.lock().unwrap()
}

pub fn set_state(new: State) {
    *STATE.lock().unwrap() = new;
}

/// Try to transition from expected → new. Returns true if successful.
pub fn transition(expected: State, new: State) -> bool {
    let mut state = STATE.lock().unwrap();
    if *state == expected {
        *state = new;
        true
    } else {
        false
    }
}

/// Kill any lingering recorder subprocess on app shutdown.
#[cfg(target_os = "macos")]
pub fn cleanup() {
    macos::cleanup();
}

pub async fn start(app: &tauri::AppHandle) -> Result<(), String> {
    if !transition(State::Idle, State::Recording) {
        return Err("Not idle".to_string());
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
    if !transition(State::Recording, State::Processing) {
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

/// Direct platform STT start (no state management). Used by NativeOsProvider.
pub fn platform_start(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let app = app.clone();
        tokio::runtime::Handle::current().block_on(macos::start_recognition(&app))
    }
    #[cfg(target_os = "windows")]
    {
        let app = app.clone();
        tokio::runtime::Handle::current().block_on(windows::start_recognition(&app))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("STT not supported on this platform".to_string())
}

/// Direct platform STT stop (no state management). Used by NativeOsProvider.
pub fn platform_stop() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        tokio::runtime::Handle::current().block_on(macos::stop_recognition())
    }
    #[cfg(target_os = "windows")]
    {
        tokio::runtime::Handle::current().block_on(windows::stop_recognition())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("STT not supported on this platform".to_string())
}

/// Direct platform cleanup. Used by NativeOsProvider.
pub fn platform_cleanup() {
    #[cfg(target_os = "macos")]
    macos::cleanup();
}
