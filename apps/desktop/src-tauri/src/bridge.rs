use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use std::time::Duration;
use tungstenite::{connect, Message};

const VSCODE_BRIDGE_URL: &str = "ws://127.0.0.1:9147";

#[derive(Serialize)]
struct RefineRequest {
    #[serde(rename = "type")]
    msg_type: String,
    id: String,
    #[serde(rename = "rawText")]
    raw_text: String,
}

#[derive(Deserialize)]
struct RefineResponse {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(rename = "refinedText")]
    refined_text: Option<String>,
    error: Option<String>,
}

pub async fn refine_text(raw_text: &str) -> Result<String, String> {
    let raw = raw_text.to_string();

    // Run blocking WebSocket call on a dedicated thread to avoid starving tokio
    let result = tauri::async_runtime::spawn_blocking(move || {
        refine_text_blocking(&raw)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

fn refine_text_blocking(raw_text: &str) -> Result<String, String> {
    // Quick TCP check with 500ms timeout — fail fast if bridge isn't running
    let addr = "127.0.0.1:9147";
    let stream = TcpStream::connect_timeout(
        &addr.parse().unwrap(),
        Duration::from_millis(500),
    ).map_err(|e| format!("Bridge not available: {}", e))?;
    drop(stream);

    // Now do the actual WebSocket connection (we know the port is open)
    let request = RefineRequest {
        msg_type: "refine".to_string(),
        id: uuid_simple(),
        raw_text: raw_text.to_string(),
    };

    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;

    let (mut socket, _response) = connect(VSCODE_BRIDGE_URL)
        .map_err(|e| format!("Failed to connect to VS Code bridge: {}", e))?;

    socket.send(Message::Text(request_json))
        .map_err(|e| format!("Failed to send message: {}", e))?;

    let mut refined = String::new();

    loop {
        let msg = socket.read()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        match msg {
            Message::Text(text) => {
                let response: RefineResponse = serde_json::from_str(&text)
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
                        break;
                    }
                    _ => {}
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let _ = socket.close(None);

    if refined.is_empty() {
        Ok(raw_text.to_string())
    } else {
        Ok(refined)
    }
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", nanos)
}
