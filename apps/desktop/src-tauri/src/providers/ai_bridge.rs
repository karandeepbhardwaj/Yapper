use crate::bridge;
use crate::providers::{
    AiProvider, CommandResult, ConversationResponse, Intent, RefinementResult,
    StyleOverrides, SummaryResult,
};

/// Routes AI calls through the VS Code extension bridge (Copilot).
pub struct BridgeAiProvider {
    model: String,
}

impl BridgeAiProvider {
    pub fn new(model: &str) -> Self {
        Self {
            model: model.to_string(),
        }
    }
}

impl AiProvider for BridgeAiProvider {
    fn refine(
        &self,
        raw_text: &str,
        style: &str,
        style_overrides: &StyleOverrides,
        code_mode: bool,
    ) -> Result<RefinementResult, String> {
        let model = if self.model.is_empty() {
            None
        } else {
            Some(self.model.clone())
        };
        let style_overrides_opt = if style_overrides.is_empty() {
            None
        } else {
            Some(style_overrides.clone())
        };
        let result = tokio::runtime::Handle::current().block_on(bridge::refine_text(
            raw_text,
            Some(style.to_string()),
            style_overrides_opt,
            Some(code_mode),
            model,
        ))?;
        Ok(RefinementResult {
            refined_text: result.refined_text,
            category: result.category,
            title: result.title,
        })
    }

    fn classify_intent(&self, _raw_text: &str) -> Result<Intent, String> {
        // Bridge handles classification internally via handleCommand.
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
        let model = if self.model.is_empty() {
            None
        } else {
            Some(self.model.clone())
        };
        let clipboard_opt = if clipboard.is_empty() {
            None
        } else {
            Some(clipboard.to_string())
        };
        let style_overrides_opt = if style_overrides.is_empty() {
            None
        } else {
            Some(style_overrides.clone())
        };
        let result = tokio::runtime::Handle::current().block_on(bridge::send_command(
            raw_text.to_string(),
            clipboard_opt,
            Some(style.to_string()),
            style_overrides_opt,
            Some(code_mode),
            model,
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
        let model = if self.model.is_empty() {
            None
        } else {
            Some(self.model.clone())
        };
        let history_owned = history.to_vec();
        let user_message_owned = user_message.to_string();
        let result = tokio::runtime::Handle::current().block_on(bridge::send_conversation_turn(
            history_owned,
            user_message_owned,
            move |chunk: String| {
                if let Some(ref cb) = on_chunk {
                    cb(&chunk);
                }
            },
            model,
        ))?;
        Ok(ConversationResponse {
            content: result.content,
        })
    }

    fn summarize(
        &self,
        history: &[bridge::ConversationTurnMsg],
    ) -> Result<SummaryResult, String> {
        let model = if self.model.is_empty() {
            None
        } else {
            Some(self.model.clone())
        };
        let history_owned = history.to_vec();
        let result = tokio::runtime::Handle::current().block_on(
            bridge::summarize_conversation(history_owned, model),
        )?;
        Ok(SummaryResult {
            summary: result.summary,
            title: result.title,
            key_points: result.key_points,
        })
    }
}
