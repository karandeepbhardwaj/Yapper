use std::os::unix::fs::PermissionsExt;

/// Swift script that captures the full screen using ScreenCaptureKit and writes PNG bytes to stdout.
static SWIFT_CAPTURE_FULL: &str = r#"
import Cocoa
import ScreenCaptureKit

let semaphore = DispatchSemaphore(value: 0)
var capturedImage: CGImage?

Task {
    do {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
            fputs("No display found\n", stderr)
            exit(1)
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.capturesAudio = false
        config.showsCursor = false
        capturedImage = try await SCScreenshotManager.captureImage(
            contentFilter: filter,
            configuration: config
        )
        semaphore.signal()
    } catch {
        fputs("Capture error: \(error)\n", stderr)
        exit(1)
    }
}

semaphore.wait()

guard let cgImage = capturedImage else {
    fputs("No image captured\n", stderr)
    exit(1)
}
let bitmap = NSBitmapImageRep(cgImage: cgImage)
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Failed to encode PNG\n", stderr)
    exit(1)
}
FileHandle.standardOutput.write(png)
"#;

/// Swift script that captures a screen region using ScreenCaptureKit.
/// Arguments: x y width height
static SWIFT_CAPTURE_REGION: &str = r#"
import Cocoa
import ScreenCaptureKit

let args = CommandLine.arguments
guard args.count == 5,
      let rx = Int(args[1]),
      let ry = Int(args[2]),
      let rw = Int(args[3]),
      let rh = Int(args[4]) else {
    fputs("Usage: script x y width height\n", stderr)
    exit(1)
}

let semaphore = DispatchSemaphore(value: 0)
var capturedImage: CGImage?

Task {
    do {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
            fputs("No display found\n", stderr)
            exit(1)
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.capturesAudio = false
        config.showsCursor = false
        // Capture full screen then crop
        config.sourceRect = CGRect(x: rx, y: ry, width: rw, height: rh)
        capturedImage = try await SCScreenshotManager.captureImage(
            contentFilter: filter,
            configuration: config
        )
        semaphore.signal()
    } catch {
        fputs("Capture error: \(error)\n", stderr)
        exit(1)
    }
}

semaphore.wait()

guard let cgImage = capturedImage else {
    fputs("No image captured\n", stderr)
    exit(1)
}
let bitmap = NSBitmapImageRep(cgImage: cgImage)
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
