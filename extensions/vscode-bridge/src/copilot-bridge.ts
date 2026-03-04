import * as vscode from "vscode";

const CATEGORY_LIST = "Interview, Thought, Work, Research, Strategy, Idea, Meeting, Personal, Creative, Note";

const REFINEMENT_PROMPTS: Record<string, string> = {
  Professional: `You are a professional writing assistant. Clean up the following raw speech transcript into clear, professional prose. Fix grammar, remove filler words (um, uh, like), and improve clarity while preserving the original meaning.

Also assign a category from this list: ${CATEGORY_LIST}. Pick the one that best fits the content.
Also generate a short title (3-8 words) that captures the main topic.

Return your response as JSON only, no markdown, no code fences:
{"refinedText": "...", "category": "...", "title": "..."}`,

  Casual: `You are a friendly writing assistant. Clean up this speech transcript into natural, casual text. Remove filler words and fix grammar but keep the tone conversational.

Also assign a category from: ${CATEGORY_LIST}.
Also generate a short title (3-8 words).

Return JSON only: {"refinedText": "...", "category": "...", "title": "..."}`,

  Technical: `You are a technical writing assistant. Clean up this speech transcript into precise, technical documentation. Remove filler words, fix grammar, and use appropriate technical terminology.

Also assign a category from: ${CATEGORY_LIST}.
Also generate a short title (3-8 words).

Return JSON only: {"refinedText": "...", "category": "...", "title": "..."}`,

  Creative: `You are a creative writing assistant. Transform this speech transcript into engaging, expressive prose. Remove filler words, enhance the language, and make it compelling while preserving the core meaning.

Also assign a category from: ${CATEGORY_LIST}.
Also generate a short title (3-8 words).

Return JSON only: {"refinedText": "...", "category": "...", "title": "..."}`,
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
  const systemPrompt =
    REFINEMENT_PROMPTS[style] || REFINEMENT_PROMPTS["Professional"];

  const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(`Raw transcript:\n\n${rawText}`),
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

  // Try to parse as JSON
  try {
    // Strip markdown code fences if present
    const cleaned = result.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      refinedText: parsed.refinedText || result,
      category: parsed.category || "Note",
      title: parsed.title || "",
    };
  } catch {
    // If JSON parsing fails, return raw text with default category
    return {
      refinedText: result,
      category: "Note",
      title: "",
    };
  }
}
