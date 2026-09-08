import { db } from "../db";
import { searchLegalCorpus, type LegalHit } from "../../src/data/legalCorpus";

export interface LinkProposal {
  id: string;
  sourceLabel: string;
  targetLabel: string;
  relationType: string;
  basis: string;
  confidence: number;
  statuteIds: string[];
  statutes: LegalHit[];
  sendable: boolean;
}

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9+]/g, "");
}

function phoneDigits(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

/**
 * Evidence Linker: cross-references CDR rows ↔ PHONE entities, ledger rows ↔
 * FINANCIAL entities, and FIR/diary statements ↔ PERSON entities, attaching
 * the exact statute for each corroborated trail.
 */
export async function linkEvidence(caseId: string, limit = 40): Promise<{ proposals: LinkProposal[]; generatedAt: string }> {
  const [entities, relationships, cdrs, financials, firs, diary] = await Promise.all([
    db.entities.find({ case_id: caseId }),
    db.relationships.find({ case_id: caseId }),
    db.cdrs.find(caseId),
    db.financials.find(caseId),
    db.firs.find(caseId),
    db.case_diary.find(caseId),
  ]);

  const existingPairs = new Set(
    relationships.map((r) => `${norm(typeof r.source === "string" ? r.source : (r.source as any)?.id || "")}>>${norm(typeof r.target === "string" ? r.target : (r.target as any)?.id || "")}>>${r.relationType}`)
  );
  const proposals: LinkProposal[] = [];
  const push = (p: Omit<LinkProposal, "id" | "statutes" | "statuteIds" | "sendable"> & { statuteQuery: string }) => {
    if (proposals.length >= limit) return;
    const statutes = searchLegalCorpus(p.statuteQuery, 3);
    proposals.push({
      id: `lnk-${proposals.length}-${Date.now().toString(36)}`,
      sourceLabel: p.sourceLabel,
      targetLabel: p.targetLabel,
      relationType: p.relationType,
      basis: p.basis,
      confidence: p.confidence,
      statuteIds: statutes.map((s) => s.id),
      statutes,
      sendable: true,
    });
  };

  // 1. CDR ↔ PHONE entities
  const phones = entities.filter((e) => e.type === "PHONE");
  for (const c of cdrs.slice(0, 200)) {
    for (const num of [c.aParty, c.bParty]) {
      const digits = phoneDigits(num);
      if (!digits) continue;
      const match = phones.find((p) => phoneDigits(p.label) === digits || phoneDigits(p.details?.phone || "") === digits);
      if (!match) continue;
      const key = `${norm(match.id)}>>${norm(c.towerId || "")}>>LOCATED_AT`;
      if (existingPairs.has(key)) continue;
      push({
        sourceLabel: match.label,
        targetLabel: c.towerLocation || c.towerId,
        relationType: "LOCATED_AT",
        basis: `CDR ${c.id}: ${num} active on ${c.towerId} (${c.towerLocation}) at ${c.timestamp}, ${c.durationSec}s.`,
        confidence: 0.92,
        statuteQuery: "65B electronic certificate CDR",
      });
    }
  }

  // 2. Ledger ↔ FINANCIAL entities (amount match → layering statutes)
  const accounts = entities.filter((e) => e.type === "FINANCIAL");
  for (const t of financials.slice(0, 200)) {
    for (const acc of [t.senderAcc, t.receiverAcc]) {
      if (!acc) continue;
      const match = accounts.find((a) =>
        norm(a.label).includes(norm(acc)) || norm(a.details?.accountNumber || "") === norm(acc)
      );
      if (!match) continue;
      const other = acc === t.senderAcc ? t.receiverName : t.senderName;
      push({
        sourceLabel: match.label,
        targetLabel: other || (acc === t.senderAcc ? t.receiverAcc : t.senderAcc),
        relationType: "FUNDS_TRANSFER",
        basis: `Ledger ${t.id}: ₹${Number(t.amount).toLocaleString("en-IN")} via ${t.mode} (UTR ${t.utrNumber}) on ${t.timestamp}.`,
        confidence: 0.9,
        statuteQuery: t.mode === "HAWALA_CASH" || Number(t.amount) >= 1000000 ? "money laundering hawala PMLA" : "cheating fraud",
      });
    }
  }

  // 3. FIR/diary statements ↔ PERSON entities (name mention → ASSOCIATED_WITH evidence)
  const persons = entities.filter((e) => e.type === "PERSON");
  const statements: Array<{ ref: string; text: string }> = [
    ...firs.map((f: any) => ({ ref: `FIR ${f.firNumber}`, text: `${f.briefNarrative} ${(f.accused || []).join(" ")}` })),
    ...diary.slice(-30).map((d: any) => ({ ref: `Diary No.${d.diaryNo}`, text: `${d.proceedings} ${d.actionTaken || ""}` })),
  ];
  for (const s of statements) {
    for (const p of persons) {
      const names = [p.label, ...(p.aliases || [])].filter(Boolean);
      const hit = names.find((n) => n.length > 3 && norm(s.text).includes(norm(n).replace(/[^a-z0-9]/g, "")) && norm(n).length > 0);
      if (!hit) continue;
      // Statement mentions are corroboration context, not graph links —
      // they ride to the reviewer as non-sendable pointers.
      if (proposals.length < limit) {
        const statutes = searchLegalCorpus("organised crime syndicate conspiracy", 3);
        proposals.push({
          id: `ctx-${proposals.length}-${Date.now().toString(36)}`,
          sourceLabel: p.label,
          targetLabel: s.ref,
          relationType: "ASSOCIATED_WITH",
          basis: `Statement reference: "${hit}" named in ${s.ref}.`,
          confidence: 0.65,
          statuteIds: statutes.map((x) => x.id),
          statutes,
          sendable: false,
        });
      }
      if (proposals.length >= limit) break;
    }
    if (proposals.length >= limit) break;
  }

  // Person↔person corroboration is intentionally left to Lead review (no auto-links).

  return {
    proposals,
    generatedAt: new Date().toISOString(),
  };
}
