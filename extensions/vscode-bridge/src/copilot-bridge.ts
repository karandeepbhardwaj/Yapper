import * as vscode from "vscode";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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

type ModelTier = "fast" | "quality";

async function selectProviderByTier(
  tier: ModelTier,
  token: vscode.CancellationToken
): Promise<{ type: "vscode"; model: vscode.LanguageModelChat } | { type: "api"; provider: string; apiKey: string } | null> {
  if (tier === "quality") {
    // Try vscode.lm first (Copilot, Claude for VS Code)
    try {
      const models = await vscode.lm.selectChatModels();
      if (models.length > 0) {
        return { type: "vscode", model: models[0] };
      }
    } catch {}

    // Try Anthropic
    const anthropicKey = getApiKey("anthropicApiKey", "ANTHROPIC_API_KEY");
    if (anthropicKey) {
      return { type: "api", provider: "anthropic", apiKey: anthropicKey };
    }

    // Fall through to fast tier
  }

  // Fast tier: Groq first, then Gemini
  const groqKey = getApiKey("groqApiKey", "GROQ_API_KEY");
  if (groqKey) {
    return { type: "api", provider: "groq", apiKey: groqKey };
  }

  const geminiKey = getApiKey("geminiApiKey", "GEMINI_API_KEY");
  if (geminiKey) {
    return { type: "api", provider: "gemini", apiKey: geminiKey };
  }

  // Last resort: try vscode.lm even for fast tier
  try {
    const models = await vscode.lm.selectChatModels();
    if (models.length > 0) {
      return { type: "vscode", model: models[0] };
    }
  } catch {}

  return null;
}

async function callProvider(
  selected: { type: "vscode"; model: vscode.LanguageModelChat } | { type: "api"; provider: string; apiKey: string },
  systemPrompt: string,
  userPrompt: string,
  token: vscode.CancellationToken
): Promise<string> {
  if (selected.type === "vscode") {
    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(userPrompt),
    ];
    const response = await selected.model.sendRequest(messages, {}, token);
    const chunks: string[] = [];
    for await (const fragment of response.text) {
      chunks.push(fragment);
    }
    return chunks.join("");
  }

  const { provider, apiKey } = selected;

  if (provider === "groq") {
    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });
    return httpPost("https://api.groq.com/openai/v1/chat/completions", {
      "Authorization": `Bearer ${apiKey}`,
    }, body).then(r => JSON.parse(r).choices[0].message.content);
  }

  if (provider === "gemini") {
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3 },
    });
    return httpPost(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      { "x-goog-api-key": apiKey },
      body
    ).then(r => JSON.parse(r).candidates[0].content.parts[0].text);
  }

  if (provider === "anthropic") {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return httpPost("https://api.anthropic.com/v1/messages", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }, body).then(r => JSON.parse(r).content[0].text);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

