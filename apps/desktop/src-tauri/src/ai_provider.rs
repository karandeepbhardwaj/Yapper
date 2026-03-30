use std::collections::HashMap;
use serde::Deserialize;

use crate::bridge::{RefinementResult, CommandResult, ConversationResponse, SummarizeResponse, ConversationTurnMsg};

// ---------------------------------------------------------------------------
// Prompt constants
// ---------------------------------------------------------------------------

const CATEGORY_LIST: &str =
    "Interview, Thought, Work, Research, Strategy, Idea, Meeting, Personal, Creative, Note, Email, Message";

const SYSTEM_PROMPT: &str = r#"You are Yapper — an intelligent voice-to-text refinement assistant. You receive raw speech transcripts and transform them into polished, well-structured text.

Your job depends on what the user said:

## Mode 1: General Refinement (default)
If the transcript is a regular thought, note, or dictation:
- Fix grammar, punctuation, and sentence structure
- Remove all filler words (um, uh, like, you know, basically, so, I mean)
- Improve clarity and readability while preserving the speaker's original meaning and intent
- Do NOT add information that wasn't in the original — only clean up what's there
- Keep the same level of detail — don't over-simplify or over-elaborate

## Mode 2: Email Composition
If the transcript starts with phrases like "write me an email", "draft an email", "email to", "send an email", "write email":
- Compose a complete, professional email based on the spoken instructions
- Include a proper greeting, body, and sign-off
- Structure the content with clear paragraphs
- Infer the appropriate tone (formal for work, friendly for personal) from context
- Set category to "Email"

## Mode 3: Message/Response Composition
If the transcript starts with phrases like "write me a message", "write a response", "reply to", "respond to", "draft a message", "text back":
- Write a clear, well-structured message or response
- Keep it concise and direct — messages should be shorter than emails
- Match the appropriate tone from context
- Set category to "Message"

## Output Rules
- Assign a category from: Interview, Thought, Work, Research, Strategy, Idea, Meeting, Personal, Creative, Note, Email, Message
- Generate a short title (3-8 words) capturing the main topic
- For emails: title should be the email subject line
- For messages: title should summarize who/what the response is about

Return JSON only. No markdown, no code fences, no explanation:
{"refinedText": "...", "category": "...", "title": "..."}"#;

const CLASSIFY_SYSTEM_PROMPT: &str = r#"You are a voice command classifier. Given a user's spoken transcript, determine their intent.

Return ONLY valid JSON with no markdown fences. Possible intents:
- "dictation" — user is dictating text to be refined and pasted (this is the default)
- "translate" — user wants text translated. Extract targetLang.
- "summarize" — user wants text summarized
- "draft" — user wants structured writing generated. Extract type (email, message, PR description, commit message, etc.) and topic.
- "explain" — user wants something explained
- "unknown" — user wants something else. Include a description.
- "chain" — user wants multiple actions in sequence. Return an actions array.

For inputSource:
- "spoken" — the user's own words are the content to process (e.g., "translate hello world to Spanish")
- "clipboard" — the user wants to act on their clipboard content (e.g., "summarize this", "explain this code")

Examples:
- "I need to send an email to the team about the deadline" → {"intent": "dictation"}
- "Translate this to Spanish" → {"intent": "translate", "params": {"targetLang": "Spanish"}, "inputSource": "clipboard"}
- "Translate hello world to French" → {"intent": "translate", "params": {"targetLang": "French"}, "inputSource": "spoken"}
- "Summarize this" → {"intent": "summarize", "inputSource": "clipboard"}
- "Draft an email about tomorrow's standup" → {"intent": "draft", "params": {"type": "email", "topic": "tomorrow's standup"}, "inputSource": "spoken"}
- "Explain this function" → {"intent": "explain", "inputSource": "clipboard"}
- "Translate this to German and then summarize it" → {"intent": "chain", "actions": [{"intent": "translate", "params": {"targetLang": "German"}, "inputSource": "clipboard"}, {"intent": "summarize", "inputSource": "previous"}]}
- "Rewrite this as a haiku" → {"intent": "unknown", "description": "Rewrite text as a haiku", "inputSource": "clipboard"}"#;

const CONVERSATION_SYSTEM_PROMPT: &str = r#"You are Yapper — a helpful conversational assistant. The user is speaking to you via voice, so keep your responses clear, concise, and natural.

