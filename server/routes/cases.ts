import { Router, Response } from "express";
import { db, DBEvidence, DBEntity, DBRelationship, DBAuditLog, DBInvestigationEvent, DBCaseMember, DBRequisition, DBDossierSignature } from "../db";
import { authenticateToken, requireCaseMembership, requireEditAccess, requireFunctional, requireRole, AuthenticatedRequest } from "../auth";
import { isAdmin, isLead, tenureKey, sameTenure, orgOf, ADMIN_ROLES, LEAD_ROLES } from "../../src/data/roles";
import type { DBRole } from "../db";
import { broadcastCaseUpdate } from "../realtime";
import { autoLogDiary } from "../services/diaryService";
import { extractEntitiesWithGemini, parseCDRCSV, parseFinancialCSV, extractEntitiesRuleBased } from "../../src/services/nlpExtractor";
import crypto from "crypto";

const router = Router();

router.use(authenticateToken);

// List authorized cases for current user with membership metadata (dept-scoped admins)
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const allCases = await db.cases.find();
  let authorizedCases: any[] = [];

  if (isAdmin(user.role)) {
    const tenure = tenureKey(user.role, user.state);
    const scoped = allCases.filter((c: any) => {
      if (!c?.org || c.org === "UNKNOWN") return true;
      const ct = c.org === "POLICE" ? `POLICE:${String(c.state || "POLICE").toUpperCase()}` : String(c.org).toUpperCase();
      return ct === tenure;
    });
    for (const c of scoped) {
      const members = await db.case_members.find({ case_id: c.id });
      const evidence = await db.evidence.find({ case_id: c.id });
      authorizedCases.push({
        ...c,
        userRole: user.role,
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

      const adminScoped = isAdmin(user.role)
        ? (() => {
            const tenure = tenureKey(user.role, user.state);
            if (!c?.org || c.org === "UNKNOWN") return true;
            const ct =
              c.org === "POLICE"
                ? `POLICE:${String(c.state || "POLICE").toUpperCase()}`
                : String(c.org).toUpperCase();
            return ct === tenure;
          })()
        : false;
      const hasAccess = adminScoped || (mem !== undefined && mem.status === "ACTIVE");

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
        userRoleInCase: hasAccess ? (isAdmin(user.role) ? user.role : mem?.role || user.role) : null,
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

// ---------------------------------------------------------------------------
// Phase 6 Req26 — interstate visibility bridge inbox: evidence other State
// Police tenures approved for sharing with the caller's state.
// ---------------------------------------------------------------------------
router.get("/shared/inbox", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (orgOf(user.role) !== "POLICE" || !user.state) {
    res.status(403).json({ error: "The interstate bridge is available to State Police officers only." });
    return;
  }
  const myState = user.state.toUpperCase();
  const myTenure = tenureKey(user.role, user.state);
  const all = await db.evidence.find({});
  const shared = all.filter(
    (e) => Array.isArray(e.sharedTo) && e.sharedTo.map((s) => String(s).toUpperCase()).includes(myState)
  );
  const caseIds = [...new Set(shared.map((e) => e.case_id))];
  const caseMap = new Map<string, any>();
  for (const id of caseIds) {
    const c: any = await db.cases.findOne(id).catch(() => null);
    if (c) caseMap.set(id, c);
  }
  res.json({
    evidence: shared
      .filter((e) => {
        const c = caseMap.get(e.case_id);
        if (!c || !c.org) return true;
        const ct = c.org === "POLICE" ? `POLICE:${String(c.state || "POLICE").toUpperCase()}` : String(c.org).toUpperCase();
        return ct !== myTenure;
      })
      .map((e) => ({
        id: e._id,
        fileName: e.file_name,
        fileType: e.file_type,
        fileHash: e.file_hash,
        uploadedAt: e.uploaded_at,
        summary: e.summary,
        sourceAuthority: e.source_authority,
        rawText: e.raw_text,
        sharedBy: e.sharedBy,
        sharedAt: e.sharedAt,
        case_id: e.case_id,
        caseCode: caseMap.get(e.case_id)?.codeName,
        originTenure:
          caseMap.get(e.case_id)?.org === "POLICE"
            ? `POLICE:${String(caseMap.get(e.case_id)?.state || "POLICE").toUpperCase()}`
            : String(caseMap.get(e.case_id)?.org || "UNKNOWN").toUpperCase(),
      })),
  });
});

// Submit a Case Access Request (Backend Authoritative role enforcement)
router.post("/:caseId/request-access", async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { caseId } = req.params;
  const { reason_for_access } = req.body;

  if (isAdmin(user.role)) {
    res.status(400).json({ error: "Administrators have dept-scoped oversight and do not require case access requests." });
    return;
  }

  const caseObj = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Specified case not found." });
    return;
  }

  // Req8 — jurisdictional boundary: leads stay within their own dept/state.
  // SHARED/UNKNOWN legacy cases remain requestable; tagged cases enforce tenure.
  if ((caseObj as any).org && (caseObj as any).org !== "UNKNOWN") {
    const userTenure = tenureKey(user.role, user.state);
    const caseTenure =
      (caseObj as any).org === "POLICE"
        ? `POLICE:${String((caseObj as any).state || "POLICE").toUpperCase()}`
        : String((caseObj as any).org).toUpperCase();
    if (caseTenure !== userTenure) {
      res.status(403).json({
        error: "Tenant Isolation",
        message: `Case tenure '${caseTenure}' is outside your jurisdiction '${userTenure}'. No cross-assignment or horizontal leakage.`,
      });
      return;
    }
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

  // Role/state strictly pulled from verified token / user record (cannot be spoofed)
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
    user_role: user.role,
    state: user.state,
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
// Phase 2 — caller's own access level for read-only UI gating (backend enforces)
router.get("/:caseId/my-access", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ role: req.caseMemberRole, access: req.caseAccess || "FULL_EDIT" });
});

router.get("/:caseId/members", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const members = await db.case_members.find({ case_id: caseId });
  res.json({ members });
});

