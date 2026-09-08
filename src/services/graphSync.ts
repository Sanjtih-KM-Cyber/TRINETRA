import type { CrimeNetworkLink, CrimeNetworkNode } from "../types";

/**
 * Phase 2 — real-time graph sync. Converts server vault records into
 * workstation graph elements so staging approvals flow into the canvas.
 */

export function dbEntityToNode(e: any): CrimeNetworkNode {
  return {
    id: String(e.id || e._id),
    label: String(e.label || "Unknown"),
    type: e.type || "PERSON",
    category: e.category,
    reviewState: e.reviewState,
    role: e.role,
    aliases: e.aliases,
    riskScore: Number(e.riskScore) || 50,
    confidence: Number(e.confidence) || 0.7,
    details: e.details || {},
    investigatorNotesList: e.investigatorNotesList,
    sourceSnippets: e.sourceSnippets,
    sourceDocumentIds: e.sourceDocumentIds,
  };
}

export function dbRelationshipToLink(r: any): CrimeNetworkLink {
  return {
    id: String(r.id || r._id),
    source: typeof r.source === "object" ? r.source.id : String(r.source),
    target: typeof r.target === "object" ? r.target.id : String(r.target),
    relationType: r.relationType || "ASSOCIATED_WITH",
    category: r.category,
    reviewState: r.reviewState,
    weight: Number(r.weight) || 0.7,
    frequency: r.frequency,
    amount: r.amount,
    durationSec: r.durationSec,
    timestamp: r.timestamp,
    details: r.details,
    sourceDocumentId: r.sourceDocumentId,
    evidenceDetail: r.evidenceDetail,
    investigatorNotesList: r.investigatorNotesList,
    flags: r.flags,
  };
}

export function mergeNodes(prev: CrimeNetworkNode[], incoming: CrimeNetworkNode[]): CrimeNetworkNode[] {
  if (incoming.length === 0) return prev;
  const known = new Set(prev.map((n) => n.id));
  const fresh = incoming.filter((n) => !known.has(n.id));
  return fresh.length > 0 ? [...prev, ...fresh] : prev;
}

export function mergeLinks(prev: CrimeNetworkLink[], incoming: CrimeNetworkLink[]): CrimeNetworkLink[] {
  if (incoming.length === 0) return prev;
  const known = new Set(prev.map((l) => l.id));
  const fresh = incoming.filter((l) => !known.has(l.id));
  return fresh.length > 0 ? [...prev, ...fresh] : prev;
}
