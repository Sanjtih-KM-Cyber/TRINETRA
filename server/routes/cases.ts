import { Router, Response } from "express";
import { db, DBEvidence, DBEntity, DBRelationship, DBAuditLog, DBInvestigationEvent } from "../db";
import { authenticateToken, requireCaseMembership, AuthenticatedRequest } from "../auth";
import { broadcastCaseUpdate } from "../realtime";
import { extractEntitiesWithGemini, parseCDRCSV, parseFinancialCSV, extractEntitiesRuleBased } from "../../src/services/nlpExtractor";
import crypto from "crypto";

const router = Router();

router.use(authenticateToken);

// List authorized cases for current user with membership metadata
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const allCases = await db.cases.find();
  let authorizedCases: any[] = [];

  if (user.role === "ADMIN") {
    // Admin has oversight of all cases
    for (const c of allCases) {
      const members = await db.case_members.find({ case_id: c.id });
      const evidence = await db.evidence.find({ case_id: c.id });
      authorizedCases.push({
        ...c,
        userRole: "ADMIN",
        membershipStatus: "ACTIVE",
        memberCount: members.length,
        evidenceCount: evidence.length,
      });
    }
  } else {
    const memberships = await db.case_members.find({ user_id: user._id });
    const memberMap = new Map(memberships.map((m) => [m.case_id, m]));

    for (const c of allCases) {
      const mem = memberMap.get(c.id);
      if (mem && mem.status === "ACTIVE") {
        const caseMembers = await db.case_members.find({ case_id: c.id });
        const evidence = await db.evidence.find({ case_id: c.id });
        authorizedCases.push({
          ...c,
          userRole: mem.role || user.role,
          membershipStatus: mem.status,
          memberCount: caseMembers.length,
          evidenceCount: evidence.length,
          assignedAt: mem.assigned_at,
        });
      }
    }
  }

  res.json({ cases: authorizedCases });
});

// List all registered cases in the system with user's clearance/access status
router.get("/available", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const allCases = await db.cases.find();
  const userMemberships = await db.case_members.find({ user_id: user._id });
  const membershipMap = new Map(userMemberships.map((m) => [m.case_id, m]));

  const userRequests = await db.case_access_requests.find({ user_id: user._id });
  const pendingRequestsMap = new Map(
    userRequests.filter((r) => r.status === "PENDING").map((r) => [r.case_id, r])
  );

  const result = await Promise.all(
    allCases.map(async (c) => {
      const caseMembers = await db.case_members.find({ case_id: c.id });
      const evidence = await db.evidence.find({ case_id: c.id });
      const mem = membershipMap.get(c.id);
      const pendingReq = pendingRequestsMap.get(c.id);

      const hasAccess = user.role === "ADMIN" || (mem !== undefined && mem.status === "ACTIVE");

      return {
        id: c.id,
        name: c.name,
        codeName: c.codeName,
        description: c.description,
        date: c.date,
        leadAgency: c.leadAgency,
        memberCount: caseMembers.length,
        evidenceCount: evidence.length,
        hasAccess,
        userRoleInCase: hasAccess ? (user.role === "ADMIN" ? "ADMIN" : mem?.role || user.role) : null,
        hasPendingRequest: pendingReq !== undefined,
        pendingRequestId: pendingReq?._id || null,
        pendingRequestDate: pendingReq?.requested_at || null,
      };
    })
  );

  res.json({ cases: result });
});

// List current user's submitted case access requests
router.get("/my-access-requests", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const requests = await db.case_access_requests.find({ user_id: user._id });
  res.json({ requests });
});