// ---------------------------------------------------------------------------
// Phase 3 Req16 — case creation governance: Department Admins only.
// The admin's tenure tags the case (org + state); an optional same-tenure
// LEAD is assigned at instantiation. No investigation templates.
// ---------------------------------------------------------------------------
router.post("/", requireRole([...ADMIN_ROLES] as DBRole[]), async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const { name, codeName, description, leadUserId, leadAgency } = req.body;

  if (!name?.trim() || !codeName?.trim()) {
    res.status(400).json({ error: "Case name and codeName are required." });
    return;
  }
  const allCases = await db.cases.find();
  if (allCases.some((c: any) => c.codeName === codeName.trim() || c.id === codeName.trim())) {
    res.status(409).json({ error: "A case with this codeName already exists." });
    return;
  }

  const org = orgOf(admin.role);
  const now = new Date().toISOString();
  const caseId = `case-${Date.now().toString(36)}`;
  const caseObj: any = {
    _id: caseId,
    id: caseId,
    name: name.trim(),
    codeName: codeName.trim(),
    description: (description || "").trim(),
    date: now.split("T")[0],
    leadAgency: leadAgency?.trim() || admin.agency,
    org,
    state: admin.state,
    pocs: {},
    created_by: admin._id,
    created_at: now,
  };
  await db.cases.insertOne(caseObj);

  const mkMember = (u: typeof admin, role: DBRole): DBCaseMember => ({
    _id: `mem-${caseId}-${u._id}-${Date.now().toString(36)}`,
    case_id: caseId,
    user_id: u._id,
    user_name: u.name,
    user_email: u.email,
    official_id: u.official_id,
    agency: u.agency,
    role,
    state: u.state,
    access: "FULL_EDIT",
    status: "ACTIVE",
    assigned_at: now,
    assigned_by: admin.name,
  });
  await db.case_members.insertOne(mkMember(admin, admin.role));

  let leadMember = null;
  if (leadUserId) {
    const lead = await db.users.findOne({ _id: leadUserId });
    if (!lead || lead.status !== "ACTIVE") {
      res.status(400).json({ error: "Lead officer must be an ACTIVE user." });
      return;
    }
    if (!isLead(lead.role) || !sameTenure(admin.role, admin.state, lead.role, lead.state)) {
      res.status(403).json({
        error: "Tenant Isolation",
        message: "Lead must hold a *_LEAD role in the admin's own department/state.",
      });
      return;
    }
    leadMember = mkMember(lead as typeof admin, lead.role);
    leadMember._id = `mem-${caseId}-${lead._id}-lead`;
    await db.case_members.insertOne(leadMember);
  }

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: admin._id,
    user_name: admin.name,
    user_role: admin.role,
    action: "CASE_CREATED",
    case_id: caseId,
    details: `Admin ${admin.name} instantiated case ${caseObj.codeName}${leadMember ? ` and assigned Lead ${(leadMember as DBCaseMember).user_name}` : ""}.`,
    digital_hash: crypto.createHash("sha256").update(`${caseId}:${admin._id}:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  broadcastCaseUpdate(caseId, {
    event_type: "CASE_CREATED",
    title: "Case registered",
    message: `${caseObj.codeName} registered by ${admin.name}.`,
    changes: {},
    actor_name: admin.name,
    actor_role: admin.role,
  });

  res.status(201).json({ success: true, case: caseObj, leadMember });
});

// ---------------------------------------------------------------------------
// Phase 8 Req32 — full-case archive import: initializes a NEW server-side case
// from an exported JSON container (graph + evidence records). ADMIN-only.
// ---------------------------------------------------------------------------
router.post("/import", requireRole([...ADMIN_ROLES] as DBRole[]), async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const { caseMetadata, graphData, evidenceRecords } = req.body as {
    caseMetadata?: any;
    graphData?: { nodes?: any[]; links?: any[] };
    evidenceRecords?: { firs?: any[]; cdrs?: any[]; financials?: any[]; intels?: any[]; evidenceFiles?: any[] };
  };

  if (!caseMetadata?.name || !caseMetadata?.codeName || !Array.isArray(graphData?.nodes)) {
    res.status(400).json({ error: "Archive must contain caseMetadata {name, codeName} and graphData.nodes[]." });
    return;
  }

  const org = orgOf(admin.role);
  const allCases = await db.cases.find();
  const taken = new Set(allCases.map((c: any) => c.codeName));
  let codeName = String(caseMetadata.codeName);
  if (taken.has(codeName)) codeName = `${codeName}-IMP-${Date.now().toString(36).toUpperCase()}`;

  const now = new Date().toISOString();
  const caseId = `case-${Date.now().toString(36)}`;
  const caseObj: any = {
    _id: caseId,
    id: caseId,
    name: String(caseMetadata.name),
    codeName,
    description: String(caseMetadata.description || "Imported from case archive container."),
    date: String(caseMetadata.date || now.split("T")[0]),
    leadAgency: admin.agency,
    org,
    state: admin.state,
    importedFrom: caseMetadata.codeName,
    created_by: admin._id,
    created_at: now,
  };
  await db.cases.insertOne(caseObj);
  await db.case_members.insertOne({
    _id: `mem-${caseId}-${admin._id}-import`,
    case_id: caseId,
    user_id: admin._id,
    user_name: admin.name,
    user_email: admin.email,
    official_id: admin.official_id,
    agency: admin.agency,
    role: admin.role,
    state: admin.state,
    access: "FULL_EDIT",
    status: "ACTIVE",
    assigned_at: now,
    assigned_by: admin.name,
  });

  const nodes = graphData?.nodes || [];
  const links = graphData?.links || [];
  if (nodes.length > 0) {
    await db.entities.upsertMany(
      nodes.map((n: any) => ({
        _id: `ent-${caseId}-${n.id}`,
        case_id: caseId,
        ...n,
      }))
    );
  }
  if (links.length > 0) {
    await db.relationships.upsertMany(
      links.map((l: any) => ({
        _id: `rel-${caseId}-${l.id || `${l.source}-${l.target}`}`,
        case_id: caseId,
        id: l.id || `${l.source}-${l.target}`,
        source: typeof l.source === "object" ? (l.source as any).id : l.source,
        target: typeof l.target === "object" ? (l.target as any).id : l.target,
        relationType: l.relationType || "ASSOCIATED_WITH",
        weight: l.weight,
        evidence_ids: l.evidence_ids || [],
        source_type: l.source_type || "MANUAL_INVESTIGATION",
        confidence: l.confidence ?? 0.9,
      }))
    );
  }
  for (const f of evidenceRecords?.firs || []) await db.firs.insertOne({ case_id: caseId, ...f });
  if ((evidenceRecords?.cdrs || []).length > 0) await db.cdrs.insertMany((evidenceRecords?.cdrs || []).map((c: any) => ({ case_id: caseId, ...c })));
  if ((evidenceRecords?.financials || []).length > 0) await db.financials.insertMany((evidenceRecords?.financials || []).map((f: any) => ({ case_id: caseId, ...f })));
  for (const i of evidenceRecords?.intels || []) await db.intels.insertOne({ case_id: caseId, ...i });
  for (const ef of evidenceRecords?.evidenceFiles || []) {
    await db.evidence.insertOne({
      _id: `EVID-IMP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      case_id: caseId,
      file_name: ef.fileName || "imported-exhibit",
      file_size: ef.fileSize || 0,
      file_size_formatted: ef.fileSizeFormatted || "0 B",
      file_type: ef.fileType || "DOCUMENT",
      file_hash: ef.fileHash || `sha256:${crypto.createHash("sha256").update(`${caseId}:${ef.fileName}:${now}`).digest("hex")}`,
      uploaded_at: ef.uploadedAt || now,
      uploaded_by: admin.name,
      uploader_role: admin.role,
      status: "COMMITTED",
      source_authority: ef.sourceAuthority || "Archive import",
      summary: ef.summary || "Restored from exported case container.",
      raw_text: ef.rawText,
      extracted_entities_count: 0,
      extracted_relations_count: 0,
    });
  }

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: admin._id,
    user_name: admin.name,
    user_role: admin.role,
    action: "CASE_IMPORTED",
    case_id: caseId,
    details: `Admin ${admin.name} initialized case ${codeName} from archive (${nodes.length} nodes, ${links.length} links).`,
    digital_hash: crypto.createHash("sha256").update(`${caseId}:IMPORT:${now}`).digest("hex"),
    result: "SUCCESS",
  });
  broadcastCaseUpdate(caseId, {
    event_type: "CASE_CREATED",
    title: "Case imported",
    message: `${codeName} initialized from archive by ${admin.name}.`,
    changes: { new_entities: nodes.length, new_relationships: links.length },
    actor_name: admin.name,
    actor_role: admin.role,
  });
  res.status(201).json({
    success: true,
    case: caseObj,
    imported: {
      nodes: nodes.length,
      links: links.length,
      firs: (evidenceRecords?.firs || []).length,
      cdrs: (evidenceRecords?.cdrs || []).length,
      financials: (evidenceRecords?.financials || []).length,
      intels: (evidenceRecords?.intels || []).length,
      evidenceFiles: (evidenceRecords?.evidenceFiles || []).length,
    },
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Req15 — Lead team composition: LEADs add same-tenure personnel
// from the command overview. No cross-assignment / horizontal leakage.
// ---------------------------------------------------------------------------
router.post(
  "/:caseId/members/lead-add",
  requireCaseMembership,
  requireEditAccess,
  requireRole([...ADMIN_ROLES, ...LEAD_ROLES] as DBRole[]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const { userId } = req.body;
    const caller = req.user!;

    const caseObj: any = await db.cases.findOne(caseId);
    if (!caseObj) {
      res.status(404).json({ error: "Case not found." });
      return;
    }
    const target = await db.users.findOne({ _id: userId });
    if (!target || target.status !== "ACTIVE") {
      res.status(400).json({ error: "Target must be an ACTIVE registered user." });
      return;
    }
    if (isLead(caller.role) && !sameTenure(caller.role, caller.state, target.role, target.state)) {
      res.status(403).json({
        error: "Tenant Isolation",
        message: `Leads may staff only officers sharing their agency prefix (yours: '${tenureKey(caller.role, caller.state)}').`,
      });
      return;
    }
    if (!sameTenure(caller.role, caller.state, target.role, target.state)) {
      res.status(403).json({ error: "Tenant Isolation", message: "Target officer is outside your tenure." });
      return;
    }
    if (caseObj.org && caseObj.org !== "UNKNOWN") {
      const ct =
        caseObj.org === "POLICE"
          ? `POLICE:${String(caseObj.state || "POLICE").toUpperCase()}`
          : String(caseObj.org).toUpperCase();
      const mt = tenureKey(target.role, target.state);
      if (ct !== "SHARED" && mt !== ct) {
        res.status(403).json({
          error: "Tenant Isolation",
          message: `Member tenure '${mt}' does not match case tenure '${ct}'.`,
        });
        return;
      }
    }
    const existing = await db.case_members.findOne({ case_id: caseId, user_id: userId });
    if (existing) {
      res.status(400).json({ error: "Officer is already assigned to this case." });
      return;
    }
    const now = new Date().toISOString();
    const member: DBCaseMember = {
      _id: `mem-${caseId}-${userId}-${Date.now().toString(36)}`,
      case_id: caseId,
      user_id: target._id,
      user_name: target.name,
      user_email: target.email,
      official_id: target.official_id,
      agency: target.agency,
      role: target.role,
      state: target.state,
      access: "FULL_EDIT",
      status: "ACTIVE",
      assigned_at: now,
      assigned_by: caller.name,
    };
    await db.case_members.insertOne(member);
    broadcastCaseUpdate(caseId, {
      event_type: "TEAM_UPDATED",
      title: "Team updated",
      message: `${target.name} (${target.role}) added by ${caller.name}.`,
      changes: {},
      actor_name: caller.name,
      actor_role: caller.role,
    });
    res.status(201).json({ success: true, member });
  }
);

// ---------------------------------------------------------------------------
// Phase 3 Req16 — POC nomination: Leads assign internal Field/Forensic/Cyber
// points of contact (must be same-tenure case members).
// ---------------------------------------------------------------------------
router.patch(
  "/:caseId/pocs",
  requireCaseMembership,
  requireEditAccess,
  requireRole([...ADMIN_ROLES, ...LEAD_ROLES] as DBRole[]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const { field, forensic, cyber } = req.body as { field?: string; forensic?: string; cyber?: string };
    const caller = req.user!;

    const caseObj: any = await db.cases.findOne(caseId);
    if (!caseObj) {
      res.status(404).json({ error: "Case not found." });
      return;
    }
    const members = await db.case_members.find({ case_id: caseId });
    const memberIds = new Set(members.filter((m) => m.status === "ACTIVE").map((m) => m.user_id));
    const picks: Record<string, string | undefined> = { field, forensic, cyber };
    for (const [kind, uid] of Object.entries(picks)) {
      if (!uid) continue;
      if (!memberIds.has(uid)) {
        res.status(400).json({ error: `POC for ${kind} must be an ACTIVE member of this case.` });
        return;
      }
      const u = await db.users.findOne({ _id: uid });
      if (u && !sameTenure(caller.role, caller.state, u.role, u.state)) {
        res.status(403).json({ error: "Tenant Isolation", message: `POC for ${kind} is outside your tenure.` });
        return;
      }
    }
    caseObj.pocs = { ...(caseObj.pocs || {}), ...Object.fromEntries(Object.entries(picks).filter(([, v]) => !!v)) };
    await db.cases.updateOne(caseId, { pocs: caseObj.pocs });
    broadcastCaseUpdate(caseId, {
      event_type: "POC_UPDATED",
      title: "POCs updated",
      message: `${caller.name} nominated case POCs.`,
      changes: {},
      actor_name: caller.name,
      actor_role: caller.role,
    });
    res.json({ success: true, pocs: caseObj.pocs });
  }
);

// ---------------------------------------------------------------------------
// Phase 3 Req17 — personnel requisition workflow (Lead → Admin).
// ---------------------------------------------------------------------------
router.post(
  "/:caseId/requisitions",
  requireCaseMembership,
  requireEditAccess,
  requireRole([...ADMIN_ROLES, ...LEAD_ROLES] as DBRole[]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const { functional, count, justification } = req.body;
    const caller = req.user!;

    if (!["CYBER", "FORENSIC", "FIELD", "LEAD"].includes(String(functional))) {
      res.status(400).json({ error: "functional must be one of CYBER/FORENSIC/FIELD/LEAD." });
      return;
    }
    const n = Number(count) || 1;
    if (n < 1 || n > 25) {
      res.status(400).json({ error: "count must be between 1 and 25." });
      return;
    }
    if (!justification?.trim() || justification.trim().length < 10) {
      res.status(400).json({ error: "justification (min 10 chars) is required." });
      return;
    }
    const caseObj: any = await db.cases.findOne(caseId);
    if (!caseObj) {
      res.status(404).json({ error: "Case not found." });
      return;
    }
    const now = new Date().toISOString();
    const reqDoc: DBRequisition = {
      _id: `req-${caseId}-${Date.now().toString(36)}`,
      case_id: caseId,
      case_code: caseObj.codeName,
      requested_by: caller.name,
      requested_by_role: caller.role,
      requested_by_state: caller.state,
      kind: "PERSONNEL",
      functional,
      count: n,
      justification: justification.trim(),
      status: "PENDING",
      requested_at: now,
    };
    await db.requisitions.insertOne(reqDoc);
    broadcastCaseUpdate(caseId, {
      event_type: "REQUISITION_CREATED",
      title: "Personnel requisition",
      message: `${caller.name} requested ${n}× ${functional}.`,
      changes: {},
      actor_name: caller.name,
      actor_role: caller.role,
    });
    res.status(201).json({ success: true, requisition: reqDoc });
  }
);

router.get("/:caseId/requisitions", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const list = await db.requisitions.find({ case_id: caseId });
  res.json({ requisitions: list });
});

// ---------------------------------------------------------------------------
// Phase 4 Req22 — data/evidence requisitions: Leads issue formal requests to
// assigned Cyber / Forensic / Field personnel; assignees fulfill after upload.
// ---------------------------------------------------------------------------
router.post(
  "/:caseId/data-requests",
  requireCaseMembership,
  requireEditAccess,
  requireRole([...ADMIN_ROLES, ...LEAD_ROLES] as DBRole[]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const { targetFunctional, title, details, deadline } = req.body;
    const caller = req.user!;

    if (!["CYBER", "FORENSIC", "FIELD"].includes(String(targetFunctional))) {
      res.status(400).json({ error: "targetFunctional must be one of CYBER/FORENSIC/FIELD." });
      return;
    }
    if (!title?.trim() || title.trim().length < 5) {
      res.status(400).json({ error: "title (min 5 chars) is required." });
      return;
    }
    if (!details?.trim() || details.trim().length < 10) {
      res.status(400).json({ error: "details (min 10 chars) are required." });
      return;
    }
    if (deadline && Number.isNaN(Date.parse(String(deadline)))) {
      res.status(400).json({ error: "deadline must be a valid date." });
      return;
    }
    const caseObj: any = await db.cases.findOne(caseId);
    if (!caseObj) {
      res.status(404).json({ error: "Case not found." });
      return;
    }
    const members = await db.case_members.find({ case_id: caseId });
    const staffed = members.some(
      (m) => m.status === "ACTIVE" && String(m.role).endsWith(`_${targetFunctional}`) && sameTenure(caller.role, caller.state, m.role, (m as any).state)
    );
    if (!staffed) {
      res.status(400).json({ error: `No ACTIVE ${targetFunctional} personnel staffed on this case.` });
      return;
    }
    const now = new Date().toISOString();
    const doc: DBRequisition = {
      _id: `dreq-${caseId}-${Date.now().toString(36)}`,
      case_id: caseId,
      case_code: caseObj.codeName,
      requested_by: caller.name,
      requested_by_role: caller.role,
      requested_by_state: caller.state,
      kind: "DATA",
      functional: targetFunctional,
      targetFunctional: targetFunctional,
      title: title.trim(),
      count: 1,
      justification: details.trim(),
      deadline: deadline ? new Date(String(deadline)).toISOString().split("T")[0] : undefined,
      status: "PENDING",
      requested_at: now,
    };
    await db.requisitions.insertOne(doc);
    broadcastCaseUpdate(caseId, {
      event_type: "REQUISITION_CREATED",
      title: "Data requisition",
      message: `${caller.name} requisitioned ${targetFunctional} data: ${doc.title}.`,
      changes: {},
      actor_name: caller.name,
      actor_role: caller.role,
    });
    res.status(201).json({ success: true, requisition: doc });
  }
);

router.get("/:caseId/data-requests", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const list = (await db.requisitions.find({ case_id: caseId })).filter((r) => r.kind === "DATA");
  res.json({ requisitions: list });
});

