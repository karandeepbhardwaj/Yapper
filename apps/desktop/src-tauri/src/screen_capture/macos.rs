use std::process::Command;

pub fn capture_full_screen() -> Result<Vec<u8>, String> {
    let tmp = tempfile::Builder::new()
        .prefix("yapper_capture_")
        .suffix(".png")
        .tempfile()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let path = tmp.path().to_string_lossy().to_string();

    // Use macOS built-in screencapture tool
    // -x: no sound, -C: capture cursor, -T0: no delay
    let output = Command::new("screencapture")
        .args(&["-x", "-T0", &path])
        .output()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("screencapture failed: {}", stderr.trim()));
    }

    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Failed to read screenshot: {}", e))?;

    if bytes.is_empty() {
        return Err("screencapture produced empty file".to_string());
    }

    eprintln!("[ScreenCapture] Full screen captured: {} bytes", bytes.len());
    Ok(bytes)
}

pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let tmp = tempfile::Builder::new()
        .prefix("yapper_capture_region_")
        .suffix(".png")
        .tempfile()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let path = tmp.path().to_string_lossy().to_string();

    // -R x,y,w,h: capture specific region
    let rect = format!("{},{},{},{}", x, y, width, height);
    let output = Command::new("screencapture")
        .args(&["-x", "-R", &rect, &path])
        .output()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("screencapture region failed: {}", stderr.trim()));
    }

    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Failed to read screenshot: {}", e))?;

    if bytes.is_empty() {
        return Err("screencapture produced empty file".to_string());
    }

    eprintln!("[ScreenCapture] Region captured: {} bytes", bytes.len());
    Ok(bytes)
}
