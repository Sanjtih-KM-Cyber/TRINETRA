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

const slice = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function loadCaseContext(caseId?: string): Promise<{ summary: string; exhibits: string[] }> {
  if (!caseId) return { summary: "No case context.", exhibits: [] };
  const [entities, relationships, firs, evidence, diary, cdrs, financials, intels] = await Promise.all([
    db.entities.find({ case_id: caseId }),
    db.relationships.find({ case_id: caseId }),
    db.firs.find(caseId),
    db.evidence.find({ case_id: caseId }),
    db.case_diary.find(caseId),
    db.cdrs.find(caseId).catch(() => [] as any[]),
    db.financials.find(caseId).catch(() => [] as any[]),
    db.intels.find(caseId).catch(() => [] as any[]),
  ]);
  const top = [...entities].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 15);
  const topLinks = [...relationships].slice(0, 12);

  // Exhibit content budget: ~3k chars each, 12k total — the model reasons
  // over actual file text, never just file names.
  let textBudget = 12000;
  const exhibitBlocks: string[] = [];
  for (const e of evidence as any[]) {
    if (textBudget <= 0) {
      exhibitBlocks.push(`- ${e.file_name} [${e.status}] (content truncated — budget exhausted)`);
      continue;
    }
    const take = Math.min(3000, textBudget);
    const raw = slice(e.raw_text, take);
    textBudget -= raw.length;
    exhibitBlocks.push(
      `- ${e.file_name} [${e.status}]${e.summary ? ` — ${slice(e.summary, 300)}` : ""}${raw ? `\n  TEXT: ${raw}` : " (no extractable text — sealed container)"}`
    );
  }

  const firBlocks = (firs as any[]).slice(0, 4).map(
    (f: any) =>
      `- FIR ${f.firNumber || f.id} (${String(f.date || "").slice(0, 10)}; ${f.policeStation || ""}): sections [${(f.sections || []).join(", ")}]; complainant: ${slice(f.complainant, 120)}; accused: ${slice((f.accused || []).join(", "), 200)}; narrative: ${slice(f.briefNarrative, 600)}`
  );

  const intelBlocks = (intels as any[]).slice(0, 5).map(
    (i: any) => `- Intel ${String(i.date || "").slice(0, 10)} (${i.sourceType || ""}, ${i.location || ""}, reliability ${i.reliabilityScore ?? "?"}): ${slice(i.description || i.sanitizedVersion, 400)}`
  );

  const diaryBlocks = (diary as any[]).slice(-8).map(
    (d: any) => `- Diary No.${d.diaryNo} (${String(d.created_at || d.date || "").slice(0, 10)}): ${slice(`${d.proceedings || ""} ${d.actionTaken || ""}`, 300)}`
  );

  const finTotal = (financials as any[]).reduce((s, f: any) => s + (Number(f.amount) || 0), 0);
  const finTop = [...(financials as any[])].sort((a: any, b: any) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 3);

  const summary = [
    `Entities (${entities.length}): ${top.map((e) => `${e.label} [${e.type}; role=${e.role || "?"}; risk=${e.riskScore ?? "?"}]`).join("; ") || "none"}`,
    `Links (${relationships.length}): ${topLinks.map((r) => `${r.source}-[${r.relationType}]-${r.target}`).join("; ") || "none"}`,
    `FIRs (${(firs as any[]).length}):\n${firBlocks.join("\n") || "none"}`,
    `Exhibits (${(evidence as any[]).length}):\n${exhibitBlocks.join("\n") || "none"}`,
    `CDRs: ${(cdrs as any[]).length} records`,
    `Financials: ${(financials as any[]).length} transfers, total ₹${finTotal.toLocaleString("en-IN")}${finTop.length ? `; top: ${finTop.map((f: any) => `${f.senderName || f.senderAcc}→${f.receiverName || f.receiverAcc} ₹${Number(f.amount).toLocaleString("en-IN")}`).join("; ")}` : ""}`,
    `Intel (${(intels as any[]).length}):\n${intelBlocks.join("\n") || "none"}`,
    `Diary (${(diary as any[]).length} entries, latest):\n${diaryBlocks.join("\n") || "none"}`,
  ].join("\n");
  return { summary, exhibits: (evidence as any[]).map((e: any) => e.file_name) };
}

