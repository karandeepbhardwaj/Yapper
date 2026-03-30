import * as vscode from "vscode";
import type { ConversationTurn, ClassifiedIntent, ClassifiedAction } from "./protocol";

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

const CLASSIFY_SYSTEM_PROMPT = `You are a voice command classifier. Given a user's spoken transcript, determine their intent.

Return ONLY valid JSON with no markdown fences. Possible intents:
- "dictation" — user is dictating text to be refined and pasted (this is the default)
- "translate" — user wants text translated. Extract targetLang.
- "summarize" — user wants text summarized
- "draft" — user wants structured writing generated. Extract type (email, message, PR description, commit message, etc.) and topic.
- "explain" — user wants something explained
- "unknown" — user wants something else. Include a description.
- "chain" — user wants multiple actions in sequence. Return an actions array.

For inputSource:
- "spoken" — the user's own words are the content to process (e.g., "translate hello world to Spanish")
- "clipboard" — the user wants to act on their clipboard content (e.g., "summarize this", "explain this code")

Examples:
- "I need to send an email to the team about the deadline" → {"intent": "dictation"}
- "Translate this to Spanish" → {"intent": "translate", "params": {"targetLang": "Spanish"}, "inputSource": "clipboard"}
- "Translate hello world to French" → {"intent": "translate", "params": {"targetLang": "French"}, "inputSource": "spoken"}
- "Summarize this" → {"intent": "summarize", "inputSource": "clipboard"}
- "Draft an email about tomorrow's standup" → {"intent": "draft", "params": {"type": "email", "topic": "tomorrow's standup"}, "inputSource": "spoken"}
- "Explain this function" → {"intent": "explain", "inputSource": "clipboard"}
- "Translate this to German and then summarize it" → {"intent": "chain", "actions": [{"intent": "translate", "params": {"targetLang": "German"}, "inputSource": "clipboard"}, {"intent": "summarize", "inputSource": "previous"}]}
- "Rewrite this as a haiku" → {"intent": "unknown", "description": "Rewrite text as a haiku", "inputSource": "clipboard"}`;

const ACTION_PROMPTS: Record<string, string> = {
  translate: `You are a translator. Translate the given text to the target language naturally, preserving tone, formatting, and meaning. Return ONLY the translated text with no explanation or wrapping.`,

  summarize: `You are a summarizer. Produce a concise summary of the given text. Include key points as bullet points if the text is long. Return ONLY the summary with no explanation or wrapping.`,

  draft: `You are a writing assistant. Generate structured writing matching the requested type and topic. For emails, include a subject line. For messages, keep it concise. For PR descriptions, use markdown with sections. Return ONLY the drafted text with no explanation or wrapping.`,

  explain: `You are an explainer. Explain the given content clearly and concisely. If it's code, explain what it does, key patterns, and any notable aspects. If it's general text, break down the key concepts. Return ONLY the explanation with no wrapping.`,
};

// --- vscode.lm helper ---

async function callVscodeLm(
  systemPrompt: string,
  userPrompt: string,
  token: vscode.CancellationToken,
  model?: string,
): Promise<string> {
  let models: vscode.LanguageModelChat[];
  if (model) {
    models = await vscode.lm.selectChatModels({ family: model });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({ id: model });
    }
    if (models.length === 0) {
      console.warn(`[Yapper] Requested model '${model}' not found, using first available`);
      models = await vscode.lm.selectChatModels();
    }
  } else {
    models = await vscode.lm.selectChatModels();
  }
  if (models.length === 0) {
    throw new Error("No AI model available. Install GitHub Copilot in VS Code.");
  }
  const selected = models[0];
  console.log(`[Yapper] Using vscode.lm: ${selected.name} (${selected.vendor}/${selected.family})`);
  const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(userPrompt),
  ];
  const response = await selected.sendRequest(messages, {}, token);
  const chunks: string[] = [];
  for await (const fragment of response.text) {
    chunks.push(fragment);
  }
  return chunks.join("");
}

export async function classifyIntent(
  rawText: string,
  token: vscode.CancellationToken,
  model?: string,
): Promise<ClassifiedIntent> {
  try {
    const result = await callVscodeLm(CLASSIFY_SYSTEM_PROMPT, rawText, token, model);
    const cleaned = result.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as ClassifiedIntent;
  } catch (err) {
    console.log("[Yapper] Classification failed, falling back to dictation:", err);
    return { intent: "dictation" };
  }
}

function resolveInput(
  inputSource: string | undefined,
  rawText: string,
  clipboard: string | null,
  previousOutput: string | null
): string {
  switch (inputSource) {
    case "clipboard":
      return clipboard || rawText;
    case "previous":
      return previousOutput || clipboard || rawText;
    case "spoken":
    default:
      return rawText;
  }
}

