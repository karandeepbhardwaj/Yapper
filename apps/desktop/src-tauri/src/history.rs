use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::store;

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
    #[serde(rename = "action", skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(rename = "actionParams", skip_serializing_if = "Option::is_none")]
    pub action_params: Option<HashMap<String, String>>,
}

pub fn get_all(app: &tauri::AppHandle) -> Result<Vec<HistoryEntry>, String> {
    store::load::<HistoryEntry>(app, "history.json")
}

pub fn add_entry(
    app: &tauri::AppHandle,
    raw_transcript: &str,
    refined_text: &str,
    category: Option<&str>,
    title: Option<&str>,
    duration_seconds: Option<u64>,
    action: Option<&str>,
    action_params: Option<&HashMap<String, String>>,
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
        action: action.map(|a| a.to_string()),
        action_params: action_params.cloned(),
    };

    entries.insert(0, entry);

    // Keep last 100 entries
    entries.truncate(100);

    store::save(app, "history.json", &entries)
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
        action: None,
        action_params: None,
    };

    entries.insert(0, entry);
    entries.truncate(100);

    store::save(app, "history.json", &entries)
}

pub fn toggle_pin(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let mut entries = get_all(app)?;
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        let currently_pinned = entry.is_pinned.unwrap_or(false);
        entry.is_pinned = Some(!currently_pinned);
    }
    store::save(app, "history.json", &entries)
}

pub fn delete_entry(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let mut entries = get_all(app)?;
    entries.retain(|e| e.id != id);
    store::save(app, "history.json", &entries)
}

