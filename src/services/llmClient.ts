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
      const apiKey = getEnv("GROQ_API_KEY");
      const model = getEnv("GROQ_MODEL") || "llama-3.3-70b-versatile";
      if (!apiKey) {
        throw new Error("GROQ_API_KEY is required when LLM_PROVIDER=groq");
      }
      return { provider, baseUrl: "https://api.groq.com/openai/v1", model, apiKey, timeoutMs };
    }
    case "gemini": {
      const apiKey = getEnv("GEMINI_API_KEY");
      const model = getEnv("GEMINI_MODEL") || "gemini-2.5-flash";
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is required when LLM_PROVIDER=gemini");
      }
      return { provider, baseUrl: "https://generativelanguage.googleapis.com/v1beta", model, apiKey, timeoutMs };
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
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
  const config = getLLMConfig();
  const effectiveTimeout = timeoutMs ?? config.timeoutMs;

  let content: string;

  try {
    if (config.provider === "gemini") {
      content = await callGemini(config, messages, effectiveTimeout);
    } else {
      content = await callOllamaOrGroq(config, messages, effectiveTimeout);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LLM request timed out after ${effectiveTimeout}ms`);
    }
    throw error;
  }

  return { content };
}

export async function callLLMWithSchema<T>(
  messages: ChatMessage[],
  schema: any
): Promise<T> {
  const config = getLLMConfig();
  
  const schemaPrompt = `
Return ONLY valid JSON matching this exact schema. No markdown, no commentary, no extra text.
Schema: ${JSON.stringify(schema, null, 2)}
`;
  
  const messagesWithSchema = [
    ...messages,
    { role: "system" as const, content: schemaPrompt },
  ];

  let content: string;
  
  try {
    if (config.provider === "gemini") {
      content = await callGemini(config, messagesWithSchema);
    } else {
      content = await callOllamaOrGroq(config, messagesWithSchema);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LLM request timed out after ${config.timeoutMs}ms`);
    }
    throw error;
  }

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