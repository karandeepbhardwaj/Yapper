use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationTurn {
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationData {
    pub turns: Vec<ConversationTurn>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "keyPoints")]
    pub key_points: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: String,
    #[serde(rename = "refinedText")]
    pub refined_text: String,
    #[serde(rename = "rawTranscript")]
    pub raw_transcript: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, rename = "isPinned", skip_serializing_if = "Option::is_none")]
    pub is_pinned: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "entryType")]
    pub entry_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation: Option<ConversationData>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "durationSeconds")]
    pub duration_seconds: Option<u64>,
}

fn history_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("history.json"))
}

pub fn get_all(app: &tauri::AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let path = history_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

pub fn add_entry(
    app: &tauri::AppHandle,
    raw_transcript: &str,
    refined_text: &str,
    category: Option<&str>,
    title: Option<&str>,
    duration_seconds: Option<u64>,
) -> Result<(), String> {
    let mut entries = get_all(app)?;

    let now = chrono::Local::now();
    let entry = HistoryEntry {
        id: now.timestamp_millis().to_string(),
        timestamp: now.to_rfc3339(),
        refined_text: refined_text.to_string(),
        raw_transcript: raw_transcript.to_string(),
        category: category.map(|s| s.to_string()),
        is_pinned: None,
        title: title.map(|s| s.to_string()),
        entry_type: None,
        conversation: None,
        duration_seconds,
    };

    entries.insert(0, entry);

    // Keep last 100 entries
    entries.truncate(100);

    let path = history_path(app)?;
    let data = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

pub fn add_conversation_entry(
    app: &tauri::AppHandle,
    summary: &str,
    title: Option<&str>,
    turns: Vec<ConversationTurn>,
    key_points: Option<Vec<String>>,
    duration_seconds: u64,
) -> Result<(), String> {
    let mut entries = get_all(app)?;

    let now = chrono::Local::now();
    let raw_transcript = turns
        .iter()
        .filter(|t| t.role == "user")
        .map(|t| t.content.as_str())
        .collect::<Vec<_>>()
        .join(" ");

    let entry = HistoryEntry {
        id: now.timestamp_millis().to_string(),
        timestamp: now.to_rfc3339(),
        refined_text: summary.to_string(),
        raw_transcript,
        category: Some("Conversation".to_string()),
        is_pinned: None,
        title: title.map(|s| s.to_string()),
        entry_type: Some("conversation".to_string()),
        conversation: Some(ConversationData { turns, key_points }),
        duration_seconds: Some(duration_seconds),
    };

    entries.insert(0, entry);
    entries.truncate(100);

    let path = history_path(app)?;
    let data = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

pub fn toggle_pin(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let mut entries = get_all(app)?;
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        let currently_pinned = entry.is_pinned.unwrap_or(false);
        entry.is_pinned = Some(!currently_pinned);
    }
    let path = history_path(app)?;
    let data = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

pub fn delete_entry(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let mut entries = get_all(app)?;
    entries.retain(|e| e.id != id);
    let path = history_path(app)?;
    let data = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

pub fn clear(app: &tauri::AppHandle) -> Result<(), String> {
    let path = history_path(app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