/**
 * SAHAYAK ask pipeline: case retrieval + legal-corpus retrieval, then a real
 * model call. No fabricated fallback — provider failures surface as errors.
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
    content: [
      "You are SAHAYAK, a senior fellow investigating officer assisting a colleague on a live Indian criminal case.",
      "Write like a sharp colleague, not a librarian: lead with what matters, reason from the evidence in front of you, flag contradictions and gaps, and give ownable next steps.",
      "Ground every claim in the CASE CONTEXT below (exhibit text, FIRs, entities, links, CDR/financial aggregates, intel, diary). Never invent names, dates, amounts, or confessions. If the context is thin, say exactly what is missing and which register/database/witness would fill it — never tell the officer to 'retrieve the full content' of an exhibit whose text is already provided above; USE that text.",
      "Structure the markdown answer as: 1) Bottom line (2-3 sentences). 2) What the evidence actually shows (cite exhibit file names + FIR numbers + dates inline). 3) Applicable law with exact sections (e.g. Sec 376 IPC / BNS 63-70, Sec 302 IPC / BNS 103, Sec 65B IEA / Sec 63 BSA, Sec 41A BNSS) and why each fits or does not yet fit. 4) Gaps & contradictions. 5) Next steps with owner and legal basis. End with ONE clarifying question when it would change the advice.",
      "Every answer MUST name exact section numbers and exhibit file names in the body. Cite provision IDs (e.g. CRPC-167) in citations.",
      'Respond in JSON only: {"answer": "markdown", "citations": ["..."], "confidence": 0.0-1.0, "recommendedActions": ["..."]}.',
    ].join(" "),
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

  // No fabricated fallback: if the model is unreachable the officer gets an
  // explicit error, never mock analysis.
  try {
    const response = await callLLM([systemMsg, userMsg], SAHAYAK_LLM_TIMEOUT_MS);
    const parsed = JSON.parse(response.content);
    return {
      answer: String(parsed.answer || "Model returned no answer."),
      citations: Array.isArray(parsed.citations) ? parsed.citations.map(String) : hits.map((h) => h.title),
      confidence: Number(parsed.confidence) || 0.85,
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.map(String) : [],
      provider: response.provider ? `${response.provider}${response.model ? `/${response.model}` : ""}` : provider,
      llmUsed: true,
      sources: exhibits,
    };
  } catch (err: any) {
    const reason = err instanceof Error ? err.message : "SAHAYAK model unreachable.";
    throw Object.assign(new Error(`SAHAYAK (${provider}) unavailable: ${reason}. Check LLM_PROVIDER/GROQ_API_KEYS/GEMINI_API_KEYS and retry — no offline answer is fabricated.`), { status: 502 });
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
    return { translated: String(parsed.translated), provider: response.provider || provider };
  } catch {
    const err: any = new Error(`Translation needs a live language model (active provider '${provider}' unreachable). Configure Groq/Gemini keys or local Ollama, or retry from the provider health panel.`);
    err.status = 503;
    throw err;
  }
}

const BRIEF_SYSTEM = (langDirective: string) => [
  "You are SAHAYAK, drafting an exhaustive case brief for a Lead Investigator from a case document.",
  "Write a complete, in-depth narrative — a story of the document that keeps even minute details intact:",
  "## Document identity (what it is, court/authority, date, reference numbers)",
  "## Parties and appearances (every name with role, verbatim)",
  "## Facts and chronology (full sequence of events with dates)",
  "## Orders, directions and timelines (each direction with who must do what by when)",
  "## Figures and provisions (every amount, statistic, section and exhibit reference, exact)",
  "## Why it matters to the investigation (2-4 lines tying the document to actionable next steps).",
  "Rules: keep every name, number, date, amount and section reference EXACT as in the source — never round, shorten or paraphrase figures. Markdown headings (##) and short paragraphs. Comprehensive, not compressed: this brief stands in for reading the whole file.",
  langDirective,
  'Respond in JSON only: {"summary": "markdown brief"}.',
].join(" ");

/**
 * Exhaustive narrative brief of any document text, in any requested
 * language. Live model when reachable; frequency-ranked extractive brief
 * offline (works on any narrative — never an empty "nothing to summarize").
 * Translation without a model is refused, never faked.
 */
