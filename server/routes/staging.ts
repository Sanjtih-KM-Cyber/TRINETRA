import { Router, Response } from "express";
import { db, DBUser } from "../db";
import {
  authenticateToken,
  requireCaseMembership,
  requireEditAccess,
  requireFunctional,
  requireRole,
  AuthenticatedRequest,
} from "../auth";
import {
  processSource,
  commitStagedEntity,
  commitStagedLink,
  refreshBatchCounts,
  stageCandidates,
  batchHash,
} from "../services/stagingService";
import {
  SP_ELIGIBLE_ROLES,
  sha256,
  autoLogDiary,
  auditRecord,
  notifyCase,
} from "../services/diaryService";

const router = Router();
router.use(authenticateToken);

const SOURCES = ["FIR", "CDR_CSV", "FINANCIAL_CSV", "OSINT_URL", "INTEL_REPORT", "CYBER_LOG"];

/** Separation of duties: submitters (field/forensic/cyber) cannot approve their own queue. */
import { REVIEWER_ROLES, isAdmin } from "../../src/data/roles";

const REVIEW_ROLES: string[] = [...REVIEWER_ROLES];

function canReview(user: DBUser): boolean {
  return REVIEW_ROLES.includes(user.role);
}

const AGENCY_STOPWORDS = new Set([
  "NATIONAL", "CENTRAL", "BUREAU", "AGENCY", "DIRECTORATE", "INDIA", "INDIAN",
  "DEPARTMENT", "MINISTRY", "CONTROL", "UNIT", "WING", "CELL", "BRANCH", "OFFICE",
  "POLICE", "CRIME", "INTELLIGENCE", "INVESTIGATION", "ENFORCEMENT", "FINANCIAL",
  "COMPUTER", "EMERGENCY", "RESPONSE", "TEAM", "RECORDS", "STATE", "SPECIAL",
]);

/**
 * Human-variance-tolerant agency match: membership strings
 * ("Narcotics Control Bureau (NCB)") rarely equal case holding strings
 * ("Narcotics Control Bureau & Directorate of Revenue Intelligence (NCB-DRI)").
 */
export function agencyMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const tokens = (s: string) =>
    s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/)
      .filter((t) => t.length >= 4 && !AGENCY_STOPWORDS.has(t));
  const ta = tokens(a);
  const tb = tokens(b);
  return ta.some((t) => tb.includes(t));
}

// ---------------------------------------------------------------------------
// MULTI-SOURCE INGESTION → STAGING AREA
// ---------------------------------------------------------------------------

router.post(
  "/:caseId/ingest",
  requireCaseMembership,
  requireEditAccess,
  requireFunctional(["ADMIN", "FIELD", "FORENSIC", "CYBER"]),
  async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const { source, content, fileName, url } = req.body;

  if (!SOURCES.includes(source)) {
    res.status(400).json({ error: `source must be one of: ${SOURCES.join(", ")}.` });
    return;
  }

  try {
    const parsed = await processSource(caseId, source, content || "", { fileName, url });
    const { batchId, entityCount, linkCount } = await stageCandidates({
      caseId,
      source,
      fileName,
      url,
      entities: parsed.entities,
      links: parsed.links,
      actor: user,
      note: parsed.note,
      content: content || undefined,
      unresolved: parsed.unresolved,
      enrichment: parsed.enrichment,
      provider: parsed.provider,
    });

    await auditRecord(caseId, user, "INGESTION_STAGED",
      `${source} ingested by ${user.name}: ${entityCount} entities + ${linkCount} links staged in batch ${batchId}. ${parsed.note}`,
      "EXHIBIT", batchId, fileName || url || source, { source, enrichment: parsed.enrichment }, req.ip);
    await autoLogDiary(caseId, user,
      `Ingestion: ${source} (${fileName || url || "direct input"}) staged ${entityCount} entities and ${linkCount} links for Lead review. ${parsed.note}`,
      "INGESTION_STAGED");
    notifyCase(caseId, "STAGING_UPDATED", "Staging Area Updated",
      `${user.name} staged ${entityCount + linkCount} items from ${source}.`, user);

    res.status(201).json({
      success: true,
      batchId,
      entityCount,
      linkCount,
      truncated: parsed.truncated,
      note: parsed.note,
      unresolvedCount: parsed.unresolved.length,
      enrichment: parsed.enrichment,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Ingestion failed." });
  }
});

// Approval queue
router.get("/:caseId/staging", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const { status, source, batchId } = req.query as Record<string, string>;
  let entities = await db.staged_entities.find(caseId, status);
  let links = await db.staged_links.find(caseId, status);
  if (source) {
    entities = entities.filter((e) => e.source === source);
    links = links.filter((l) => l.source === source);
  }
  if (batchId) {
    entities = entities.filter((e) => e.batchId === batchId);
    links = links.filter((l) => l.batchId === batchId);
  }
  const batches = await db.ingestion_batches.find(caseId);
  res.json({ entities, links, batches });
});

