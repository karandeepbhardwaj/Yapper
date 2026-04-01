use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;

static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_PROGRESS: Mutex<Option<DownloadProgress>> = Mutex::new(None);

#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub model: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelStatus {
    pub available_models: Vec<ModelInfo>,
    pub current_model: Option<String>,
    pub is_downloading: bool,
    pub download_progress: Option<DownloadProgress>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub description: String,
    pub downloaded: bool,
}

const MODELS: &[(&str, u64, &str, &str)] = &[
    ("tiny", 75_000_000, "75 MB", "Fastest, decent accuracy"),
    ("base", 150_000_000, "150 MB", "Good balance of speed and accuracy"),
    ("small", 500_000_000, "500 MB", "Great accuracy, moderate speed"),
    ("medium", 1_500_000_000, "1.5 GB", "Excellent accuracy, slower"),
    ("large-v3", 3_000_000_000, "3 GB", "Best accuracy, slowest"),
];

pub fn models_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot find home directory");
    home.join(".yapper").join("models")
}

pub fn model_path(model_name: &str) -> PathBuf {
    models_dir().join(format!("ggml-{}.bin", model_name))
}

pub fn is_model_downloaded(model_name: &str) -> bool {
    model_path(model_name).exists()
}

pub fn get_available_model(configured: &str) -> Option<PathBuf> {
    let path = model_path(configured);
    if path.exists() { Some(path) } else { None }
}

pub fn get_status(current_model: &str) -> ModelStatus {
    let available_models = MODELS
        .iter()
        .map(|(name, size, display, desc)| ModelInfo {
            name: name.to_string(),
            size_bytes: *size,
            size_display: display.to_string(),
            description: desc.to_string(),
            downloaded: is_model_downloaded(name),
        })
        .collect();

    let current = if is_model_downloaded(current_model) {
        Some(current_model.to_string())
    } else {
        None
    };

    ModelStatus {
        available_models,
        current_model: current,
        is_downloading: DOWNLOADING.load(Ordering::Relaxed),
        download_progress: DOWNLOAD_PROGRESS.lock().unwrap().clone(),
    }
}

pub fn download_model(model_name: &str, app: &tauri::AppHandle) -> Result<(), String> {
    if DOWNLOADING.load(Ordering::Relaxed) {
        return Err("A download is already in progress".to_string());
    }

    let valid = MODELS.iter().any(|(n, _, _, _)| *n == model_name);
    if !valid {
        return Err(format!("Unknown model: {}", model_name));
    }

    DOWNLOADING.store(true, Ordering::Relaxed);

    let dir = models_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create models dir: {}", e))?;

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin",
        model_name
    );

    let dest = model_path(model_name);
    let tmp_dest = dest.with_extension("bin.tmp");

    let result = (|| -> Result<(), String> {
        let resp = ureq::get(&url)
            .call()
            .map_err(|e| format!("Download failed: {}", e))?;

        let total_bytes = resp
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);

        let mut reader = resp.into_body().into_reader();
        let mut file = fs::File::create(&tmp_dest)
            .map_err(|e| format!("Failed to create temp file: {}", e))?;

        let mut downloaded: u64 = 0;
        let mut buf = [0u8; 65536];
        let mut last_emit: u64 = 0;

        loop {
            let n = reader.read(&mut buf).map_err(|e| format!("Read error: {}", e))?;
            if n == 0 { break; }
            file.write_all(&buf[..n]).map_err(|e| format!("Write error: {}", e))?;
            downloaded += n as u64;

            if downloaded - last_emit > 1_000_000 || downloaded == total_bytes {
                last_emit = downloaded;
                let percent = if total_bytes > 0 {
                    (downloaded as f64 / total_bytes as f64) * 100.0
                } else { 0.0 };
                let progress = DownloadProgress {
                    model: model_name.to_string(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    percent,
                };
                *DOWNLOAD_PROGRESS.lock().unwrap() = Some(progress.clone());
                let _ = app.emit("model-download-progress", &progress);
            }
        }

        file.flush().map_err(|e| format!("Flush error: {}", e))?;
        drop(file);
        fs::rename(&tmp_dest, &dest).map_err(|e| format!("Failed to finalize download: {}", e))?;
        Ok(())
    })();

    DOWNLOADING.store(false, Ordering::Relaxed);
    *DOWNLOAD_PROGRESS.lock().unwrap() = None;

    if let Err(ref e) = result {
        let _ = fs::remove_file(&tmp_dest);
        let _ = app.emit("model-download-error", e.to_string());
    } else {
        let _ = app.emit("model-download-complete", model_name);
    }

    result
}

pub fn delete_model(model_name: &str) -> Result<(), String> {
    let path = model_path(model_name);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete model: {}", e))?;
    }
    Ok(())
}
