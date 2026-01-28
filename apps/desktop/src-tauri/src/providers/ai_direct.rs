use crate::ai_provider;
use crate::bridge;
use crate::providers::{
    AiProvider, CommandResult, ConversationResponse, Intent, RefinementResult,
    StyleOverrides, SummaryResult,
};

/// Direct HTTPS calls to Groq or Anthropic APIs.
pub struct DirectAiProvider {
    provider: String,
    api_key: String,
    model: String,
}

impl DirectAiProvider {
    pub fn new(provider: &str, api_key: &str, model: &str) -> Self {
        Self {
            provider: provider.to_string(),
            api_key: api_key.to_string(),
            model: model.to_string(),
        }
    }
}

impl AiProvider for DirectAiProvider {
    fn refine(
        &self,
        raw_text: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<RefinementResult, String> {
        let result = tokio::runtime::Handle::current().block_on(ai_provider::refine_text(
            raw_text,
            Some(style.to_string()),
            Some(style_overrides.clone()),
            Some(code_mode),
            &self.provider,
            &self.api_key,
            &self.model,
        ))?;
        Ok(RefinementResult {
            refined_text: result.refined_text,
            category: result.category,
            title: result.title,
        })
    }

    fn classify_intent(&self, _raw_text: &str) -> Result<Intent, String> {
        Ok(Intent {
            intent: "dictation".to_string(),
            params: None,
            input_source: None,
            description: None,
            actions: None,
        })
    }

    fn send_command(
        &self,
        raw_text: &str,
        clipboard: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<CommandResult, String> {
        let result = tokio::runtime::Handle::current().block_on(ai_provider::send_command(
            raw_text.to_string(),
            Some(clipboard.to_string()),
            Some(style.to_string()),
            Some(style_overrides.clone()),
            Some(code_mode),
            &self.provider,
            &self.api_key,
            &self.model,
        ))?;
        Ok(CommandResult {
            result: result.result,
            action: result.action,
            params: result.params,
        })
    }

    fn converse(
        &self,
        history: &[bridge::ConversationTurnMsg],
        user_message: &str,
        on_chunk: Option<Box<dyn Fn(&str) + Send>>,
    ) -> Result<ConversationResponse, String> {
        let on_chunk_owned = on_chunk.map(|f| {
            let f: Box<dyn Fn(&str) + Send> = f;
            move |s: String| f(&s)
        });
        let result =
            tokio::runtime::Handle::current().block_on(ai_provider::send_conversation_turn(
                history.to_vec(),
                user_message.to_string(),
                &self.provider,
                &self.api_key,
                &self.model,
                move |s| {
                    if let Some(ref cb) = on_chunk_owned {
                        cb(s);
                    }
                },
            ))?;
        Ok(ConversationResponse {
            content: result.content,
        })
    }

    fn summarize(
        &self,
        history: &[bridge::ConversationTurnMsg],
    ) -> Result<SummaryResult, String> {
        let result =
            tokio::runtime::Handle::current().block_on(ai_provider::summarize_conversation(
                history.to_vec(),
                &self.provider,
                &self.api_key,
                &self.model,
            ))?;
        Ok(SummaryResult {
            summary: result.summary,
            title: result.title,
            key_points: result.key_points,
        })
    }
}
