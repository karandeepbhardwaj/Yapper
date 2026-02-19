import * as vscode from "vscode";

const CATEGORY_LIST = "Interview, Thought, Work, Research, Strategy, Idea, Meeting, Personal, Creative, Note, Email, Message";

const SYSTEM_PROMPT = `You are Yapper — an intelligent voice-to-text refinement assistant. You receive raw speech transcripts and transform them into polished, well-structured text.

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
- Assign a category from: ${CATEGORY_LIST}
- Generate a short title (3-8 words) capturing the main topic
- For emails: title should be the email subject line
- For messages: title should summarize who/what the response is about

Return JSON only. No markdown, no code fences, no explanation:
{"refinedText": "...", "category": "...", "title": "..."}`;

const STYLE_MODIFIERS: Record<string, string> = {
  Professional: "Use a professional, clear tone. Prefer concise sentences. Avoid colloquialisms.",
  Casual: "Keep a natural, conversational tone. It's okay to be informal but still grammatically correct.",
  Technical: "Use precise, technical language. Prefer specific terminology over general descriptions. Structure for clarity.",
  Creative: "Enhance the language to be engaging and expressive. Use vivid words and varied sentence structure while preserving meaning.",
};

export interface RefinementResult {
  refinedText: string;
  category: string;
  title: string;
}

export async function refineWithCopilot(
  rawText: string,
  style: string = "Professional",
  token: vscode.CancellationToken
): Promise<RefinementResult> {
  const models = await vscode.lm.selectChatModels({
    vendor: "copilot",
  });

  if (models.length === 0) {
    throw new Error(
      "No Copilot models available. Ensure GitHub Copilot is installed and activated."
    );
  }

  const model = models[0];
  const styleNote = STYLE_MODIFIERS[style] || STYLE_MODIFIERS["Professional"];

  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    vscode.LanguageModelChatMessage.User(`Style: ${styleNote}\n\nRaw transcript:\n\n${rawText}`),
  ];

  const response = await model.sendRequest(messages, {}, token);

  const chunks: string[] = [];
  for await (const fragment of response.text) {
    chunks.push(fragment);
  }

  const result = chunks.join("").trim();

  if (!result) {
    throw new Error("Copilot returned an empty response");
  }

  try {
    const cleaned = result
      .replace(/^```(?:json)?\s*/g, "")
      .replace(/\s*```$/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      refinedText: parsed.refinedText || result,
      category: parsed.category || "Note",
      title: parsed.title || "",
    };
  } catch {
    return {
      refinedText: result,
      category: "Note",
      title: "",
    };
  }
}
