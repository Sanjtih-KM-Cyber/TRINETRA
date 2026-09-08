import { Router, Response } from "express";
import { db, DBAccessRequest, DBAuditLog, DBCaseMember, DBRole } from "../db";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../auth";
import { ADMIN_ROLES, USER_ROLES, tenureKey, sameTenure, isAdmin } from "../../src/data/roles";
import crypto from "crypto";

const router = Router();

// All routes here strictly require a department Admin role (CBI_ADMIN/NIA_ADMIN/CID_ADMIN/POLICE_ADMIN)
router.use(authenticateToken);
router.use(requireRole([...ADMIN_ROLES] as DBRole[]));

function adminTenure(req: AuthenticatedRequest): string {
  return tenureKey(req.user!.role, req.user!.state);
}

function caseTenureOf(c: any): string {
  if (!c?.org || c.org === "UNKNOWN") return "SHARED";
  return c.org === "POLICE" ? `POLICE:${String(c.state || "POLICE").toUpperCase()}` : String(c.org).toUpperCase();
}

function inAdminTenure(req: AuthenticatedRequest, role: string, state?: string): boolean {
  return sameTenure(req.user!.role, req.user!.state, role, state);
}

// Dashboard Governance Metrics (dept-scoped)
router.get("/dashboard", async (req: AuthenticatedRequest, res: Response) => {
  const tenure = adminTenure(req);
  const allUsers = await db.users.find();
  const users = allUsers.filter((u) => sameTenure(req.user!.role, req.user!.state, u.role, u.state));
  const allRequests = await db.access_requests.find();
  const requests = allRequests.filter((r: any) =>
    sameTenure(req.user!.role, req.user!.state, r.requested_role, r.state)
  );
  const caseRequests = await db.case_access_requests.find();
  const allCases = await db.cases.find();
  const cases = allCases.filter((c: any) => {
    const ct = caseTenureOf(c);
    return ct === "SHARED" || ct === tenure;
  });
  const auditLogs = await db.audit_logs.find();

  const activeUsers = users.filter((u) => u.status === "ACTIVE").length;
  const pendingRequests = requests.filter((r) => r.status === "PENDING").length;
  const pendingCaseRequests = caseRequests.filter((r) => r.status === "PENDING").length;
  const suspendedUsers = users.filter((u) => u.status === "SUSPENDED").length;

  res.json({
    metrics: {
      totalUsers: users.length,
      activeUsers,
      pendingRequests,
      pendingCaseRequests,
      suspendedUsers,
      activeCases: cases.length,
      auditLogCount: auditLogs.length,
      tenure,
    },
    recentRequests: requests.slice(0, 5),
    recentCaseRequests: caseRequests.slice(0, 5),
    recentAudits: auditLogs.slice(0, 10),
  });
});

// Case Access Requests List (dept-scoped by requester tenure)
router.get("/case-access-requests", async (req: AuthenticatedRequest, res: Response) => {
  const all = await db.case_access_requests.find();
  const requests = all.filter((r: any) =>
    sameTenure(req.user!.role, req.user!.state, r.user_role, (r as any).state)
  );
  res.json({ requests });
});

