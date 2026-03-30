use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Instant;
use tauri::Emitter;

use crate::bridge::{self, ConversationTurnMsg};
use crate::history;

static SESSION: Mutex<Option<ConversationSession>> = Mutex::new(None);

struct ConversationSession {
    id: String,
    turns: Vec<Turn>,
    start_time: Instant,
}

struct Turn {
    role: String,
    content: String,
    timestamp: String,
}

#[derive(Clone, Serialize)]
struct AiChunkPayload {
    #[serde(rename = "sessionId")]
    session_id: String,
    content: String,
}

#[derive(Clone, Serialize)]
struct TurnCompletePayload {
    #[serde(rename = "sessionId")]
    session_id: String,
    role: String,
    content: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub summary: String,
    pub title: String,
    #[serde(rename = "keyPoints")]
    pub key_points: Vec<String>,
    #[serde(rename = "turnCount")]
    pub turn_count: usize,
    #[serde(rename = "durationSeconds")]
    pub duration_seconds: u64,
}

#[tauri::command]
pub async fn start_conversation() -> Result<String, String> {
    let mut session = SESSION.lock().map_err(|e| e.to_string())?;
    let id = crate::store::uuid_simple();
    *session = Some(ConversationSession {
        id: id.clone(),
        turns: Vec::new(),
        start_time: Instant::now(),
    });
    Ok(id)
}

#[tauri::command]
pub async fn send_conversation_turn(
    app: tauri::AppHandle,
    user_text: String,
) -> Result<String, String> {
    // Build the history from current session turns (BEFORE adding the new user turn)
    let (prior_history, session_id) = {
        let mut session = SESSION.lock().map_err(|e| e.to_string())?;
        let s = session.as_mut().ok_or("No active conversation")?;

        // Add user turn to session
        let now = chrono::Local::now().to_rfc3339();
        s.turns.push(Turn {
            role: "user".to_string(),
            content: user_text.clone(),
            timestamp: now,
        });

        // Build prior history (everything EXCEPT the new user turn) to avoid duplication
        // The bridge protocol sends userMessage separately
        let prior: Vec<ConversationTurnMsg> = s.turns.iter()
            .take(s.turns.len().saturating_sub(1))
            .map(|t| ConversationTurnMsg {
                role: t.role.clone(),
                content: t.content.clone(),
            }).collect();

        (prior, s.id.clone())
    };

    // Emit user turn complete
    app.emit("conversation-turn-complete", TurnCompletePayload {
        session_id: session_id.clone(),
        role: "user".to_string(),
        content: user_text.clone(),
    }).ok();

    // Dispatch to direct API or VS Code bridge based on settings
    let settings = crate::commands::get_settings_internal(&app);
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let result = if settings.ai_provider_mode == "apikey"
        && !settings.ai_api_key.is_empty()
        && !settings.ai_provider.is_empty()
    {
        crate::ai_provider::send_conversation_turn(
            prior_history,
            user_text,
            &settings.ai_provider,
            &settings.ai_api_key,
            move |chunk| {
                app_clone.emit("conversation-ai-chunk", AiChunkPayload {
                    session_id: session_id_clone.clone(),
                    content: chunk,
                }).ok();
            },
        ).await?
    } else {
        bridge::send_conversation_turn(
            prior_history,
            user_text,
            move |chunk| {
                app_clone.emit("conversation-ai-chunk", AiChunkPayload {
                    session_id: session_id_clone.clone(),
                    content: chunk,
                }).ok();
            },
            if settings.vscode_model.is_empty() { None } else { Some(settings.vscode_model.clone()) },
        ).await?
    };

    // Add assistant turn to session
    {
        let mut session = SESSION.lock().map_err(|e| e.to_string())?;
        if let Some(s) = session.as_mut() {
            let now = chrono::Local::now().to_rfc3339();
            s.turns.push(Turn {
                role: "assistant".to_string(),
                content: result.content.clone(),
                timestamp: now,
            });
        }
    }

    // Emit assistant turn complete
    app.emit("conversation-turn-complete", TurnCompletePayload {
        session_id,
        role: "assistant".to_string(),
        content: result.content.clone(),
    }).ok();

    Ok(result.content)
}

#[tauri::command]
pub async fn end_conversation(app: tauri::AppHandle) -> Result<ConversationSummary, String> {
    let (history, turns_for_history, duration_secs) = {
        let mut session = SESSION.lock().map_err(|e| e.to_string())?;
        let s = session.take().ok_or("No active conversation")?;

        let duration = s.start_time.elapsed().as_secs();

        let history: Vec<ConversationTurnMsg> = s.turns.iter().map(|t| ConversationTurnMsg {
            role: t.role.clone(),
            content: t.content.clone(),
        }).collect();

        let turns_for_history: Vec<history::ConversationTurn> = s.turns.into_iter().map(|t| {
            history::ConversationTurn {
                role: t.role,
                content: t.content,
                timestamp: t.timestamp,
            }
        }).collect();

        (history, turns_for_history, duration)
    };

    if history.is_empty() {
        return Err("Conversation has no turns".to_string());
    }

    // Dispatch to direct API or VS Code bridge based on settings
    let settings = crate::commands::get_settings_internal(&app);
    let summary_result = if settings.ai_provider_mode == "apikey"
        && !settings.ai_api_key.is_empty()
        && !settings.ai_provider.is_empty()
    {
        crate::ai_provider::summarize_conversation(
            history,
            &settings.ai_provider,
            &settings.ai_api_key,
        ).await
    } else {
        bridge::summarize_conversation(
            history,
            if settings.vscode_model.is_empty() { None } else { Some(settings.vscode_model.clone()) },
        ).await
    };

    let (summary_text, title, key_points) = match summary_result {
        Ok(r) => (r.summary, r.title, r.key_points),
        Err(_) => {
            // Fallback: use first user message as summary
            let first_user = turns_for_history.iter()
                .find(|t| t.role == "user")
                .map(|t| t.content.clone())
                .unwrap_or_else(|| "Conversation".to_string());
            (first_user, "Conversation".to_string(), vec![])
        }
    };

    let turn_count = turns_for_history.len();

    // Save to history
    history::add_conversation_entry(
        &app,
        &summary_text,
        Some(&title),
        turns_for_history,
        if key_points.is_empty() { None } else { Some(key_points.clone()) },
        duration_secs,
    )?;

    let result = ConversationSummary {
        summary: summary_text,
        title,
        key_points,
        turn_count,
        duration_seconds: duration_secs,
    };

    app.emit("conversation-ended", result.clone()).ok();

    Ok(result)
}

/// Discard the conversation without saving to history
#[tauri::command]
pub fn discard_conversation() -> Result<(), String> {
    let mut session = SESSION.lock().map_err(|e| e.to_string())?;
    *session = None;
    Ok(())
}

pub fn is_active() -> bool {
    SESSION.lock().map(|s| s.is_some()).unwrap_or(false)
}

#[tauri::command]
pub fn is_conversation_active() -> bool {
    is_active()
}