export async function sahayakSummarize(
  text: string,
  targetLang?: string,
  opts: { adapter?: string } = {}
): Promise<{ summary: string; provider: string; llmUsed: boolean; lines?: string[]; language: string }> {
  const clean = String(text || "").trim();
  if (clean.length < 20) throw new Error("Text is required (minimum 20 characters).");
  const lang = (targetLang || "").trim();
  const english = lang.length === 0 || /^eng/i.test(lang);
  const outLang = english ? "the document's own language" : lang;
  const langDirective = english
    ? "Write the brief in the document's own language — do not translate."
    : `Write the ENTIRE brief in ${lang.toUpperCase()} only — every heading, sentence and name explanation in ${lang.toUpperCase()}; keep proper nouns verbatim.`;

  const messages: ChatMessage[] = [
    { role: "system", content: BRIEF_SYSTEM(langDirective) },
    { role: "user", content: clean.slice(0, 12000) },
  ];

  if (opts.adapter) {
    const mesh = await tryMeshAdapter(opts.adapter, messages);
    if (mesh) {
      try {
        const parsed = JSON.parse(mesh.content);
        if (parsed.summary) return { summary: String(parsed.summary), provider: mesh.via, llmUsed: true, language: outLang };
      } catch {
        /* fall through */
      }
    }
  }

  try {
    const response = await callLLM(messages, SAHAYAK_LLM_TIMEOUT_MS);
    const parsed = JSON.parse(response.content);
    if (!parsed.summary) throw new Error("empty");
    return { summary: String(parsed.summary), provider: response.provider || getActiveProvider(), llmUsed: true, language: outLang };
  } catch (err: any) {
    if (!english) {
      const out: any = new Error(
        `Summary in ${lang} needs a live language model (active provider '${getActiveProvider()}' unreachable). Showing the original-language brief instead is available without a model.`
      );
      out.status = 503;
      throw out;
    }
    const { extractiveSummary } = await import("./docIntel");
    const ext = extractiveSummary(clean, 10);
    return {
      summary: ext.summary,
      provider: "extractive (offline rules engine)",
      llmUsed: false,
      lines: ext.lines,
      language: outLang,
    };
  }
}

/**
 * INTAKE PRE-READ — reads a whole staged document and returns an
 * exhaustive narrative brief for the Lead, before review begins.
 * Never throws: returns null when no model is live (caller marks the
 * batch un-briefed and moves on). Used fire-and-forget at ingest time.
 */
export async function generateIntakeBrief(
  text: string,
  fileName?: string
): Promise<{ brief: string; provider: string } | null> {
  const clean = String(text || "").trim();
  if (clean.length < 200) return null;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        BRIEF_SYSTEM("Write the brief in the document's own language — do not translate."),
        fileName ? `The source file is "${fileName}".` : "",
        "Keep it investigation-ready: a Lead Investigator who never opens the raw file must still be able to act on this brief.",
      ].join(" "),
    },
    { role: "user", content: clean.slice(0, 12000) },
  ];
  try {
    const response = await callLLM(messages, SAHAYAK_LLM_TIMEOUT_MS);
    const parsed = JSON.parse(response.content);
    const brief = String(parsed.summary || "").trim();
    if (brief.length < 100) return null;
    return { brief, provider: response.provider || getActiveProvider() };
  } catch {
    return null;
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
      provider: response.provider || provider,
      llmUsed: true,
      citations: hits.map((h) => h.title),
    };
  } catch {
    return { legalOpinion, provider: `${provider} (unreachable)`, llmUsed: false, citations: hits.map((h) => h.title) };
  }
}
