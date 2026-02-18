use serde::{Deserialize, Serialize};
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

    // Collect response (may come in chunks)
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
