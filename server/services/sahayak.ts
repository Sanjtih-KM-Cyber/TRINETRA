import { db } from "../db";
import { callLLM, getActiveProvider, type ChatMessage } from "../../src/services/llmClient";
import { searchLegalCorpus, type LegalHit } from "../../src/data/legalCorpus";
import { routeMeshChat } from "./modelMesh";

/** Well-known LoRA adapter tags (served via llama.cpp, Phase 5 mesh). */
export const KNOWN_ADAPTERS = ["legal-lora", "finder-lora", "general-lora"];

/** Try an adapter-tagged mesh peer before the local provider. Returns content or null. */
async function tryMeshAdapter(
  adapter: string | undefined,
  messages: ChatMessage[]
): Promise<{ content: string; via: string } | null> {
  if (!adapter) return null;
  try {
    const r = await routeMeshChat(messages, { adapter, timeoutMs: SAHAYAK_LLM_TIMEOUT_MS });
    return { content: r.content, via: `mesh:${r.peerName}/${r.model}` };
  } catch (err) {
    console.warn(`[SAHAYAK] mesh adapter '${adapter}' unavailable:`, (err as Error).message);
    return null;
  }
}

export interface SahayakAnswer {
  answer: string;
  citations: string[];
  confidence: number;
  recommendedActions: string[];
  provider: string;
  llmUsed: boolean;
  sources: string[];
}

async function loadCaseContext(caseId?: string): Promise<{ summary: string; exhibits: string[] }> {
  if (!caseId) return { summary: "No case context.", exhibits: [] };
  const [entities, relationships, firs, evidence, diary] = await Promise.all([
    db.entities.find({ case_id: caseId }),
    db.relationships.find({ case_id: caseId }),
    db.firs.find(caseId),
    db.evidence.find({ case_id: caseId }),
    db.case_diary.find(caseId),
  ]);
  const top = [...entities].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 12);
  const summary = [
    `Entities: ${entities.length} (${top.map((e) => `${e.label} [${e.type}]`).join("; ") || "none"})`,
    `Links: ${relationships.length} (${relationships.slice(0, 10).map((r) => `${r.source}-[${r.relationType}]-${r.target}`).join("; ") || "none"})`,
    `FIRs: ${firs.map((f: any) => `${f.firNumber} (${(f.sections || []).join(", ")})`).join("; ") || "none"}`,
    `Exhibits: ${evidence.map((e: any) => `${e.file_name} [${e.status}]`).join("; ") || "none"}`,
    `Evidence dates: ${evidence.map((e: any) => `${e.file_name}@${String(e.uploaded_at || "").slice(0, 10)}`).join("; ") || "none"}`,
    `Diary entries: ${diary.length}`,
  ].join("\n");
  return { summary, exhibits: evidence.map((e: any) => e.file_name) };
}

function deterministicAnswer(question: string, caseSummary: string, hits: LegalHit[]): Omit<SahayakAnswer, "provider" | "llmUsed" | "sources"> {
  const q = question.toLowerCase();
  const cites = hits.slice(0, 4).map((h) => `${h.title} — ${h.snippet.slice(0, 140)}`);
  const actions: string[] = [];
  let body: string;

  if (/bail|remand|custody|167|437|438|439/.test(q)) {
    body = `**Custody & Bail Assessment (rules engine + retrieved law):**\n\n${caseSummary}\n\nApplicable provisions retrieved:\n${hits.map((h) => `- ${h.title}: ${h.snippet}`).join("\n") || "- No direct provision match; consult the Statutes tab."}\n\nVerify the 15/60/90-day clocks in the Custody Tracker before advising.`;
    actions.push("Open the Custody Tracker and check auto-alerts", "File bail plea from the tracker with court + date");
  } else if (/charge|challan|173|193|evidence|exhibit|65b|certificate/.test(q)) {
    body = `**Charge-Sheet & Evidence Assessment:**\n\n${caseSummary}\n\nRetrieved law:\n${hits.map((h) => `- ${h.title}: ${h.snippet}`).join("\n") || "-"}\n\nEnsure every electronic exhibit carries a BSA Sec 63 / IEA 65B certificate hash before filing.`;
    actions.push("Generate the Sec 173 draft from the Charge Sheet tab", "Attach Annexures A–Z with hashes");
  } else if (/arrest|seize|memo|41|102|warrant/.test(q)) {
    body = `**Arrest / Seizure Compliance Check:**\n\n${caseSummary}\n\nRetrieved law:\n${hits.map((h) => `- ${h.title}: ${h.snippet}`).join("\n") || "-"}\n\nConfirm grounds recorded, witnesses attested, rights read and nominee intimated before filing the memo.`;
    actions.push("Draw the memo from Investigation Proceedings", "Affix Aadhaar e-sign with Verhoeff validation");
  } else {
    body = `**Case Analysis (rules engine + retrieved law):**\n\n${caseSummary}\n\n${hits.length > 0 ? `Retrieved law:\n${hits.map((h) => `- ${h.title}: ${h.snippet}`).join("\n")}` : "No statute matched the query directly — try section numbers (e.g. 167, 65B, 21 NDPS)."}`;
    actions.push("Review staged entities in the Approval Queue", "Cross-check with the Evidence Links tab");
  }
  return { answer: body, citations: cites, confidence: 0.78, recommendedActions: actions };
}

