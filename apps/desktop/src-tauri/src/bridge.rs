use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::TcpStream;
use std::sync::atomic::{AtomicU64, AtomicU32, Ordering};
use std::time::Duration;
use tungstenite::{connect, Message, WebSocket, stream::MaybeTlsStream};

const VSCODE_BRIDGE_BASE: &str = "ws://127.0.0.1:9147/";

fn bridge_url() -> String {
    let home = if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE").ok()
    } else {
        std::env::var("HOME").ok()
    };
    let token = home
        .map(|h| std::path::PathBuf::from(h).join(".yapper").join("bridge-token"))
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default()
        .trim()
        .to_string();
    if token.is_empty() {
        VSCODE_BRIDGE_BASE.to_string()
    } else {
        format!("{}?token={}", VSCODE_BRIDGE_BASE, token)
    }
}

static BRIDGE_FAIL_COUNT: AtomicU32 = AtomicU32::new(0);
static BRIDGE_COOLDOWN_UNTIL: AtomicU64 = AtomicU64::new(0);
const BRIDGE_FAIL_THRESHOLD: u32 = 3;
const BRIDGE_COOLDOWN_SECS: u64 = 30;

#[derive(Serialize)]
struct RefineRequest {
    #[serde(rename = "type")]
    msg_type: String,
    id: String,
    #[serde(rename = "rawText")]
    raw_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    style: Option<String>,
    #[serde(rename = "styleOverrides", skip_serializing_if = "Option::is_none")]
    style_overrides: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "codeMode", skip_serializing_if = "Option::is_none")]
    code_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