// Approve Case Access Request (same-tenure only — Req8)
router.post("/case-access-requests/:id/approve", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;

  const caseReq = await db.case_access_requests.findOne(id);
  if (!caseReq) {
    res.status(404).json({ error: "Case access request not found." });
    return;
  }
  if (!inAdminTenure(req, caseReq.user_role, (caseReq as any).state)) {
    res.status(403).json({
      error: "Tenant Isolation",
      message: `Cannot approve '${caseReq.user_role}' outside admin tenure '${adminTenure(req)}'.`,
    });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseReq.case_id).catch(() => null);
  if (caseObj?.org && caseObj.org !== "UNKNOWN") {
    const ct = caseTenureOf(caseObj);
    const memberTenure = tenureKey(caseReq.user_role, (caseReq as any).state);
    if (ct !== "SHARED" && ct !== memberTenure) {
      res.status(403).json({
        error: "Tenant Isolation",
        message: `Member tenure '${memberTenure}' does not match case tenure '${ct}'.`,
      });
      return;
    }
    if (ct !== "SHARED" && ct !== adminTenure(req)) {
      res.status(403).json({ error: "Tenant Isolation", message: "Case is outside your tenure." });
      return;
    }
  }

  const now = new Date().toISOString();

  // Update Case Access Request status
  await db.case_access_requests.updateOne(id, {
    status: "APPROVED",
    reviewed_by: req.user!.name,
    reviewed_at: now,
    review_notes: notes || "Approved by Security Administrator.",
  });

  // Assign user to case if not already member
  const existingMember = await db.case_members.findOne({
    case_id: caseReq.case_id,
    user_id: caseReq.user_id,
  });

  let memberRecord = existingMember;
  if (!existingMember) {
    const newMember: DBCaseMember = {
      _id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      case_id: caseReq.case_id,
      user_id: caseReq.user_id,
      user_name: caseReq.user_name,
      user_email: caseReq.user_email,
      official_id: caseReq.official_id,
      agency: caseReq.agency,
      role: caseReq.user_role,
      status: "ACTIVE",
      assigned_at: now,
      assigned_by: req.user!.name,
    };
    await db.case_members.insertOne(newMember);
    memberRecord = newMember;
  }

  // Audit log
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: "CASE_ACCESS_APPROVED",
    case_id: caseReq.case_id,
    details: `Admin ${req.user!.name} approved access request for ${caseReq.user_name} (${caseReq.user_role}) to case ${caseReq.case_code}.`,
    digital_hash: crypto.createHash("sha256").update(`${id}:${caseReq.case_id}:${caseReq.user_id}:APPROVE:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, message: "Case access request approved.", member: memberRecord });
});

// Reject Case Access Request
router.post("/case-access-requests/:id/reject", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;

  const caseReq = await db.case_access_requests.findOne(id);
  if (!caseReq) {
    res.status(404).json({ error: "Case access request not found." });
    return;
  }

  const now = new Date().toISOString();

  await db.case_access_requests.updateOne(id, {
    status: "REJECTED",
    reviewed_by: req.user!.name,
    reviewed_at: now,
    review_notes: notes || "Declined by Security Administrator.",
  });

  // Audit log
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: "CASE_ACCESS_REJECTED",
    case_id: caseReq.case_id,
    details: `Admin ${req.user!.name} rejected access request for ${caseReq.user_name} to case ${caseReq.case_code}. Reason: ${notes || "No reason given"}`,
    digital_hash: crypto.createHash("sha256").update(`${id}:${caseReq.case_id}:${caseReq.user_id}:REJECT:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, message: "Case access request rejected." });
});

// Access Requests List (dept-scoped by requested tenure)
router.get("/access-requests", async (req: AuthenticatedRequest, res: Response) => {
  const all = await db.access_requests.find();
  const requests = all.filter((r: any) =>
    sameTenure(req.user!.role, req.user!.state, r.requested_role, (r as any).state)
  );
  res.json({ requests });
});

