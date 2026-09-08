import { Router, Response } from "express";
import { db } from "../db";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../auth";
import { ADMIN_ROLES, isAdmin } from "../../src/data/roles";
import type { DBRole } from "../db";
import { sahayakAsk, sahayakHealth, sahayakTranslate, sahayakChargeAssist, sahayakSummarize, KNOWN_ADAPTERS } from "../services/sahayak";
import { parseDocument } from "../services/docIntel";
import { linkEvidence } from "../services/legalLinker";
import { searchLegalCorpus } from "../../src/data/legalCorpus";
import { listMeshPeers, refreshMeshHealth, meshTransport } from "../services/modelMesh";
import { auditRecord, notifyCase } from "../services/diaryService";

const router = Router();
router.use(authenticateToken);

async function assertCaseAccess(req: AuthenticatedRequest, caseId: string): Promise<boolean> {
  const user = req.user!;
  if (isAdmin(user.role)) return true;
  const mem = await db.case_members.findOne({ case_id: caseId, user_id: user._id });
  return !!mem && mem.status === "ACTIVE";
}

// Provider + LoRA + federated mesh health (real probes)
router.get("/health", async (_req: AuthenticatedRequest, res: Response) => {
  const health = await sahayakHealth();
  const mesh = await refreshMeshHealth().catch(() => []);
  res.json({
    ...health,
    mesh: {
      transport: meshTransport(),
      tailscaleHostname: process.env.TAILSCALE_HOSTNAME || null,
      peers: mesh,
      knownAdapters: KNOWN_ADAPTERS,
    },
  });
});

// Federated mesh peer registry (reads for members, writes for ADMIN)
router.get("/mesh", async (_req: AuthenticatedRequest, res: Response) => {
  const peers = await refreshMeshHealth().catch(() => []);
  res.json({ transport: meshTransport(), peers, knownAdapters: KNOWN_ADAPTERS });
});

router.post("/mesh", requireRole([...ADMIN_ROLES] as DBRole[]), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { name, baseUrl, adapters, models, enabled } = req.body;
  if (!name || !baseUrl) {
    res.status(400).json({ error: "name and baseUrl are required." });
    return;
  }
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.status(400).json({ error: "baseUrl must be http(s)." });
      return;
    }
  } catch {
    res.status(400).json({ error: "baseUrl is not a valid URL." });
    return;
  }
  const now = new Date().toISOString();
  const peer = await db.mesh_peers.insertOne({
    _id: `peer-${Date.now()}`,
    name: String(name),
    baseUrl: String(baseUrl).replace(/\/$/, ""),
    transport: (() => {
      try {
        const h = new URL(baseUrl).hostname.toLowerCase();
        return h.endsWith(".ts.net") || h.startsWith("100.") ? "tailscale" : "local";
      } catch {
        return "unknown";
      }
    })(),
    adapters: Array.isArray(adapters) ? adapters.map(String) : [],
    models: Array.isArray(models) ? models.map(String) : [],
    enabled: enabled !== false,
    addedBy: user.name,
    created_at: now,
  });
  await auditRecord("global", user, "MESH_PEER_ADDED",
    `${user.name} registered mesh peer ${peer.name} (${peer.baseUrl}).`,
    "CASE", peer._id, peer.name, undefined, req.ip);
  res.status(201).json({ success: true, peer });
});

router.delete("/mesh/:peerId", requireRole([...ADMIN_ROLES] as DBRole[]), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const ok = await db.mesh_peers.deleteOne(req.params.peerId);
  if (!ok) {
    res.status(404).json({ error: "Peer not found." });
    return;
  }
  await auditRecord("global", user, "MESH_PEER_REMOVED",
    `${user.name} removed mesh peer ${req.params.peerId}.`,
    "CASE", req.params.peerId, undefined, undefined, req.ip);
  res.json({ success: true });
});

// Unified ask: case retrieval + legal corpus + ad-hoc officer context + live LLM / labelled rules engine
router.post("/ask", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { caseId, question, adapter, adhocContext } = req.body;
  if (!question || String(question).trim().length < 3) {
    res.status(400).json({ error: "question is required." });
    return;
  }
  if (adapter && !KNOWN_ADAPTERS.includes(adapter)) {
    res.status(400).json({ error: `adapter must be one of: ${KNOWN_ADAPTERS.join(", ")}.` });
    return;
  }
  if (adhocContext && String(adhocContext).length > 20000) {
    res.status(400).json({ error: "adhocContext exceeds 20000 chars." });
    return;
  }
  if (caseId && !(await assertCaseAccess(req, caseId))) {
    res.status(403).json({ error: "Not a member of this case." });
    return;
  }
  try {
    const result = await sahayakAsk(caseId, String(question), { adapter, adhocContext });
    await auditRecord(caseId || "global", user, "SAHAYAK_ASK",
      `${user.name} asked SAHAYAK${caseId ? ` on ${caseId}` : ""}: "${String(question).slice(0, 120)}" [${result.llmUsed ? result.provider : "rules engine"}].`,
      "CASE", caseId, undefined, { llmUsed: result.llmUsed }, req.ip);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "SAHAYAK query failed." });
  }
});