/**
 * SAHAYAK ask pipeline: case retrieval + legal-corpus retrieval, then a real
 * LLM call when a provider is reachable; deterministic synthesis otherwise
 * (always labelled via llmUsed so the UI never implies a model spoke).
 */
export async function sahayakAsk(
  caseId: string | undefined,
  question: string,
  opts: { adapter?: string; adhocContext?: string } = {}
): Promise<SahayakAnswer> {
  if (!question || question.trim().length < 3) throw new Error("Question is required.");
  const { summary, exhibits } = await loadCaseContext(caseId);
  const hits = searchLegalCorpus(question, 6);
  const provider = getActiveProvider();
  // Phase 5 Req25 — ad-hoc officer-supplied files/folders, capped server-side.
  const adhoc = (opts.adhocContext || "").slice(0, 12000);
  const systemMsg: ChatMessage = {
    role: "system",
    content: "You are SAHAYAK, a law-enforcement investigation assistant for Indian criminal procedure. Answer strictly from the provided case context and retrieved legal provisions. Every answer MUST state the exact section numbers involved (e.g. Sec 167, Sec 65B, Sec 41A, Sec 438, Sec 21 NDPS) and the relevant exhibit file names in the answer body itself — never paraphrase section numbers away. Cite provision IDs (e.g. CRPC-167) and exhibit names. Respond in JSON: {\"answer\": \"markdown\", \"citations\": [\"...\"], \"confidence\": 0.0-1.0, \"recommendedActions\": [\"...\"]}. Never invent case facts.",
  };
  const userMsg: ChatMessage = {
    role: "user",
    content: `CASE CONTEXT:\n${summary}\n\nRETRIEVED LAW:\n${hits.map((h) => `${h.id} | ${h.title}: ${h.snippet}`).join("\n") || "none"}${adhoc ? `\n\nOFFICER-ATTACHED CONTEXT:\n${adhoc}` : ""}\n\nOFFICER QUESTION: ${question}`,
  };

  // Phase 5 — adapter-tagged mesh peer first (e.g. legal-lora), then local provider.
  if (opts.adapter) {
    const mesh = await tryMeshAdapter(opts.adapter, [systemMsg, userMsg]);
    if (mesh) {
      try {
        const parsed = JSON.parse(mesh.content);
        return {
          answer: String(parsed.answer || "Model returned no answer."),
          citations: Array.isArray(parsed.citations) ? parsed.citations.map(String) : hits.map((h) => h.title),
          confidence: Number(parsed.confidence) || 0.85,
          recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.map(String) : [],
          provider: mesh.via,
          llmUsed: true,
          sources: exhibits,
        };
      } catch {
        /* malformed mesh output — fall through to local provider */
      }
    }
  }

  try {
    const response = await callLLM([systemMsg, userMsg], SAHAYAK_LLM_TIMEOUT_MS);
    const parsed = JSON.parse(response.content);
    return {
      answer: String(parsed.answer || "Model returned no answer."),
      citations: Array.isArray(parsed.citations) ? parsed.citations.map(String) : hits.map((h) => h.title),
      confidence: Number(parsed.confidence) || 0.85,
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.map(String) : [],
      provider,
      llmUsed: true,
      sources: exhibits,
    };
  } catch {
    const d = deterministicAnswer(question, summary, hits);
    return { ...d, provider: `${provider} (unreachable — rules engine)`, llmUsed: false, sources: exhibits };
  }
}

/** Local models need longer than the 10s interactive default for long-form answers. */
export const SAHAYAK_LLM_TIMEOUT_MS = 90000;

export interface ProviderStatus {
  provider: string;
  active: boolean;
  reachable: boolean;
  latencyMs?: number;
  detail: string;
}

