use serde::{Deserialize, Serialize};

use crate::store;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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

#[tauri::command]
pub fn get_all_snippets(app: tauri::AppHandle) -> Result<Vec<Snippet>, String> {
    get_all_inner(&app)
}

fn get_all_inner(app: &tauri::AppHandle) -> Result<Vec<Snippet>, String> {
    store::load::<Snippet>(app, "snippets.json")
}

#[tauri::command]
pub fn add_snippet(app: tauri::AppHandle, snippet: Snippet) -> Result<(), String> {
    let mut snippets = get_all_inner(&app)?;
    snippets.insert(0, snippet);
    store::save(&app, "snippets.json", &snippets)
}

#[tauri::command]
pub fn update_snippet(app: tauri::AppHandle, snippet: Snippet) -> Result<(), String> {
    let mut snippets = get_all_inner(&app)?;
    if let Some(existing) = snippets.iter_mut().find(|s| s.id == snippet.id) {
        *existing = snippet;
    } else {
        return Err(format!("Snippet not found: {}", snippet.id));
    }
    store::save(&app, "snippets.json", &snippets)
}

#[tauri::command]
pub fn delete_snippet(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut snippets = get_all_inner(&app)?;
    snippets.retain(|s| s.id != id);
    store::save(&app, "snippets.json", &snippets)
}

#[tauri::command]
pub fn toggle_snippet_favorite(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut snippets = get_all_inner(&app)?;
    if let Some(snippet) = snippets.iter_mut().find(|s| s.id == id) {
        let currently_favorite = snippet.is_favorite.unwrap_or(false);
        snippet.is_favorite = Some(!currently_favorite);
    }
    store::save(&app, "snippets.json", &snippets)
}

pub fn detect_and_expand(text: &str, app: &tauri::AppHandle) -> Option<String> {
    let snippets = get_all_inner(app).ok()?;
    let text_lower = text.to_lowercase();
    let words: Vec<&str> = text_lower.split_whitespace().collect();
    snippets
        .iter()
        .find(|s| {
            let trigger = s.trigger.to_lowercase();
            words.iter().any(|w| *w == trigger)
        })
        .map(|s| s.expansion.clone())
}