#[derive(Serialize)]
pub struct ConversationRequest {
    #[serde(rename = "type")]
    msg_type: String,
    id: String,
    #[serde(rename = "turnId")]
    turn_id: String,
    history: Vec<ConversationTurnMsg>,
    #[serde(rename = "userMessage")]
    user_message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

#[derive(Serialize)]
pub struct SummarizeRequest {
    #[serde(rename = "type")]
    msg_type: String,
    id: String,
    history: Vec<ConversationTurnMsg>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

#[derive(Serialize)]
struct CommandRequest {
    #[serde(rename = "type")]
    msg_type: String,
    id: String,
    #[serde(rename = "rawText")]
    raw_text: String,
    clipboard: Option<String>,
    style: Option<String>,
    #[serde(rename = "styleOverrides", skip_serializing_if = "Option::is_none")]
    style_overrides: Option<HashMap<String, String>>,
    #[serde(rename = "codeMode", skip_serializing_if = "Option::is_none")]
    code_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ConversationTurnMsg {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
struct BridgeResponse {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(rename = "refinedText")]
    refined_text: Option<String>,
    content: Option<String>,
    summary: Option<String>,
    category: Option<String>,
    title: Option<String>,
    #[serde(rename = "keyPoints")]
    key_points: Option<Vec<String>>,
    error: Option<String>,
    #[serde(default)]
    result: Option<String>,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    params: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone)]
pub struct RefinementResult {
    pub refined_text: String,
    pub category: Option<String>,
    pub title: Option<String>,
}

pub async fn refine_text(
    raw_text: &str,
    style: Option<String>,
    style_overrides: Option<std::collections::HashMap<String, String>>,
    code_mode: Option<bool>,
    model: Option<String>,
) -> Result<RefinementResult, String> {
    let raw = raw_text.to_string();

    let result = tauri::async_runtime::spawn_blocking(move || {
        refine_text_blocking(&raw, style, style_overrides, code_mode, model)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

fn refine_text_blocking(
    raw_text: &str,
    style: Option<String>,
    style_overrides: Option<std::collections::HashMap<String, String>>,
    code_mode: Option<bool>,
    model: Option<String>,
) -> Result<RefinementResult, String> {
    let mut socket = open_bridge_socket()?;

    let request = RefineRequest {
        msg_type: "refine".to_string(),
        id: crate::store::uuid_simple(),
        raw_text: raw_text.to_string(),
        style,
        style_overrides,
        code_mode,
        model,
    };

    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    socket.send(Message::Text(request_json))
        .map_err(|e| format!("Failed to send message: {}", e))?;

    let mut refined = String::new();
    let mut category: Option<String> = None;
    let mut title: Option<String> = None;

    loop {
        let msg = socket.read()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        match msg {
            Message::Text(text) => {
                let response: BridgeResponse = serde_json::from_str(&text)
                    .map_err(|e| format!("Invalid response: {}", e))?;

                if let Some(error) = response.error {
                    return Err(error);
                }

                match response.msg_type.as_str() {
                    "chunk" => {
                        if let Some(text) = response.refined_text {
                            refined.push_str(&text);
                        }
                    }
                    "result" | "complete" => {
                        if let Some(text) = response.refined_text {
                            refined = text;
                        }
                        category = response.category;
                        title = response.title;
                        break;
                    }
                    _ => {}
                }
            }
            Message::Close(_) => {
                return Err("Bridge closed connection before completing refinement".to_string());
            }
            _ => {}
        }
    }

    let _ = socket.close(None);

    Ok(RefinementResult {
        refined_text: if refined.is_empty() { raw_text.to_string() } else { refined },
        category,
        title,
    })
}

// --- Conversation support ---

#[derive(Debug, Clone)]
pub struct ConversationResponse {
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct SummarizeResponse {
    pub summary: String,
    pub title: String,
    pub key_points: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct CommandResult {
    pub result: String,
    pub action: String,
    pub params: Option<HashMap<String, String>>,
}

/// Send a conversation turn to the bridge and collect the AI response.
/// Calls `on_chunk` for each streaming chunk.
pub async fn send_conversation_turn(
    history: Vec<ConversationTurnMsg>,
    user_message: String,
    on_chunk: impl Fn(String) + Send + 'static,
    model: Option<String>,
) -> Result<ConversationResponse, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        send_conversation_turn_blocking(&history, &user_message, on_chunk, model)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

fn send_conversation_turn_blocking(
    history: &[ConversationTurnMsg],
    user_message: &str,
    on_chunk: impl Fn(String),
    model: Option<String>,
) -> Result<ConversationResponse, String> {
    let mut socket = open_bridge_socket()?;

    let request = ConversationRequest {
        msg_type: "conversation".to_string(),
        id: crate::store::uuid_simple(),
        turn_id: crate::store::uuid_simple(),
        history: history.to_vec(),
        user_message: user_message.to_string(),
        model,
    };

    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    socket.send(Message::Text(request_json))
        .map_err(|e| format!("Failed to send message: {}", e))?;

    let mut full_content = String::new();

    loop {
        let msg = socket.read()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        match msg {
            Message::Text(text) => {
                let response: BridgeResponse = serde_json::from_str(&text)
                    .map_err(|e| format!("Invalid response: {}", e))?;

                if let Some(error) = response.error {
                    return Err(error);
                }

                match response.msg_type.as_str() {
                    "conversation_chunk" => {
                        if let Some(chunk) = &response.content {
                            on_chunk(chunk.clone());
                            full_content.push_str(chunk);
                        }
                    }
                    "conversation_result" => {
                        if let Some(content) = response.content {
                            full_content = content;
                        }
                        break;
                    }
                    "error" => {
                        return Err(response.error.unwrap_or_else(|| "Unknown error".to_string()));
                    }
                    _ => {}
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let _ = socket.close(None);

    Ok(ConversationResponse {
        content: full_content,
    })
}

/// Send a summarize request to the bridge.
pub async fn summarize_conversation(
    history: Vec<ConversationTurnMsg>,
    model: Option<String>,
) -> Result<SummarizeResponse, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        summarize_conversation_blocking(&history, model)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

fn summarize_conversation_blocking(
    history: &[ConversationTurnMsg],
    model: Option<String>,
) -> Result<SummarizeResponse, String> {
    let mut socket = open_bridge_socket()?;

    let request = SummarizeRequest {
        msg_type: "summarize".to_string(),
        id: crate::store::uuid_simple(),
        history: history.to_vec(),
        model,
    };

    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    socket.send(Message::Text(request_json))
        .map_err(|e| format!("Failed to send message: {}", e))?;

    loop {
        let msg = socket.read()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        match msg {
            Message::Text(text) => {
                let response: BridgeResponse = serde_json::from_str(&text)
                    .map_err(|e| format!("Invalid response: {}", e))?;

                if let Some(error) = response.error {
                    return Err(error);
                }

                if response.msg_type == "summarize_result" {
                    let _ = socket.close(None);
                    return Ok(SummarizeResponse {
                        summary: response.summary.unwrap_or_default(),
                        title: response.title.unwrap_or_else(|| "Conversation".to_string()),
                        key_points: response.key_points.unwrap_or_default(),
                    });
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let _ = socket.close(None);
    Err("Bridge closed without sending summary".to_string())
}

// --- Command flow ---

pub async fn send_command(
    raw_text: String,
    clipboard: Option<String>,
    style: Option<String>,
    style_overrides: Option<HashMap<String, String>>,
    code_mode: Option<bool>,
    model: Option<String>,
) -> Result<CommandResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        send_command_blocking(&raw_text, clipboard.as_deref(), style.as_deref(), style_overrides, code_mode, model)
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))?;
    result
}

fn send_command_blocking(
    raw_text: &str,
    clipboard: Option<&str>,
    style: Option<&str>,
    style_overrides: Option<HashMap<String, String>>,
    code_mode: Option<bool>,
    model: Option<String>,
) -> Result<CommandResult, String> {
    let mut socket = open_bridge_socket()?;

    let request = CommandRequest {
        msg_type: "command".to_string(),
        id: crate::store::uuid_simple(),
        raw_text: raw_text.to_string(),
        clipboard: clipboard.map(|s| s.to_string()),
        style: style.map(|s| s.to_string()),
        style_overrides,
        code_mode,
        model,
    };

    let json = serde_json::to_string(&request).map_err(|e| format!("Serialize error: {e}"))?;
    socket
        .send(tungstenite::Message::Text(json))
        .map_err(|e| format!("Send error: {e}"))?;

    loop {
        let msg = socket
            .read()
            .map_err(|e| format!("Read error: {e}"))?;

        match msg {
            tungstenite::Message::Text(text) => {
                let resp: BridgeResponse =
                    serde_json::from_str(&text).map_err(|e| format!("Parse error: {e}"))?;

                match resp.msg_type.as_str() {
                    "command_result" => {
                        let result = resp.result
                            .or(resp.refined_text)
                            .unwrap_or_default();
                        let action = resp.action
                            .unwrap_or_else(|| "unknown".to_string());
                        return Ok(CommandResult {
                            result,
                            action,
                            params: resp.params,
                        });
                    }
                    "error" => {
                        return Err(resp.error.unwrap_or_else(|| "Unknown bridge error".to_string()));
                    }
                    _ => continue,
                }
            }
            tungstenite::Message::Close(_) => {
                return Err("Bridge closed connection".to_string());
            }
            _ => continue,
        }
    }
}

// --- Model listing ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeModelInfo {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub family: String,
}

pub async fn list_models() -> Result<Vec<BridgeModelInfo>, String> {
    let result = tauri::async_runtime::spawn_blocking(list_models_blocking)
        .await
        .map_err(|e| format!("Task failed: {}", e))?;
    result
}

fn list_models_blocking() -> Result<Vec<BridgeModelInfo>, String> {
    let mut socket = open_bridge_socket()?;

    let request = serde_json::json!({
        "type": "list-models",
        "id": crate::store::uuid_simple()
    });

    socket.send(tungstenite::Message::Text(request.to_string()))
        .map_err(|e| format!("Failed to send message: {}", e))?;

    loop {
        let msg = socket.read()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        match msg {
            tungstenite::Message::Text(text) => {
                let response: serde_json::Value = serde_json::from_str(&text)
                    .map_err(|e| format!("Invalid response: {}", e))?;

                if let Some(error) = response.get("error").and_then(|e| e.as_str()) {
                    return Err(error.to_string());
                }

                if response.get("type").and_then(|t| t.as_str()) == Some("models-list") {
                    let models: Vec<BridgeModelInfo> = response.get("models")
                        .and_then(|m| serde_json::from_value(m.clone()).ok())
                        .unwrap_or_default();
                    let _ = socket.close(None);
                    return Ok(models);
                }
            }
            tungstenite::Message::Close(_) => {
                return Err("Bridge closed connection".to_string());
            }
            _ => continue,
        }
    }
}

// --- Vision support ---

#[derive(Debug, serde::Serialize)]
pub struct VisionRequest {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: String,
    pub image: String,
    pub prompt: String,
    pub token: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VisionResponse {
    pub analysis: String,
}

pub async fn send_vision_request(image: &str, prompt: &str) -> Result<VisionResponse, String> {
    let image = image.to_string();
    let prompt = prompt.to_string();
    let result = tauri::async_runtime::spawn_blocking(move || {
        send_vision_request_blocking(&image, &prompt)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;
    result
}

fn send_vision_request_blocking(image: &str, prompt: &str) -> Result<VisionResponse, String> {
    let home = if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE").ok()
    } else {
        std::env::var("HOME").ok()
    };
    let token = home
        .map(|h| std::path::PathBuf::from(h).join(".yapper").join("bridge-token"))
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    let mut socket = open_bridge_socket()?;

    let request = VisionRequest {
        msg_type: "vision".to_string(),
        id: crate::store::uuid_simple(),
        image: image.to_string(),
        prompt: prompt.to_string(),
        token,
    };

    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    socket
        .send(Message::Text(request_json))
        .map_err(|e| format!("Failed to send message: {}", e))?;

    loop {
        let msg = socket
            .read()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        match msg {
            Message::Text(text) => {
                let response: BridgeResponse = serde_json::from_str(&text)
                    .map_err(|e| format!("Invalid response: {}", e))?;

                if let Some(error) = response.error {
                    return Err(error);
                }

                if response.msg_type == "vision_result" {
                    let _ = socket.close(None);
                    return Ok(VisionResponse {
                        analysis: response.refined_text.unwrap_or_default(),
                    });
                }
            }
            Message::Close(_) => {
                return Err("Bridge closed connection before completing vision request".to_string());
            }
            _ => {}
        }
    }
}

// --- Shared helpers ---

fn open_bridge_socket() -> Result<WebSocket<MaybeTlsStream<TcpStream>>, String> {
    // Circuit breaker check
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let cooldown = BRIDGE_COOLDOWN_UNTIL.load(Ordering::Relaxed);
    if now < cooldown {
        return Err("Bridge in cooldown after repeated failures".to_string());
    }

    let addr = "127.0.0.1:9147";
    let stream = TcpStream::connect_timeout(
        &addr.parse().unwrap(),
        Duration::from_millis(500),
    ).map_err(|e| {
        let fails = BRIDGE_FAIL_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
        if fails >= BRIDGE_FAIL_THRESHOLD {
            BRIDGE_COOLDOWN_UNTIL.store(now + BRIDGE_COOLDOWN_SECS, Ordering::Relaxed);
            BRIDGE_FAIL_COUNT.store(0, Ordering::Relaxed);
            log::warn!("Bridge failed {} times, cooling down for {}s", fails, BRIDGE_COOLDOWN_SECS);
        }
        format!("Bridge not available: {}", e)
    })?;
    drop(stream);

    let (socket, _response) = connect(bridge_url())
        .map_err(|e| format!("Failed to connect to VS Code bridge: {}", e))?;

    // Success -- reset circuit breaker
    BRIDGE_FAIL_COUNT.store(0, Ordering::Relaxed);

    if let MaybeTlsStream::Plain(ref s) = socket.get_ref() {
        let _ = s.set_read_timeout(Some(Duration::from_secs(30)));
    }

    Ok(socket)
}