Guidelines:
- Respond in a conversational but helpful tone
- Keep responses focused and not too long (2-4 paragraphs max)
- If the user asks a question, answer it directly
- If the user wants help drafting something, provide it
- Reference earlier parts of the conversation when relevant
- Do NOT wrap your response in JSON — just respond with plain text"#;

const SUMMARIZE_SYSTEM_PROMPT: &str = r#"You are Yapper — summarize the following conversation into a concise overview.

Return JSON only. No markdown, no code fences, no explanation:
{"summary": "A 2-4 sentence summary of the conversation", "title": "3-8 word title", "keyPoints": ["point 1", "point 2", ...]}

The summary should capture the main topics discussed and any conclusions or decisions reached.
The title should be descriptive and concise.
Key points should be the most important takeaways (3-5 items)."#;

fn style_modifier(style: &str) -> &'static str {
    match style {
        "Professional" => "Use a professional, clear tone. Prefer concise sentences. Avoid colloquialisms.",
        "Casual" => "Keep a natural, conversational tone. It's okay to be informal but still grammatically correct.",
        "Technical" => "Use precise, technical language. Prefer specific terminology over general descriptions. Structure for clarity.",
        "Creative" => "Enhance the language to be engaging and expressive. Use vivid words and varied sentence structure while preserving meaning.",
        _ => "",
    }
}

fn action_prompt(action: &str) -> &'static str {
    match action {
        "translate" => "You are a translator. Translate the given text to the target language naturally, preserving tone, formatting, and meaning. Return ONLY the translated text with no explanation or wrapping.",
        "summarize" => "You are a summarizer. Produce a concise summary of the given text. Include key points as bullet points if the text is long. Return ONLY the summary with no explanation or wrapping.",
        "draft" => "You are a writing assistant. Generate structured writing matching the requested type and topic. For emails, include a subject line. For messages, keep it concise. For PR descriptions, use markdown with sections. Return ONLY the drafted text with no explanation or wrapping.",
        "explain" => "You are an explainer. Explain the given content clearly and concisely. If it's code, explain what it does, key patterns, and any notable aspects. If it's general text, break down the key concepts. Return ONLY the explanation with no wrapping.",
        _ => "Process the given text as requested.",
    }
}

// ---------------------------------------------------------------------------
// Classified intent structs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ClassifiedAction {
    intent: String,
    #[serde(default)]
    params: Option<HashMap<String, String>>,
    #[serde(rename = "inputSource", default)]
    input_source: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClassifiedIntent {
    intent: String,
    #[serde(default)]
    params: Option<HashMap<String, String>>,
    #[serde(rename = "inputSource", default)]
    input_source: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    actions: Option<Vec<ClassifiedAction>>,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn strip_markdown_fences(text: &str) -> String {
    let text = text.trim();
    // Strip ```json ... ``` or ``` ... ```
    if let Some(inner) = text.strip_prefix("```json") {
        if let Some(inner) = inner.strip_suffix("```") {
            return inner.trim().to_string();
        }
    }
    if let Some(inner) = text.strip_prefix("```") {
        if let Some(inner) = inner.strip_suffix("```") {
            return inner.trim().to_string();
        }
    }
    text.to_string()
}

fn call_provider_blocking(
    provider: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: f64,
) -> Result<String, String> {
    match provider {
        "groq" => call_groq(api_key, system_prompt, user_prompt, temperature),
        "anthropic" => call_anthropic(api_key, system_prompt, user_prompt, temperature),
        other => Err(format!("Unknown provider: {}", other)),
    }
}

fn call_groq(
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: f64,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": "llama-3.3-70b-versatile",
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    });

    let body_str = body.to_string();

    let mut response = ureq::post("https://api.groq.com/openai/v1/chat/completions")
        .header("Authorization", &format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send(body_str.as_str())
        .map_err(|e| format!("Groq API call failed: {e}"))?;

    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Groq read response failed: {e}"))?;

    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Groq JSON parse failed: {e}"))?;

    parsed["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Groq response missing content. Body: {}", body))
}