// Review a staged entity
router.post("/:caseId/staging/entities/:stagedId/review", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, stagedId } = req.params;
  const user = req.user!;
  const { decision, note } = req.body;
  if (!canReview(user)) {
    res.status(403).json({ error: "Approval authority rests with the Lead Investigator (or deputed agency officer). Submitters cannot approve." });
    return;
  }
  if (!["APPROVE", "REJECT"].includes(decision)) {
    res.status(400).json({ error: "decision must be APPROVE or REJECT." });
    return;
  }
  const staged = await db.staged_entities.findOne(stagedId);
  if (!staged || staged.case_id !== caseId) {
    res.status(404).json({ error: "Staged entity not found." });
    return;
  }
  if (staged.status !== "PENDING") {
    res.status(400).json({ error: `Item already ${staged.status}.` });
    return;
  }

  const now = new Date().toISOString();
  if (decision === "APPROVE") {
    const { mainId, merged } = await commitStagedEntity(caseId, staged, user);
    await db.staged_entities.updateOne(stagedId, {
      status: "APPROVED", reviewedBy: user.name, reviewedAt: now, reviewNote: note,
    });
    await refreshBatchCounts(caseId, staged.batchId);
    await auditRecord(caseId, user, "STAGED_ENTITY_APPROVED",
      `${user.name} approved staged entity "${staged.label}" → main graph${merged ? ` (merged into ${mainId})` : ` (${mainId})`}.`,
      "NODE", mainId, staged.label, { merged }, req.ip);
    await autoLogDiary(caseId, user,
      `Staging approval: "${staged.label}" (${staged.type}) admitted to main graph from ${staged.source}${merged ? " as merge with existing entity" : ""}.`,
      "STAGING_APPROVED");
    notifyCase(caseId, "STAGING_UPDATED", "Entity Approved",
      `${user.name} approved "${staged.label}" to the main graph.`, user);
    res.json({ success: true, mainId, merged });
    return;
  }

  if (!note || String(note).trim().length < 5) {
    res.status(400).json({ error: "A rejection reason (min 5 chars) is required — it follows the item to the Innocent pool." });
    return;
  }
  await db.staged_entities.updateOne(stagedId, {
    status: "REJECTED", reviewedBy: user.name, reviewedAt: now, reviewNote: note,
  });
  const poolItem = await db.innocent_pool.insertOne({
    _id: `pool-${stagedId}`,
    case_id: caseId,
    kind: "ENTITY",
    label: staged.label,
    snapshot: staged,
    rejectionReason: String(note).trim(),
    rejectedBy: user.name,
    rejectedAt: now,
    source: staged.source,
    batchId: staged.batchId,
    readded: false,
  });
  await refreshBatchCounts(caseId, staged.batchId);
  await auditRecord(caseId, user, "STAGED_ENTITY_REJECTED",
    `${user.name} rejected staged entity "${staged.label}" — moved to Innocent pool. Reason: ${note}`,
    "NODE", stagedId, staged.label, undefined, req.ip);
  notifyCase(caseId, "STAGING_UPDATED", "Entity Rejected",
    `${user.name} moved "${staged.label}" to the Innocent pool.`, user);
  res.json({ success: true, poolId: poolItem._id });
});

