import * as vscode from "vscode";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

import type { ConversationTurn } from "./protocol";

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
