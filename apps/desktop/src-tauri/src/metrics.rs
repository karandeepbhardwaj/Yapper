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

    // Compute avg_wpm from entries that have a positive duration
    let avg_wpm = {
        let wpm_values: Vec<f32> = entries
            .iter()
            .filter_map(|e| {
                let dur = e.duration_seconds?;
                if dur == 0 {
                    return None;
                }
                let words = e.refined_text.split_whitespace().count() as f32;
                let minutes = dur as f32 / 60.0;
                Some(words / minutes)
            })
            .collect();

        if wpm_values.is_empty() {
            0.0
        } else {
            wpm_values.iter().sum::<f32>() / wpm_values.len() as f32
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