// Submit a Case Access Request (Backend Authoritative role enforcement)
router.post("/:caseId/request-access", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { caseId } = req.params;
  const { reason_for_access } = req.body;

  if (user.role === "ADMIN") {
    res.status(400).json({ error: "Administrators have global access and do not require case access requests." });
    return;
  }

  const caseObj = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Specified case not found." });
    return;
  }

  // Check if user is already an active member
  const existingMember = await db.case_members.findOne({
    case_id: caseId,
    user_id: user._id,
  });

  if (existingMember && existingMember.status === "ACTIVE") {
    res.status(400).json({ error: "You are already an authorized active member of this case workspace." });
    return;
  }

  // Check if a pending request already exists
  const existingPending = await db.case_access_requests.findOneByCaseAndUser(caseId, user._id);
  if (existingPending) {
    res.status(400).json({ error: "A pending case access request for this operation is already awaiting Admin review." });
    return;
  }

  const now = new Date().toISOString();
  const requestId = `case_req-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

  // Role is strictly pulled from verified token / user record (Cannot be modified/spoofed in body)
  const newRequest = {
    _id: requestId,
    case_id: caseId,
    case_name: caseObj.name,
    case_code: caseObj.codeName,
    user_id: user._id,
    user_name: user.name,
    user_email: user.email,
    official_id: user.official_id,
    agency: user.agency,
    user_role: user.role as "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR",
    reason_for_access: reason_for_access || `Operational requirement for ${user.role.replace("_", " ")} duties under ${user.agency}.`,
    status: "PENDING" as const,
    requested_at: now,
  };

  await db.case_access_requests.insertOne(newRequest);

  // Audit Log
  const digitalHash = crypto
    .createHash("sha256")
    .update(`CASE_ACCESS_REQUEST:${requestId}:${user._id}:${caseId}:${now}`)
    .digest("hex");

  await db.audit_logs.insertOne({
    _id: `audit-${Date.now()}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "CASE_ACCESS_REQUESTED",
    action_type: "SECURITY",
    case_id: caseId,
    details: `${user.name} (${user.role}) submitted access request for case ${caseObj.codeName}.`,
    digital_hash: digitalHash,
    result: "SUCCESS",
  });

  res.status(201).json({
    message: "Case access request submitted successfully. Awaiting Administrator approval.",
    request: newRequest,
  });
});

// Get all members of a case (Enforces active membership)
router.get("/:caseId/members", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const members = await db.case_members.find({ case_id: caseId });
  res.json({ members });
});

// Single Unified Case State
router.get("/:caseId/state", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;

  const caseObj = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  const [
    entities,
    relationships,
    evidenceFiles,
    members,
    auditLogs,
    events,
    firs,
    cdrs,
    financials,
    intels,
    observations,
  ] = await Promise.all([
    db.entities.find({ case_id: caseId }),
    db.relationships.find({ case_id: caseId }),
    db.evidence.find({ case_id: caseId }),
    db.case_members.find({ case_id: caseId }),
    db.audit_logs.find({ case_id: caseId }),
    db.investigation_events.find({ case_id: caseId }),
    db.firs.find(caseId),
    db.cdrs.find(caseId),
    db.financials.find(caseId),
    db.intels.find(caseId),
    db.observations.find({ case_id: caseId }),
  ]);

  // Format evidence files for frontend
  const formattedEvidence = evidenceFiles.map((e) => ({
    id: e._id,
    fileName: e.file_name,
    fileSize: e.file_size,
    fileSizeFormatted: e.file_size_formatted,
    fileType: e.file_type,
    fileHash: e.file_hash,
    uploadedAt: e.uploaded_at,
    processingStatus: e.status === "COMMITTED" ? "PROCESSED" : e.status === "VALIDATED" ? "VALIDATED" : e.status === "PROCESSING" ? "PROCESSING" : "PENDING",
    lifecycleStatus: e.status,
    extractedEntitiesCount: e.extracted_entities_count,
    extractedRelationsCount: e.extracted_relations_count,
    summary: e.summary,
    sourceAuthority: e.source_authority,
    uploadedBy: e.uploaded_by,
    uploaderRole: e.uploader_role,
    extractedEntities: e.extracted_entities,
    extractedRelations: e.extracted_relations,
  }));

  res.json({
    case: caseObj,
    nodes: entities,
    links: relationships,
    evidenceFiles: formattedEvidence,
    observations,
    members,
    auditLogs,
    events,
    firs,
    cdrs,
    financials,
    intels,
  });
});

