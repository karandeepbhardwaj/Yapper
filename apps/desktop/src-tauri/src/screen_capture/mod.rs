#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

pub fn capture_full_screen() -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    { macos::capture_full_screen() }
    #[cfg(target_os = "windows")]
    { windows::capture_full_screen() }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("Screen capture not supported on this platform".to_string())
}

pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    { macos::capture_region(x, y, width, height) }
    #[cfg(target_os = "windows")]
    { windows::capture_region(x, y, width, height) }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("Screen capture not supported on this platform".to_string())
}
