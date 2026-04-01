use crate::providers::VisionProvider;

pub struct NativeOcrProvider;

impl NativeOcrProvider {
    pub fn new() -> Self {
        Self
    }
}

impl VisionProvider for NativeOcrProvider {
    fn analyze(&self, image_bytes: &[u8], _prompt: &str) -> Result<String, String> {
        self.ocr(image_bytes)
    }

    fn ocr(&self, image_bytes: &[u8]) -> Result<String, String> {
        platform_ocr(image_bytes)
    }

    fn supports_ai_analysis(&self) -> bool {
        false
    }
}

#[cfg(target_os = "macos")]
fn platform_ocr(image_bytes: &[u8]) -> Result<String, String> {
    use std::io::Write;
    use std::process::Command;

    let swift_code = r#"
import Foundation
import Vision
import AppKit

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let image = NSImage(data: data),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Failed to create image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try! handler.perform([request])

var results: [String] = []
if let observations = request.results {
    for observation in observations {
        if let candidate = observation.topCandidates(1).first {
            results.append(candidate.string)
        }
    }
}

print(results.joined(separator: "\n"))
"#;

    let tmp = tempfile::Builder::new()
        .suffix(".swift")
        .tempfile()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    std::fs::write(tmp.path(), swift_code)
        .map_err(|e| format!("Failed to write Swift script: {}", e))?;

    let mut child = Command::new("swift")
        .arg(tmp.path())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Swift: {}", e))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(image_bytes)
            .map_err(|e| format!("Failed to write image data: {}", e))?;
    }
    // Must drop stdin before waiting for output
    drop(child.stdin.take());

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Swift process failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn platform_ocr(_image_bytes: &[u8]) -> Result<String, String> {
    Err("OCR not yet implemented on Windows".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_ocr(_image_bytes: &[u8]) -> Result<String, String> {
    Err("OCR not supported on this platform".to_string())
}