/** Real reachability probes (short timeouts) for every configured provider. */
export async function sahayakHealth(): Promise<{ providers: ProviderStatus[]; loraEndpoint: ProviderStatus }> {
  const probe = async (name: string, url: string, active: boolean): Promise<ProviderStatus> => {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      // Any HTTP response (even 401 without a key) proves the host is alive.
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      return {
        provider: name, active, reachable: true, latencyMs: Date.now() - t0,
        detail: `HTTP ${res.status} — host alive${res.status === 401 ? "; API key required for inference" : ""}.`,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const reason = err?.name === "AbortError" ? "probe timeout (4s)" : "connection refused";
      return { provider: name, active, reachable: false, detail: `Unreachable (${reason}).` };
    }
  };

  const active = getActiveProvider();
  const providers = await Promise.all([
    probe("ollama", `${process.env.LOCAL_LLM_BASE_URL || "http://localhost:11434"}/api/tags`, active === "ollama"),
    probe("groq", "https://api.groq.com/openai/v1/models", active === "groq"),
  ]);

  // LoRA mesh check is strict: HTTP 200 with a llama.cpp-shaped body.
  // Anything else (401, HTML, foreign API) is reported as not-a-mesh.
  const loraBase = process.env.LORA_ENDPOINT || "http://localhost:8080";
  let loraEndpoint: ProviderStatus;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${loraBase}/health`, { signal: ctrl.signal });
    const body = await res.text().catch(() => "");
    clearTimeout(timer);
    const looksLlama = res.status === 200 && /llama|{"status"\s*:\s*"ok"|^\s*ok\s*$/i.test(body);
    loraEndpoint = looksLlama
      ? { provider: "local-lora (llama.cpp)", active: false, reachable: true, detail: "LoRA mesh endpoint live (Phase 5 serving)." }
      : { provider: "local-lora (llama.cpp)", active: false, reachable: false, detail: `Port responds (HTTP ${res.status}) but is not a llama.cpp endpoint — Phase 5 federated serving target.` };
  } catch {
    loraEndpoint = { provider: "local-lora (llama.cpp)", active: false, reachable: false, detail: "Not deployed yet — Phase 5 federated serving target." };
  }

  return { providers, loraEndpoint };
}

/** Translation requires a live model — 503 otherwise (no fake translations). */
export async function sahayakTranslate(
  text: string,
  targetLang: string,
  opts: { adapter?: string } = {}
): Promise<{ translated: string; provider: string }> {
  if (!text || text.trim().length < 2) throw new Error("Text is required.");
  if (!targetLang) throw new Error("targetLang is required (e.g. Hindi, Tamil, Urdu).");
  const provider = getActiveProvider();
  const messages: ChatMessage[] = [
    { role: "system", content: `Translate the officer's text into ${targetLang}. Return JSON: {"translated": "..."}. Translate faithfully; keep names, numbers and section references intact.` },
    { role: "user", content: text.slice(0, 4000) },
  ];
  // Phase 5 — finder-lora mesh peer first for multilingual work.
  if (opts.adapter || targetLang) {
    const mesh = await tryMeshAdapter(opts.adapter || "finder-lora", messages);
    if (mesh) {
      try {
        const parsed = JSON.parse(mesh.content);
        if (parsed.translated) return { translated: String(parsed.translated), provider: mesh.via };
      } catch {
        /* fall through */
      }
    }
  }
  try {
    const response = await callLLM(messages, SAHAYAK_LLM_TIMEOUT_MS);
    const parsed = JSON.parse(response.content);
    if (!parsed.translated) throw new Error("empty");
    return { translated: String(parsed.translated), provider };
  } catch {
    const err: any = new Error(`Translation needs a live language model (active provider '${provider}' unreachable). Configure Groq/Gemini or local Ollama, or retry from the provider health panel.`);
    err.status = 503;
    throw err;
  }
}

/**
 * Summarize any document text, in any requested language. Live model when
 * reachable (translated summary included); deterministic extractive summary
 * offline. Translation without a model is refused, never faked.
 */