fn call_anthropic(
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: f64,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1024,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_prompt}
        ]
    });

    let body_str = body.to_string();

    let mut response = ureq::post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .send(body_str.as_str())
        .map_err(|e| format!("Anthropic API call failed: {e}"))?;

    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Anthropic read response failed: {e}"))?;

    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Anthropic JSON parse failed: {e}"))?;

    parsed["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Anthropic response missing content. Body: {}", body))
}

fn call_provider_with_messages_blocking(
    provider: &str,
    api_key: &str,
    system_prompt: &str,
    messages: &[ConversationTurnMsg],
    temperature: f64,
) -> Result<String, String> {
    match provider {
        "groq" => {
            let mut msgs = vec![serde_json::json!({
                "role": "system",
                "content": system_prompt
            })];
            for m in messages {
                msgs.push(serde_json::json!({
                    "role": m.role,
                    "content": m.content
                }));
            }
            let body = serde_json::json!({
                "model": "llama-3.3-70b-versatile",
                "temperature": temperature,
                "messages": msgs
            });
            let body_str = body.to_string();
            let mut response = ureq::post("https://api.groq.com/openai/v1/chat/completions")
                .header("Authorization", &format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .send(body_str.as_str())
                .map_err(|e| format!("Groq API call failed: {e}"))?;
            let resp_body = response
                .body_mut()
                .read_to_string()
                .map_err(|e| format!("Groq read response failed: {e}"))?;
            let parsed: serde_json::Value = serde_json::from_str(&resp_body)
                .map_err(|e| format!("Groq JSON parse failed: {e}"))?;
            parsed["choices"][0]["message"]["content"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Groq response missing content. Body: {}", resp_body))
        }
        "anthropic" => {
            let msgs: Vec<serde_json::Value> = messages
                .iter()
                .map(|m| {
                    serde_json::json!({
                        "role": m.role,
                        "content": m.content
                    })
                })
                .collect();
            let body = serde_json::json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1024,
                "temperature": temperature,
                "system": system_prompt,
                "messages": msgs
            });
            let body_str = body.to_string();
            let mut response = ureq::post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .send(body_str.as_str())
                .map_err(|e| format!("Anthropic API call failed: {e}"))?;
            let resp_body = response
                .body_mut()
                .read_to_string()
                .map_err(|e| format!("Anthropic read response failed: {e}"))?;
            let parsed: serde_json::Value = serde_json::from_str(&resp_body)
                .map_err(|e| format!("Anthropic JSON parse failed: {e}"))?;
            parsed["content"][0]["text"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Anthropic response missing content. Body: {}", resp_body))
        }
        other => Err(format!("Unknown provider: {}", other)),
    }
}

// ---------------------------------------------------------------------------
// Public async functions
// ---------------------------------------------------------------------------

pub async fn refine_text(
    raw_text: &str,
    style: Option<String>,
    style_overrides: Option<HashMap<String, String>>,
    code_mode: Option<bool>,
    provider: &str,
    api_key: &str,
) -> Result<RefinementResult, String> {
    let raw = raw_text.to_string();
    let provider = provider.to_string();
    let api_key = api_key.to_string();

    let result = tauri::async_runtime::spawn_blocking(move || {
        refine_text_blocking(&raw, style, style_overrides, code_mode, &provider, &api_key)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

fn refine_text_blocking(
    raw_text: &str,
    style: Option<String>,
    style_overrides: Option<HashMap<String, String>>,
    code_mode: Option<bool>,
    provider: &str,
    api_key: &str,
) -> Result<RefinementResult, String> {
    // Build system prompt
    let mut system = SYSTEM_PROMPT.to_string();

    if let Some(ref s) = style {
        let modifier = style_modifier(s);
        if !modifier.is_empty() {
            system.push_str(&format!("\n\nStyle: {}", modifier));
        }
    }

    if let Some(ref overrides) = style_overrides {
        if !overrides.is_empty() {
            let override_text: Vec<String> = overrides
                .iter()
                .map(|(k, v)| format!("{}: {}", k, v))
                .collect();
            system.push_str(&format!("\n\nStyle overrides:\n{}", override_text.join("\n")));
        }
    }

    if code_mode == Some(true) {
        system.push_str(
            "\n\nCode mode: The user may be dictating code or technical content. Preserve identifiers, keywords, and technical terms exactly.",
        );
    }

    system.push_str(&format!(
        "\n\nAvailable categories: {}",
        CATEGORY_LIST
    ));

    log::info!("[ai_provider] refine_text via provider={}", provider);

    let content = call_provider_blocking(provider, api_key, &system, raw_text, 0.3)?;
    let cleaned = strip_markdown_fences(&content);

    match serde_json::from_str::<serde_json::Value>(&cleaned) {
        Ok(json) => {
            let refined_text = json["refinedText"]
                .as_str()
                .unwrap_or(raw_text)
                .to_string();
            let category = json["category"].as_str().map(|s| s.to_string());
            let title = json["title"].as_str().map(|s| s.to_string());
            Ok(RefinementResult {
                refined_text,
                category,
                title,
            })
        }
        Err(e) => {
            log::warn!("[ai_provider] Failed to parse refine JSON: {}. Falling back to raw.", e);
            Ok(RefinementResult {
                refined_text: raw_text.to_string(),
                category: None,
                title: None,
            })
        }
    }
}

pub async fn send_command(
    raw_text: String,
    clipboard: Option<String>,
    style: Option<String>,
    style_overrides: Option<HashMap<String, String>>,
    code_mode: Option<bool>,
    provider: &str,
    api_key: &str,
) -> Result<CommandResult, String> {
    let provider = provider.to_string();
    let api_key = api_key.to_string();

    let result = tauri::async_runtime::spawn_blocking(move || {
        send_command_blocking(
            &raw_text,
            clipboard.as_deref(),
            style,
            style_overrides,
            code_mode,
            &provider,
            &api_key,
        )
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

fn send_command_blocking(
    raw_text: &str,
    clipboard: Option<&str>,
    style: Option<String>,
    style_overrides: Option<HashMap<String, String>>,
    code_mode: Option<bool>,
    provider: &str,
    api_key: &str,
) -> Result<CommandResult, String> {
    log::info!("[ai_provider] send_command: classifying intent via provider={}", provider);

    // Step 1: Classify intent
    let classify_response =
        call_provider_blocking(provider, api_key, CLASSIFY_SYSTEM_PROMPT, raw_text, 0.1)?;
    let classify_cleaned = strip_markdown_fences(&classify_response);

    let classified: ClassifiedIntent = serde_json::from_str(&classify_cleaned)
        .map_err(|e| format!("Failed to parse classify response: {}. Raw: {}", e, classify_cleaned))?;

    log::info!("[ai_provider] Classified intent: {}", classified.intent);

    match classified.intent.as_str() {
        "dictation" => {
            // Delegate to refine_text_blocking
            let refined = refine_text_blocking(
                raw_text,
                style,
                style_overrides,
                code_mode,
                provider,
                api_key,
            )?;
            let mut params = HashMap::new();
            if let Some(cat) = &refined.category {
                params.insert("category".to_string(), cat.clone());
            }
            if let Some(ttl) = &refined.title {
                params.insert("title".to_string(), ttl.clone());
            }
            Ok(CommandResult {
                result: refined.refined_text,
                action: "dictation".to_string(),
                params: if params.is_empty() { None } else { Some(params) },
            })
        }

        "chain" => {
            let actions = classified.actions.unwrap_or_default();
            let mut current_text = raw_text.to_string();

            for action in &actions {
                let input_text = match action.input_source.as_deref() {
                    Some("clipboard") => clipboard.unwrap_or(raw_text).to_string(),
                    Some("previous") => current_text.clone(),
                    _ => raw_text.to_string(),
                };

                let sys_prompt = action_prompt(&action.intent);
                let user_prompt = build_action_user_prompt(&action.intent, &input_text, &action.params);

                current_text =
                    call_provider_blocking(provider, api_key, sys_prompt, &user_prompt, 0.5)?;
            }

            let last_action = actions.last().map(|a| a.intent.as_str()).unwrap_or("chain");
            Ok(CommandResult {
                result: current_text,
                action: last_action.to_string(),
                params: None,
            })
        }

        intent => {
            // Single action (translate, summarize, draft, explain, unknown)
            let input_source = classified.input_source.as_deref().unwrap_or("spoken");
            let input_text = if input_source == "clipboard" {
                clipboard.unwrap_or(raw_text).to_string()
            } else {
                raw_text.to_string()
            };

            let sys_prompt = action_prompt(intent);
            let user_prompt = build_action_user_prompt(intent, &input_text, &classified.params);

            let result = call_provider_blocking(provider, api_key, sys_prompt, &user_prompt, 0.5)?;

            let params: Option<HashMap<String, String>> = classified.params.clone();

            Ok(CommandResult {
                result,
                action: intent.to_string(),
                params,
            })
        }
    }
}

fn build_action_user_prompt(
    intent: &str,
    text: &str,
    params: &Option<HashMap<String, String>>,
) -> String {
    match intent {
        "translate" => {
            let lang = params
                .as_ref()
                .and_then(|p| p.get("targetLang"))
                .map(|s| s.as_str())
                .unwrap_or("English");
            format!("Translate to {}:\n\n{}", lang, text)
        }
        "draft" => {
            let dtype = params
                .as_ref()
                .and_then(|p| p.get("type"))
                .map(|s| s.as_str())
                .unwrap_or("document");
            let topic = params
                .as_ref()
                .and_then(|p| p.get("topic"))
                .map(|s| s.as_str())
                .unwrap_or(text);
            format!("Write a {} about: {}", dtype, topic)
        }
        _ => text.to_string(),
    }
}

pub async fn send_conversation_turn(
    history: Vec<ConversationTurnMsg>,
    user_message: String,
    provider: &str,
    api_key: &str,
    on_chunk: impl Fn(String) + Send + 'static,
) -> Result<ConversationResponse, String> {
    let provider = provider.to_string();
    let api_key = api_key.to_string();

    let result = tauri::async_runtime::spawn_blocking(move || {
        send_conversation_turn_blocking(&history, &user_message, &provider, &api_key, on_chunk)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

fn send_conversation_turn_blocking(
    history: &[ConversationTurnMsg],
    user_message: &str,
    provider: &str,
    api_key: &str,
    on_chunk: impl Fn(String),
) -> Result<ConversationResponse, String> {
    log::info!("[ai_provider] send_conversation_turn via provider={}", provider);

    // Build messages array: history + new user message
    let mut messages: Vec<ConversationTurnMsg> = history.to_vec();
    messages.push(ConversationTurnMsg {
        role: "user".to_string(),
        content: user_message.to_string(),
    });

    let content = call_provider_with_messages_blocking(
        provider,
        api_key,
        CONVERSATION_SYSTEM_PROMPT,
        &messages,
        0.7,
    )?;

    // No streaming — call on_chunk once with full content
    on_chunk(content.clone());

    Ok(ConversationResponse { content })
}

pub async fn summarize_conversation(
    history: Vec<ConversationTurnMsg>,
    provider: &str,
    api_key: &str,
) -> Result<SummarizeResponse, String> {
    let provider = provider.to_string();
    let api_key = api_key.to_string();

    let result = tauri::async_runtime::spawn_blocking(move || {
        summarize_conversation_blocking(&history, &provider, &api_key)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

fn summarize_conversation_blocking(
    history: &[ConversationTurnMsg],
    provider: &str,
    api_key: &str,
) -> Result<SummarizeResponse, String> {
    log::info!("[ai_provider] summarize_conversation via provider={}", provider);

    // Format history as plain text
    let conversation_text: String = history
        .iter()
        .map(|m| {
            let role_label = if m.role == "user" { "User" } else { "Assistant" };
            format!("{}: {}", role_label, m.content)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let content = call_provider_blocking(
        provider,
        api_key,
        SUMMARIZE_SYSTEM_PROMPT,
        &conversation_text,
        0.3,
    )?;

    let cleaned = strip_markdown_fences(&content);

    match serde_json::from_str::<serde_json::Value>(&cleaned) {
        Ok(json) => {
            let summary = json["summary"]
                .as_str()
                .unwrap_or("Conversation summary")
                .to_string();
            let title = json["title"]
                .as_str()
                .unwrap_or("Conversation")
                .to_string();
            let key_points = json["keyPoints"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            Ok(SummarizeResponse {
                summary,
                title,
                key_points,
            })
        }
        Err(e) => {
            log::warn!("[ai_provider] Failed to parse summarize JSON: {}. Using fallback.", e);
            Ok(SummarizeResponse {
                summary: content.clone(),
                title: "Conversation".to_string(),
                key_points: vec![],
            })
        }
    }
}