router.post(
  "/:caseId/data-requests/:reqId/fulfill",
  requireCaseMembership,
  requireEditAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    const { caseId, reqId } = req.params;
    const caller = req.user!;
    const doc = await db.requisitions.findOne(reqId);
    if (!doc || doc.kind !== "DATA" || doc.case_id !== caseId || doc.status !== "PENDING") {
      res.status(404).json({ error: "Pending data requisition not found." });
      return;
    }
    const parts = String(caller.role).split("_");
    const myFunctional = parts[parts.length - 1];
    if (myFunctional !== doc.targetFunctional && !isAdmin(caller.role)) {
      res.status(403).json({ error: `Only ${doc.targetFunctional} personnel may fulfill this requisition.` });
      return;
    }
    const now = new Date().toISOString();
    await db.requisitions.updateOne(reqId, {
      status: "FULFILLED",
      fulfilled_by: caller.name,
      fulfilled_at: now,
      review_notes: req.body?.notes,
    });
    broadcastCaseUpdate(caseId, {
      event_type: "REQUISITION_DECIDED",
      title: "Data requisition fulfilled",
      message: `${caller.name} fulfilled '${doc.title}'.`,
      changes: {},
      actor_name: caller.name,
      actor_role: caller.role,
    });
    res.json({ success: true });
  }
);

