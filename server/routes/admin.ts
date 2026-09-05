import { Router, Response } from "express";
import { db, DBAccessRequest, DBAuditLog, DBCaseMember } from "../db";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../auth";
import crypto from "crypto";

const router = Router();

// All routes here strictly require ADMIN role
router.use(authenticateToken);
router.use(requireRole(["ADMIN"]));

// Dashboard Governance Metrics
router.get("/dashboard", async (req: AuthenticatedRequest, res: Response) => {
  const users = await db.users.find();
  const requests = await db.access_requests.find();
  const caseRequests = await db.case_access_requests.find();
  const cases = await db.cases.find();
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
    },
    recentRequests: requests.slice(0, 5),
    recentCaseRequests: caseRequests.slice(0, 5),
    recentAudits: auditLogs.slice(0, 10),
  });
});

// Case Access Requests List
router.get("/case-access-requests", async (req: AuthenticatedRequest, res: Response) => {
  const requests = await db.case_access_requests.find();
  res.json({ requests });
});

// Approve Case Access Request
router.post("/case-access-requests/:id/approve", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;

  const caseReq = await db.case_access_requests.findOne(id);
  if (!caseReq) {
    res.status(404).json({ error: "Case access request not found." });
    return;
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

// Access Requests List
router.get("/access-requests", async (req: AuthenticatedRequest, res: Response) => {
  const requests = await db.access_requests.find();
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

  // Admin explicitly assigns role (LEAD_INVESTIGATOR or FORENSIC_INVESTIGATOR)
  const roleToAssign: "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" =
    assignedRole === "FORENSIC_INVESTIGATOR"
      ? "FORENSIC_INVESTIGATOR"
      : assignedRole === "LEAD_INVESTIGATOR"
      ? "LEAD_INVESTIGATOR"
      : accessReq.requested_role === "FORENSIC_INVESTIGATOR"
      ? "FORENSIC_INVESTIGATOR"
      : "LEAD_INVESTIGATOR";

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
      status: "ACTIVE",
      approved_by: req.user!._id,
      approved_at: now,
    });

    // If default case provided or auto-assign to Garuda
    const caseToAssign = defaultCaseId || "case-garuda";
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
        status: "ACTIVE",
        assigned_at: now,
        assigned_by: req.user!.name,
      };
      await db.case_members.insertOne(member);
    } else {
      await db.case_members.updateOne(existingMember._id, {
        role: roleToAssign,
        status: "ACTIVE",
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

// List Users
router.get("/users", async (req: AuthenticatedRequest, res: Response) => {
  const users = await db.users.find();
  const sanitized = users.map((u) => ({
    _id: u._id,
    name: u.name,
    official_id: u.official_id,
    email: u.email,
    agency: u.agency,
    designation: u.designation,
    department: u.department,
    role: u.role,
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

// Cases & Case Access
router.get("/cases", async (req: AuthenticatedRequest, res: Response) => {
  const cases = await db.cases.find();
  const allMembers = await db.case_members.find({});

  const enrichedCases = cases.map((c) => {
    const members = allMembers.filter((m) => m.case_id === c.id);
    return {
      ...c,
      members,
      memberCount: members.length,
      leadCount: members.filter((m) => m.role === "LEAD_INVESTIGATOR").length,
      forensicCount: members.filter((m) => m.role === "FORENSIC_INVESTIGATOR").length,
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

// Assign Member to Case
router.post("/cases/:caseId/members", async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const { userId } = req.body;

  const targetUser = await db.users.findOne({ _id: userId });
  if (!targetUser) {
    res.status(404).json({ error: "Target user not found" });
    return;
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

// System Audit Logs
router.get("/audit-logs", async (req: AuthenticatedRequest, res: Response) => {
  const logs = await db.audit_logs.find();
  res.json({ logs });
});

export default router;
