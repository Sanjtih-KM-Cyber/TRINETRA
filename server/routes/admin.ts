import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { db, DBAccessRequest, DBAuditLog, DBCaseMember, DBRole, DBUser } from "../db";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../auth";
import { ADMIN_ROLES, USER_ROLES, tenureKey, caseTenureOf, sameTenure, isAdmin, orgOf, isStatewiseOrg, STATE_META } from "../../src/data/roles";
import crypto from "crypto";

const router = Router();

// All routes here strictly require a department Admin role (CBI_ADMIN/NIA_ADMIN/CID_ADMIN/POLICE_ADMIN)
router.use(authenticateToken);
router.use(requireRole([...ADMIN_ROLES] as DBRole[]));

function adminTenure(req: AuthenticatedRequest): string {
  return tenureKey(req.user!.role, req.user!.state);
}

function inAdminTenure(req: AuthenticatedRequest, role: string, state?: string): boolean {
  return sameTenure(req.user!.role, req.user!.state, role, state);
}

/** Legacy requests may lack state — infer it from the agency name. */
function requestState(req: DBAccessRequest): string | undefined {
  if ((req as any).state) return (req as any).state;
  const agency = String(req.agency || "");
  for (const [code, meta] of Object.entries(STATE_META)) {
    if (agency.includes(meta.agency)) return code;
  }
  return undefined;
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

// Approve Case Access Request (same-tenure; sanctioned cross-tenure via orderRef)
router.post("/case-access-requests/:id/approve", async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { notes, orderRef } = req.body;
  const sanctioned = String(orderRef || "").trim().length >= 6;

  const caseReq = await db.case_access_requests.findOne(id);
  if (!caseReq) {
    res.status(404).json({ error: "Case access request not found." });
    return;
  }
  if (!inAdminTenure(req, caseReq.user_role, (caseReq as any).state) && !sanctioned) {
    res.status(403).json({
      error: "Tenant Isolation",
      message: `Cannot approve '${caseReq.user_role}' outside admin tenure '${adminTenure(req)}' without a sanction orderRef.`,
    });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseReq.case_id).catch(() => null);
  if (caseObj?.org && caseObj.org !== "UNKNOWN") {
    const ct = caseTenureOf(caseObj);
    const memberTenure = tenureKey(caseReq.user_role, (caseReq as any).state);
    if (ct !== "SHARED" && ct !== memberTenure && !sanctioned) {
      res.status(403).json({
        error: "Tenant Isolation",
        message: `Member tenure '${memberTenure}' does not match case tenure '${ct}'. Supply a sanction orderRef for a cross-tenure posting.`,
      });
      return;
    }
    if (ct !== "SHARED" && ct !== adminTenure(req)) {
      res.status(403).json({ error: "Tenant Isolation", message: `Case tenure '${ct}' is outside your tenure.` });
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

// Direct officer onboarding (no justification needed): the Admin enters name,
// branch, division and operation role; the system auto-generates the official
// email and employee ID; the Admin sets the password. Same-tenure only.
router.post("/users", async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const { full_name, branch, division, designation, department, requested_role, state, password } = req.body;

  if (!full_name?.trim() || !requested_role) {
    res.status(400).json({ error: "full_name and requested_role are required." });
    return;
  }
  if (!password || String(password).length < 6) {
    res.status(400).json({ error: "A password of at least 6 characters is required." });
    return;
  }
  if (!(USER_ROLES as readonly string[]).includes(requested_role)) {
    res.status(400).json({ error: `requested_role must be one of: ${USER_ROLES.join(", ")}.` });
    return;
  }
  const targetState = isStatewiseOrg(orgOf(requested_role)) ? String(state || admin.state || "").toUpperCase() : undefined;
  if (isStatewiseOrg(orgOf(requested_role)) && !targetState) {
    res.status(400).json({ error: "state is required for State Police / CID roles." });
    return;
  }
  if (!sameTenure(admin.role, admin.state, requested_role, targetState)) {
    res.status(403).json({
      error: "Tenant Isolation",
      message: `You may onboard only ${adminTenure(req)} officers.`,
    });
    return;
  }

  const slug = String(full_name).toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 40) || "officer";
  const domain =
    orgOf(requested_role) === "POLICE"
      ? STATE_META[targetState!]!.domain
      : orgOf(requested_role) === "CBI"
      ? "cbi.gov.in"
      : orgOf(requested_role) === "NIA"
      ? "nia.gov.in"
      : "cid.gov.in";
  const short =
    orgOf(requested_role) === "POLICE"
      ? STATE_META[targetState!]!.short
      : orgOf(requested_role) === "CID" && targetState
      ? `CID-${STATE_META[targetState]!.short}`
      : orgOf(requested_role);
  const func = String(requested_role).split("_").slice(1).join("").slice(0, 3).toUpperCase() || "GEN";

  let email = "";
  let officialId = "";
  for (let attempt = 0; attempt < 25; attempt++) {
    const suffix = Math.floor(100 + Math.random() * 900);
    const tryEmail = `${slug}.${suffix}@${domain}`.toLowerCase();
    const tryId = `${short}-${func}-${Math.floor(100 + Math.random() * 900)}`;
    const clash =
      (await db.users.findOne({ email: tryEmail })) || (await db.users.findOne({ official_id: tryId }));
    if (!clash) {
      email = tryEmail;
      officialId = tryId;
      break;
    }
  }
  if (!email) {
    res.status(500).json({ error: "Could not mint unique credentials. Retry." });
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const now = new Date().toISOString();
  const branchName = String(branch || department || "General Duties").trim();
  const divisionName = String(division || "").trim();
  const unitName = divisionName ? `${branchName} / ${divisionName}` : branchName;
  const agency =
    orgOf(requested_role) === "POLICE"
      ? STATE_META[targetState!]!.agency
      : orgOf(requested_role) === "CBI"
      ? "Central Bureau of Investigation (CBI)"
      : orgOf(requested_role) === "NIA"
      ? "National Investigation Agency (NIA)"
      : "Crime Investigation Department (CID)";
  const newUser: DBUser = {
    _id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    name: full_name.trim(),
    official_id: officialId,
    email,
    password_hash: await bcrypt.hash(String(password), salt),
    agency,
    designation: designation?.trim() || "Investigative Officer",
    department: unitName,
    role: requested_role,
    state: targetState,
    status: "ACTIVE",
    created_at: now,
    approved_by: admin._id,
    approved_at: now,
  };
  await db.users.insertOne(newUser);
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: admin._id,
    user_name: admin.name,
    user_role: admin.role,
    action: "OFFICER_ONBOARDED",
    details: `Admin ${admin.name} onboarded ${newUser.name} as ${requested_role} (${officialId}).`,
    digital_hash: crypto.createHash("sha256").update(`${newUser._id}:${now}:ONBOARD`).digest("hex"),
    result: "SUCCESS",
  });
  res.status(201).json({
    success: true,
    user: {
      _id: newUser._id,
      name: newUser.name,
      official_id: officialId,
      email,
      role: requested_role,
      state: targetState,
      agency,
      department: unitName,
    },
  });
});

// Access Requests List (dept-scoped by requested tenure)
router.get("/access-requests", async (req: AuthenticatedRequest, res: Response) => {
  const all = await db.access_requests.find();
  const requests = all.filter((r: any) =>
    sameTenure(req.user!.role, req.user!.state, r.requested_role, requestState(r))
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
  const reqState = requestState(accessReq);
  if (!sameTenure(req.user!.role, req.user!.state, candidate, reqState)) {
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
      state: reqState || user.state,
      status: "ACTIVE",
      approved_by: req.user!._id,
      approved_at: now,
    });

    // Approval activates the account only — case staffing happens explicitly
    // via the Yet-to-be-Assigned pool (Assign Lead) or team management.
    // A defaultCaseId seats the officer immediately when it matches tenure.
    if (defaultCaseId) {
      const targetCase: any = await db.cases.findOne(defaultCaseId).catch(() => null);
      const userTenure = tenureKey(roleToAssign, (accessReq as any).state || user.state);
      const targetTenure = targetCase ? caseTenureOf(targetCase) : "SHARED";
      if (targetCase && targetTenure !== "SHARED" && targetTenure !== userTenure) {
        await db.audit_logs.insertOne({
          _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          user_id: req.user!._id,
          user_name: req.user!.name,
          user_role: req.user!.role,
          action: "ACCESS_REQUEST_AUTOASSIGN_SKIPPED",
          details: `Auto-assign to ${defaultCaseId} skipped: user tenure '${userTenure}' vs case tenure '${targetTenure}'. Staff explicitly from the pool.`,
          digital_hash: crypto.createHash("sha256").update(`${id}:${roleToAssign}:SKIP:${now}`).digest("hex"),
          result: "SUCCESS",
        });
      } else if (targetCase) {
        const existingMember = await db.case_members.findOne({
          case_id: defaultCaseId,
          user_id: user._id,
        });
        if (!existingMember) {
          const member: DBCaseMember = {
            _id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            case_id: defaultCaseId,
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
        } else {
          await db.case_members.updateOne(existingMember._id, {
            role: roleToAssign,
            status: "ACTIVE",
          });
        }
      }
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

// Update User Status — unblocking (SUSPENDED → ACTIVE) issues a one-time
// temporary password the officer must rotate on first sign-in.
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

  const wasSuspended = user.status === "SUSPENDED";
  let tempPassword: string | undefined;
  if (status === "ACTIVE" && wasSuspended) {
    // One-time temp password: memorable + policy-compliant.
    const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
    tempPassword = `Tmp@${rand}${Math.floor(10 + Math.random() * 90)}`;
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(tempPassword, salt);
    await db.users.updateOne(id, {
      status,
      password_hash,
      mustChangePassword: true,
      pendingTempPassword: tempPassword,
    } as any);
    try {
      const { clearOtpFailures } = await import("./auth");
      clearOtpFailures(id);
    } catch {
      /* lockout map unavailable */
    }
  } else if (status === "ACTIVE") {
    await db.users.updateOne(id, { status, mustChangePassword: false, pendingTempPassword: undefined } as any);
  } else {
    await db.users.updateOne(id, { status });
  }

  const now = new Date().toISOString();
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: status === "ACTIVE" && wasSuspended ? "USER_UNBLOCKED_WITH_TEMP" : `USER_STATUS_${status}`,
    details:
      status === "ACTIVE" && wasSuspended
        ? `Admin unblocked ${user.name} (${user.official_id}) and issued a one-time temporary password (rotation enforced).`
        : `Admin changed status of ${user.name} (${user.official_id}) to ${status}.`,
    digital_hash: crypto.createHash("sha256").update(`${id}:${status}:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  // Realtime nudge to the officer (if they hold a socket) — the blocked
  // screen also polls account-status, so delivery is guaranteed either way.
  try {
    const { pushToUser } = await import("../realtime");
    pushToUser(id, {
      type: "ACCOUNT_STATUS",
      status,
      unblocked: status === "ACTIVE" && wasSuspended,
      mustChangePassword: status === "ACTIVE" && wasSuspended,
      ...(tempPassword ? { tempPassword } : {}),
      message:
        status === "ACTIVE" && wasSuspended
          ? "Your account has been unblocked. Sign in with the temporary password and set your own."
          : `Your account status is now ${status}.`,
    });
  } catch {
    /* realtime unavailable */
  }

  res.json({
    success: true,
    message:
      status === "ACTIVE" && wasSuspended
        ? `Officer unblocked — share this one-time temporary password: ${tempPassword}`
        : `User status updated to ${status}`,
    ...(tempPassword ? { tempPassword, mustChangePassword: true } : {}),
  });
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

// Assign Member to Case. Same-tenure staffing is the default; a sanctioned
// cross-tenure posting is allowed ONLY with an orderRef (court/government
// directive), and is sealed in the audit ledger as CROSS_TENURE_ASSIGNMENT.
router.post("/cases/:caseId/members", async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const { userId, orderRef } = req.body;
  const sanctioned = String(orderRef || "").trim().length >= 6;

  const targetUser = await db.users.findOne({ _id: userId });
  if (!targetUser) {
    res.status(404).json({ error: "Target user not found" });
    return;
  }
  const memberTenure = tenureKey(targetUser.role, targetUser.state);
  if (!inAdminTenure(req, targetUser.role, targetUser.state) && !sanctioned) {
    res.status(403).json({
      error: "Tenant Isolation",
      message: `Officer tenure '${memberTenure}' is outside your tenure '${adminTenure(req)}'. Pick a ${adminTenure(req)} officer, or supply a sanction orderRef (min 6 chars) for a cross-tenure posting.`,
    });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseId).catch(() => null);
  if (caseObj && caseObj.org && caseObj.org !== "UNKNOWN") {
    const ct = caseTenureOf(caseObj);
    if (ct !== "SHARED" && ct !== adminTenure(req)) {
      res.status(403).json({ error: "Tenant Isolation", message: `Case tenure '${ct}' is outside your tenure '${adminTenure(req)}'.` });
      return;
    }
    if (ct !== "SHARED" && memberTenure !== ct && !sanctioned) {
      res.status(403).json({
        error: "Tenant Isolation",
        message: `Officer tenure '${memberTenure}' does not match case tenure '${ct}'. Staff a ${ct} officer, or supply a sanction orderRef (min 6 chars) for a cross-tenure posting.`,
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

  const crossPosted = !sameTenure(req.user!.role, req.user!.state, targetUser.role, targetUser.state);
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: req.user!._id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: crossPosted ? "CROSS_TENURE_ASSIGNMENT" : "CASE_MEMBER_ASSIGNED",
    case_id: caseId,
    details: crossPosted
      ? `Admin sanctioned cross-tenure posting of ${targetUser.name} (${memberTenure}) to case ${caseId} per order ${String(orderRef).trim()}.`
      : `Admin assigned ${targetUser.name} (${targetUser.role}) to case ${caseId}.`,
    digital_hash: crypto.createHash("sha256").update(`${caseId}:${userId}:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, member: newMember, crossPosted });
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
  // Approve-with-assignee: seat an officer from the personnel pool in one step.
  let assignedName: string | undefined;
  const { assigneeId } = req.body || {};
  if (assigneeId) {
    const target = await db.users.findOne({ _id: assigneeId });
    if (!target || target.status !== "ACTIVE") {
      res.status(400).json({ error: "Assignee must be an ACTIVE registered officer." });
      return;
    }
    if (!sameTenure(req.user!.role, req.user!.state, target.role, target.state)) {
      res.status(403).json({ error: "Tenant Isolation", message: "Assignee is outside your tenure." });
      return;
    }
    const already = await db.case_members.findOne({ case_id: doc.case_id, user_id: target._id });
    if (!already) {
      const now2 = new Date().toISOString();
      await db.case_members.insertOne({
        _id: `mem-${doc.case_id}-${target._id}-req`,
        case_id: doc.case_id,
        user_id: target._id,
        user_name: target.name,
        user_email: target.email,
        official_id: target.official_id,
        agency: target.agency,
        role: target.role,
        state: target.state,
        access: "FULL_EDIT",
        status: "ACTIVE",
        assigned_at: now2,
        assigned_by: req.user!.name,
      });
      assignedName = target.name;
    }
  }
  const now = new Date().toISOString();
  await db.requisitions.updateOne(doc._id, {
    status: "APPROVED",
    reviewed_by: req.user!.name,
    reviewed_at: now,
    review_notes: req.body?.notes,
  });
  res.json({ success: true, assigned: assignedName });
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

// Delete Case (Admin only, with cascade deletion and confirmation)
router.delete("/cases/:caseId", requireRole([...ADMIN_ROLES] as DBRole[]), async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const { caseId } = req.params;
  const { confirm, reason: rawReason } = req.body || {};

  if (!confirm) {
    res.status(400).json({ error: "Confirmation required: send { confirm: true, reason: '...' }" });
    return;
  }

  const caseObj: any = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Case not found." });
    return;
  }

  // Check admin tenure matches case
  const caseTenure = caseTenureOf(caseObj);
  const tenure = adminTenure(req);
  if (caseTenure !== "SHARED" && caseTenure !== tenure) {
    res.status(403).json({ error: "Tenant Isolation", message: "Cannot delete a case outside your tenure." });
    return;
  }

  const trimmedReason = String(rawReason || "").trim();
  if (!trimmedReason || trimmedReason.length < 6) {
    res.status(400).json({ error: "Reason must be at least 6 characters." });
    return;
  }

  const now = new Date().toISOString();

  // Cascade delete via backend helper (works for memory + Mongo vaults).
  const { memberCount, evidenceCount } = await (db as any).deleteCaseCascade(caseId);

  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
    timestamp: now,
    user_id: admin._id,
    user_name: admin.name,
    user_role: admin.role,
    action: "CASE_DELETED",
    case_id: caseId,
    details: `Admin ${admin.name} deleted case ${caseId} (${memberCount} members, ${evidenceCount} exhibits). Reason: ${trimmedReason}`,
    digital_hash: crypto.createHash("sha256").update(`${caseId}:DELETE:${now}`).digest("hex"),
    result: "SUCCESS",
  });

  res.json({ success: true, message: `Case deleted successfully. All associated data cascaded.` });
});

export default router;