export async function classifyIntent(
  rawText: string,
  token: vscode.CancellationToken
): Promise<ClassifiedIntent> {
  const selected = await selectProviderByTier("fast", token);
  if (!selected) {
    const msg = "Yapper: No AI provider available for classification. Configure an API key (yapper.groqApiKey, yapper.geminiApiKey, or yapper.anthropicApiKey) in VS Code settings, or install GitHub Copilot.";
    console.warn("[Yapper]", msg);
    vscode.window.showWarningMessage(msg);
    return { intent: "dictation" };
  }

  try {
    const result = await callProvider(selected, CLASSIFY_SYSTEM_PROMPT, rawText, token);
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
  token: vscode.CancellationToken
): Promise<string> {
  const selected = await selectProviderByTier(
    intent === "translate" ? "fast" : "quality",
    token
  );
  if (!selected) {
    throw new Error("No AI provider available");
  }

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

  return callProvider(selected, systemPrompt, userPrompt, token);
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
  token: vscode.CancellationToken
): Promise<CommandResult> {
  // Step 1: Classify intent
  const classified = await classifyIntent(rawText, token);

  // Step 2: If dictation, use existing refine path
  if (classified.intent === "dictation") {
    const refinement = await refineWithCopilot(rawText, style, token, styleOverrides, codeMode);
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
        token
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
    token
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

// Read API keys from VS Code settings file directly (fallback for config API issues)
function readApiKeyFromSettingsFile(keyName: string): string {
  try {
    const settingsPath = process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Roaming", "Code", "User", "settings.json")
      : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support", "Code", "User", "settings.json")
      : path.join(os.homedir(), ".config", "Code", "User", "settings.json");

    const content = fs.readFileSync(settingsPath, "utf-8");
    // Strip JSON comments (VS Code settings can have // comments)
    const stripped = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const settings = JSON.parse(stripped);
    return settings[keyName] || "";
  } catch {
    return "";
  }
}

function getApiKey(settingName: string, envVar: string): string {
  // Try VS Code config API first
  const fromConfig = vscode.workspace.getConfiguration("yapper").get<string>(settingName, "");
  if (fromConfig) { return fromConfig; }
  // Try environment variable
  const fromEnv = process.env[envVar] || "";
  if (fromEnv) { return fromEnv; }
  // Try reading settings file directly
  return readApiKeyFromSettingsFile(`yapper.${settingName}`);
}

// --- HTTP helper ---

function httpPost(urlStr: string, headers: Record<string, string>, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Parse URL manually to avoid needing DOM URL type
    const match = urlStr.match(/^https:\/\/([^/]+)(\/.*)?$/);
    if (!match) { return reject(new Error(`Invalid URL: ${urlStr}`)); }
    const hostname = match[1];
    const pathStr = match[2] || "/";

    const req = https.request({
      hostname,
      path: pathStr,
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
    }, (res: import("http").IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const respBody = Buffer.concat(chunks).toString();
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${respBody.slice(0, 300)}`));
        } else {
          resolve(respBody);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// --- API providers ---

async function refineWithGroq(rawText: string, style: string, apiKey: string): Promise<RefinementResult> {
  const styleNote = STYLE_MODIFIERS[style] || STYLE_MODIFIERS["Professional"];
  const body = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Style: ${styleNote}\n\nRaw transcript:\n\n${rawText}` },
    ],
    temperature: 0.3,
  });

  console.log("[Yapper] Using Groq API (llama-3.3-70b)");
  const response = await httpPost("https://api.groq.com/openai/v1/chat/completions", {
    "Authorization": `Bearer ${apiKey}`,
  }, body);
  const parsed = JSON.parse(response);
  const text = parsed?.choices?.[0]?.message?.content || "";
  if (!text) { throw new Error("Groq returned empty response"); }
  return parseResult(text);
}

async function refineWithGemini(rawText: string, style: string, apiKey: string): Promise<RefinementResult> {
  const styleNote = STYLE_MODIFIERS[style] || STYLE_MODIFIERS["Professional"];
  const prompt = `${SYSTEM_PROMPT}\n\nStyle: ${styleNote}\n\nRaw transcript:\n\n${rawText}`;
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3 },
  });

  console.log("[Yapper] Using Gemini API (gemini-2.0-flash)");
  const response = await httpPost(url, { "x-goog-api-key": apiKey }, body);
  const parsed = JSON.parse(response);
  const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) { throw new Error("Gemini returned empty response"); }
  return parseResult(text);
}

