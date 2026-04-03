use std::os::unix::fs::PermissionsExt;

/// Swift script that captures the full screen and writes PNG bytes to stdout.
static SWIFT_CAPTURE_FULL: &str = r#"
import Cocoa
let displayID = CGMainDisplayID()
guard let screenshot = CGDisplayCreateImage(displayID) else {
    fputs("Failed to capture screen\n", stderr)
    exit(1)
}
let bitmap = NSBitmapImageRep(cgImage: screenshot)
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Failed to encode PNG\n", stderr)
    exit(1)
}
FileHandle.standardOutput.write(png)
"#;

/// Swift script that captures a screen region and writes PNG bytes to stdout.
/// Arguments: x y width height
static SWIFT_CAPTURE_REGION: &str = r#"
import Cocoa
let args = CommandLine.arguments
guard args.count == 5,
      let x = Double(args[1]),
      let y = Double(args[2]),
      let w = Double(args[3]),
      let h = Double(args[4]) else {
    fputs("Usage: script x y width height\n", stderr)
    exit(1)
}
let displayID = CGMainDisplayID()
let displayHeight = Double(CGDisplayPixelsHigh(displayID))
// CoreGraphics origin is bottom-left; flip y for top-left coordinate input
let cgY = displayHeight - y - h
let rect = CGRect(x: x, y: cgY, width: w, height: h)
guard let screenshot = CGDisplayCreateImage(displayID, rect: rect) else {
    fputs("Failed to capture region\n", stderr)
    exit(1)
}
let bitmap = NSBitmapImageRep(cgImage: screenshot)
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Failed to encode PNG\n", stderr)
    exit(1)
}
FileHandle.standardOutput.write(png)
"#;

/// Write a Swift script to a temp file with restricted permissions and return its path.
fn write_temp_swift(prefix: &str, content: &str) -> Result<std::path::PathBuf, String> {
    let temp_file = tempfile::Builder::new()
        .prefix(prefix)
        .suffix(".swift")
        .tempfile_in("/tmp")
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let (_, path) = temp_file
        .keep()
        .map_err(|e| format!("Failed to persist temp file: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("Failed to set permissions: {}", e))?;

    Ok(path)
}

/// Run a Swift script and return its stdout as bytes.
fn run_swift_script(script_path: &std::path::Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut cmd = std::process::Command::new("swift");
    cmd.arg(script_path);
    for arg in args {
        cmd.arg(arg);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run swift: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Swift capture failed: {}", stderr.trim()));
    }

    if output.stdout.is_empty() {
        return Err("Swift capture produced no output".to_string());
    }

    Ok(output.stdout)
}

pub fn capture_full_screen() -> Result<Vec<u8>, String> {
    let script_path = write_temp_swift("yapper_capture_full_", SWIFT_CAPTURE_FULL)?;
    let result = run_swift_script(&script_path, &[]);
    let _ = std::fs::remove_file(&script_path);
    result
}

pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let script_path = write_temp_swift("yapper_capture_region_", SWIFT_CAPTURE_REGION)?;
    let x_str = x.to_string();
    let y_str = y.to_string();
    let w_str = width.to_string();
    let h_str = height.to_string();
    let result = run_swift_script(&script_path, &[&x_str, &y_str, &w_str, &h_str]);
    let _ = std::fs::remove_file(&script_path);
    result
}