// Exact statute / article / precedent lookup
router.get("/statutes", async (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || "");
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));
  if (!q.trim()) {
    res.status(400).json({ error: "q is required." });
    return;
  }
  res.json({ query: q, hits: searchLegalCorpus(q, limit) });
});

// Document Intel: PDF/DOCX/TXT/CSV/LOG → text + script detect + entities + highlights
router.post("/document", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { fileName, mimeType, contentBase64 } = req.body;
  if (!fileName || !contentBase64) {
    res.status(400).json({ error: "fileName and contentBase64 are required." });
    return;
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(String(contentBase64), "base64");
  } catch {
    res.status(400).json({ error: "contentBase64 is not valid base64." });
    return;
  }
  if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) {
    res.status(400).json({ error: "Document must be 1 byte – 20MB." });
    return;
  }
  try {
    const parsed = await parseDocument(fileName, mimeType || "application/octet-stream", buffer);
    await auditRecord("global", user, "DOC_INTEL_PARSED",
      `${user.name} parsed ${fileName}: ${parsed.pages} page(s), ${parsed.entities.length} entities, ${parsed.highlights.length} highlighted lines [${parsed.language.primary}].`,
      "EXHIBIT", undefined, fileName, { pages: parsed.pages }, req.ip);
    res.json({ success: true, document: parsed });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Document parsing failed." });
  }
});

// Evidence Linker: CDR/financial/statement cross-reference + exact statutes
router.post("/link-evidence", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { caseId, limit } = req.body;
  if (!caseId) {
    res.status(400).json({ error: "caseId is required." });
    return;
  }
  if (!(await assertCaseAccess(req, caseId))) {
    res.status(403).json({ error: "Not a member of this case." });
    return;
  }
  const result = await linkEvidence(caseId, Math.min(60, Math.max(1, Number(limit) || 40)));
  await auditRecord(caseId, user, "EVIDENCE_LINKED",
    `${user.name} ran the Evidence Linker on ${caseId}: ${result.proposals.length} proposals.`,
    "CASE", caseId, undefined, { proposals: result.proposals.length }, req.ip);
  notifyCase(caseId, "EVIDENCE_LINKED", "Evidence Links Proposed",
    `${user.name} generated ${result.proposals.length} evidence-link proposals.`, user);
  res.json(result);
});

// Translation (live model required — 503 otherwise, never faked)
router.post("/translate", async (req: AuthenticatedRequest, res: Response) => {
  const { text, targetLang, adapter } = req.body;
  if (adapter && !KNOWN_ADAPTERS.includes(adapter)) {
    res.status(400).json({ error: `adapter must be one of: ${KNOWN_ADAPTERS.join(", ")}.` });
    return;
  }
  try {
    const result = await sahayakTranslate(String(text || ""), String(targetLang || ""), { adapter });
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message || "Translation failed." });
  }
});

// Summarize any text in any language (LLM when live, extractive offline)
router.post("/summarize", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { text, targetLang, adapter } = req.body;
  if (adapter && !KNOWN_ADAPTERS.includes(adapter)) {
    res.status(400).json({ error: `adapter must be one of: ${KNOWN_ADAPTERS.join(", ")}.` });
    return;
  }
  try {
    const result = await sahayakSummarize(String(text || ""), targetLang ? String(targetLang) : undefined, { adapter });
    await auditRecord("global", user, "SAHAYAK_SUMMARIZE",
      `${user.name} summarized a document${targetLang ? ` in ${targetLang}` : ""} [${result.llmUsed ? result.provider : "extractive offline"}].`,
      "EXHIBIT", undefined, undefined, { llmUsed: result.llmUsed }, req.ip);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message || "Summarize failed." });
  }
});

// Charge-sheet assist: corpus legal opinion + optional LLM polish
router.post("/chargesheet-assist", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { caseId, sections, accusedCount, exhibitCount, factsDraft, evidenceDraft } = req.body;
  if (caseId && !(await assertCaseAccess(req, caseId))) {
    res.status(403).json({ error: "Not a member of this case." });
    return;
  }
  if (!factsDraft || String(factsDraft).trim().length < 20) {
    res.status(400).json({ error: "factsDraft (min 20 chars) is required." });
    return;
  }
  if (req.body.adapter && !KNOWN_ADAPTERS.includes(req.body.adapter)) {
    res.status(400).json({ error: `adapter must be one of: ${KNOWN_ADAPTERS.join(", ")}.` });
    return;
  }
  const result = await sahayakChargeAssist({
    firNumber: req.body.firNumber,
    sections: Array.isArray(sections) ? sections : [],
    accusedCount: Number(accusedCount) || 0,
    exhibitCount: Number(exhibitCount) || 0,
    factsDraft: String(factsDraft),
    evidenceDraft: String(evidenceDraft || ""),
  }, { adapter: req.body.adapter });
  if (caseId) {
    await auditRecord(caseId, user, "CHARGESHEET_ASSISTED",
      `${user.name} ran SAHAYAK charge-sheet assist [${result.llmUsed ? result.provider : "corpus only"}].`,
      "DOSSIER", undefined, undefined, { llmUsed: result.llmUsed }, req.ip);
  }
  res.json(result);
});

export default router;