// Approve Access Request
router.post("/access-requests/:id/approve", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { notes, defaultCaseId, assignedRole } = req.body;

  const accessReq = await db.access_requests.findOne(id);
  if (!accessReq) {
    res.status(404).json({ error: "Access request not found" });
    return;
  }

  // Admin assigns canonical Phase-0 roles within its own tenure only.
  const VALID_ROLES: DBRole[] = [...USER_ROLES] as DBRole[];
  const candidate = (assignedRole as DBRole) || accessReq.requested_role;
  if (!VALID_ROLES.includes(candidate)) {
    res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(", ")}.` });
    return;
  }
  if (!sameTenure(req.user!.role, req.user!.state, candidate, (accessReq as any).state)) {
    res.status(403).json({
      error: "Tenant Isolation",
      message: `Admin tenure '${adminTenure(req)}' cannot approve role '${candidate}' outside its department/state.`,
    });
    return;
  }
  const roleToAssign: DBRole = candidate;

  const now = new Date().toISOString();

  // Update Access Request
  await db.access_requests.updateOne(id, {
    status: "APPROVED",
    reviewed_by: req.user!.name,
    reviewed_at: now,
    notes: notes || `Access granted as ${roleToAssign} by Security Administrator.`,
  });

  // Find user by official_email or official_id and activate
  const user = await db.users.findOne({ email: accessReq.official_email }) ||
    await db.users.findOne({ official_id: accessReq.official_id });

  if (user) {
    await db.users.updateOne(user._id, {
      role: roleToAssign,
      state: (accessReq as any).state || user.state,
      status: "ACTIVE",
      approved_by: req.user!._id,
      approved_at: now,
    });

    // If default case provided or auto-assign to Garuda — skipped when the
    // case tenure does not match the approved user (Req8: no cross-tenant seeding).
    const caseToAssign = defaultCaseId || "case-garuda";
    const targetCase: any = await db.cases.findOne(caseToAssign).catch(() => null);
    const userTenure = tenureKey(roleToAssign, (accessReq as any).state || user.state);
    const targetTenure = targetCase ? caseTenureOf(targetCase) : "SHARED";
    let autoAssigned = false;
    if (!targetCase || targetTenure === "SHARED" || targetTenure === userTenure) {
      const existingMember = await db.case_members.findOne({
        case_id: caseToAssign,
        user_id: user._id,
      });

      if (!existingMember) {
        const member: DBCaseMember = {
          _id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          case_id: caseToAssign,
          user_id: user._id,
          user_name: user.name,
          user_email: user.email,
          official_id: user.official_id,
          agency: user.agency,
          role: roleToAssign,
          state: (accessReq as any).state || user.state,
          status: "ACTIVE",
          assigned_at: now,
          assigned_by: req.user!.name,
        };
        await db.case_members.insertOne(member);
        autoAssigned = true;
      } else {
        await db.case_members.updateOne(existingMember._id, {
          role: roleToAssign,
          status: "ACTIVE",
        });
        autoAssigned = true;
      }
    }
    if (!autoAssigned) {
      await db.audit_logs.insertOne({
        _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: now,
        user_id: req.user!._id,
        user_name: req.user!.name,
        user_role: req.user!.role,
        action: "ACCESS_REQUEST_AUTOASSIGN_SKIPPED",
        details: `Auto-assign to ${caseToAssign} skipped: user tenure '${userTenure}' vs case tenure '${targetTenure}'.`,
        digital_hash: crypto.createHash("sha256").update(`${id}:${roleToAssign}:SKIP:${now}`).digest("hex"),
        result: "SUCCESS",
      });
    }
  }

  // Audit log
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: "ACCESS_REQUEST_APPROVED",
    details: `Admin ${req.user!.name} approved access request for ${accessReq.full_name} (${accessReq.official_id}) and assigned operational role ${roleToAssign}.`,
    digital_hash: crypto.createHash("sha256").update(`${id}:${roleToAssign}:${now}:APPROVE`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, message: `Access approved as ${roleToAssign}. User account activated.` });
});

// Reject Access Request
router.post("/access-requests/:id/reject", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;

  const accessReq = await db.access_requests.findOne(id);
  if (!accessReq) {
    res.status(404).json({ error: "Access request not found" });
    return;
  }

  const now = new Date().toISOString();

  await db.access_requests.updateOne(id, {
    status: "REJECTED",
    reviewed_by: req.user!.name,
    reviewed_at: now,
    notes: notes || "Access denied per security review.",
  });

  const user = await db.users.findOne({ email: accessReq.official_email }) ||
    await db.users.findOne({ official_id: accessReq.official_id });

  if (user) {
    await db.users.updateOne(user._id, { status: "REJECTED" });
  }

  // Audit log
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: "ACCESS_REQUEST_REJECTED",
    details: `Admin ${req.user!.name} rejected access request for ${accessReq.full_name} (${accessReq.official_id}). Reason: ${notes || "Denied"}.`,
    digital_hash: crypto.createHash("sha256").update(`${id}:${now}:REJECT`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, message: "Access request rejected." });
});

// List Users (dept-scoped)
router.get("/users", async (req: AuthenticatedRequest, res: Response) => {
  const all = await db.users.find();
  const users = all.filter((u) => sameTenure(req.user!.role, req.user!.state, u.role, u.state));
  const sanitized = users.map((u) => ({
    _id: u._id,
    name: u.name,
    official_id: u.official_id,
    email: u.email,
    agency: u.agency,
    designation: u.designation,
    department: u.department,
    role: u.role,
    state: u.state,
    status: u.status,
    created_at: u.created_at,
    approved_by: u.approved_by,
    approved_at: u.approved_at,
    last_login: u.last_login,
    avatarColor: u.avatarColor,
  }));
  res.json({ users: sanitized });
});

// Update User Status
router.patch("/users/:id/status", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["ACTIVE", "SUSPENDED", "REJECTED"].includes(status)) {
    res.status(400).json({ error: "Invalid status value. Must be ACTIVE, SUSPENDED, or REJECTED." });
    return;
  }

  const user = await db.users.findOne({ _id: id });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!inAdminTenure(req, user.role, user.state)) {
    res.status(403).json({ error: "Tenant Isolation", message: "Cannot change status outside your department/state." });
    return;
  }

  await db.users.updateOne(id, { status });

  const now = new Date().toISOString();
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: `USER_STATUS_${status}`,
    details: `Admin changed status of ${user.name} (${user.official_id}) to ${status}.`,
    digital_hash: crypto.createHash("sha256").update(`${id}:${status}:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, message: `User status updated to ${status}` });
});

