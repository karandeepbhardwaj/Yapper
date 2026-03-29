use serde::{Serialize, de::DeserializeOwned};
use tauri::Manager;
use std::path::PathBuf;

pub fn data_path(app: &tauri::AppHandle, filename: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(filename))
}

pub fn load<T: DeserializeOwned + Default>(app: &tauri::AppHandle, filename: &str) -> Result<Vec<T>, String> {
    let path = data_path(app, filename)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

/// Atomic save: write to temp file, then rename
pub fn save<T: Serialize>(app: &tauri::AppHandle, filename: &str, items: &[T]) -> Result<(), String> {
    let path = data_path(app, filename)?;
    let tmp_path = path.with_extension("json.tmp");
    let data = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
    std::fs::write(&tmp_path, &data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| {
        // Clean up temp file on rename failure
        let _ = std::fs::remove_file(&tmp_path);
        e.to_string()
    })
}

pub fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}-{:x}", nanos, count)
}