// Review a staged link
router.post("/:caseId/staging/links/:stagedId/review", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, stagedId } = req.params;
  const user = req.user!;
  const { decision, note } = req.body;
  if (!canReview(user)) {
    res.status(403).json({ error: "Approval authority rests with the Lead Investigator (or deputed agency officer). Submitters cannot approve." });
    return;
  }
  if (!["APPROVE", "REJECT"].includes(decision)) {
    res.status(400).json({ error: "decision must be APPROVE or REJECT." });
    return;
  }
  const staged = await db.staged_links.findOne(stagedId);
  if (!staged || staged.case_id !== caseId) {
    res.status(404).json({ error: "Staged link not found." });
    return;
  }
  if (staged.status !== "PENDING") {
    res.status(400).json({ error: `Item already ${staged.status}.` });
    return;
  }

  const now = new Date().toISOString();
  if (decision === "APPROVE") {
    try {
      const { linkId } = await commitStagedLink(caseId, staged);
      await db.staged_links.updateOne(stagedId, {
        status: "APPROVED", reviewedBy: user.name, reviewedAt: now, reviewNote: note,
      });
      await refreshBatchCounts(caseId, staged.batchId);
      await auditRecord(caseId, user, "STAGED_LINK_APPROVED",
        `${user.name} approved staged link "${staged.sourceLabel} [${staged.relationType}] ${staged.targetLabel}" → main graph.`,
        "LINK", linkId, `${staged.sourceLabel}→${staged.targetLabel}`, undefined, req.ip);
      await autoLogDiary(caseId, user,
        `Staging approval: link "${staged.sourceLabel} [${staged.relationType}] ${staged.targetLabel}" admitted to main graph from ${staged.source}.`,
        "STAGING_APPROVED");
      notifyCase(caseId, "STAGING_UPDATED", "Link Approved",
        `${user.name} approved a link to the main graph.`, user);
      res.json({ success: true, linkId });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
    return;
  }

  if (!note || String(note).trim().length < 5) {
    res.status(400).json({ error: "A rejection reason (min 5 chars) is required." });
    return;
  }
  await db.staged_links.updateOne(stagedId, {
    status: "REJECTED", reviewedBy: user.name, reviewedAt: now, reviewNote: note,
  });
  const poolItem = await db.innocent_pool.insertOne({
    _id: `pool-${stagedId}`,
    case_id: caseId,
    kind: "LINK",
    label: `${staged.sourceLabel} [${staged.relationType}] ${staged.targetLabel}`,
    snapshot: staged,
    rejectionReason: String(note).trim(),
    rejectedBy: user.name,
    rejectedAt: now,
    source: staged.source,
    batchId: staged.batchId,
    readded: false,
  });
  await refreshBatchCounts(caseId, staged.batchId);
  await auditRecord(caseId, user, "STAGED_LINK_REJECTED",
    `${user.name} rejected staged link "${staged.sourceLabel}→${staged.targetLabel}". Reason: ${note}`,
    "LINK", stagedId, `${staged.sourceLabel}→${staged.targetLabel}`, undefined, req.ip);
  notifyCase(caseId, "STAGING_UPDATED", "Link Rejected",
    `${user.name} moved a link to the Innocent pool.`, user);
  res.json({ success: true, poolId: poolItem._id });
});