export async function executeAction(
  intent: string,
  params: Record<string, string> | undefined,
  input: string,
  description: string | undefined,
  token: vscode.CancellationToken,
  model?: string,
): Promise<string> {
  let systemPrompt: string;
  let userPrompt: string;

  switch (intent) {
    case "translate": {
      const lang = params?.targetLang || "English";
      systemPrompt = ACTION_PROMPTS.translate;
      userPrompt = `Translate the following text to ${lang}:\n\n${input}`;
      break;
    }
    case "summarize":
      systemPrompt = ACTION_PROMPTS.summarize;
      userPrompt = `Summarize the following:\n\n${input}`;
      break;
    case "draft": {
      const type = params?.type || "message";
      const topic = params?.topic || input;
      systemPrompt = ACTION_PROMPTS.draft;
      userPrompt = `Draft a ${type} about: ${topic}`;
      break;
    }
    case "explain":
      systemPrompt = ACTION_PROMPTS.explain;
      userPrompt = `Explain the following:\n\n${input}`;
      break;
    case "unknown":
      systemPrompt = `You are a helpful assistant. The user wants to: ${description || "process this text"}. Do exactly what they ask. Return ONLY the result with no explanation or wrapping.`;
      userPrompt = input;
      break;
    default:
      throw new Error(`Unknown action: ${intent}`);
  }

  return callVscodeLm(systemPrompt, userPrompt, token, model);
}

export interface CommandResult {
  result: string;
  action: string;
  params?: Record<string, string>;
}

export async function handleCommand(
  rawText: string,
  clipboard: string | null,
  style: string | undefined,
  styleOverrides: Record<string, string> | undefined,
  codeMode: boolean | undefined,
  token: vscode.CancellationToken,
  model?: string,
): Promise<CommandResult> {
  // Step 1: Classify intent
  const classified = await classifyIntent(rawText, token, model);

  // Step 2: If dictation, use existing refine path
  if (classified.intent === "dictation") {
    const refinement = await refineWithCopilot(rawText, style, token, styleOverrides, codeMode, model);
    return {
      result: refinement.refinedText,
      action: "dictation",
      params: { category: refinement.category, title: refinement.title },
    };
  }

  // Step 3: If chain, execute actions sequentially
  if (classified.intent === "chain" && classified.actions && classified.actions.length > 0) {
    let previousOutput: string | null = null;
    let lastAction: ClassifiedAction = classified.actions[classified.actions.length - 1];

    for (const action of classified.actions) {
      const input = resolveInput(action.inputSource, rawText, clipboard, previousOutput);
      previousOutput = await executeAction(
        action.intent,
        action.params,
        input,
        action.description,
        token,
        model,
      );
    }

    return {
      result: previousOutput || "",
      action: "chain",
      params: {
        steps: classified.actions.map(a => a.intent).join(" + "),
        ...(lastAction.params || {}),
      },
    };
  }

  // Step 4: Single action
  const input = resolveInput(classified.inputSource, rawText, clipboard, null);
  const result = await executeAction(
    classified.intent,
    classified.params,
    input,
    classified.description,
    token,
    model,
  );

  return {
    result,
    action: classified.intent,
    params: classified.params,
  };
}

export interface RefinementResult {
  refinedText: string;
  category: string;
  title: string;
}

export interface ConversationResult {
  content: string;
}

export interface SummarizeResult {
  summary: string;
  title: string;
  keyPoints: string[];
}

function parseResult(result: string): RefinementResult {
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
    return { refinedText: result, category: "Note", title: "" };
  }
}

// --- Workspace file detection for code mode ---

async function getWorkspaceFiles(): Promise<string[]> {
  try {
    const files = await vscode.workspace.findFiles("**/*.{ts,tsx,js,jsx,py,rs,go,java,cpp,c,h,css,html,json,md}", "**/node_modules/**", 50);
    return files.map(f => f.path.split("/").pop() || "").filter(Boolean);
  } catch {
    return [];
  }
}

// --- Main entry point ---

export async function refineWithCopilot(
  rawText: string,
  style: string = "Professional",
  token: vscode.CancellationToken,
  styleOverrides?: Record<string, string>,
  codeMode?: boolean,
  model?: string,
): Promise<RefinementResult> {
  // Build extra context from style overrides and code mode
  let extraContext = "";
  if (styleOverrides && Object.keys(styleOverrides).length > 0) {
    const overrideLines = Object.entries(styleOverrides)
      .map(([cat, s]) => `- If the content is "${cat}", use ${s} tone`)
      .join("\n");
    extraContext += `\n\nStyle overrides by category:\n${overrideLines}`;
  }
  if (codeMode) {
    const files = await getWorkspaceFiles();
    if (files.length > 0) {
      extraContext += `\n\nCode mode is ON. Known files in workspace: ${files.slice(0, 30).join(", ")}. Preserve code references (file names, variable names, function names) with backtick formatting.`;
    }
  }

  let models: vscode.LanguageModelChat[];
  if (model) {
    models = await vscode.lm.selectChatModels({ family: model });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({ id: model });
    }
    if (models.length === 0) {
      console.warn(`[Yapper] Requested model '${model}' not found, using first available`);
      models = await vscode.lm.selectChatModels();
    }
  } else {
    models = await vscode.lm.selectChatModels();
  }
  if (models.length === 0) {
    throw new Error("No AI model available. Install GitHub Copilot in VS Code.");
  }
  const selected = models[0];
  console.log(`[Yapper] Using vscode.lm: ${selected.name} (${selected.vendor}/${selected.family})`);
  const styleNote = STYLE_MODIFIERS[style] || STYLE_MODIFIERS["Professional"];
  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT + extraContext),
    vscode.LanguageModelChatMessage.User(`Style: ${styleNote}\n\nRaw transcript:\n\n${rawText}`),
  ];
  const response = await selected.sendRequest(messages, {}, token);
  const chunks: string[] = [];
  for await (const fragment of response.text) { chunks.push(fragment); }
  const result = chunks.join("").trim();
  if (!result) {
    throw new Error("vscode.lm returned an empty response.");
  }
  return parseResult(result);
}