// Cases & Case Access (dept-scoped; SHARED legacy cases visible to all)
router.get("/cases", async (req: AuthenticatedRequest, res: Response) => {
  const tenure = adminTenure(req);
  const allCases = await db.cases.find();
  const cases = allCases.filter((c: any) => {
    const ct = caseTenureOf(c);
    return ct === "SHARED" || ct === tenure;
  });
  const allMembers = await db.case_members.find({});

  const enrichedCases = cases.map((c) => {
    const members = allMembers.filter((m) => m.case_id === c.id);
    return {
      ...c,
      members,
      memberCount: members.length,
      leadCount: members.filter((m) => String(m.role).endsWith("_LEAD")).length,
      forensicCount: members.filter((m) => String(m.role).endsWith("_FORENSIC")).length,
    };
  });

  res.json({ cases: enrichedCases });
});

// Get Case Members
router.get("/cases/:caseId/members", async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const members = await db.case_members.find({ case_id: caseId });
  res.json({ members });
});

// Assign Member to Case (strict same-tenure: no cross-assignment / horizontal leakage)
router.post("/cases/:caseId/members", async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const { userId } = req.body;

  const targetUser = await db.users.findOne({ _id: userId });
  if (!targetUser) {
    res.status(404).json({ error: "Target user not found" });
    return;
  }
  if (!inAdminTenure(req, targetUser.role, targetUser.state)) {
    res.status(403).json({
      error: "Tenant Isolation",
      message: `Cannot assign '${targetUser.role}' outside admin tenure '${adminTenure(req)}'. Leads are compartmentalized per department/state.`,
    });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseId).catch(() => null);
  if (caseObj && caseObj.org && caseObj.org !== "UNKNOWN") {
    const ct = caseTenureOf(caseObj);
    if (ct !== "SHARED" && ct !== adminTenure(req)) {
      res.status(403).json({ error: "Tenant Isolation", message: "Cannot assign members to a case outside your tenure." });
      return;
    }
    const memberTenure = tenureKey(targetUser.role, targetUser.state);
    if (ct !== "SHARED" && memberTenure !== ct) {
      res.status(403).json({
        error: "Tenant Isolation",
        message: `Member tenure '${memberTenure}' does not match case tenure '${ct}'.`,
      });
      return;
    }
  }

  const existing = await db.case_members.findOne({ case_id: caseId, user_id: userId });
  if (existing) {
    res.status(400).json({ error: "User is already assigned to this case." });
    return;
  }

  const now = new Date().toISOString();
  const newMember: DBCaseMember = {
    _id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    case_id: caseId,
    user_id: targetUser._id,
    user_name: targetUser.name,
    user_email: targetUser.email,
    official_id: targetUser.official_id,
    agency: targetUser.agency,
    role: targetUser.role as any,
    state: targetUser.state,
    status: "ACTIVE",
    assigned_at: now,
    assigned_by: req.user!.name,
  };

  await db.case_members.insertOne(newMember);

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: "CASE_MEMBER_ASSIGNED",
    case_id: caseId,
    details: `Admin assigned ${targetUser.name} (${targetUser.role}) to case ${caseId}.`,
    digital_hash: crypto.createHash("sha256").update(`${caseId}:${userId}:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, member: newMember });
});

// Remove Member from Case
router.delete("/cases/:caseId/members/:userId", async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, userId } = req.params;

  await db.case_members.deleteByCaseAndUser(caseId, userId);

  const now = new Date().toISOString();
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: "CASE_MEMBER_REMOVED",
    case_id: caseId,
    details: `Admin removed user ${userId} from case ${caseId}.`,
    digital_hash: crypto.createHash("sha256").update(`${caseId}:${userId}:REMOVE:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, message: "Member removed from case." });
});