// 1. Evidence Ingestion: UPLOADED Stage
router.post("/:caseId/evidence", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const {
    fileName,
    fileType,
    fileSize,
    fileSizeFormatted,
    sourceAuthority,
    rawText,
    summary,
  } = req.body;

  if (!fileName || !fileType) {
    res.status(400).json({ error: "fileName and fileType are required" });
    return;
  }

  const user = req.user!;
  const evId = `EVID-${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  // Compute cryptographic SHA-256 hash for chain of custody
  const contentToHash = rawText || `${fileName}:${fileSize}:${Date.now()}:${sourceAuthority}`;
  const fileHash = `sha256:${crypto.createHash("sha256").update(contentToHash).digest("hex")}`;

  const evidenceRecord: DBEvidence = {
    _id: evId,
    case_id: caseId,
    file_name: fileName,
    file_size: fileSize || 1024000,
    file_size_formatted: fileSizeFormatted || "1.02 MB",
    file_type: fileType,
    file_hash: fileHash,
    uploaded_at: now,
    uploaded_by: user.name,
    uploader_role: user.role,
    status: "UPLOADED",
    source_authority: sourceAuthority || `${user.agency} Evidence Locker`,
    summary: summary || `Ingested ${fileName} by ${user.name} (${user.role}).`,
    raw_text: rawText,
    extracted_entities_count: 0,
    extracted_relations_count: 0,
  };

  await db.evidence.insertOne(evidenceRecord);

  // Record audit log
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "INGEST_EVIDENCE_UPLOAD",
    case_id: caseId,
    resource_id: evId,
    target_label: fileName,
    details: `Officer ${user.name} uploaded evidence exhibit ${fileName} (${evidenceRecord.file_size_formatted}) with SHA-256 fingerprint ${fileHash}.`,
    digital_hash: fileHash,
    result: "SUCCESS",
  });

  // Record Investigation Event
  await db.investigation_events.insertOne({
    _id: `ev-${Date.now()}`,
    case_id: caseId,
    event_type: "EVIDENCE_UPLOADED",
    title: `Evidence Intake: ${fileName}`,
    description: `Registered exhibit under custody with hash ${fileHash.slice(0, 18)}...`,
    timestamp: now,
    actor_id: user._id,
    actor_name: user.name,
    actor_role: user.role,
  });

  // Broadcast Realtime Update
  broadcastCaseUpdate(caseId, {
    event_type: "EVIDENCE_UPLOADED",
    title: "New Evidence Uploaded",
    message: `${user.name} (${user.role}) uploaded exhibit: ${fileName}`,
    changes: { new_evidence: 1 },
    evidence_id: evId,
    actor_name: user.name,
    actor_role: user.role,
  });

  res.status(201).json({
    success: true,
    evidence: evidenceRecord,
  });
});

// 2. Evidence Processing: PROCESSING -> VALIDATED Stage
router.post("/:caseId/evidence/:evidenceId/process", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, evidenceId } = req.params;
  const { rawText, fileType } = req.body;

  const ev = await db.evidence.findOne(evidenceId);
  if (!ev) {
    res.status(404).json({ error: "Evidence exhibit not found" });
    return;
  }

  // Update to PROCESSING
  await db.evidence.updateOne(evidenceId, { status: "PROCESSING" });

  const textToProcess = rawText || ev.raw_text || "";
  let extractedNodes: any[] = [];
  let extractedLinks: any[] = [];
  let summary = ev.summary;

  try {
    if (ev.file_type === "CDR_CSV" || fileType === "CDR_CSV") {
      const cdrRecords = parseCDRCSV(textToProcess);
      const nodeMap = new Map<string, any>();
      const generatedLinks: any[] = [];

      cdrRecords.forEach((rec, idx) => {
        const aId = `phone-${rec.aParty.replace(/\D/g, "")}`;
        const bId = `phone-${rec.bParty.replace(/\D/g, "")}`;

        if (!nodeMap.has(aId)) {
          nodeMap.set(aId, {
            id: aId,
            label: rec.aParty,
            type: "PHONE",
            riskScore: 65,
            confidence: 0.95,
            details: { phone: rec.aParty, imei: rec.imeiA, towerLocation: rec.towerLocation },
          });
        }
        if (!nodeMap.has(bId)) {
          nodeMap.set(bId, {
            id: bId,
            label: rec.bParty,
            type: "PHONE",
            riskScore: 60,
            confidence: 0.9,
            details: { phone: rec.bParty, imei: rec.imeiB, towerLocation: rec.towerLocation },
          });
        }
        generatedLinks.push({
          id: `link-cdr-${Date.now()}-${idx}`,
          source: aId,
          target: bId,
          relationType: "CALLS",
          confidence: 0.95,
          evidenceCount: 1,
          details: { durationSec: rec.durationSec, timestamp: rec.timestamp, towerId: rec.towerId },
        });
      });

      extractedNodes = Array.from(nodeMap.values());
      extractedLinks = generatedLinks;
      summary = `Extracted ${extractedNodes.length} callers and ${extractedLinks.length} call records from CDR dump.`;
    } else if (ev.file_type === "FINANCIAL_CSV" || fileType === "FINANCIAL_CSV") {
      const finRecords = parseFinancialCSV(textToProcess);
      const nodeMap = new Map<string, any>();
      const generatedLinks: any[] = [];

      finRecords.forEach((rec, idx) => {
        const senderId = `acc-${rec.senderAcc.replace(/\W/g, "")}`;
        const receiverId = `acc-${rec.receiverAcc.replace(/\W/g, "")}`;

        if (!nodeMap.has(senderId)) {
          nodeMap.set(senderId, {
            id: senderId,
            label: rec.senderName || rec.senderAcc,
            type: "ACCOUNT",
            riskScore: rec.isSmurfingFlag ? 85 : 55,
            confidence: 0.95,
            details: { accountNumber: rec.senderAcc, bankName: rec.bankName },
          });
        }
        if (!nodeMap.has(receiverId)) {
          nodeMap.set(receiverId, {
            id: receiverId,
            label: rec.receiverName || rec.receiverAcc,
            type: "ACCOUNT",
            riskScore: rec.isSmurfingFlag ? 85 : 55,
            confidence: 0.95,
            details: { accountNumber: rec.receiverAcc, bankName: rec.bankName },
          });
        }
        generatedLinks.push({
          id: `link-fin-${Date.now()}-${idx}`,
          source: senderId,
          target: receiverId,
          relationType: "FINANCIAL_TRANSFER",
          confidence: 0.98,
          evidenceCount: 1,
          details: { amount: rec.amount, mode: rec.mode, utr: rec.utrNumber, timestamp: rec.timestamp },
        });
      });

      extractedNodes = Array.from(nodeMap.values());
      extractedLinks = generatedLinks;
      summary = `Extracted ${extractedNodes.length} accounts/entities and ${extractedLinks.length} financial transactions.`;
    } else {
      // FIR or narrative text
      const nlpResult = await extractEntitiesWithGemini(textToProcess, ev.file_name);
      extractedNodes = nlpResult.nodes;
      extractedLinks = nlpResult.links;
      summary = nlpResult.summary || summary;
    }
  } catch (err: any) {
    // Fallback to rule-based extractor
    const fallback = extractEntitiesRuleBased(textToProcess);
    extractedNodes = fallback.nodes;
    extractedLinks = fallback.links;
    summary = fallback.summary;
  }

  // Update status to VALIDATED and store extracted previews
  const updatedEv = await db.evidence.updateOne(evidenceId, {
    status: "VALIDATED",
    extracted_entities_count: extractedNodes.length,
    extracted_relations_count: extractedLinks.length,
    extracted_entities: extractedNodes,
    extracted_relations: extractedLinks,
    summary,
    quality_notes: "Validated via automated entity/relationship extraction engine. Ready for official case graph commitment.",
  });

  const user = req.user!;
  const now = new Date().toISOString();

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "EVIDENCE_VALIDATED",
    case_id: caseId,
    resource_id: evidenceId,
    target_label: ev.file_name,
    details: `Processed and validated exhibit ${ev.file_name}. Generated ${extractedNodes.length} candidate entities and ${extractedLinks.length} candidate relationships.`,
    digital_hash: crypto.createHash("sha256").update(`${evidenceId}:VALIDATED:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({
    success: true,
    evidence: updatedEv,
    candidateNodes: extractedNodes,
    candidateLinks: extractedLinks,
  });
});

