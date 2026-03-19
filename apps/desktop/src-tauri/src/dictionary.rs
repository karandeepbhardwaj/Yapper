use serde::{Deserialize, Serialize};

use crate::store;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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

#[tauri::command]
pub fn get_all_entries(app: tauri::AppHandle) -> Result<Vec<DictionaryEntry>, String> {
    store::load::<DictionaryEntry>(&app, "dictionary.json")
}

#[tauri::command]
pub fn add_entry(
    app: tauri::AppHandle,
    shorthand: String,
    expansion: String,
    category: String,
) -> Result<DictionaryEntry, String> {
    let mut entries = store::load::<DictionaryEntry>(&app, "dictionary.json")?;
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
    store::save(&app, "dictionary.json", &entries)?;
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
    let mut entries = store::load::<DictionaryEntry>(&app, "dictionary.json")?;
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        entry.shorthand = shorthand;
        entry.expansion = expansion;
        entry.category = category;
    } else {
        return Err(format!("Dictionary entry not found: {}", id));
    }
    store::save(&app, "dictionary.json", &entries)
}

#[tauri::command]
pub fn delete_entry(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut entries = store::load::<DictionaryEntry>(&app, "dictionary.json")?;
    entries.retain(|e| e.id != id);
    store::save(&app, "dictionary.json", &entries)
}

#[tauri::command]
pub fn toggle_favorite(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut entries = store::load::<DictionaryEntry>(&app, "dictionary.json")?;
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        let currently_favorite = entry.is_favorite.unwrap_or(false);
        entry.is_favorite = Some(!currently_favorite);
    }
    store::save(&app, "dictionary.json", &entries)
}

/// Case-insensitive word replacement with punctuation handling.
pub fn apply_replacements(text: &str, app: &tauri::AppHandle) -> String {
    let entries = match store::load::<DictionaryEntry>(app, "dictionary.json") {
        Ok(e) => e,
        Err(_) => return text.to_string(),
    };
    if entries.is_empty() {
        return text.to_string();
    }

    let words: Vec<&str> = text.split_whitespace().collect();
    let replaced: Vec<String> = words.iter().map(|word| {
        // Strip trailing punctuation for matching
        let trimmed = word.trim_end_matches(|c: char| c.is_ascii_punctuation());
        let suffix = &word[trimmed.len()..];
        let word_lower = trimmed.to_lowercase();
        for entry in &entries {
            if word_lower == entry.shorthand.to_lowercase() {
                return format!("{}{}", entry.expansion, suffix);
            }
        }
        word.to_string()
    }).collect();
    replaced.join(" ")
}
