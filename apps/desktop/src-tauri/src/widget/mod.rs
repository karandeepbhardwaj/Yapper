#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
mod windows;

pub fn setup(app: &tauri::App) {
    #[cfg(target_os = "macos")]
    macos::setup(app);
    #[cfg(not(target_os = "macos"))]
    windows::setup(app);
}