// 3. Evidence Commitment: VALIDATED -> COMMITTED Stage (Writes to Authoritative Case Graph)
router.post("/:caseId/evidence/:evidenceId/commit", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, evidenceId } = req.params;
  const { entities, relationships } = req.body;

  const ev = await db.evidence.findOne(evidenceId);
  if (!ev) {
    res.status(404).json({ error: "Evidence exhibit not found" });
    return;
  }

  const nodesToCommit = entities || ev.extracted_entities || [];
  const linksToCommit = relationships || ev.extracted_relations || [];

  const user = req.user!;
  const now = new Date().toISOString();

  // 1. Prepare and persist DB entities with provenance
  const preparedEntities: DBEntity[] = nodesToCommit.map((n: any) => ({
    _id: `ent-${caseId}-${n.id}`,
    case_id: caseId,
    id: n.id,
    label: n.label,
    type: n.type,
    category: n.category || "EVIDENCE",
    reviewState: n.reviewState || "CONFIRMED",
    role: n.role || "Investigative Subject",
    aliases: n.aliases || [],
    riskScore: n.riskScore || 75,
    confidence: n.confidence || 0.9,
    details: n.details || {},
    evidence_ids: [evidenceId],
    sourceDocumentIds: [evidenceId],
    created_at: now,
    updated_at: now,
  }));

  await db.entities.upsertMany(preparedEntities);

  // 2. Prepare and persist DB relationships with provenance
  const preparedLinks: DBRelationship[] = linksToCommit.map((l: any, idx: number) => ({
    _id: `rel-${caseId}-${l.id || `l-${Date.now()}-${idx}`}`,
    case_id: caseId,
    id: l.id || `l-${Date.now()}-${idx}`,
    source: typeof l.source === "object" ? l.source.id : l.source,
    target: typeof l.target === "object" ? l.target.id : l.target,
    relationType: l.relationType || "ASSOCIATED_WITH",
    category: l.category || "EVIDENCE",
    reviewState: l.reviewState || "CONFIRMED",
    weight: l.weight || 0.8,
    frequency: l.frequency || 1,
    amount: l.amount,
    durationSec: l.durationSec,
    timestamp: l.timestamp || now,
    details: l.details || `Extracted from exhibit ${ev.file_name}`,
    evidence_ids: [evidenceId],
    source_type: ev.file_type || "DOCUMENT",
    confidence: l.confidence || 0.9,
    flags: l.flags || [],
    evidenceDetail: l.evidenceDetail,
  }));

  await db.relationships.upsertMany(preparedLinks);

  // 3. Mark evidence status as COMMITTED
  const updatedEv = await db.evidence.updateOne(evidenceId, {
    status: "COMMITTED",
    extracted_entities_count: preparedEntities.length,
    extracted_relations_count: preparedLinks.length,
  });

  // 4. Investigation Event
  await db.investigation_events.insertOne({
    _id: `ev-${Date.now()}`,
    case_id: caseId,
    event_type: "EVIDENCE_COMMITTED",
    title: `Intelligence Committed: ${ev.file_name}`,
    description: `Integrated ${preparedEntities.length} entities and ${preparedLinks.length} relationships into authoritative case graph.`,
    timestamp: now,
    actor_id: user._id,
    actor_name: user.name,
    actor_role: user.role,
  });

  // 5. Audit Log with SHA-256 Digest
  const auditDigest = crypto
    .createHash("sha256")
    .update(`${evidenceId}:${preparedEntities.length}:${preparedLinks.length}:${now}`)
    .digest("hex");

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "EVIDENCE_COMMITTED_TO_GRAPH",
    case_id: caseId,
    resource_id: evidenceId,
    target_label: ev.file_name,
    details: `Officer ${user.name} committed ${preparedEntities.length} entities and ${preparedLinks.length} relationships from exhibit ${ev.file_name} to case graph.`,
    digital_hash: `sha256:${auditDigest}`,
    result: "SUCCESS",
  });

  // 6. Broadcast Real-time WebSocket Event to all case members
  broadcastCaseUpdate(caseId, {
    event_type: "EVIDENCE_COMMITTED",
    title: "New Intelligence Committed",
    message: `${preparedEntities.length} entities and ${preparedLinks.length} relationships were added to ${caseId} by ${user.name}.`,
    changes: {
      new_evidence: 1,
      new_entities: preparedEntities.length,
      new_relationships: preparedLinks.length,
      new_alerts: 1,
    },
    evidence_id: evidenceId,
    actor_name: user.name,
    actor_role: user.role,
  });

  res.json({
    success: true,
    message: "Evidence successfully committed to shared case state.",
    evidence: updatedEv,
    committedEntitiesCount: preparedEntities.length,
    committedRelationsCount: preparedLinks.length,
  });
});