async function refineWithAnthropic(rawText: string, style: string, apiKey: string): Promise<RefinementResult> {
  const styleNote = STYLE_MODIFIERS[style] || STYLE_MODIFIERS["Professional"];
  const body = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Style: ${styleNote}\n\nRaw transcript:\n\n${rawText}` }],
  });

  console.log("[Yapper] Using Anthropic API (claude-sonnet-4)");
  const response = await httpPost("https://api.anthropic.com/v1/messages", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  }, body);
  const parsed = JSON.parse(response);
  const text = parsed?.content?.[0]?.text || "";
  if (!text) { throw new Error("Anthropic returned empty response"); }
  return parseResult(text);
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

  // 1. Try vscode.lm API first (Copilot, Claude for VS Code, etc.)
  try {
    let models = await vscode.lm.selectChatModels();
    if (models.length > 0) {
      const model = models[0];
      console.log(`[Yapper] Using vscode.lm: ${model.name} (${model.vendor}/${model.family})`);
      const styleNote = STYLE_MODIFIERS[style] || STYLE_MODIFIERS["Professional"];
      const messages = [
        vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT + extraContext),
        vscode.LanguageModelChatMessage.User(`Style: ${styleNote}\n\nRaw transcript:\n\n${rawText}`),
      ];
      const response = await model.sendRequest(messages, {}, token);
      const chunks: string[] = [];
      for await (const fragment of response.text) { chunks.push(fragment); }
      const result = chunks.join("").trim();
      if (result) { return parseResult(result); }
    }
  } catch (err) {
    console.log(`[Yapper] vscode.lm failed: ${err instanceof Error ? err.message : err}`);
  }

  // 2. Direct API fallbacks — try each provider if key is available
  const providers: Array<{ name: string; settingKey: string; envVar: string; fn: (raw: string, style: string, key: string) => Promise<RefinementResult> }> = [
    { name: "Groq",      settingKey: "groqApiKey",      envVar: "GROQ_API_KEY",      fn: refineWithGroq },
    { name: "Gemini",    settingKey: "geminiApiKey",     envVar: "GEMINI_API_KEY",    fn: refineWithGemini },
    { name: "Anthropic", settingKey: "anthropicApiKey",  envVar: "ANTHROPIC_API_KEY", fn: refineWithAnthropic },
  ];

  for (const provider of providers) {
    const key = getApiKey(provider.settingKey, provider.envVar);
    if (key) {
      try {
        return await provider.fn(rawText, style, key);
      } catch (err) {
        console.log(`[Yapper] ${provider.name} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  throw new Error(
    "All refinement methods failed. Set an API key in VS Code settings (yapper.groqApiKey, yapper.geminiApiKey, or yapper.anthropicApiKey)."
  );
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
  onChunk?: (chunk: string) => void
): Promise<ConversationResult> {
  // Try vscode.lm API
  try {
    const models = await vscode.lm.selectChatModels();
    if (models.length > 0) {
      const model = models[0];
      console.log(`[Yapper] Conversation using vscode.lm: ${model.name}`);

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

      const response = await model.sendRequest(messages, {}, token);
      const chunks: string[] = [];
      for await (const fragment of response.text) {
        chunks.push(fragment);
        onChunk?.(fragment);
      }
      const content = chunks.join("").trim();
      if (content) {
        return { content };
      }
    }
  } catch (err) {
    console.log(`[Yapper] Conversation vscode.lm failed: ${err instanceof Error ? err.message : err}`);
  }

  // Fallback to direct API providers
  const conversationProviders: Array<{ name: string; settingKey: string; envVar: string; fn: (history: ConversationTurn[], userMessage: string) => Promise<string> }> = [
    { name: "Groq", settingKey: "groqApiKey", envVar: "GROQ_API_KEY", fn: async (h, msg) => {
      const key = getApiKey("groqApiKey", "GROQ_API_KEY");
      if (!key) { throw new Error("No key"); }
      const messages = [
        { role: "system" as const, content: CONVERSATION_SYSTEM_PROMPT },
        ...h.map(t => ({ role: t.role as "user" | "assistant", content: t.content })),
        { role: "user" as const, content: msg },
      ];
      console.log("[Yapper] Conversation using Groq API");
      const response = await httpPost("https://api.groq.com/openai/v1/chat/completions", {
        "Authorization": `Bearer ${key}`,
      }, JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.7 }));
      const parsed = JSON.parse(response);
      return parsed?.choices?.[0]?.message?.content || "";
    }},
    { name: "Gemini", settingKey: "geminiApiKey", envVar: "GEMINI_API_KEY", fn: async (h, msg) => {
      const key = getApiKey("geminiApiKey", "GEMINI_API_KEY");
      if (!key) { throw new Error("No key"); }
      const prompt = CONVERSATION_SYSTEM_PROMPT + "\n\n" +
        h.map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n\n") +
        `\n\nUser: ${msg}`;
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
      console.log("[Yapper] Conversation using Gemini API");
      const response = await httpPost(url, { "x-goog-api-key": key }, JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }));
      const parsed = JSON.parse(response);
      return parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }},
    { name: "Anthropic", settingKey: "anthropicApiKey", envVar: "ANTHROPIC_API_KEY", fn: async (h, msg) => {
      const key = getApiKey("anthropicApiKey", "ANTHROPIC_API_KEY");
      if (!key) { throw new Error("No key"); }
      const messages = [
        ...h.map(t => ({ role: t.role as "user" | "assistant", content: t.content })),
        { role: "user" as const, content: msg },
      ];
      console.log("[Yapper] Conversation using Anthropic API");
      const response = await httpPost("https://api.anthropic.com/v1/messages", {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      }, JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1024, system: CONVERSATION_SYSTEM_PROMPT, messages }));
      const parsed = JSON.parse(response);
      return parsed?.content?.[0]?.text || "";
    }},
  ];

  for (const provider of conversationProviders) {
    const key = getApiKey(provider.settingKey, provider.envVar);
    if (key) {
      try {
        const content = await provider.fn(history, userMessage);
        if (content) { return { content }; }
      } catch (err) {
        console.log(`[Yapper] Conversation ${provider.name} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  throw new Error("Conversation failed — no language model available. Set an API key (yapper.groqApiKey, yapper.geminiApiKey, or yapper.anthropicApiKey) or install GitHub Copilot.");
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
  token: vscode.CancellationToken
): Promise<SummarizeResult> {
  // Format history as readable text
  const historyText = history
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  // Try vscode.lm API
  try {
    const models = await vscode.lm.selectChatModels();
    if (models.length > 0) {
      const model = models[0];
      console.log(`[Yapper] Summarize using vscode.lm: ${model.name}`);

      const messages = [
        vscode.LanguageModelChatMessage.User(SUMMARIZE_SYSTEM_PROMPT),
        vscode.LanguageModelChatMessage.User(`Conversation:\n\n${historyText}`),
      ];

      const response = await model.sendRequest(messages, {}, token);
      const chunks: string[] = [];
      for await (const fragment of response.text) {
        chunks.push(fragment);
      }
      const result = chunks.join("").trim();
      if (result) {
        return parseSummarizeResult(result);
      }
    }
  } catch (err) {
    console.log(`[Yapper] Summarize vscode.lm failed: ${err instanceof Error ? err.message : err}`);
  }

  // Fallback to direct API providers
  const summarizeProviders: Array<{ name: string; settingKey: string; envVar: string; fn: (text: string) => Promise<string> }> = [
    { name: "Groq", settingKey: "groqApiKey", envVar: "GROQ_API_KEY", fn: async (text) => {
      const key = getApiKey("groqApiKey", "GROQ_API_KEY");
      if (!key) { throw new Error("No key"); }
      console.log("[Yapper] Summarize using Groq API");
      const response = await httpPost("https://api.groq.com/openai/v1/chat/completions", {
        "Authorization": `Bearer ${key}`,
      }, JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [
        { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
        { role: "user", content: `Conversation:\n\n${text}` },
      ], temperature: 0.3 }));
      const parsed = JSON.parse(response);
      return parsed?.choices?.[0]?.message?.content || "";
    }},
    { name: "Gemini", settingKey: "geminiApiKey", envVar: "GEMINI_API_KEY", fn: async (text) => {
      const key = getApiKey("geminiApiKey", "GEMINI_API_KEY");
      if (!key) { throw new Error("No key"); }
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
      console.log("[Yapper] Summarize using Gemini API");
      const response = await httpPost(url, { "x-goog-api-key": key }, JSON.stringify({
        contents: [{ parts: [{ text: `${SUMMARIZE_SYSTEM_PROMPT}\n\nConversation:\n\n${text}` }] }],
        generationConfig: { temperature: 0.3 },
      }));
      const parsed = JSON.parse(response);
      return parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }},
    { name: "Anthropic", settingKey: "anthropicApiKey", envVar: "ANTHROPIC_API_KEY", fn: async (text) => {
      const key = getApiKey("anthropicApiKey", "ANTHROPIC_API_KEY");
      if (!key) { throw new Error("No key"); }
      console.log("[Yapper] Summarize using Anthropic API");
      const response = await httpPost("https://api.anthropic.com/v1/messages", {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      }, JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1024, system: SUMMARIZE_SYSTEM_PROMPT, messages: [
        { role: "user", content: `Conversation:\n\n${text}` },
      ] }));
      const parsed = JSON.parse(response);
      return parsed?.content?.[0]?.text || "";
    }},
  ];

  for (const provider of summarizeProviders) {
    const key = getApiKey(provider.settingKey, provider.envVar);
    if (key) {
      try {
        const result = await provider.fn(historyText);
        if (result) { return parseSummarizeResult(result); }
      } catch (err) {
        console.log(`[Yapper] Summarize ${provider.name} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  throw new Error("Summarization failed — no language model available.");
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