// --- Conversation handler ---

const CONVERSATION_SYSTEM_PROMPT = `You are Yapper — a helpful conversational assistant. The user is speaking to you via voice, so keep your responses clear, concise, and natural.

Guidelines:
- Respond in a conversational but helpful tone
- Keep responses focused and not too long (2-4 paragraphs max)
- If the user asks a question, answer it directly
- If the user wants help drafting something, provide it
- Reference earlier parts of the conversation when relevant
- Do NOT wrap your response in JSON — just respond with plain text`;

export async function handleConversation(
  history: ConversationTurn[],
  userMessage: string,
  token: vscode.CancellationToken,
  onChunk?: (chunk: string) => void,
  model?: string,
): Promise<ConversationResult> {
  let models: vscode.LanguageModelChat[];
  if (model) {
    models = await vscode.lm.selectChatModels({ family: model });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({ id: model });
    }
    if (models.length === 0) {
      console.warn(`[Yapper] Requested model '${model}' not found, using first available`);
      models = await vscode.lm.selectChatModels();
    }
  } else {
    models = await vscode.lm.selectChatModels();
  }
  if (models.length === 0) {
    throw new Error("No AI model available. Install GitHub Copilot in VS Code.");
  }
  const selected = models[0];
  console.log(`[Yapper] Using vscode.lm: ${selected.name} (${selected.vendor}/${selected.family})`);

  const messages = [
    vscode.LanguageModelChatMessage.User(CONVERSATION_SYSTEM_PROMPT),
  ];

  // Add conversation history
  for (const turn of history) {
    if (turn.role === "user") {
      messages.push(vscode.LanguageModelChatMessage.User(turn.content));
    } else {
      messages.push(vscode.LanguageModelChatMessage.Assistant(turn.content));
    }
  }

  // Add current user message
  messages.push(vscode.LanguageModelChatMessage.User(userMessage));

  const response = await selected.sendRequest(messages, {}, token);
  const chunks: string[] = [];
  for await (const fragment of response.text) {
    chunks.push(fragment);
    onChunk?.(fragment);
  }
  const content = chunks.join("").trim();
  if (!content) {
    throw new Error("vscode.lm returned an empty response.");
  }
  return { content };
}

// --- Summarize handler ---

const SUMMARIZE_SYSTEM_PROMPT = `You are Yapper — summarize the following conversation into a concise overview.

Return JSON only. No markdown, no code fences, no explanation:
{"summary": "A 2-4 sentence summary of the conversation", "title": "3-8 word title", "keyPoints": ["point 1", "point 2", ...]}

The summary should capture the main topics discussed and any conclusions or decisions reached.
The title should be descriptive and concise.
Key points should be the most important takeaways (3-5 items).`;

export async function handleSummarize(
  history: ConversationTurn[],
  token: vscode.CancellationToken,
  model?: string,
): Promise<SummarizeResult> {
  // Format history as readable text
  const historyText = history
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  let models: vscode.LanguageModelChat[];
  if (model) {
    models = await vscode.lm.selectChatModels({ family: model });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({ id: model });
    }
    if (models.length === 0) {
      console.warn(`[Yapper] Requested model '${model}' not found, using first available`);
      models = await vscode.lm.selectChatModels();
    }
  } else {
    models = await vscode.lm.selectChatModels();
  }
  if (models.length === 0) {
    throw new Error("No AI model available. Install GitHub Copilot in VS Code.");
  }
  const selected = models[0];
  console.log(`[Yapper] Using vscode.lm: ${selected.name} (${selected.vendor}/${selected.family})`);

  const messages = [
    vscode.LanguageModelChatMessage.User(SUMMARIZE_SYSTEM_PROMPT),
    vscode.LanguageModelChatMessage.User(`Conversation:\n\n${historyText}`),
  ];

  const response = await selected.sendRequest(messages, {}, token);
  const chunks: string[] = [];
  for await (const fragment of response.text) {
    chunks.push(fragment);
  }
  const result = chunks.join("").trim();
  if (!result) {
    throw new Error("vscode.lm returned an empty response.");
  }
  return parseSummarizeResult(result);
}

function parseSummarizeResult(result: string): SummarizeResult {
  try {
    const cleaned = result
      .replace(/^```(?:json)?\s*/g, "")
      .replace(/\s*```$/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || result,
      title: parsed.title || "Conversation",
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    };
  } catch {
    return { summary: result, title: "Conversation", keyPoints: [] };
  }
}