// Bulk review a whole batch
router.post("/:caseId/staging/batch/:batchId/review", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, batchId } = req.params;
  const user = req.user!;
  const { decision, note } = req.body;
  if (!canReview(user)) {
    res.status(403).json({ error: "Approval authority rests with the Lead Investigator (or deputed agency officer)." });
    return;
  }
  if (!["APPROVE", "REJECT"].includes(decision)) {
    res.status(400).json({ error: "decision must be APPROVE or REJECT." });
    return;
  }
  const batch = await db.ingestion_batches.findOne(batchId);
  if (!batch || batch.case_id !== caseId) {
    res.status(404).json({ error: "Batch not found." });
    return;
  }

  const now = new Date().toISOString();
  const ents = (await db.staged_entities.find(caseId)).filter((e) => e.batchId === batchId && e.status === "PENDING");
  const links = (await db.staged_links.find(caseId)).filter((l) => l.batchId === batchId && l.status === "PENDING");
  let approved = 0;
  let rejected = 0;
  const skipped: string[] = [];

  if (decision === "APPROVE") {
    for (const e of ents) {
      const { mainId, merged } = await commitStagedEntity(caseId, e, user);
      await db.staged_entities.updateOne(e._id, { status: "APPROVED", reviewedBy: user.name, reviewedAt: now, reviewNote: note || "Bulk batch approval" });
      void mainId;
      void merged;
      approved++;
    }
    for (const l of links) {
      try {
        await commitStagedLink(caseId, l);
        await db.staged_links.updateOne(l._id, { status: "APPROVED", reviewedBy: user.name, reviewedAt: now, reviewNote: note || "Bulk batch approval" });
        approved++;
      } catch {
        skipped.push(`${l.sourceLabel}→${l.targetLabel}`);
      }
    }
  } else {
    if (!note || String(note).trim().length < 5) {
      res.status(400).json({ error: "A rejection reason (min 5 chars) is required for bulk reject." });
      return;
    }
    for (const e of ents) {
      await db.staged_entities.updateOne(e._id, { status: "REJECTED", reviewedBy: user.name, reviewedAt: now, reviewNote: note });
      await db.innocent_pool.insertOne({
        _id: `pool-${e._id}`, case_id: caseId, kind: "ENTITY", label: e.label,
        snapshot: e, rejectionReason: String(note).trim(), rejectedBy: user.name,
        rejectedAt: now, source: e.source, batchId, readded: false,
      });
      rejected++;
    }
    for (const l of links) {
      await db.staged_links.updateOne(l._id, { status: "REJECTED", reviewedBy: user.name, reviewedAt: now, reviewNote: note });
      await db.innocent_pool.insertOne({
        _id: `pool-${l._id}`, case_id: caseId, kind: "LINK",
        label: `${l.sourceLabel} [${l.relationType}] ${l.targetLabel}`,
        snapshot: l, rejectionReason: String(note).trim(), rejectedBy: user.name,
        rejectedAt: now, source: l.source, batchId, readded: false,
      });
      rejected++;
    }
  }

  await refreshBatchCounts(caseId, batchId);
  await auditRecord(caseId, user, decision === "APPROVE" ? "STAGING_BATCH_APPROVED" : "STAGING_BATCH_REJECTED",
    `${user.name} bulk-${decision === "APPROVE" ? "approved" : "rejected"} batch ${batchId}: ${approved} approved, ${rejected} rejected${skipped.length ? `, ${skipped.length} links skipped (endpoints pending)` : ""}.`,
    "EXHIBIT", batchId, batch.fileName || batch.source, undefined, req.ip);
  await autoLogDiary(caseId, user,
    `Staging batch ${batchId} (${batch.source}) bulk reviewed: ${approved} admitted, ${rejected} to Innocent pool${skipped.length ? `, ${skipped.length} links held for entity approval` : ""}.`,
    "STAGING_BATCH_REVIEW");
  notifyCase(caseId, "STAGING_UPDATED", "Batch Reviewed",
    `${user.name} bulk-reviewed batch ${batchId}.`, user);

  res.json({ success: true, approved, rejected, skipped });
});

// ---------------------------------------------------------------------------
// INNOCENT POOL ("innocent until proven guilty")
// ---------------------------------------------------------------------------

router.get("/:caseId/innocent-pool", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  let items = await db.innocent_pool.find(caseId);
  if (q) {
    items = items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.rejectionReason.toLowerCase().includes(q) ||
        i.kind.toLowerCase().includes(q) ||
        i.source.toLowerCase().includes(q)
    );
  }
  res.json({ items });
});

router.post("/:caseId/innocent-pool/:poolId/readd", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, poolId } = req.params;
  const user = req.user!;
  const item = await db.innocent_pool.findOne(poolId);
  if (!item || item.case_id !== caseId) {
    res.status(404).json({ error: "Pool item not found." });
    return;
  }

  const now = new Date().toISOString();
  const newBatchId = `batch-${caseId}-${Date.now()}`;
  await db.ingestion_batches.insertOne({
    _id: newBatchId,
    case_id: caseId,
    source: item.source,
    fileName: `Re-admission from Innocent pool (${item.label})`,
    entityCount: item.kind === "ENTITY" ? 1 : 0,
    linkCount: item.kind === "LINK" ? 1 : 0,
    approvedCount: 0,
    rejectedCount: 0,
    pendingCount: 1,
    status: "STAGED",
    submittedBy: user.name,
    submittedByRank: user.designation,
    submittedAt: now,
    hash: batchHash(caseId, `READD:${item.source}`, 1, user._id, now),
  });

  if (item.kind === "ENTITY") {
    const s = item.snapshot;
    await db.staged_entities.insertMany([{
      _id: `se-${newBatchId}-0`,
      case_id: caseId,
      batchId: newBatchId,
      source: item.source,
      label: s.label,
      type: s.type,
      role: s.role,
      riskScore: s.riskScore ?? 50,
      confidence: s.confidence ?? 0.6,
      details: s.details,
      evidenceRef: s.evidenceRef,
      locator: s.locator,
      status: "PENDING",
      submittedBy: user.name,
      created_at: now,
    }]);
  } else {
    const s = item.snapshot;
    await db.staged_links.insertMany([{
      _id: `sl-${newBatchId}-0`,
      case_id: caseId,
      batchId: newBatchId,
      source: item.source,
      sourceLabel: s.sourceLabel,
      targetLabel: s.targetLabel,
      relationType: s.relationType,
      weight: s.weight ?? 0.6,
      frequency: s.frequency,
      amount: s.amount,
      details: s.details,
      evidenceRef: s.evidenceRef,
      locator: s.locator,
      status: "PENDING",
      submittedBy: user.name,
      created_at: now,
    }]);
  }
  await db.innocent_pool.updateOne(poolId, { readded: true });

  await auditRecord(caseId, user, "INNOCENT_POOL_READD",
    `${user.name} re-admitted "${item.label}" from the Innocent pool to staging for fresh review.`,
    item.kind === "ENTITY" ? "NODE" : "LINK", poolId, item.label, undefined, req.ip);
  notifyCase(caseId, "STAGING_UPDATED", "Pool Re-admission",
    `${user.name} sent "${item.label}" back to staging.`, user);

  res.status(201).json({ success: true, batchId: newBatchId });
});

