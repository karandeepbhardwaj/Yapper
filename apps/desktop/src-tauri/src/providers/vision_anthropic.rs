use crate::providers::VisionProvider;
use base64::Engine;

pub struct AnthropicVisionProvider {
    api_key: String,
    model: String,
}

impl AnthropicVisionProvider {
    pub fn new(api_key: &str, model: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: if model.is_empty() {
                "claude-haiku-4-5-20251001".to_string()
            } else {
                model.to_string()
            },
        }
    }
}

impl VisionProvider for AnthropicVisionProvider {
    fn analyze(&self, image_bytes: &[u8], prompt: &str) -> Result<String, String> {
        let b64 = base64::engine::general_purpose::STANDARD.encode(image_bytes);

        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 2048,
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": b64,
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    }
                ]
            }]
        });

        let body_str = body.to_string();

        let mut response = ureq::post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .send(body_str.as_str())
            .map_err(|e| format!("Anthropic vision API error: {e}"))?;

        let body = response
            .body_mut()
            .read_to_string()
            .map_err(|e| format!("Anthropic vision read response failed: {e}"))?;

        let parsed: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("Anthropic vision JSON parse failed: {e}"))?;

        parsed["content"][0]["text"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| format!("Anthropic vision response missing content. Body: {}", body))
    }

    fn ocr(&self, image_bytes: &[u8]) -> Result<String, String> {
        self.analyze(
            image_bytes,
            "Extract all visible text from this image. Return only the extracted text, preserving the original layout as much as possible.",
        )
    }

    fn supports_ai_analysis(&self) -> bool {
        true
    }
}