/// Seed sample data for dev/demo purposes. Clears existing history first.
pub fn seed_sample_data(app: &tauri::AppHandle) -> Result<(), String> {
    let now = chrono::Local::now();
    let entries: Vec<HistoryEntry> = vec![
        HistoryEntry {
            id: (now.timestamp_millis() - 100).to_string(),
            timestamp: (now - chrono::Duration::minutes(5)).to_rfc3339(),
            refined_text: "## Summary\n\nThe quarterly report shows **strong growth** across all metrics. Key highlights:\n\n- Revenue up **23%** year-over-year\n- Customer retention at *94%*, exceeding target\n- New product launch contributed **$2.1M** in Q4\n\nI'd like to schedule a meeting to discuss next steps. Would Thursday at 2pm work for you?".into(),
            raw_transcript: "the quarterly report shows strong growth across all metrics revenue up 23 percent year over year customer retention at 94 percent exceeding target new product launch contributed 2.1 million in q4 id like to schedule a meeting to discuss next steps would thursday at 2pm work for you".into(),
            category: Some("Email".into()),
            is_pinned: Some(true),
            title: Some("Quarterly report summary".into()),
            entry_type: None, conversation: None,
            duration_seconds: Some(12),
            action: None,
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 200).to_string(),
            timestamp: (now - chrono::Duration::minutes(30)).to_rfc3339(),
            refined_text: "## Auth Middleware Architecture\n\nThe new authentication system should use **JWT tokens** with a 24-hour expiry. Key changes:\n\n1. Add **refresh token rotation** for security\n2. Migrate sessions from in-memory cache to **Redis**\n3. Implement `rate-limiting` on the `/auth/token` endpoint\n\nThis will fix the scaling issue we saw in production last week where the in-memory store was consuming **4GB** of RAM per instance.".into(),
            raw_transcript: "the new authentication middleware should use jwt tokens with 24 hour expiry we need to add refresh token rotation and store sessions in redis instead of the in memory cache implement rate limiting on the auth token endpoint this will fix the scaling issue we saw in production last week where the in memory store was consuming 4gb of ram per instance".into(),
            category: Some("Work".into()),
            is_pinned: None,
            title: Some("Auth middleware architecture notes".into()),
            entry_type: None, conversation: None,
            duration_seconds: Some(15),
            action: None,
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 300).to_string(),
            timestamp: (now - chrono::Duration::hours(1)).to_rfc3339(),
            refined_text: "## Design System Migration\n\nWe should adopt a **token-based approach** with semantic naming:\n\n- Use `color-surface-primary` instead of `gray-100`\n- Define spacing tokens: *sm*, *md*, *lg*, *xl*\n- Create component-level tokens that reference global tokens\n\n### Benefits\n\n- **Dark mode** support for free\n- Truly *themeable* component library\n- Consistent spacing across all breakpoints".into(),
            raw_transcript: "ive been thinking about the design system migration we should adopt a token based approach with semantic naming color surface primary instead of gray 100 define spacing tokens create component level tokens that reference global tokens this gives us dark mode support for free and makes the component library truly themeable and consistent spacing across all breakpoints".into(),
            category: Some("Thought".into()),
            is_pinned: None,
            title: Some("Design system token strategy".into()),
            entry_type: None, conversation: None,
            duration_seconds: Some(18),
            action: None,
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 400).to_string(),
            timestamp: (now - chrono::Duration::hours(2)).to_rfc3339(),
            refined_text: "## Q3 Roadmap Meeting Notes\n\n**Attendees:** Sarah, Mike, Priya, James\n\n### Priorities\n\n1. **Performance improvements** — reduce p95 latency by 40%\n2. **New onboarding flow** — redesign for self-serve customers\n3. **API v2** — breaking changes deferred to Q4\n\n### Action Items\n\n- Design mockups due by *Friday*\n- Engineering estimates due *next Monday*\n- Sarah to draft the customer communication plan".into(),
            raw_transcript: "meeting notes discussed the q3 roadmap priorities team agreed to focus on performance improvements first reduce p95 latency by 40 percent then tackle the new onboarding flow for self serve customers api v2 breaking changes deferred to q4 design mockups expected by friday engineering estimates due next monday sarah to draft the customer communication plan".into(),
            category: Some("Work".into()),
            is_pinned: None,
            title: Some("Q3 roadmap planning meeting".into()),
            entry_type: None, conversation: None,
            duration_seconds: Some(22),
            action: None,
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 500).to_string(),
            timestamp: (now - chrono::Duration::hours(3)).to_rfc3339(),
            refined_text: "Hey team, just a quick update — the deployment pipeline is now fully automated. Push to main triggers build, test, and deploy to staging. Production releases happen on tag push. Check the README for the new workflow.".into(),
            raw_transcript: "hey team just a quick update the deployment pipeline is now fully automated push to main triggers build test and deploy to staging production releases happen on tag push check the readme for the new workflow".into(),
            category: Some("Message".into()),
            is_pinned: None,
            title: Some("CI/CD pipeline update".into()),
            entry_type: None, conversation: None,
            duration_seconds: Some(10),
            action: None,
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 600).to_string(),
            timestamp: (now - chrono::Duration::hours(5)).to_rfc3339(),
            refined_text: "Remember to pick up groceries on the way home. We need milk, eggs, bread, and those specific pasta noodles from the Italian aisle. Also grab some fresh basil for tonight's dinner.".into(),
            raw_transcript: "remember to pick up groceries on the way home we need milk eggs bread and those specific pasta noodles from the italian aisle also grab some fresh basil for tonights dinner".into(),
            category: Some("Personal".into()),
            is_pinned: None,
            title: Some("Grocery list reminder".into()),
            entry_type: None, conversation: None,
            duration_seconds: Some(8),
            action: None,
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 700).to_string(),
            timestamp: (now - chrono::Duration::hours(8)).to_rfc3339(),
            refined_text: "The API response times have improved significantly after the database indexing changes. Average latency dropped from 450ms to 120ms on the `/users` endpoint. The compound index on `(org_id, created_at)` was the key improvement.".into(),
            raw_transcript: "the api response times have improved significantly after the database indexing changes average latency dropped from 450 milliseconds to 120 milliseconds on the users endpoint the compound index on org id created at was the key improvement".into(),
            category: Some("Work".into()),
            is_pinned: Some(true),
            title: Some("Database performance improvements".into()),
            entry_type: None, conversation: None,
            duration_seconds: Some(14),
            action: None,
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 800).to_string(),
            timestamp: (now - chrono::Duration::days(1)).to_rfc3339(),
            refined_text: "For the interview tomorrow, make sure to review the system design fundamentals: consistent hashing, event-driven architecture, and the CAP theorem trade-offs. Also prepare the walkthrough of the real-time notification system you built.".into(),
            raw_transcript: "for the interview tomorrow make sure to review the system design fundamentals consistent hashing event driven architecture and the cap theorem tradeoffs also prepare the walkthrough of the real time notification system you built".into(),
            category: Some("Personal".into()),
            is_pinned: None,
            title: Some("Interview prep notes".into()),
            entry_type: None, conversation: None,
            duration_seconds: Some(16),
            action: None,
            action_params: None,
        },
        // Voice command sample entries
        HistoryEntry {
            id: (now.timestamp_millis() - 900).to_string(),
            timestamp: (now - chrono::Duration::minutes(15)).to_rfc3339(),
            refined_text: "Hola Sarah, quería hacer un seguimiento de nuestra conversación de ayer. El informe trimestral se ve genial y creo que deberíamos programar una reunión para discutir los próximos pasos. ¿Te funcionaría el jueves a las 2pm?".into(),
            raw_transcript: "translate this to spanish hey sarah I wanted to follow up on our conversation from yesterday the quarterly report is looking great and I think we should schedule a meeting to discuss the next steps would thursday at 2pm work for you".into(),
            category: Some("Translate".into()),
            is_pinned: None,
            title: None,
            entry_type: None, conversation: None,
            duration_seconds: Some(9),
            action: Some("translate".into()),
            action_params: Some(HashMap::from([("targetLang".into(), "Spanish".into())])),
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 1000).to_string(),
            timestamp: (now - chrono::Duration::minutes(45)).to_rfc3339(),
            refined_text: "The team discussed Q3 roadmap priorities, agreeing to focus on performance improvements before the new onboarding flow. Design mockups are due Friday, engineering estimates by Monday.".into(),
            raw_transcript: "summarize this".into(),
            category: Some("Summarize".into()),
            is_pinned: None,
            title: None,
            entry_type: None, conversation: None,
            duration_seconds: Some(3),
            action: Some("summarize".into()),
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 1100).to_string(),
            timestamp: (now - chrono::Duration::hours(4)).to_rfc3339(),
            refined_text: "Subject: Standup Sync — March 29\n\nHi team,\n\nJust a heads-up that tomorrow's standup will be moved to 10:30 AM to accommodate the all-hands at 9. Same Zoom link as usual. Please have your sprint updates ready.\n\nThanks,\nKaran".into(),
            raw_transcript: "draft an email about moving tomorrow's standup to 10 30 because of the all hands at 9".into(),
            category: Some("Draft".into()),
            is_pinned: None,
            title: None,
            entry_type: None, conversation: None,
            duration_seconds: Some(7),
            action: Some("draft".into()),
            action_params: Some(HashMap::from([("type".into(), "email".into()), ("topic".into(), "moving standup to 10:30 due to all-hands".into())])),
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 1200).to_string(),
            timestamp: (now - chrono::Duration::hours(6)).to_rfc3339(),
            refined_text: "This function implements a circuit breaker pattern for the WebSocket bridge connection. It tracks consecutive failures with an atomic counter. After 3 failures, it enters a 30-second cooldown where all connection attempts are short-circuited with an error. On a successful connection, the failure counter resets to zero. The TCP pre-check with a 500ms timeout avoids blocking on the full WebSocket handshake when the server is unreachable.".into(),
            raw_transcript: "explain this function".into(),
            category: Some("Explain".into()),
            is_pinned: Some(true),
            title: None,
            entry_type: None, conversation: None,
            duration_seconds: Some(4),
            action: Some("explain".into()),
            action_params: None,
        },
        HistoryEntry {
            id: (now.timestamp_millis() - 1300).to_string(),
            timestamp: (now - chrono::Duration::hours(7)).to_rfc3339(),
            refined_text: "L'équipe a discuté des priorités de la feuille de route du T3, en convenant de se concentrer d'abord sur les améliorations de performance. Les maquettes sont attendues vendredi.".into(),
            raw_transcript: "translate this to french and then summarize it".into(),
            category: Some("Chain".into()),
            is_pinned: None,
            title: None,
            entry_type: None, conversation: None,
            duration_seconds: Some(5),
            action: Some("chain".into()),
            action_params: Some(HashMap::from([("steps".into(), "translate + summarize".into()), ("targetLang".into(), "French".into())])),
        },
    ];
    store::save(app, "history.json", &entries)
}

pub fn clear(app: &tauri::AppHandle) -> Result<(), String> {
    let path = store::data_path(app, "history.json")?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
