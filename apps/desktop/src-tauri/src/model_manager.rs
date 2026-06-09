use std::path::PathBuf;
use tauri::Manager;

/// The single Whisper model bundled with the app (ggml-base.bin).
pub const BUNDLED_MODEL: &str = "base";

fn model_filename(model_name: &str) -> String {
    format!("ggml-{}.bin", model_name)
}

/// Legacy per-user models directory (e.g. a model downloaded by an older build).
pub fn models_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot find home directory");
    home.join(".yapper").join("models")
}

/// Resolve the on-disk path to the Whisper model.
///
/// Prefers the model bundled in the app's resources (shipped with the app, so
/// the app works offline with no download). Falls back to a per-user copy under
/// `~/.yapper/models` for backwards compatibility with older installs.
pub fn resolve_model_path(app: &tauri::AppHandle, model_name: &str) -> Option<PathBuf> {
    let filename = model_filename(model_name);

    // 1. Bundled resource (read-only, shipped inside the app).
    if let Ok(res_dir) = app.path().resource_dir() {
        let bundled = res_dir.join("resources").join("models").join(&filename);
        if bundled.exists() {
            return Some(bundled);
        }
    }

    // 2. Legacy per-user copy.
    let user = models_dir().join(&filename);
    if user.exists() {
        return Some(user);
    }

    None
}