export async function sahayakSummarize(
  text: string,
  targetLang?: string,
  opts: { adapter?: string } = {}
): Promise<{ summary: string; provider: string; llmUsed: boolean; lines?: string[] }> {
  const clean = String(text || "").trim();
  if (clean.length < 20) throw new Error("Text is required (minimum 20 characters).");
  const lang = (targetLang || "").trim();
  const needsTranslation = lang.length > 0 && !/^eng/i.test(lang);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: lang
        ? `Summarize the document for an investigating officer IN ${lang.toUpperCase()}. Return JSON: {"summary": "..."}. Keep every name, number, date and section reference exact; 5-10 sentences.`
        : "Summarize the document for an investigating officer in its own language. Return JSON: {\"summary\": \"...\"}. Keep every name, number, date and section reference exact; 5-10 sentences.",
    },
    { role: "user", content: clean.slice(0, 12000) },
  ];

  if (opts.adapter) {
    const mesh = await tryMeshAdapter(opts.adapter, messages);
    if (mesh) {
      try {
        const parsed = JSON.parse(mesh.content);
        if (parsed.summary) return { summary: String(parsed.summary), provider: mesh.via, llmUsed: true };
      } catch {
        /* fall through */
      }
    }
  }

  try {
    const response = await callLLM(messages, SAHAYAK_LLM_TIMEOUT_MS);
    const parsed = JSON.parse(response.content);
    if (!parsed.summary) throw new Error("empty");
    return { summary: String(parsed.summary), provider: getActiveProvider(), llmUsed: true };
  } catch (err: any) {
    if (needsTranslation) {
      const out: any = new Error(
        `Summary in ${lang} needs a live language model (active provider '${getActiveProvider()}' unreachable). Showing the original-language extract instead is available without a model.`
      );
      out.status = 503;
      throw out;
    }
    const { extractiveSummary } = await import("./docIntel");
    const ext = extractiveSummary(clean, 6);
    return {
      summary: ext.summary,
      provider: "extractive (offline rules engine)",
      llmUsed: false,
      lines: ext.lines,
    };
  }
}

export interface ChargeAssistInput {
  firNumber?: string;
  sections: string[];
  accusedCount: number;
  exhibitCount: number;
  factsDraft: string;
  evidenceDraft: string;
}

/** Drafts the legal-opinion block from corpus provisions; polishes via LLM when live. */
export async function sahayakChargeAssist(
  input: ChargeAssistInput,
  opts: { adapter?: string } = {}
): Promise<{
  legalOpinion: string;
  polishedFacts?: string;
  provider: string;
  llmUsed: boolean;
  citations: string[];
}> {
  const hits = searchLegalCorpus(input.sections.join(" "), 8);
  const sectionLines = input.sections.length > 0
    ? input.sections.map((s) => {
        const h = searchLegalCorpus(s, 3)[0];
        return h ? `- ${h.title}: ${h.snippet}` : `- ${s}: proceed per sanctioned provisions.`;
      })
    : ["- Sections to be confirmed from the FIR before filing."];
  const legalOpinion = [
    `LEGAL OPINION (SAHAYAK, from local statute corpus):`,
    `1. Sanction: verify sanction u/s 19 PC Act / 197 BNSS where public servants are accused.`,
    `2. Sections invoked (${input.sections.join(", ") || "to be confirmed"}):`,
    ...sectionLines,
    `3. Evidence posture: ${input.exhibitCount} exhibit(s) on record for ${input.accusedCount} accused; ensure BSA Sec 63 certificates for all electronic exhibits.`,
    `4. Limitation: file within the 60/90-day remand clock; supplementary charge sheet u/s 173(8) CrPC / 193(9) BNSS if investigation continues.`,
  ].join("\n");

  const provider = getActiveProvider();
  const polishMessages: ChatMessage[] = [
    { role: "system", content: "You are SAHAYAK. Tighten the investigating officer's charge-sheet narrative into numbered paragraphs. Keep every fact; fix structure only. Return JSON: {\"polished\": \"...\"}." },
    { role: "user", content: input.factsDraft.slice(0, 6000) },
  ];
  if (opts.adapter) {
    const mesh = await tryMeshAdapter(opts.adapter, polishMessages);
    if (mesh) {
      try {
        const parsed = JSON.parse(mesh.content);
        return {
          legalOpinion,
          polishedFacts: parsed.polished ? String(parsed.polished) : undefined,
          provider: mesh.via,
          llmUsed: true,
          citations: hits.map((h) => h.title),
        };
      } catch {
        /* fall through */
      }
    }
  }
  try {
    const response = await callLLM(polishMessages, SAHAYAK_LLM_TIMEOUT_MS);
    const parsed = JSON.parse(response.content);
    return {
      legalOpinion,
      polishedFacts: parsed.polished ? String(parsed.polished) : undefined,
      provider,
      llmUsed: true,
      citations: hits.map((h) => h.title),
    };
  } catch {
    return { legalOpinion, provider: `${provider} (unreachable)`, llmUsed: false, citations: hits.map((h) => h.title) };
  }
}