// Update or Create Node
router.post("/:caseId/nodes", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const nodeData = req.body;

  const user = req.user!;
  const now = new Date().toISOString();
  const ent: DBEntity = {
    _id: `ent-${caseId}-${nodeData.id}`,
    case_id: caseId,
    id: nodeData.id,
    label: nodeData.label,
    type: nodeData.type,
    category: nodeData.category || "EVIDENCE",
    reviewState: nodeData.reviewState || "CONFIRMED",
    role: nodeData.role,
    aliases: nodeData.aliases || [],
    riskScore: nodeData.riskScore || 70,
    confidence: nodeData.confidence || 0.9,
    details: nodeData.details || {},
    evidence_ids: nodeData.sourceDocumentIds || ["MANUAL_INPUT"],
    updated_at: now,
  };

  await db.entities.insertOne(ent);

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "UPDATE_ENTITY",
    case_id: caseId,
    resource_id: ent.id,
    target_label: ent.label,
    details: `Officer ${user.name} updated target node ${ent.label} (${ent.type}).`,
    digital_hash: crypto.createHash("sha256").update(`${ent.id}:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, node: ent });
});

// Update or Create Relationship
router.post("/:caseId/links", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const linkData = req.body;

  const user = req.user!;
  const now = new Date().toISOString();
  const rel: DBRelationship = {
    _id: `rel-${caseId}-${linkData.id}`,
    case_id: caseId,
    id: linkData.id,
    source: typeof linkData.source === "object" ? linkData.source.id : linkData.source,
    target: typeof linkData.target === "object" ? linkData.target.id : linkData.target,
    relationType: linkData.relationType,
    category: linkData.category || "EVIDENCE",
    reviewState: linkData.reviewState || "CONFIRMED",
    weight: linkData.weight || 0.8,
    frequency: linkData.frequency,
    amount: linkData.amount,
    durationSec: linkData.durationSec,
    timestamp: linkData.timestamp || now,
    details: linkData.details,
    evidence_ids: linkData.evidence_ids || ["MANUAL_INPUT"],
    source_type: linkData.source_type || "INVESTIGATOR",
    confidence: linkData.confidence || 0.9,
  };

  await db.relationships.insertOne(rel);

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "UPDATE_RELATIONSHIP",
    case_id: caseId,
    resource_id: rel.id,
    target_label: `${rel.source} -> ${rel.target}`,
    details: `Officer ${user.name} recorded link ${rel.source} [${rel.relationType}] ${rel.target}.`,
    digital_hash: crypto.createHash("sha256").update(`${rel.id}:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, link: rel });
});

