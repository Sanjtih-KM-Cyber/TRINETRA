import { AIProcessingEngine } from "../types";

export type LLMProvider = "ollama" | "groq" | "gemini";

export interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  /** Provider + model that actually served the request (after key rotation / failover). */
  provider?: LLMProvider;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ExtractionSchema {
  entities: Array<{
    id: string;
    label: string;
    type: string;
    role: string;
    confidence: number;
    sourceSnippets: string[];
    details?: Record<string, any>;
    aliases?: string[];
  }>;
  relationships: Array<{
    sourceId: string;
    targetId: string;
    relationType: string;
    details: string;
    confidence: number;
    weight?: number;
  }>;
  summary: string;
  suspiciousSignals: string[];
}

function getEnv(key: string): string | undefined {
  // Browser (Vite): import.meta.env. Server bundle (CJS): process.env.
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string> })?.env?.[key];
    if (viteEnv !== undefined) return viteEnv;
  } catch {
    /* import.meta unavailable (bundled CJS server) — fall through */
  }
  if (typeof process !== "undefined") {
    return process.env?.[key];
  }
  return undefined;
}

function getLLMConfig(): LLMConfig {
  const provider = (getEnv("LLM_PROVIDER") as LLMProvider) || "ollama";
  const timeoutMs = parseInt(getEnv("LLM_REQUEST_TIMEOUT_MS") || "10000", 10);

  switch (provider) {
    case "ollama": {
      const baseUrl = getEnv("LOCAL_LLM_BASE_URL") || "http://localhost:11434/v1";
      const model = getEnv("LOCAL_LLM_MODEL") || "llama3.2";
      return { provider, baseUrl, model, timeoutMs };
    }
    case "groq": {
      const keys = groqKeys();
      const model = getEnv("GROQ_MODEL") || "llama-3.3-70b-versatile";
      if (keys.length === 0) {
        throw new Error("GROQ_API_KEY(S) required when LLM_PROVIDER=groq (set GROQ_API_KEY or GROQ_API_KEYS)");
      }
      return { provider, baseUrl: "https://api.groq.com/openai/v1", model, apiKey: keys[0], timeoutMs };
    }
    case "gemini": {
      const keys = geminiKeys();
      const model = getEnv("GEMINI_MODEL") || "gemini-2.5-flash";
      if (keys.length === 0) {
        throw new Error("GEMINI_API_KEY(S) required when LLM_PROVIDER=gemini (set GEMINI_API_KEY or GEMINI_API_KEYS)");
      }
      return { provider, baseUrl: "https://generativelanguage.googleapis.com/v1beta", model, apiKey: keys[0], timeoutMs };
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}

/**
 * MULTI-KEY ROTATION + CROSS-PROVIDER FAILOVER.
 *
 * GROQ_API_KEYS / GEMINI_API_KEYS accept comma-separated keys (singular
 * GROQ_API_KEY / GEMINI_API_KEY still work as the first/only key). Calls
 * round-robin across a provider's keys; a 429 parks that key for 60s, a
 * 401/403 retires it for the process lifetime, and anything else fails
 * over to the next key. When every key of the active provider is
 * exhausted, the pipeline falls over to the other cloud provider's keys
 * (groq ↔ gemini) before giving up — so one dead quota never kills SAHAYAK.
 */

function parseKeyList(plural: string, singular: string): string[] {
  const out: string[] = [];
  for (const raw of (getEnv(plural) || "").split(",")) {
    const k = raw.trim();
    if (k && !out.includes(k)) out.push(k);
  }
  const single = (getEnv(singular) || "").trim();
  if (single && !out.includes(single)) out.push(single);
  return out;
}

export function groqKeys(): string[] {
  return parseKeyList("GROQ_API_KEYS", "GROQ_API_KEY");
}

export function geminiKeys(): string[] {
  return parseKeyList("GEMINI_API_KEYS", "GEMINI_API_KEY");
}

interface ProviderAttempt {
  provider: Exclude<LLMProvider, "ollama"> | "ollama";
  baseUrl: string;
  model: string;
  apiKey?: string;
  keySlot: string;
}

const keyCooldownUntil = new Map<string, number>();
const deadKeys = new Set<string>();
const roundRobinIdx: Record<string, number> = { groq: 0, gemini: 0, ollama: 0 };
const COOLDOWN_MS = 60000;

let lastUsedProvider: LLMProvider | null = null;
let lastUsedModel: string | null = null;

/** Provider + model that actually served the most recent successful call. */
export function getLastUsedProvider(): LLMProvider {
  return lastUsedProvider || getActiveProvider();
}

export function getLastUsedModel(): string {
  return lastUsedModel || getActiveModel();
}

function orderKeys(provider: "groq" | "gemini", keys: string[]): string[] {
  if (keys.length === 0) return [];
  const start = roundRobinIdx[provider] % keys.length;
  roundRobinIdx[provider] = (roundRobinIdx[provider] + 1) % Math.max(1, keys.length);
  return [...keys.slice(start), ...keys.slice(0, start)];
}

/** Stable per-key identity (djb2 fingerprint — no node:crypto, browser-safe). */
function keySlot(provider: string, apiKey: string | undefined): string {
  if (!apiKey) return `${provider}:nokey`;
  let h = 5381;
  for (let i = 0; i < apiKey.length; i++) h = ((h << 5) + h + apiKey.charCodeAt(i)) >>> 0;
  return `${provider}:${h.toString(36)}`;
}

function buildAttempts(): ProviderAttempt[] {
  const active = getActiveProvider();
  const attempts: ProviderAttempt[] = [];
  const groqModel = getEnv("GROQ_MODEL") || "llama-3.3-70b-versatile";
  const geminiModel = getEnv("GEMINI_MODEL") || "gemini-2.5-flash";

  const pushCloud = (provider: "groq" | "gemini") => {
    const keys = provider === "groq" ? groqKeys() : geminiKeys();
    const model = provider === "groq" ? groqModel : geminiModel;
    const baseUrl =
      provider === "groq"
        ? "https://api.groq.com/openai/v1"
        : "https://generativelanguage.googleapis.com/v1beta";
    for (const key of orderKeys(provider, keys)) {
      attempts.push({ provider, baseUrl, model, apiKey: key, keySlot: keySlot(provider, key) });
    }
  };

  if (active === "ollama") {
    attempts.push({
      provider: "ollama",
      baseUrl: getEnv("LOCAL_LLM_BASE_URL") || "http://localhost:11434/v1",
      model: getEnv("LOCAL_LLM_MODEL") || "llama3.2",
      keySlot: "ollama:0",
    });
    pushCloud("groq");
    pushCloud("gemini");
  } else if (active === "groq") {
    pushCloud("groq");
    pushCloud("gemini");
  } else if (active === "gemini") {
    pushCloud("gemini");
    pushCloud("groq");
  } else {
    throw new Error(`Unknown LLM_PROVIDER: ${active}`);
  }
  return attempts;
}

function classifyError(err: unknown): { status?: number; timeout: boolean } {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const m = /API error \((\d{3})\)/.exec(msg);
  return { status: m ? parseInt(m[1], 10) : undefined, timeout: /aborterror|timed out/i.test(msg) };
}

function toConfig(a: ProviderAttempt, timeoutMs: number): LLMConfig {
  return { provider: a.provider as LLMProvider, baseUrl: a.baseUrl, model: a.model, apiKey: a.apiKey, timeoutMs };
}

async function runWithFailover(
  messages: ChatMessage[],
  timeoutMs?: number
): Promise<{ content: string; provider: LLMProvider; model: string }> {
  const attempts = buildAttempts();
  if (attempts.length === 0) {
    throw new Error(
      "No LLM keys configured. Set GROQ_API_KEY(S) and/or GEMINI_API_KEY(S) (comma-separated lists supported)."
    );
  }
  const now = Date.now();
  const live = attempts.filter(
    (a) => !deadKeys.has(a.keySlot) && (keyCooldownUntil.get(a.keySlot) || 0) <= now
  );
  const queue = live.length > 0 ? live : attempts;
  const errors: string[] = [];

  for (const attempt of queue) {
    if (deadKeys.has(attempt.keySlot)) continue;
    if ((keyCooldownUntil.get(attempt.keySlot) || 0) > Date.now() && queue === live) continue;
    const effectiveTimeout = timeoutMs ?? parseInt(getEnv("LLM_REQUEST_TIMEOUT_MS") || "10000", 10);
    try {
      const config = toConfig(attempt, effectiveTimeout);
      const content =
        attempt.provider === "gemini"
          ? await callGemini(config, messages, effectiveTimeout)
          : await callOllamaOrGroq(config, messages, effectiveTimeout);
      if (!content || !content.trim()) throw new Error("empty completion");
      lastUsedProvider = attempt.provider as LLMProvider;
      lastUsedModel = attempt.model;
      return { content, provider: attempt.provider as LLMProvider, model: attempt.model };
    } catch (err) {
      const { status, timeout } = classifyError(err);
      const label = `${attempt.provider}[${attempt.keySlot}]`;
      if (status === 429) {
        keyCooldownUntil.set(attempt.keySlot, Date.now() + COOLDOWN_MS);
        errors.push(`${label}: quota exhausted (429, parked 60s)`);
      } else if (status === 401 || status === 403) {
        deadKeys.add(attempt.keySlot);
        errors.push(`${label}: rejected key (${status}, retired)`);
      } else if (timeout) {
        errors.push(`${label}: timed out`);
      } else {
        errors.push(`${label}: ${err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160)}`);
      }
    }
  }
  throw new Error(`All LLM keys exhausted — ${errors.join("; ") || "no attempts"}`);
}

function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
}

async function callOllamaOrGroq(config: LLMConfig, messages: ChatMessage[], timeoutMs?: number): Promise<string> {
  const controller = createTimeoutController(timeoutMs ?? config.timeoutMs);
  
  const payload = {
    model: config.model,
    messages,
    temperature: 0.1,
    max_tokens: 4096,
    response_format: { type: "json_object" },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${config.provider.toUpperCase()} API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(config: LLMConfig, messages: ChatMessage[], timeoutMs?: number): Promise<string> {
  const controller = createTimeoutController(timeoutMs ?? config.timeoutMs);
  
  const systemPrompt = messages.find(m => m.role === "system")?.content || "";
  const userMessages = messages.filter(m => m.role !== "system");
  
  const payload = {
    contents: userMessages.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(
    `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function callLLM(messages: ChatMessage[], timeoutMs?: number): Promise<LLMResponse> {
  const { content, provider, model } = await runWithFailover(messages, timeoutMs);
  return { content, provider, model };
}

export async function callLLMWithSchema<T>(
  messages: ChatMessage[],
  schema: any
): Promise<T> {
  const schemaPrompt = `
Return ONLY valid JSON matching this exact schema. No markdown, no commentary, no extra text.
Schema: ${JSON.stringify(schema, null, 2)}
`;

  const messagesWithSchema = [
    ...messages,
    { role: "system" as const, content: schemaPrompt },
  ];

  const { content } = await runWithFailover(messagesWithSchema);

  const cleanedContent = stripMarkdownCodeBlocks(content);
  
  try {
    return JSON.parse(cleanedContent) as T;
  } catch (parseError) {
    throw new Error(`Failed to parse LLM JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }
}

export function stripMarkdownCodeBlocks(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function getActiveProvider(): LLMProvider {
  return (getEnv("LLM_PROVIDER") as LLMProvider) || "ollama";
}

export function getActiveModel(): string {
  const provider = getActiveProvider();
  if (provider === "groq") return getEnv("GROQ_MODEL") || "llama-3.3-70b-versatile";
  if (provider === "gemini") return getEnv("GEMINI_MODEL") || "gemini-2.5-flash";
  return getEnv("LOCAL_LLM_MODEL") || "llama3.2";
}

export function getActiveEngine(): AIProcessingEngine {
  const provider = getActiveProvider();
  switch (provider) {
    case "ollama":
      return "LOCAL_OFFLINE";
    case "groq":
      return "GROQ_LPU";
    case "gemini":
      return "GEMINI_37";
    default:
      return "LOCAL_OFFLINE";
  }
}