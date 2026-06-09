//! Bundled Ollama server lifecycle.
//!
//! Yapper ships its own Ollama binary + a small refinement model, so the app
//! refines transcripts fully offline with no user setup. The server is started
//! on a private port (never the default 11434) so it can't collide with a
//! user's own Ollama install, and is killed when the app exits.

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

/// Address the bundled Ollama server listens on. Deliberately NOT 11434 so it
/// never collides with a separately-installed Ollama.
pub const OLLAMA_HOST: &str = "127.0.0.1:11435";

/// The single refinement model bundled with the app.
pub const MODEL: &str = "qwen2.5:0.5b";

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

fn binary_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let res = app.path().resource_dir().ok()?;
    let name = if cfg!(target_os = "windows") { "ollama.exe" } else { "ollama" };
    let p = res.join("ollama").join(name);
    p.exists().then_some(p)
}

/// Copy the bundled (read-only) model store to a writable app-data dir on first
/// run; Ollama needs a writable models directory. Returns that path.
fn ensure_models_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dest = app.path().app_data_dir().ok()?.join("ollama-models");
    if dest.join("manifests").exists() {
        return Some(dest); // already populated
    }
    if let Ok(res) = app.path().resource_dir() {
        let src = res.join("ollama-models");
        if src.exists() {
            if let Err(e) = copy_dir_all(&src, &dest) {
                log::error!("[sidecar] failed to stage models: {e}");
            }
        }
    }
    Some(dest)
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// Start the bundled Ollama server. No-op (logged) if the binary isn't bundled,
/// in which case refinement falls back to the raw transcript.
pub fn start(app: &tauri::AppHandle) {
    let bin = match binary_path(app) {
        Some(b) => b,
        None => {
            log::warn!("[sidecar] bundled ollama binary not found — refinement disabled");
            return;
        }
    };

    // Resource extraction can drop the executable bit; restore it.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&bin) {
            let mut perm = meta.permissions();
            perm.set_mode(0o755);
            let _ = std::fs::set_permissions(&bin, perm);
        }
    }

    let mut cmd = Command::new(&bin);
    cmd.arg("serve").env("OLLAMA_HOST", OLLAMA_HOST);
    if let Some(models) = ensure_models_dir(app) {
        cmd.env("OLLAMA_MODELS", models);
    }

    match cmd.spawn() {
        Ok(child) => {
            log::info!("[sidecar] ollama serve started on {OLLAMA_HOST}");
            *CHILD.lock().unwrap() = Some(child);
        }
        Err(e) => log::error!("[sidecar] failed to start ollama: {e}"),
    }
}

/// Stop the bundled server. Call on app exit.
pub fn stop() {
    if let Some(mut child) = CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}
