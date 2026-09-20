import crypto from "crypto";
import {
  db,
  DBUser,
  DBStagedEntity,
  DBStagedLink,
  DBEntity,
  DBRelationship,
} from "../db";
import {
  reconstructText,
  reconstructCdr,
  reconstructFinancial,
  reconstructReadableText,
  MAX_RECON_ENTITIES,
  MAX_RECON_LINKS,
} from "./reconstructor";

export const MAX_STAGE_ENTITIES = MAX_RECON_ENTITIES;
export const MAX_STAGE_LINKS = MAX_RECON_LINKS;

export interface StagedCandidate {
  label: string;
  type: string;
  role?: string;
  riskScore: number;
  confidence: number;
  details?: any;
  evidenceRef?: string;
  locator?: string;
}

export interface StagedLinkCandidate {
  sourceLabel: string;
  targetLabel: string;
  relationType: string;
  weight: number;
  frequency?: number;
  amount?: number;
  details?: string;
  evidenceRef?: string;
  locator?: string;
}

function sha(payload: string): string {
  return `sha256:${crypto.createHash("sha256").update(payload).digest("hex")}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchUrlText(url: string): Promise<{ text: string; title?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs may be ingested.");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "TRINETRA-OS/1.0 (lawful OSINT collection)" },
    });
    if (!res.ok) throw new Error(`URL fetch failed with HTTP ${res.status}.`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1024 * 1024) throw new Error("Page exceeds 1MB ingest cap.");
    const html = buf.toString("utf8");
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
    const text = stripHtml(html).slice(0, 20000);
    if (text.length < 50) throw new Error("Page yielded no usable text.");
    return { text, title };
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("URL fetch timed out (12s).");
    throw err instanceof Error ? err : new Error("URL fetch failed.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Multi-source intake, now unified on the Reconstructor: deterministic
 * structuring always, LLM enrichment when a model is live. Nothing touches
 * the main graph — Lead review happens in the approval queue.
 */
export async function processSource(
  caseId: string,
  source: string,
  content: string,
  opts: { fileName?: string; url?: string; wantLlm?: boolean }
): Promise<{
  entities: StagedCandidate[];
  links: StagedLinkCandidate[];
  truncated: boolean;
  note: string;
  unresolved: string[];
  enrichment: "LLM_ASSIST" | "RULES_ONLY";
  provider: string;
  readable: string;
  rawText: string;
}> {
  const evidenceRef = opts.fileName || opts.url || source;
  const readableOf = (t: string) => {
    try {
      const r = reconstructReadableText(t || "");
      const joined = r.paragraphs.join("\n\n");
      return joined.length > 40 ? joined.slice(0, MAX_BATCH_CONTENT_CHARS) : (t || "").slice(0, MAX_BATCH_CONTENT_CHARS);
    } catch {
      return (t || "").slice(0, MAX_BATCH_CONTENT_CHARS);
    }
  };

  if (source === "FIR" || source === "INTEL_REPORT" || source === "CYBER_LOG") {
    const docName =
      source === "FIR" ? "FIR Narrative" : source === "CYBER_LOG" ? "Cyber Log" : "Intel Report";
    const r = await reconstructText(caseId, content, { evidenceRef, docName, wantLlm: opts.wantLlm });
    return {
      entities: r.entities, links: r.links, truncated: r.truncated, note: r.note,
      unresolved: r.unresolved, enrichment: r.enrichment, provider: r.provider,
      readable: readableOf(content), rawText: content || "",
    };
  }

  if (source === "CDR_CSV") {
    const r = await reconstructCdr(content, evidenceRef);
    return {
      entities: r.entities, links: r.links, truncated: false, note: r.note,
      unresolved: r.unresolved, enrichment: "RULES_ONLY", provider: "rules engine",
      readable: readableOf(content), rawText: content || "",
    };
  }

  if (source === "FINANCIAL_CSV") {
    const r = await reconstructFinancial(content, evidenceRef);
    return {
      entities: r.entities, links: r.links, truncated: false, note: r.note,
      unresolved: r.unresolved, enrichment: "RULES_ONLY", provider: "rules engine",
      readable: readableOf(content), rawText: content || "",
    };
  }

  if (source === "OSINT_URL") {
    if (!opts.url) throw new Error("url is required for OSINT ingestion.");
    const { text, title } = await fetchUrlText(opts.url);
    const r = await reconstructText(caseId, text, {
      evidenceRef: opts.url,
      docName: title || opts.url,
      wantLlm: opts.wantLlm,
    });
    for (const e of r.entities) {
      e.details = { ...(e.details || {}), osintUrl: opts.url };
      e.evidenceRef = opts.url;
      e.confidence = Math.min(0.85, e.confidence);
    }
    return {
      entities: r.entities, links: r.links, truncated: r.truncated,
      note: `Fetched ${title || opts.url} (${text.length} chars) → ${r.note}`,
      unresolved: r.unresolved, enrichment: r.enrichment, provider: r.provider,
      readable: readableOf(text), rawText: text,
    };
  }

  throw new Error(`Unknown source: ${source}.`);
}

/** Raw source retained per batch (capped) so reviewers can read files as-is. */
export const MAX_BATCH_CONTENT_CHARS = 200000;

export interface StageCandidatesInput {
  caseId: string;
  source: string;
  fileName?: string;
  url?: string;
  entities: StagedCandidate[];
  links: StagedLinkCandidate[];
  actor: DBUser;
  note?: string;
  content?: string;
  /** Clean reading-layout text; computed from content when omitted. */
  readableContent?: string;
  unresolved?: string[];
  enrichment?: string;
  provider?: string;
}

/**
 * AI PRE-READ — runs detached after staging: reads the full document and
 * stores an exhaustive narrative brief on the batch BEFORE the Lead opens
 * it, so SAHAYAK answers from ready context instead of cold text.
 * Never throws, never blocks intake, skips short/structured payloads.
 */
function kickOffIntakeBrief(caseId: string, batchId: string, fileName: string | undefined, text: string): void {
  try {
    if (process.env.SAHAYAK_AUTOBRIEF === "false") return;
    if (!text || text.length < 500) return;
    const run = async () => {
      try {
        const { generateIntakeBrief } = await import("./sahayak");
        const brief = await generateIntakeBrief(text.slice(0, 12000), fileName);
        if (!brief) {
          await db.ingestion_batches.updateOne(batchId, { briefPending: false }).catch(() => null);
          return;
        }
        await db.ingestion_batches.updateOne(batchId, {
          aiBrief: brief.brief,
          briefProvider: brief.provider,
          briefAt: new Date().toISOString(),
          briefPending: false,
        }).catch(() => null);
        const { notifyCase } = await import("./diaryService");
        notifyCase(caseId, "STAGING_UPDATED", "AI Brief Ready",
          `SAHAYAK finished reading ${fileName || batchId} — brief ready for Lead review.`,
          { name: "SAHAYAK", role: "SYSTEM" } as any);
      } catch {
        await db.ingestion_batches.updateOne(batchId, { briefPending: false }).catch(() => null);
      }
    };
    void run().catch(() => undefined);
  } catch {
    /* intake must never fail because of the brief */
  }
}

/**
 * Single writer for every staging batch — intake hub, field reports,
 * forensic commits and cyber logs all land here with identical shape.
 */
export async function stageCandidates(input: StageCandidatesInput): Promise<{
  batchId: string;
  entityCount: number;
  linkCount: number;
}> {
  const { caseId, actor } = input;
  const now = new Date().toISOString();
  const batchId = `batch-${caseId}-${Date.now()}`;
  const content = (input.content || "").slice(0, MAX_BATCH_CONTENT_CHARS);
  let readableContent = (input.readableContent || "").slice(0, MAX_BATCH_CONTENT_CHARS);
  if (!readableContent && content) {
    try {
      const r = reconstructReadableText(content);
      const joined = r.paragraphs.join("\n\n");
      readableContent = (joined.length > 40 ? joined : content).slice(0, MAX_BATCH_CONTENT_CHARS);
    } catch {
      readableContent = content;
    }
  }
  const briefWanted = !!content && content.length >= 500 && process.env.SAHAYAK_AUTOBRIEF !== "false";

  await db.ingestion_batches.insertOne({
    _id: batchId,
    case_id: caseId,
    source: input.source,
    fileName: input.fileName,
    url: input.url,
    entityCount: input.entities.length,
    linkCount: input.links.length,
    approvedCount: 0,
    rejectedCount: 0,
    pendingCount: input.entities.length + input.links.length,
    truncated: false,
    status: "STAGED",
    submittedBy: actor.name,
    submittedByRank: actor.designation,
    submittedAt: now,
    hash: batchHash(caseId, input.source, input.entities.length + input.links.length, actor._id, now),
    content: content || undefined,
    contentTruncated: (input.content || "").length > MAX_BATCH_CONTENT_CHARS,
    readableContent: readableContent || undefined,
    briefPending: briefWanted,
    unresolved: (input.unresolved || []).slice(0, 50),
    enrichment: input.enrichment,
    provider: input.provider,
  } as any);

  if (briefWanted) {
    kickOffIntakeBrief(caseId, batchId, input.fileName || input.url, readableContent || content);
  }

  const stagedEntities = await Promise.all(
    input.entities.map(async (e, i) => {
      const dup = await findDuplicate(caseId, e.label, e.type);
      return {
        _id: `se-${batchId}-${i}`,
        case_id: caseId,
        batchId,
        source: input.source,
        label: e.label,
        type: e.type,
        role: e.role,
        riskScore: e.riskScore,
        confidence: e.confidence,
        details: e.details,
        evidenceRef: e.evidenceRef,
        locator: e.locator,
        status: "PENDING" as const,
        submittedBy: actor.name,
        duplicateOf: dup ? dup.id : undefined,
        created_at: now,
      };
    })
  );
  await db.staged_entities.insertMany(stagedEntities);

  const stagedLinks = input.links.map((l, i) => ({
    _id: `sl-${batchId}-${i}`,
    case_id: caseId,
    batchId,
    source: input.source,
    sourceLabel: l.sourceLabel,
    targetLabel: l.targetLabel,
    relationType: l.relationType,
    weight: l.weight,
    frequency: (l as any).frequency,
    amount: (l as any).amount,
    details: l.details,
    evidenceRef: l.evidenceRef,
    locator: l.locator,
    status: "PENDING" as const,
    submittedBy: actor.name,
    created_at: now,
  }));
  await db.staged_links.insertMany(stagedLinks);

  return { batchId, entityCount: input.entities.length, linkCount: input.links.length };
}

/** Checks the main graph for an existing entity with the same label+type. */
export async function findDuplicate(caseId: string, label: string, type: string): Promise<DBEntity | null> {
  const existing = await db.entities.find({ case_id: caseId });
  const norm = label.toLowerCase().trim();
  return existing.find((e) => e.label.toLowerCase().trim() === norm && e.type === type) || null;
}

export async function commitStagedEntity(
  caseId: string,
  staged: DBStagedEntity,
  user: DBUser
): Promise<{ mainId: string; merged: boolean }> {
  const now = new Date().toISOString();
  const dup = await findDuplicate(caseId, staged.label, staged.type);
  if (dup) {
    const docIds = [...(dup.sourceDocumentIds || [])];
    const ref = `STAGE:${staged.batchId}`;
    if (!docIds.includes(ref)) docIds.push(ref);
    await db.entities.updateOne(dup._id, { sourceDocumentIds: docIds, updated_at: now });
    return { mainId: dup.id, merged: true };
  }
  const mainId = `staged-${staged._id}`;
  const entity: DBEntity = {
    _id: `ent-${caseId}-${mainId}`,
    case_id: caseId,
    id: mainId,
    label: staged.label,
    type: staged.type,
    category: "EVIDENCE",
    reviewState: "NEEDS_REVIEW",
    role: staged.role,
    riskScore: staged.riskScore,
    confidence: staged.confidence,
    details: staged.details || {},
    evidence_ids: [],
    sourceDocumentIds: [`STAGE:${staged.batchId}`],
    sourceSnippets: staged.locator
      ? [{ docId: staged.batchId, docName: staged.evidenceRef || staged.source, locator: staged.locator, snippet: staged.locator, confidence: staged.confidence }]
      : [],
    created_at: now,
    updated_at: now,
  };
  await db.entities.insertOne(entity);
  return { mainId, merged: false };
}

export async function commitStagedLink(
  caseId: string,
  staged: DBStagedLink
): Promise<{ linkId: string }> {
  const existing = await db.entities.find({ case_id: caseId });
  const byLabel = new Map(existing.map((e) => [e.label.toLowerCase().trim(), e]));
  const src = byLabel.get(staged.sourceLabel.toLowerCase().trim());
  const tgt = byLabel.get(staged.targetLabel.toLowerCase().trim());
  if (!src || !tgt) {
    const missing = [!src ? `"${staged.sourceLabel}"` : null, !tgt ? `"${staged.targetLabel}"` : null]
      .filter(Boolean)
      .join(" and ");
    throw new Error(`Cannot approve link: endpoint ${missing} is not on the main graph yet. Approve the entities first.`);
  }
  const now = new Date().toISOString();
  const linkId = `staged-${staged._id}`;
  const rel: DBRelationship = {
    _id: `rel-${caseId}-${linkId}`,
    case_id: caseId,
    id: linkId,
    source: src.id,
    target: tgt.id,
    relationType: staged.relationType,
    category: "EVIDENCE",
    reviewState: "NEEDS_REVIEW",
    provenance: "AI_SUGGESTED",
    status: "EXTRACTED",
    weight: staged.weight,
    frequency: staged.frequency,
    amount: staged.amount,
    timestamp: now,
    details: staged.details,
    evidence_ids: [],
    source_type: "STAGING",
    confidence: 0.8,
  };
  await db.relationships.insertOne(rel);
  return { linkId };
}

export async function refreshBatchCounts(caseId: string, batchId: string): Promise<void> {
  const [ents, links] = await Promise.all([
    db.staged_entities.find(caseId),
    db.staged_links.find(caseId),
  ]);
  const inBatch = (b: string) => b === batchId;
  const e = ents.filter((x) => inBatch(x.batchId));
  const l = links.filter((x) => inBatch(x.batchId));
  const approved = e.filter((x) => x.status === "APPROVED").length + l.filter((x) => x.status === "APPROVED").length;
  const rejected = e.filter((x) => x.status === "REJECTED").length + l.filter((x) => x.status === "REJECTED").length;
  const pending = e.length + l.length - approved - rejected;
  await db.ingestion_batches.updateOne(batchId, {
    approvedCount: approved,
    rejectedCount: rejected,
    pendingCount: pending,
    status: pending === 0 ? "FULLY_REVIEWED" : approved + rejected > 0 ? "PARTIALLY_REVIEWED" : "STAGED",
  });
}

export function batchHash(caseId: string, source: string, n: number, by: string, at: string): string {
  return sha(`${caseId}|${source}|${n}|${by}|${at}`);
}