// Audit Logs for Case
router.get("/:caseId/audit-logs", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const logs = await db.audit_logs.find({ case_id: caseId });
  res.json({ logs });
});

// Update Node Review State
router.patch("/:caseId/nodes/:nodeId/review", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, nodeId } = req.params;
  const { reviewState, note } = req.body;

  const validStates = ["CONFIRMED", "REJECTED", "UNCERTAIN", "NEEDS_REVIEW"];
  if (!validStates.includes(reviewState)) {
    res.status(400).json({ error: "Invalid reviewState. Must be one of: CONFIRMED, REJECTED, UNCERTAIN, NEEDS_REVIEW" });
    return;
  }

  const user = req.user!;
  const now = new Date().toISOString();

  // Find the entity
  const entity = await db.entities.findOne(caseId, nodeId);
  if (!entity) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const previousState = entity.reviewState || "NEEDS_REVIEW";

  // Update entity review state
  const updatedEntity = await db.entities.updateOne(entity._id, {
    reviewState,
    updated_at: now,
  });

  // Create audit log entry
  const auditPayload = `${entity._id}:${previousState}:${reviewState}:${user._id}:${now}`;
  const digitalHash = `sha256:${crypto.createHash("sha256").update(auditPayload).digest("hex")}`;

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "UPDATE_NODE_REVIEW_STATE",
    action_type: "EVIDENCE_REVIEW",
    case_id: caseId,
    resource_id: entity._id,
    target_type: "NODE",
    target_id: entity.id,
    target_label: entity.label,
    details: `Officer ${user.name} (${user.role}) changed review state of node "${entity.label}" (${entity.type}) from ${previousState} to ${reviewState}.${note ? ` Note: ${note}` : ""}`,
    digital_hash: digitalHash,
    result: "SUCCESS",
    metadata: { previousState, newState: reviewState, note: note || null },
  });

  // Broadcast real-time update
  broadcastCaseUpdate(caseId, {
    event_type: "NODE_REVIEW_UPDATED",
    title: "Node Review State Updated",
    message: `${user.name} updated "${entity.label}" to ${reviewState}`,
    changes: { new_entities: 1 },
    actor_name: user.name,
    actor_role: user.role,
  });

  res.json({ success: true, entity: updatedEntity, auditHash: digitalHash });
});

