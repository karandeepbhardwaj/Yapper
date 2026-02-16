use chrono::NaiveDate;
use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub streak_days: u32,
    pub total_words: u32,
    pub avg_wpm: f32,
    pub total_entries: u32,
    pub total_duration_seconds: u64,
}

#[tauri::command]
pub async fn get_metrics(app: tauri::AppHandle) -> Result<Metrics, String> {
    let entries = crate::history::get_all(&app)?;

    let total_entries = entries.len() as u32;

    let total_words: u32 = entries
        .iter()
        .map(|e| e.refined_text.split_whitespace().count() as u32)
        .sum();

    let total_duration_seconds: u64 = entries
        .iter()
        .filter_map(|e| e.duration_seconds)
        .sum();

    // Compute avg_wpm as total words / total minutes (only from entries with duration > 0)
    let avg_wpm = {
        let mut wpm_words: u32 = 0;
        let mut wpm_seconds: u64 = 0;
        for e in &entries {
            if let Some(dur) = e.duration_seconds {
                if dur > 0 {
                    wpm_words += e.refined_text.split_whitespace().count() as u32;
                    wpm_seconds += dur;
                }
            }
        }
        if wpm_seconds == 0 {
            0.0
        } else {
            wpm_words as f32 / (wpm_seconds as f32 / 60.0)
        }
    };

    // Compute streak: consecutive days backward from today with at least one entry
    let streak_days = {
        let mut dates_with_entries = HashSet::new();
        for entry in &entries {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&entry.timestamp) {
                let date = dt.date_naive();
                dates_with_entries.insert(date);
            }
        }

        let today = chrono::Local::now().date_naive();
        let mut streak: u32 = 0;
        let mut day = today;
        loop {
            if dates_with_entries.contains(&day) {
                streak += 1;
                day = day.pred_opt().unwrap_or(NaiveDate::MIN);
            } else {
                break;
            }
        }
        streak
    };

    Ok(Metrics {
        streak_days,
        total_words,
        avg_wpm,
        total_entries,
        total_duration_seconds,
    })
}
