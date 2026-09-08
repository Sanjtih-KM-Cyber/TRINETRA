import { db } from "../db";
import {
  extractEntitiesRuleBased,
  extractEntitiesUniversal,
  parseCDRCSV,
  parseFinancialCSV,
} from "../../src/services/nlpExtractor";
import { matchGazetteer } from "../../src/data/gazetteer";
import { getActiveProvider } from "../../src/services/llmClient";

/** Shared normalizers (single home — ingestionPipeline imports these). */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return "";
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return rawPhone.trim();
}

export function normalizeVehiclePlate(plate: string): string {
  if (!plate) return "";
  return plate.toUpperCase().replace(/\s+/g, "-").trim();
}

export function normalizeText(text: string): string {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export interface ReconstructedEntity {
  label: string;
  type: string;
  role?: string;
  riskScore: number;
  confidence: number;
  details?: any;
  evidenceRef?: string;
  locator?: string;
}

export interface ReconstructedLink {
  sourceLabel: string;
  targetLabel: string;
  relationType: string;
  weight: number;
  frequency?: number;
  amount?: number;
  durationSec?: number;
  details?: string;
  evidenceRef?: string;
  locator?: string;
}

export interface Reconstruction {
  entities: ReconstructedEntity[];
  links: ReconstructedLink[];
  /** Lines/rows that yielded nothing — surfaced for Lead review, never dropped. */
  unresolved: string[];
  enrichment: "LLM_ASSIST" | "RULES_ONLY";
  provider: string;
  truncated: boolean;
  note: string;
}

export const MAX_RECON_ENTITIES = 200;
export const MAX_RECON_LINKS = 400;

function geocode(e: { label: string; details?: any }): void {
  if (e.details?.geo?.lat && e.details?.geo?.lng) return;
  const hit = matchGazetteer(`${e.label} ${e.details?.address || ""} ${e.details?.notes || ""}`);
  if (hit) {
    e.details = { ...(e.details || {}), geo: { lat: hit.lat, lng: hit.lng, name: hit.label } };
  }
}

/** Lines carrying no identifiers at all — the "left nothing behind" ledger. */
function findUnresolvedLines(text: string, recognized: Array<{ locator?: string }>): string[] {
  const withEvidence = new Set(
    recognized
      .map((r) => r.locator)
      .filter((l): l is string => !!l)
      .flatMap((l) => {
        const m = /line (\d+)/i.exec(l);
        return m ? [Number(m[1])] : [];
      })
  );
  return text
    .split("\n")
    .map((l) => l.trim())
    .map((line, i) => ({ line, i: i + 1 }))
    .filter(({ line, i }) => line.length > 40 && !withEvidence.has(i))
    .slice(0, 50)
    .map(({ line, i }) => `L${i}: ${line.slice(0, 160)}`);
}

function mergeLlmEnrichment(
  base: ReconstructedEntity[],
  llmNodes: any[]
): { merged: ReconstructedEntity[]; added: number; enriched: number } {
  const byLabel = new Map(base.map((e) => [e.label.toLowerCase().trim(), e]));
  let added = 0;
  let enriched = 0;
  for (const n of llmNodes || []) {
    const label = String(n.label || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const existing = byLabel.get(key);
    if (existing) {
      if ((!existing.role || existing.role === "Mentioned Location") && n.role) {
        existing.role = String(n.role);
        enriched++;
      }
      const aliases = [...(existing.details?.aliases || []), ...((n as any).aliases || [])];
      if (aliases.length > 0) {
        existing.details = { ...(existing.details || {}), aliases: [...new Set(aliases)] };
        enriched++;
      }
    } else if (["PERSON", "ORGANIZATION", "LOCATION"].includes(String(n.type || "").toUpperCase())) {
      // LLM-only contribution: named persons/orgs regexes cannot see.
      const entity: ReconstructedEntity = {
        label,
        type: String(n.type).toUpperCase(),
        role: String(n.role || "Named Individual"),
        riskScore: 60,
        confidence: Math.min(0.85, Number(n.confidence) || 0.7),
        details: (n as any).details || {},
        evidenceRef: undefined,
        locator: undefined,
      };
      geocode(entity);
      base.push(entity);
      byLabel.set(key, entity);
      added++;
    }
  }
  return { merged: base, added, enriched };
}

/**
 * THE RECONSTRUCTOR — one structuring pipeline for every intake path
 * (field reports, forensic exhibits, cyber logs, OSINT, CSVs).
 *
 * Deterministic core (normalizers + rule extractors + gazetteer + graph
 * dedupe) runs always; an LLM pass enriches names/roles when a provider
 * is live. Pure w.r.t. the graph: it never writes, only structures.
 * Requesters decide staging vs direct commit.
 */
export async function reconstructText(
  caseId: string,
  text: string,
  opts: { evidenceRef: string; docName: string; wantLlm?: boolean }
): Promise<Reconstruction> {
  const clean = normalizeText(text);
  if (clean.length < 20) throw new Error("Text content is required (minimum 20 characters).");

  const rule = extractEntitiesRuleBased(clean, `RECON-${Date.now()}`, opts.docName);
  const entities: ReconstructedEntity[] = rule.nodes.map((n: any) => ({
    label: n.label,
    type: n.type,
    role: n.role,
    riskScore: n.riskScore ?? 60,
    confidence: n.confidence ?? 0.8,
    details: n.details || {},
    evidenceRef: opts.evidenceRef,
    locator: n.sourceSnippets?.[0]?.locator,
  }));
  const links: ReconstructedLink[] = rule.links.map((l: any) => ({
    sourceLabel: typeof l.source === "object" ? l.source.label : String(l.source),
    targetLabel: typeof l.target === "object" ? l.target.label : String(l.target),
    relationType: l.relationType,
    weight: l.weight ?? 0.7,
    frequency: l.frequency,
    amount: l.amount,
    durationSec: l.durationSec,
    details: l.details,
    evidenceRef: opts.evidenceRef,
    locator: l.evidenceDetail?.locator,
  }));

  let enrichment: Reconstruction["enrichment"] = "RULES_ONLY";
  const provider = getActiveProvider();
  let llmAdded = 0;
  if (opts.wantLlm !== false) {
    // Bounded enrichment: a slow/offline model must never stall intake.
    const llmRace = extractEntitiesUniversal(clean, opts.docName).catch(() => null);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
    try {
      const llm = await Promise.race([llmRace, timeout]);
      if (llm) {
        // extractEntitiesUniversal falls back to rules internally when no
        // model is live — only count genuinely new named entities.
        const { added, enriched } = mergeLlmEnrichment(entities, llm.nodes || []);
        llmAdded = added;
        if (added > 0 || enriched > 0) enrichment = "LLM_ASSIST";
      }
    } catch {
      /* offline — rules stand alone */
    }
  }

  for (const e of entities) geocode(e);

  // Dedupe against the live graph (advisory — approval still merges).
  try {
    const existing = await db.entities.find({ case_id: caseId });
    const known = new Set(existing.map((e) => `${e.type}::${e.label.toLowerCase().trim()}`));
    for (const e of entities) {
      if (known.has(`${e.type}::${e.label.toLowerCase().trim()}`)) {
        (e as any).duplicateOfGraph = true;
      }
    }
  } catch {
    /* graph check is advisory */
  }

  const recognized = [
    ...rule.nodes.flatMap((n: any) => n.sourceSnippets || []),
  ];
  const unresolved = findUnresolvedLines(clean, recognized);

  let truncated = false;
  if (entities.length > MAX_RECON_ENTITIES) {
    entities.splice(MAX_RECON_ENTITIES);
    truncated = true;
  }
  if (links.length > MAX_RECON_LINKS) {
    links.splice(MAX_RECON_LINKS);
    truncated = true;
  }

  const noteParts = [
    `${entities.length} entities, ${links.length} links`,
    enrichment === "LLM_ASSIST" ? `LLM-enriched (+${llmAdded} named)` : "rules only (model offline)",
    `${unresolved.length} unrecognized lines held for review`,
  ];
  if (truncated) noteParts.push("truncated to caps");
  return { entities, links, unresolved, enrichment, provider, truncated, note: noteParts.join(" · ") };
}

export async function reconstructCdr(
  content: string,
  evidenceRef: string
): Promise<{ entities: ReconstructedEntity[]; links: ReconstructedLink[]; unresolved: string[]; note: string }> {
  const rows = parseCDRCSV(content);
  if (rows.length === 0) throw new Error("No CDR rows parsed. Expected positional columns: aParty,bParty,imeiA,imeiB,timestamp,durationSec,callType,towerId,towerLocation,lat,lng.");
  const phones = new Map<string, ReconstructedEntity>();
  const pairAgg = new Map<string, { a: string; b: string; count: number; duration: number; tower: string }>();
  const unresolved: string[] = [];
  rows.forEach((r, i) => {
    if (!r.aParty || !r.bParty) {
      unresolved.push(`Row ${i + 2}: missing party numbers`);
      return;
    }
    for (const num of [normalizePhoneNumber(r.aParty), normalizePhoneNumber(r.bParty)]) {
      if (num && !phones.has(num)) {
        phones.set(num, {
          label: num, type: "PHONE", role: "CDR Calling Line",
          riskScore: 65, confidence: 0.97,
          details: { phone: num, tower: r.towerLocation },
          evidenceRef, locator: `Tower ${r.towerId || r.towerLocation}`,
        });
      }
    }
    const key = `${r.aParty}>>${r.bParty}`;
    const agg = pairAgg.get(key) || { a: r.aParty, b: r.bParty, count: 0, duration: 0, tower: r.towerLocation };
    agg.count += 1;
    agg.duration += Number(r.durationSec) || 0;
    pairAgg.set(key, agg);
  });
  const entities = [...phones.values()];
  const links: ReconstructedLink[] = [...pairAgg.values()].map((p) => ({
    sourceLabel: normalizePhoneNumber(p.a),
    targetLabel: normalizePhoneNumber(p.b),
    relationType: "CALLS",
    weight: Math.min(1, 0.4 + p.count / 20),
    frequency: p.count,
    details: `${p.count} calls, ${p.duration}s total via ${p.tower}`,
    evidenceRef,
    locator: `CDR aggregate ${p.a}↔${p.b}`,
  }));
  return { entities, links, unresolved: unresolved.slice(0, 50), note: `${rows.length} rows → ${entities.length} phones, ${links.length} aggregates` };
}

export async function reconstructFinancial(
  content: string,
  evidenceRef: string
): Promise<{ entities: ReconstructedEntity[]; links: ReconstructedLink[]; unresolved: string[]; note: string }> {
  const rows = parseFinancialCSV(content);
  if (rows.length === 0) throw new Error("No ledger rows parsed. Expected positional columns: senderAcc,senderName,receiverAcc,receiverName,amount,timestamp,mode,utr,bank.");
  const accts = new Map<string, ReconstructedEntity>();
  const pairAgg = new Map<string, { s: string; sName: string; r: string; rName: string; count: number; total: number; mode: string }>();
  const unresolved: string[] = [];
  rows.forEach((t, i) => {
    if (!t.senderAcc || !t.receiverAcc) {
      unresolved.push(`Row ${i + 2}: missing account numbers`);
      return;
    }
    for (const [acc, name] of [[t.senderAcc, t.senderName], [t.receiverAcc, t.receiverName]] as Array<[string, string]>) {
      if (acc && !accts.has(acc)) {
        accts.set(acc, {
          label: `${name || acc} (${acc})`, type: "FINANCIAL", role: "Ledger Account",
          riskScore: 70, confidence: 0.96,
          details: { accountNumber: acc, notes: `Observed in ${evidenceRef}` },
          evidenceRef, locator: `Ledger ${t.utrNumber || ""}`.trim(),
        });
      }
    }
    const key = `${t.senderAcc}>>${t.receiverAcc}`;
    const agg = pairAgg.get(key) || { s: t.senderAcc, sName: t.senderName, r: t.receiverAcc, rName: t.receiverName, count: 0, total: 0, mode: t.mode };
    agg.count += 1;
    agg.total += Number(t.amount) || 0;
    pairAgg.set(key, agg);
  });
  const entities = [...accts.values()];
  const acctLabel = (acc: string, name: string) => `${name || acc} (${acc})`;
  const links: ReconstructedLink[] = [...pairAgg.values()].map((p) => ({
    sourceLabel: acctLabel(p.s, p.sName),
    targetLabel: acctLabel(p.r, p.rName),
    relationType: "FUNDS_TRANSFER",
    weight: Math.min(1, 0.4 + p.total / 5000000),
    frequency: p.count,
    amount: p.total,
    details: `${p.count} transfers totalling ₹${p.total.toLocaleString("en-IN")} via ${p.mode}${p.total < 1000000 && p.count > 2 ? " — possible smurfing" : ""}`,
    evidenceRef,
    locator: `Ledger aggregate ${p.s}→${p.r}`,
  }));
  return { entities, links, unresolved: unresolved.slice(0, 50), note: `${rows.length} rows → ${entities.length} accounts, ${links.length} aggregates` };
}