// ---------------------------------------------------------------------------
// Judicial Dossier Studio — Sign & Certify (Sec 65B IEA / Sec 63 BSA).
// Lead Investigators (and Admins) formally sign the court dossier; the
// signature hash binds case + registration + signer + timestamp.
// ---------------------------------------------------------------------------
router.get("/:caseId/dossier/signatures", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const list = await db.dossier_signatures.find({ case_id: req.params.caseId });
  res.json({ signatures: list });
});

router.post(
  "/:caseId/dossier/signatures",
  requireCaseMembership,
  requireEditAccess,
  requireRole([...ADMIN_ROLES, ...LEAD_ROLES] as DBRole[]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { caseId } = req.params;
    const { regNumber, court, venue } = req.body;
    const caller = req.user!;

    if (!regNumber?.trim()) {
      res.status(400).json({ error: "regNumber (dossier registration number) is required." });
      return;
    }
    const caseObj: any = await db.cases.findOne(caseId);
    if (!caseObj) {
      res.status(404).json({ error: "Case not found." });
      return;
    }
    const now = new Date().toISOString();
    const statement = `I, ${caller.name} (${caller.role}, ${caller.official_id}), attest the facts, exhibits and findings of case ${regNumber.trim()} as true to the best of my knowledge, certified under Section 65B IEA / Section 63 BSA.`;
    const sig: DBDossierSignature = {
      _id: `sig-${caseId}-${Date.now().toString(36)}`,
      case_id: caseId,
      reg_number: regNumber.trim(),
      court: String(court || "").slice(0, 120),
      signed_by: caller.name,
      signed_role: caller.role,
      signed_badge: caller.official_id,
      statement,
      signature_hash: `sha256:${crypto.createHash("sha256").update(`${caseId}:${regNumber}:${caller._id}:${now}`).digest("hex")}`,
      signed_at: now,
    };
    await db.dossier_signatures.insertOne(sig);
    await db.audit_logs.insertOne({
      _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: now,
      user_id: caller._id,
      user_name: caller.name,
      user_role: caller.role,
      action: "DOSSIER_SIGNED",
      case_id: caseId,
      details: `${caller.name} signed judicial dossier ${sig.reg_number} (${sig.signature_hash.slice(0, 20)}…).`,
      digital_hash: sig.signature_hash,
      result: "SUCCESS",
    });
    broadcastCaseUpdate(caseId, {
      event_type: "DOSSIER_SIGNED",
      title: "Dossier signed",
      message: `${caller.name} signed dossier ${sig.reg_number}.`,
      changes: {},
      actor_name: caller.name,
      actor_role: caller.role,
    });
    res.status(201).json({ success: true, signature: sig });
  }
);

