use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub id: String,
    pub shorthand: String,
    pub expansion: String,
    pub category: String,
    #[serde(default, rename = "isFavorite", skip_serializing_if = "Option::is_none")]
    pub is_favorite: Option<bool>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

fn dictionary_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("dictionary.json"))
}

fn load_entries(app: &tauri::AppHandle) -> Result<Vec<DictionaryEntry>, String> {
    let path = dictionary_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_entries(app: &tauri::AppHandle, entries: &[DictionaryEntry]) -> Result<(), String> {
    let path = dictionary_path(app)?;
    let data = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_entries(app: tauri::AppHandle) -> Result<Vec<DictionaryEntry>, String> {
    load_entries(&app)
}

#[tauri::command]
pub fn add_entry(
    app: tauri::AppHandle,
    shorthand: String,
    expansion: String,
    category: String,
) -> Result<DictionaryEntry, String> {
    let mut entries = load_entries(&app)?;
    let now = chrono::Local::now();
    let entry = DictionaryEntry {
        id: now.timestamp_millis().to_string(),
        shorthand,
        expansion,
        category,
        is_favorite: None,
        created_at: now.to_rfc3339(),
    };
    entries.insert(0, entry.clone());
    save_entries(&app, &entries)?;
    Ok(entry)
}

#[tauri::command]
pub fn update_entry(
    app: tauri::AppHandle,
    id: String,
    shorthand: String,
    expansion: String,
    category: String,
) -> Result<(), String> {
    let mut entries = load_entries(&app)?;
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        entry.shorthand = shorthand;
        entry.expansion = expansion;
        entry.category = category;
    } else {
        return Err(format!("Dictionary entry not found: {}", id));
    }
    save_entries(&app, &entries)
}

#[tauri::command]
pub fn delete_entry(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut entries = load_entries(&app)?;
    entries.retain(|e| e.id != id);
    save_entries(&app, &entries)
}

#[tauri::command]
pub fn toggle_favorite(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut entries = load_entries(&app)?;
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        let currently_favorite = entry.is_favorite.unwrap_or(false);
        entry.is_favorite = Some(!currently_favorite);
    }
    save_entries(&app, &entries)
}

/// Case-insensitive word replacement. Simple approach: split on whitespace,
/// check each word against shorthands, replace matches.
pub fn apply_replacements(text: &str, app: &tauri::AppHandle) -> String {
    let entries = match load_entries(app) {
        Ok(e) => e,
        Err(_) => return text.to_string(),
    };
    if entries.is_empty() {
        return text.to_string();
    }

    let words: Vec<&str> = text.split_whitespace().collect();
    let replaced: Vec<String> = words.iter().map(|word| {
        let word_lower = word.to_lowercase();
        for entry in &entries {
            if word_lower == entry.shorthand.to_lowercase() {
                return entry.expansion.clone();
            }
        }
        word.to_string()
    }).collect();
    replaced.join(" ")
}
