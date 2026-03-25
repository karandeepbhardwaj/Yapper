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

export interface RefinementResult {
  refinedText: string;
  category: string;
  title: string;
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3 },
  });

  console.log("[Yapper] Using Gemini API (gemini-2.0-flash)");
  const response = await httpPost(url, {}, body);
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

// --- Main entry point ---

export async function refineWithCopilot(
  rawText: string,
  style: string = "Professional",
  token: vscode.CancellationToken
): Promise<RefinementResult> {
  // 1. Try vscode.lm API first (Copilot, Claude for VS Code, etc.)
  try {
    let models = await vscode.lm.selectChatModels();
    if (models.length > 0) {
      const model = models[0];
      console.log(`[Yapper] Using vscode.lm: ${model.name} (${model.vendor}/${model.family})`);
      const styleNote = STYLE_MODIFIERS[style] || STYLE_MODIFIERS["Professional"];
      const messages = [
        vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
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