router.post(
  "/:caseId/requisitions/:reqId/approve",
  requireCaseMembership,
  requireRole([...ADMIN_ROLES] as DBRole[]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { reqId } = req.params;
    const admin = req.user!;
    const doc = await db.requisitions.findOne(reqId);
    if (!doc || doc.status !== "PENDING") {
      res.status(404).json({ error: "Pending requisition not found." });
      return;
    }
    if (!sameTenure(admin.role, admin.state, doc.requested_by_role, doc.requested_by_state)) {
      res.status(403).json({ error: "Tenant Isolation", message: "Requisition is outside your tenure." });
      return;
    }
    const now = new Date().toISOString();
    await db.requisitions.updateOne(reqId, { status: "APPROVED", reviewed_by: admin.name, reviewed_at: now, review_notes: req.body?.notes });
    broadcastCaseUpdate(doc.case_id, {
      event_type: "REQUISITION_DECIDED",
      title: "Requisition approved",
      message: `${admin.name} approved ${doc.count}× ${doc.functional} for ${doc.case_code}.`,
      changes: {},
      actor_name: admin.name,
      actor_role: admin.role,
    });
    res.json({ success: true });
  }
);

router.post(
  "/:caseId/requisitions/:reqId/reject",
  requireCaseMembership,
  requireRole([...ADMIN_ROLES] as DBRole[]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { reqId } = req.params;
    const admin = req.user!;
    const doc = await db.requisitions.findOne(reqId);
    if (!doc || doc.status !== "PENDING") {
      res.status(404).json({ error: "Pending requisition not found." });
      return;
    }
    if (!sameTenure(admin.role, admin.state, doc.requested_by_role, doc.requested_by_state)) {
      res.status(403).json({ error: "Tenant Isolation", message: "Requisition is outside your tenure." });
      return;
    }
    const now = new Date().toISOString();
    await db.requisitions.updateOne(reqId, { status: "REJECTED", reviewed_by: admin.name, reviewed_at: now, review_notes: req.body?.notes });
    res.json({ success: true });
  }
);

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

  // Format evidence files for frontend (Phase 5 Req25 — full source text included
  // so officers can retrieve/read complete case files directly in the chat view).
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
    rawText: e.raw_text,
    sharedTo: (e as any).sharedTo || [],
    sharedBy: (e as any).sharedBy,
    sharedAt: (e as any).sharedAt,
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
router.post(
  "/:caseId/evidence",
  requireCaseMembership,
  requireEditAccess,
  requireFunctional(["ADMIN", "FIELD", "FORENSIC", "CYBER"]),
  async (req: AuthenticatedRequest, res: Response) => {
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
router.post(
  "/:caseId/evidence/:evidenceId/process",
  requireCaseMembership,
  requireEditAccess,
  requireFunctional(["ADMIN", "FIELD", "FORENSIC", "CYBER"]),
  async (req: AuthenticatedRequest, res: Response) => {
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
router.post(
  "/:caseId/evidence/:evidenceId/commit",
  requireCaseMembership,
  requireEditAccess,
  requireFunctional(["ADMIN", "FIELD", "FORENSIC", "CYBER"]),
  async (req: AuthenticatedRequest, res: Response) => {
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

  // Forensic commits stage for Lead review — the exhibit stays sealed in the
  // vault, but graph assertions wait for approval. Nothing writes the graph here.
  const { stageCandidates } = await import("../services/stagingService");
  const stagedEntities = nodesToCommit.map((n: any) => ({
    label: n.label,
    type: n.type,
    role: n.role || "Investigative Subject",
    riskScore: n.riskScore || 75,
    confidence: n.confidence || 0.9,
    details: { ...(n.details || {}), aliases: n.aliases || [] },
    evidenceRef: evidenceId,
    locator: n.locator,
  }));
  const stagedLinks = linksToCommit.map((l: any) => ({
    sourceLabel: typeof l.source === "object" ? l.source.label || l.source.id : String(l.source),
    targetLabel: typeof l.target === "object" ? l.target.label || l.target.id : String(l.target),
    relationType: l.relationType || "ASSOCIATED_WITH",
    weight: l.weight || 0.8,
    frequency: l.frequency,
    amount: l.amount,
    details: l.details || `Extracted from exhibit ${ev.file_name}`,
    evidenceRef: evidenceId,
    locator: l.locator,
  }));
  const { batchId } = await stageCandidates({
    caseId,
    source: ev.file_type === "CDR_CSV" || ev.file_type === "FINANCIAL_CSV" ? ev.file_type : "FIR",
    fileName: ev.file_name,
    entities: stagedEntities,
    links: stagedLinks,
    actor: user,
    note: `Staged from forensic exhibit ${ev.file_name} (${ev.file_type}).`,
    content: (ev as any).raw_text,
  });

  // 3. Mark evidence status as COMMITTED (sealed in vault; graph pending review)
  const updatedEv = await db.evidence.updateOne(evidenceId, {
    status: "COMMITTED",
    extracted_entities_count: stagedEntities.length,
    extracted_relations_count: stagedLinks.length,
  });

  // 4. Investigation Event
  await db.investigation_events.insertOne({
    _id: `ev-${Date.now()}`,
    case_id: caseId,
    event_type: "EVIDENCE_STAGED",
    title: `Intelligence Staged: ${ev.file_name}`,
    description: `Staged ${stagedEntities.length} entities and ${stagedLinks.length} relationships for Lead review (batch ${batchId}).`,
    timestamp: now,
    actor_id: user._id,
    actor_name: user.name,
    actor_role: user.role,
  });

  // 5. Audit Log with SHA-256 Digest
  const auditDigest = crypto
    .createHash("sha256")
    .update(`${evidenceId}:${stagedEntities.length}:${stagedLinks.length}:${now}`)
    .digest("hex");

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "EVIDENCE_STAGED_FOR_REVIEW",
    case_id: caseId,
    resource_id: evidenceId,
    target_label: ev.file_name,
    details: `Officer ${user.name} staged ${stagedEntities.length} entities and ${stagedLinks.length} relationships from exhibit ${ev.file_name} for Lead review (batch ${batchId}).`,
    digital_hash: `sha256:${auditDigest}`,
    result: "SUCCESS",
  });

  // 6. Broadcast Real-time WebSocket Event to all case members
  broadcastCaseUpdate(caseId, {
    event_type: "STAGING_UPDATED",
    title: "New Intake Staged for Review",
    message: `${stagedEntities.length} entities and ${stagedLinks.length} relationships from ${ev.file_name} await Lead review in ${caseId}.`,
    changes: {
      new_evidence: 1,
      new_entities: stagedEntities.length,
      new_relationships: stagedLinks.length,
      new_alerts: 1,
    },
    evidence_id: evidenceId,
    actor_name: user.name,
    actor_role: user.role,
  });

  await autoLogDiary(
    caseId,
    user,
    `Evidence staged: exhibit ${ev.file_name} queued ${stagedEntities.length} entities and ${stagedLinks.length} relationships for Lead review (batch ${batchId}).`,
    "EVIDENCE_COMMIT"
  );

  res.json({
    success: true,
    message: "Evidence staged for Lead review — it appears in the Intake Pipeline in real time.",
    evidence: updatedEv,
    committedEntitiesCount: stagedEntities.length,
    committedRelationsCount: stagedLinks.length,
    stagedBatchId: batchId,
  });
});

// ---------------------------------------------------------------------------
// Phase 6 Req26 — State Police Lead approval flag: mirrors an approved exhibit
// into collaborating State Police Lead views across state boundaries.
// ---------------------------------------------------------------------------
router.post(
  "/:caseId/evidence/:evidenceId/share",
  requireCaseMembership,
  requireEditAccess,
  requireRole([...ADMIN_ROLES, ...LEAD_ROLES] as DBRole[]),
  async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, evidenceId } = req.params;
  const { states } = req.body as { states?: string[] };
  const caller = req.user!;

  if (orgOf(caller.role) !== "POLICE") {
    res.status(403).json({ error: "Cross-state sharing is a State Police bridge workflow." });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Case not found." });
    return;
  }
  if (!sameTenure(caller.role, caller.state, `${caseObj.org || "POLICE"}_LEAD`, caseObj.state)) {
    res.status(403).json({ error: "Tenant Isolation", message: "You may flag only your own tenure's exhibits." });
    return;
  }
  const targets = [...new Set((states || []).map((s) => String(s).toUpperCase()))].filter(Boolean);
  if (targets.length === 0) {
    res.status(400).json({ error: "states[] (counter-state jurisdictions) is required." });
    return;
  }
  if (targets.includes(String(caller.state || "").toUpperCase())) {
    res.status(400).json({ error: "Cannot share with your own state." });
    return;
  }
  const ev = await db.evidence.findOne(evidenceId);
  if (!ev || ev.case_id !== caseId) {
    res.status(404).json({ error: "Evidence exhibit not found in this case." });
    return;
  }
  const now = new Date().toISOString();
  const merged = [...new Set([...(ev.sharedTo || []), ...targets])];
  await db.evidence.updateOne(evidenceId, { sharedTo: merged, sharedBy: caller.name, sharedAt: now });
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: caller._id,
    user_name: caller.name,
    user_role: caller.role,
    action: "EVIDENCE_SHARED_CROSS_STATE",
    case_id: caseId,
    resource_id: evidenceId,
    target_label: ev.file_name,
    details: `${caller.name} approved ${ev.file_name} for joint-jurisdiction use by ${merged.join(", ")}.`,
    digital_hash: crypto.createHash("sha256").update(`${evidenceId}:${merged.join(",")}:${now}`).digest("hex"),
    result: "SUCCESS",
  });
  broadcastCaseUpdate(caseId, {
    event_type: "EVIDENCE_SHARED",
    title: "Exhibit shared interstate",
    message: `${ev.file_name} approved for ${merged.join(", ")} by ${caller.name}.`,
    changes: {},
    evidence_id: evidenceId,
    actor_name: caller.name,
    actor_role: caller.role,
  });
  res.json({ success: true, sharedTo: merged });
  }
);

// Update or Create Node
router.post("/:caseId/nodes", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
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
router.post("/:caseId/links", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
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
router.patch("/:caseId/nodes/:nodeId/review", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
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

  // Phase 1: auto-log graph review into Sec 172 case diary
  await autoLogDiary(
    caseId,
    user,
    `Graph review: entity "${entity.label}" (${entity.type}) marked ${reviewState} by ${user.name} (${user.designation}).${note ? ` Note: ${note}` : ""}`,
    "NODE_REVIEW"
  );

  res.json({ success: true, entity: updatedEntity, auditHash: digitalHash });
});

// Update Link Review State
router.patch("/:caseId/links/:linkId/review", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
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

  // Phase 1: auto-log graph review into Sec 172 case diary
  await autoLogDiary(
    caseId,
    user,
    `Graph review: link "${relationship.source} [${relationship.relationType}] ${relationship.target}" marked ${reviewState} by ${user.name} (${user.designation}).${note ? ` Note: ${note}` : ""}`,
    "LINK_REVIEW"
  );

  res.json({ success: true, link: updatedRelationship, auditHash: digitalHash });
});

// Record Playbook / Investigative Action in the Immutable Audit Ledger
router.post("/:caseId/audit", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
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
