import * as vscode from "vscode";

const REFINEMENT_PROMPTS: Record<string, string> = {
  Professional:
    "You are a professional writing assistant. Clean up the following raw speech transcript into clear, professional prose. Fix grammar, remove filler words (um, uh, like), and improve clarity while preserving the original meaning. Return ONLY the refined text, nothing else.",
  Casual:
    "You are a friendly writing assistant. Clean up this speech transcript into natural, casual text. Remove filler words and fix grammar but keep the tone conversational. Return ONLY the refined text, nothing else.",
  Technical:
    "You are a technical writing assistant. Clean up this speech transcript into precise, technical documentation. Remove filler words, fix grammar, and use appropriate technical terminology. Return ONLY the refined text, nothing else.",
  Creative:
    "You are a creative writing assistant. Transform this speech transcript into engaging, expressive prose. Remove filler words, enhance the language, and make it compelling while preserving the core meaning. Return ONLY the refined text, nothing else.",
};

export async function refineWithCopilot(
  rawText: string,
  style: string = "Professional",
  token: vscode.CancellationToken
): Promise<string> {
  // Select a Copilot model
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

  // Collect the full response
  const chunks: string[] = [];
  for await (const fragment of response.text) {
    chunks.push(fragment);
  }

  const result = chunks.join("");

  if (!result.trim()) {
    throw new Error("Copilot returned an empty response");
  }

  return result.trim();
}

export async function streamRefineWithCopilot(
  rawText: string,
  style: string = "Professional",
  token: vscode.CancellationToken,
  onChunk: (chunk: string) => void
): Promise<string> {
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
    onChunk(fragment);
  }

  return chunks.join("").trim();
}