// ---------------------------------------------------------------------------
// INTER-DEPARTMENT TRANSFER (source → VIEW_ONLY, target → FULL_EDIT)
// ---------------------------------------------------------------------------

router.get("/:caseId/transfers", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const transfers = await db.transfers.find(req.params.caseId);
  res.json({ transfers });
});

router.post(
  "/:caseId/transfers",
  requireCaseMembership,
  requireEditAccess,
  requireRole([...REVIEWER_ROLES] as any),
  async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const user = req.user!;
    const { toAgency, toDepartment, toOfficerId, reason } = req.body;

    if (!toAgency || !toDepartment || !reason || String(reason).trim().length < 10) {
      res.status(400).json({ error: "toAgency, toDepartment and reason (min 10 chars) are required." });
      return;
    }
    const caseObj = await db.cases.findOne(caseId);
    if (!caseObj) {
      res.status(404).json({ error: "Case not found." });
      return;
    }
    if (caseObj.leadAgency === toAgency) {
      res.status(400).json({ error: "Case is already held by that agency." });
      return;
    }

    let toOfficerName: string | undefined;
    if (toOfficerId) {
      const officer = await db.users.findOne({ _id: toOfficerId });
      if (!officer || officer.status !== "ACTIVE") {
        res.status(400).json({ error: "Receiving officer must be an ACTIVE user." });
        return;
      }
      toOfficerName = officer.name;
    }

    const now = new Date().toISOString();
    const transfer = await db.transfers.insertOne({
      _id: `xfer-${caseId}-${Date.now()}`,
      case_id: caseId,
      caseName: caseObj.name,
      fromAgency: caseObj.leadAgency,
      fromDepartment: user.department,
      toAgency,
      toDepartment,
      toOfficerId,
      toOfficerName,
      reason: String(reason).trim(),
      status: "PENDING",
      requestedBy: user.name,
      requestedByRank: user.designation,
      requestedAt: now,
      proposalHash: sha256(`${caseId}|${caseObj.leadAgency}|${toAgency}|${user._id}|${now}`),
    });

    await auditRecord(caseId, user, "TRANSFER_PROPOSED",
      `${user.name} proposed inter-department transfer of ${caseObj.codeName} from ${transfer.fromAgency} to ${toAgency}. Reason: ${reason}`,
      "CASE", transfer._id, caseObj.codeName, { toAgency }, req.ip);
    notifyCase(caseId, "TRANSFER_PROPOSED", "Transfer Proposed",
      `${user.name} proposed transfer to ${toAgency}.`, user);

    res.status(201).json({ success: true, transfer });
  }
);