// Admin directory (Phase 6 Req27) — cross-tenure ADMIN listing for handover targeting.
router.get("/admins", async (req: AuthenticatedRequest, res: Response) => {
  const all = await db.users.find();
  const admins = all
    .filter((u) => u.status === "ACTIVE" && String(u.role).endsWith("_ADMIN"))
    .map((u) => ({
      _id: u._id,
      name: u.name,
      official_id: u.official_id,
      email: u.email,
      agency: u.agency,
      role: u.role,
      state: u.state,
      tenure: tenureKey(u.role, u.state),
    }));
  res.json({ admins });
});

// Personnel requisitions queue (dept-scoped, Phase 3 Req17)
router.get("/requisitions", async (req: AuthenticatedRequest, res: Response) => {
  const all = await db.requisitions.find({});
  const list = all.filter((r) =>
    sameTenure(req.user!.role, req.user!.state, r.requested_by_role, r.requested_by_state)
  );
  res.json({ requisitions: list });
});

router.post("/requisitions/:id/approve", async (req: AuthenticatedRequest, res: Response) => {
  const doc = await db.requisitions.findOne(req.params.id);
  if (!doc || doc.status !== "PENDING") {
    res.status(404).json({ error: "Pending requisition not found." });
    return;
  }
  if (!sameTenure(req.user!.role, req.user!.state, doc.requested_by_role, doc.requested_by_state)) {
    res.status(403).json({ error: "Tenant Isolation", message: "Requisition is outside your tenure." });
    return;
  }
  const now = new Date().toISOString();
  await db.requisitions.updateOne(doc._id, {
    status: "APPROVED",
    reviewed_by: req.user!.name,
    reviewed_at: now,
    review_notes: req.body?.notes,
  });
  res.json({ success: true });
});

router.post("/requisitions/:id/reject", async (req: AuthenticatedRequest, res: Response) => {
  const doc = await db.requisitions.findOne(req.params.id);
  if (!doc || doc.status !== "PENDING") {
    res.status(404).json({ error: "Pending requisition not found." });
    return;
  }
  if (!sameTenure(req.user!.role, req.user!.state, doc.requested_by_role, doc.requested_by_state)) {
    res.status(403).json({ error: "Tenant Isolation", message: "Requisition is outside your tenure." });
    return;
  }
  const now = new Date().toISOString();
  await db.requisitions.updateOne(doc._id, {
    status: "REJECTED",
    reviewed_by: req.user!.name,
    reviewed_at: now,
    review_notes: req.body?.notes,
  });
  res.json({ success: true });
});

// System Audit Logs
router.get("/audit-logs", async (req: AuthenticatedRequest, res: Response) => {
  const logs = await db.audit_logs.find();
  res.json({ logs });
});

export default router;
