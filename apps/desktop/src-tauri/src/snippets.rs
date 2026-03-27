use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub trigger: String,
    pub expansion: String,
    pub category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_favorite: Option<bool>,
    pub created_at: String,
}

fn snippets_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("snippets.json"))
}

#[tauri::command]
pub fn get_all_snippets(app: tauri::AppHandle) -> Result<Vec<Snippet>, String> {
    get_all_inner(&app)
}

fn get_all_inner(app: &tauri::AppHandle) -> Result<Vec<Snippet>, String> {
    let path = snippets_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_all(app: &tauri::AppHandle, snippets: &[Snippet]) -> Result<(), String> {
    let path = snippets_path(app)?;
    let data = serde_json::to_string_pretty(snippets).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_snippet(app: tauri::AppHandle, snippet: Snippet) -> Result<(), String> {
    let mut snippets = get_all_inner(&app)?;
    snippets.insert(0, snippet);
    save_all(&app, &snippets)
}

#[tauri::command]
pub fn update_snippet(app: tauri::AppHandle, snippet: Snippet) -> Result<(), String> {
    let mut snippets = get_all_inner(&app)?;
    if let Some(existing) = snippets.iter_mut().find(|s| s.id == snippet.id) {
        *existing = snippet;
    } else {
        return Err(format!("Snippet not found: {}", snippet.id));
    }
    save_all(&app, &snippets)
}

#[tauri::command]
pub fn delete_snippet(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut snippets = get_all_inner(&app)?;
    snippets.retain(|s| s.id != id);
    save_all(&app, &snippets)
}

#[tauri::command]
pub fn toggle_snippet_favorite(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut snippets = get_all_inner(&app)?;
    if let Some(snippet) = snippets.iter_mut().find(|s| s.id == id) {
        let currently_favorite = snippet.is_favorite.unwrap_or(false);
        snippet.is_favorite = Some(!currently_favorite);
    }
    save_all(&app, &snippets)
}

pub fn detect_and_expand(text: &str, app: &tauri::AppHandle) -> Option<String> {
    let snippets = get_all_inner(app).ok()?;
    let text_lower = text.to_lowercase();
    snippets
        .iter()
        .find(|s| text_lower.contains(&s.trigger.to_lowercase()))
        .map(|s| s.expansion.clone())
}