router.post("/:caseId/transfers/:transferId/accept", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, transferId } = req.params;
  const user = req.user!;
  if (!SP_ELIGIBLE_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Accepting a transfer requires Lead-level authority." });
    return;
  }
  const transfer = await db.transfers.findOne(transferId);
  if (!transfer || transfer.case_id !== caseId) {
    res.status(404).json({ error: "Transfer not found." });
    return;
  }
  if (transfer.status !== "PENDING") {
    res.status(400).json({ error: `Transfer already ${transfer.status}.` });
    return;
  }

  const now = new Date().toISOString();
  const members = await db.case_members.find({ case_id: caseId });

  // Source department → VIEW_ONLY (dept-admin oversight retains FULL_EDIT)
  const affectedMembers: string[] = [];
  for (const m of members) {
    const isAdmin = String(m.role).endsWith("_ADMIN");
    const belongsToSource = agencyMatches(m.agency, transfer.fromAgency);
    if (belongsToSource && !isAdmin && m.status === "ACTIVE") {
      await db.case_members.updateOne(m._id, { access: "VIEW_ONLY" });
      affectedMembers.push(`${m.user_name} (${m.official_id}) → VIEW_ONLY`);
    }
  }

  // Target → FULL_EDIT: named receiving officer, else the accepting officer
  const targetUserId = transfer.toOfficerId || user._id;
  const targetUser = transfer.toOfficerId
    ? await db.users.findOne({ _id: transfer.toOfficerId })
    : user;
  if (targetUser) {
    const existingTarget = await db.case_members.findOne({ case_id: caseId, user_id: targetUser._id });
    if (existingTarget) {
      await db.case_members.updateOne(existingTarget._id, { access: "FULL_EDIT", status: "ACTIVE" });
    } else {
      await db.case_members.insertOne({
        _id: `mem-${caseId}-${targetUser._id}-${Date.now()}`,
        case_id: caseId,
        user_id: targetUser._id,
        user_name: targetUser.name,
        user_email: targetUser.email,
        official_id: targetUser.official_id,
        agency: transfer.toAgency,
        role: targetUser.role,
        access: "FULL_EDIT",
        status: "ACTIVE",
        assigned_at: now,
        assigned_by: user._id,
      });
    }
  }

  // Update case holding agency
  const caseObj = await db.cases.findOne(caseId);
  if (caseObj) {
    (caseObj as any).leadAgency = transfer.toAgency;
  }

  const executionHash = sha256(`${transferId}|ACCEPT|${user._id}|${now}|${affectedMembers.join(",")}`);
  if (targetUser) {
    affectedMembers.push(`${targetUser.name} (${targetUser.official_id}) → FULL_EDIT`);
  }
  const updated = await db.transfers.updateOne(transferId, {
    status: "ACCEPTED",
    decidedBy: user.name,
    decidedAt: now,
    decisionNote: req.body?.note,
    executionHash,
    affectedMembers,
  });

  await auditRecord(caseId, user, "TRANSFER_EXECUTED",
    `Transfer executed: ${transfer.fromAgency} → ${transfer.toAgency}. Source members set VIEW_ONLY; ${transfer.toOfficerName || user.name} holds FULL_EDIT. Execution hash ${executionHash}.`,
    "CASE", transferId, transfer.caseName, { toAgency: transfer.toAgency }, req.ip);
  await autoLogDiary(caseId, user,
    `Inter-department transfer executed: case holding moved from ${transfer.fromAgency} to ${transfer.toAgency}. Source team access reduced to VIEW_ONLY; receiving officer granted FULL_EDIT. Reason: ${transfer.reason}`,
    "TRANSFER_EXECUTED");
  notifyCase(caseId, "TRANSFER_EXECUTED", "Case Transferred",
    `${transfer.fromAgency} → ${transfer.toAgency} executed by ${user.name}.`, user);

  res.json({ success: true, transfer: updated });
});

router.post("/:caseId/transfers/:transferId/reject", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, transferId } = req.params;
  const user = req.user!;
  if (!SP_ELIGIBLE_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Rejecting a transfer requires Lead-level authority." });
    return;
  }
  const transfer = await db.transfers.findOne(transferId);
  if (!transfer || transfer.case_id !== caseId) {
    res.status(404).json({ error: "Transfer not found." });
    return;
  }
  if (transfer.status !== "PENDING") {
    res.status(400).json({ error: `Transfer already ${transfer.status}.` });
    return;
  }
  const now = new Date().toISOString();
  const updated = await db.transfers.updateOne(transferId, {
    status: "REJECTED",
    decidedBy: user.name,
    decidedAt: now,
    decisionNote: req.body?.note,
  });
  await auditRecord(caseId, user, "TRANSFER_REJECTED",
    `${user.name} rejected transfer proposal to ${transfer.toAgency}. Note: ${req.body?.note || "—"}`,
    "CASE", transferId, transfer.caseName, undefined, req.ip);
  notifyCase(caseId, "TRANSFER_REJECTED", "Transfer Rejected",
    `${user.name} rejected the transfer to ${transfer.toAgency}.`, user);
  res.json({ success: true, transfer: updated });
});

export default router;
