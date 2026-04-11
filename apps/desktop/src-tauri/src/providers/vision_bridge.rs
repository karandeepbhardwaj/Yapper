use crate::bridge;
use crate::providers::VisionProvider;
use base64::Engine;

pub struct CopilotVisionProvider;

impl CopilotVisionProvider {
    pub fn new() -> Self {
        Self
    }
}

impl VisionProvider for CopilotVisionProvider {
    fn analyze(&self, image_bytes: &[u8], prompt: &str) -> Result<String, String> {
        let b64 = base64::engine::general_purpose::STANDARD.encode(image_bytes);
        let result = tokio::runtime::Handle::current()
            .block_on(bridge::send_vision_request(&b64, prompt))?;
        Ok(result.analysis)
    }

    fn ocr(&self, image_bytes: &[u8]) -> Result<String, String> {
        self.analyze(image_bytes, "Extract all visible text from this image. Return only the extracted text.")
    }

    fn supports_ai_analysis(&self) -> bool {
        true
    }
}