// Update Link Review State
router.patch("/:caseId/links/:linkId/review", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, linkId } = req.params;
  const { reviewState, note } = req.body;

  const validStates = ["CONFIRMED", "REJECTED", "UNCERTAIN", "NEEDS_REVIEW"];
  if (!validStates.includes(reviewState)) {
    res.status(400).json({ error: "Invalid reviewState. Must be one of: CONFIRMED, REJECTED, UNCERTAIN, NEEDS_REVIEW" });
    return;
  }

  const user = req.user!;
  const now = new Date().toISOString();

  // Find the relationship
  const relationships = await db.relationships.find({ case_id: caseId });
  const relationship = relationships.find((r) => r.id === linkId || r._id === linkId);
  if (!relationship) {
    res.status(404).json({ error: "Relationship not found" });
    return;
  }

  const previousState = relationship.reviewState || "NEEDS_REVIEW";

  // Update relationship review state
  const updatedRelationship = await db.relationships.updateOne(relationship._id, {
    reviewState,
    updated_at: now,
  });

  // Create audit log entry
  const auditPayload = `${relationship._id}:${previousState}:${reviewState}:${user._id}:${now}`;
  const digitalHash = `sha256:${crypto.createHash("sha256").update(auditPayload).digest("hex")}`;

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "UPDATE_LINK_REVIEW_STATE",
    action_type: "EVIDENCE_REVIEW",
    case_id: caseId,
    resource_id: relationship._id,
    target_type: "LINK",
    target_id: relationship.id,
    target_label: `${relationship.source} [${relationship.relationType}] ${relationship.target}`,
    details: `Officer ${user.name} (${user.role}) changed review state of link "${relationship.source} [${relationship.relationType}] ${relationship.target}" from ${previousState} to ${reviewState}.${note ? ` Note: ${note}` : ""}`,
    digital_hash: digitalHash,
    result: "SUCCESS",
    metadata: { previousState, newState: reviewState, note: note || null },
  });

  // Broadcast real-time update
  broadcastCaseUpdate(caseId, {
    event_type: "LINK_REVIEW_UPDATED",
    title: "Link Review State Updated",
    message: `${user.name} updated link to ${reviewState}`,
    changes: { new_relationships: 1 },
    actor_name: user.name,
    actor_role: user.role,
  });

  res.json({ success: true, link: updatedRelationship, auditHash: digitalHash });
});

// Record Playbook / Investigative Action in the Immutable Audit Ledger
router.post("/:caseId/audit", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const { action, details, targetType, targetId, targetLabel, metadata } = req.body;

  if (!action || typeof action !== "string") {
    res.status(400).json({ error: "action is required" });
    return;
  }

  const user = req.user!;
  const now = new Date().toISOString();

  const auditPayload = `${caseId}:${action}:${targetId || "none"}:${user._id}:${now}:${JSON.stringify(metadata || {})}`;
  const digitalHash = `sha256:${crypto.createHash("sha256").update(auditPayload).digest("hex")}`;

  const log = await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action,
    action_type: "EVIDENCE_REVIEW",
    case_id: caseId,
    resource_id: targetId,
    target_type: targetType || "CASE",
    target_id: targetId,
    target_label: targetLabel,
    details: details || `Officer ${user.name} (${user.role}) recorded action ${action}.`,
    digital_hash: digitalHash,
    result: "SUCCESS",
    metadata: metadata || null,
  });

  broadcastCaseUpdate(caseId, {
    event_type: "AUDIT_RECORDED",
    title: "Investigative Action Recorded",
    message: `${user.name}: ${details || action}`,
    changes: {},
    actor_name: user.name,
    actor_role: user.role,
  });

  res.status(201).json({ success: true, log, auditHash: digitalHash });
});

export default router;
